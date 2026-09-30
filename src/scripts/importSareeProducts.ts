import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../config/logger.js';
import { v2 as cloudinary } from 'cloudinary';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { ProductVariant } from '../models/ProductVariant.js';
import { cloudinaryConfigured } from '../config/cloudinary.js';
import { slugify } from '@taaj/shared';

/**
 * Import real saree products from processed local images.
 *
 * Reads the manifest produced by `scripts/process_saree_images.py`, upserts the
 * category taxonomy (creating new subcategories under "Sarees" where a folder has
 * no existing match), refreshes descriptions/SEO/images on ALL categories, and
 * upserts one product per processed image.
 *
 * Idempotent: categories upsert by slug, products upsert by SKU — re-running does
 * not create duplicates and never deletes existing (seed) products/categories.
 *
 * Run: npm run import:sarees --workspace @taaj/backend
 * (First generate images + manifest: npm run process:images --workspace @taaj/backend)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, 'data', 'saree-manifest.json');

const ASSET_BASE =
  process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '') ??
  `http://localhost:${process.env.PORT ?? 3000}`;

/** backend/public — where process_saree_images.py writes the processed JPEGs. */
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

/**
 * Resolve a processed local image and upload it to Cloudinary so it persists
 * independently of the local dev server. Uses a deterministic public_id +
 * overwrite, so re-running the import replaces the same asset instead of
 * creating duplicates. Falls back to the local /static URL if Cloudinary is
 * not configured or an upload fails.
 */
async function imageFor(
  staticUrl: string,
  publicId: string,
  alt: string,
): Promise<{ url: string; publicId?: string; alt: string }> {
  if (cloudinaryConfigured) {
    try {
      const abs = path.join(PUBLIC_DIR, staticUrl.replace(/^\/static\//, ''));
      const res = await cloudinary.uploader.upload(abs, {
        folder: 'taaj-handloom/sarees',
        public_id: publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      return { url: res.secure_url, publicId: res.public_id, alt };
    } catch (err) {
      logger.warn({ err }, `Cloudinary upload failed for ${publicId} — falling back to local URL`);
    }
  }
  return { url: `${ASSET_BASE}${staticUrl}`, alt };
}

interface ManifestProduct {
  sku: string;
  color: string;
  url: string;
  width: number;
  height: number;
  source: string;
}
interface ManifestCategory {
  folder: string;
  name: string;
  isNew: boolean;
  skuPrefix: string;
  image: { url: string } | null;
  products: ManifestProduct[];
}
interface Manifest {
  generatedAt: string;
  categories: Record<string, ManifestCategory>;
}

/** Deterministic 0..1 pseudo-random from a string (stable flags across re-runs). */
function seededUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const has = (name: string, ...words: string[]) => {
  const n = name.toLowerCase();
  return words.some((w) => n.includes(w));
};

/** Fabric/material inferred from category name — kept generic, no over-claims. */
function fabricFor(name: string): string {
  if (has(name, 'tissue')) return 'Tissue Silk';
  if (has(name, 'garbha', 'reshami')) return 'Silk Cotton';
  if (has(name, 'cotton')) return 'Cotton';
  return 'Silk Cotton';
}

function patternFor(name: string): string {
  if (has(name, 'zari line')) return 'Zari Stripe';
  if (has(name, 'checks')) return 'Woven Checks';
  if (has(name, 'lotus')) return 'Lotus Butta';
  if (has(name, 'chand')) return 'Chand-Tara Buti';
  if (has(name, 'diya')) return 'Diya Butta';
  if (has(name, 'nayanthara', 'star')) return 'Star Buti';
  if (has(name, 'v buti')) return 'V Buti';
  if (has(name, 'butta', 'buti')) return 'Buti Motif';
  if (has(name, 'pallu')) return 'Statement Pallu';
  if (has(name, 'tissue')) return 'Tissue Weave';
  if (has(name, 'multi')) return 'Multi-Colour Weave';
  if (has(name, 'border')) return 'Woven Border';
  return 'Woven Border';
}

function occasionFor(name: string): string[] {
  if (has(name, 'tissue', 'garbha', 'heavy', 'silk')) return ['Wedding', 'Festive', 'Reception'];
  if (has(name, 'checks', 'small border', 'zari line', 'simple')) return ['Daily', 'Office', 'Festive'];
  return ['Festive', 'Pooja', 'Wedding'];
}

/** Price tier (₹) by category richness — mrp above, small stable per-SKU variation. */
function pricingFor(catName: string, sku: string): { mrp: number; price: number } {
  let base: number;
  if (has(catName, 'tissue', 'garbha', 'heavy pallu')) base = 3299;
  else if (has(catName, 'silk sarees') && !has(catName, 'tissue')) base = 3099;
  else if (has(catName, 'lotus', 'multi-colour big', 'big border', 'kossa')) base = 2699;
  else if (has(catName, 'checks', 'zari line', 'small border', 'simple')) base = 2099;
  else base = 2499;
  const bump = Math.round(seededUnit(sku) * 6) * 50; // 0..300 in ₹50 steps
  const price = base + bump;
  const mrp = Math.round((price * 1.28) / 10) * 10;
  return { mrp, price };
}

function catDescription(name: string): string {
  const p = patternFor(name);
  return (
    `Handwoven ${name.replace(/ Sarees?$/i, '')} from TAAJ Handloom — crafted on traditional ` +
    `Maheshwar looms with the signature ${p.toLowerCase()} and lustrous reversible borders. ` +
    `Lightweight, breathable and elegant, each drape carries the soft sheen and fine finish ` +
    `that define authentic Maheshwari weaving.`
  );
}

function productContent(color: string, catName: string, sku: string) {
  const singular = catName.replace(/ Sarees?$/i, ' Saree').replace(/Sarees?$/i, 'Saree');
  const base = /maheshwari/i.test(singular) ? singular : `Maheshwari ${singular}`;
  const name = `${color} ${base}`;
  const fabric = fabricFor(catName);
  const pattern = patternFor(catName);
  const occasion = occasionFor(catName);
  const shortDescription =
    `${color} handwoven ${catName.replace(/ Sarees?$/i, '').toLowerCase()} Maheshwari saree ` +
    `with a ${pattern.toLowerCase()} and a graceful zari border.`;
  const description =
    `This ${color.toLowerCase()} Maheshwari saree is handwoven in Maheshwar, Madhya Pradesh by ` +
    `TAAJ Handloom. The body carries a ${pattern.toLowerCase()} finished with the signature ` +
    `Maheshwari border and a softly lustrous pallu. Woven in a ${fabric.toLowerCase()} blend, it ` +
    `drapes light and airy with a subtle sheen — an easy, elegant choice for ` +
    `${occasion.slice(0, 2).join(' and ').toLowerCase()} wear. Being entirely handcrafted, small ` +
    `irregularities and gentle colour variation are natural marks of the weave, not defects.`;
  const careInstructions =
    `First wash by dry-clean only; thereafter hand-wash gently in cold water with a mild ` +
    `detergent. Do not bleach or soak. Wash this saree separately for the first few washes as ` +
    `natural dyes may release a little colour. Dry in shade and iron on a medium setting, using ` +
    `a thin cloth over the zari to protect its shine. Store folded in a cotton wrap, away from ` +
    `direct sunlight and damp.`;
  const tags = ['handloom', 'maheshwari', 'saree', color.toLowerCase(), slugify(catName)];
  return { name, shortDescription, description, careInstructions, fabric, pattern, occasion, tags };
}

async function run() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  await connectDatabase();

  // Ensure the "Sarees" parent exists (created by seedProducts; create if missing).
  const parent = await Category.findOneAndUpdate(
    { slug: 'sarees' },
    {
      $setOnInsert: { slug: 'sarees' },
      $set: {
        name: 'Sarees',
        parent: null,
        isActive: true,
        seo: {
          title: 'Maheshwari Handloom Sarees — TAAJ Handloom',
          description: 'Authentic handwoven Maheshwari sarees crafted in Maheshwar, Madhya Pradesh.',
        },
      },
    },
    { new: true, upsert: true },
  );

  // Requirement: delete all existing saree subcategories + their products, then
  // rebuild the taxonomy from the source folders. Suits/Chunari (other parents)
  // are left untouched.
  const oldSubcats = await Category.find({ parent: parent._id }).select('_id slug');
  if (oldSubcats.length) {
    const oldIds = oldSubcats.map((c) => c._id);
    const oldProducts = await Product.find({ category: { $in: oldIds } }).select('_id');
    const oldProductIds = oldProducts.map((p) => p._id);
    if (oldProductIds.length) await ProductVariant.deleteMany({ product: { $in: oldProductIds } });
    const prodDel = await Product.deleteMany({ category: { $in: oldIds } });
    const catDel = await Category.deleteMany({ _id: { $in: oldIds } });
    logger.info(
      `Cleared ${catDel.deletedCount} existing saree subcategories and ${prodDel.deletedCount} products before rebuild`,
    );
  }

  const maxOrderDoc = await Category.findOne({ parent: parent._id }).sort({ sortOrder: -1 });
  let nextOrder = (maxOrderDoc?.sortOrder ?? 0) + 1;

  const stats = {
    catsCreated: 0,
    catsUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    images: 0,
  };
  const seenSkus = new Set<string>();

  for (const [slug, cat] of Object.entries(manifest.categories)) {
    const existing = await Category.findOne({ slug });
    const image = cat.image ? await imageFor(cat.image.url, `cat-${slug}`, cat.name) : undefined;

    const set: Record<string, unknown> = {
      name: cat.name,
      description: catDescription(cat.name),
      parent: parent._id,
      isActive: true,
      seo: {
        title: `${cat.name} — Maheshwari Handloom | TAAJ Handloom`,
        description:
          `Shop authentic ${cat.name.toLowerCase()} from TAAJ Handloom — handwoven in Maheshwar ` +
          `with pure zari borders. Direct from the loom, wholesale & retail.`,
      },
    };
    if (image) set.image = image; // only overwrite the image when we have a folder photo
    if (!existing) set.sortOrder = nextOrder++;

    const catDoc = await Category.findOneAndUpdate(
      { slug },
      { $set: set, $setOnInsert: { slug } },
      { new: true, upsert: true },
    );
    if (existing) stats.catsUpdated++;
    else stats.catsCreated++;

    for (const item of cat.products) {
      const sku = item.sku.toUpperCase();
      if (seenSkus.has(sku)) {
        logger.warn(`Duplicate SKU in manifest, skipping: ${sku}`);
        continue;
      }
      seenSkus.add(sku);

      const c = productContent(item.color, cat.name, sku);
      const slugified = `${slugify(c.name)}-${sku.toLowerCase()}`;
      const { mrp, price } = pricingFor(cat.name, sku);
      const r = seededUnit(sku);

      const mainImage = await imageFor(item.url, sku.toLowerCase(), c.name);

      const alreadyExists = await Product.exists({ sku });
      await Product.findOneAndUpdate(
        { sku },
        {
          $set: {
            name: c.name,
            slug: slugified,
            category: catDoc._id,
            subcategory: null,
            shortDescription: c.shortDescription,
            description: c.description,
            careInstructions: c.careInstructions,
            pricing: {
              mrp,
              price,
              wholesalePrice: Math.round((price * 0.8) / 10) * 10,
              minWholesaleQty: 5,
            },
            attributes: {
              fabric: c.fabric,
              material: c.fabric,
              pattern: c.pattern,
              occasion: c.occasion,
              tags: c.tags,
            },
            media: { mainImage, gallery: [] },
            flags: {
              isActive: true,
              // realistic, non-overlapping-ish distribution driven by a stable hash
              isFeatured: r < 0.16,
              isBestSeller: r >= 0.16 && r < 0.32,
              isNewArrival: r >= 0.55,
            },
            hasVariants: false,
            baseStock: { quantity: 50, reserved: 0, sold: 0, lowStockThreshold: 3 },
            salesCount: r < 0.32 ? Math.round(r * 60) : 0,
            seo: { title: c.name, description: c.shortDescription },
          },
          $setOnInsert: { sku },
        },
        { new: true, upsert: true },
      );

      if (alreadyExists) stats.productsUpdated++;
      else stats.productsCreated++;
      stats.images++;
    }

    logger.info(`  ${slug}: ${cat.products.length} products (${cat.isNew ? 'new' : 'existing'} cat)`);
  }

  // Requirement §1: refresh SEO on the remaining existing categories (no folder),
  // without touching their curated descriptions or images.
  const untouched = await Category.find({ slug: { $nin: Object.keys(manifest.categories) } });
  for (const c of untouched) {
    c.seo = {
      title: `${c.name} — ${c.parent ? 'Maheshwari Handloom' : 'TAAJ Handloom'} | TAAJ Handloom`,
      description:
        c.seo?.description ??
        `Shop ${c.name.toLowerCase()} from TAAJ Handloom — authentic Maheshwari handloom, direct from the loom.`,
    };
    if (!c.description) c.description = catDescription(c.name);
    await c.save();
  }

  logger.info('─────────────────────────────────────────────');
  logger.info(`Categories: ${stats.catsCreated} created, ${stats.catsUpdated} updated, ${untouched.length} SEO-refreshed`);
  logger.info(`Products:   ${stats.productsCreated} created, ${stats.productsUpdated} updated`);
  logger.info(`Images:     ${stats.images} linked`);
  logger.info(`Asset base: ${ASSET_BASE}`);
  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'Saree import failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
