import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { ProductVariant } from '../models/ProductVariant.js';
import { Banner } from '../models/Banner.js';
import { PRODUCT_COLORS, slugify } from '@taaj/shared';

/**
 * Seed the Maheshwari category taxonomy + sample products (with variants).
 * The taxonomy mirrors the real Maheshwari handloom structure (weave / motif /
 * border families) adapted for TAAJ Handloom — parents + subcategories.
 *
 * Products and variants are wiped and recreated so the taxonomy stays in sync;
 * categories are upserted by slug (admin-created categories are preserved).
 * Run: npm run seed:products --workspace @taaj/backend
 */

const img = (seed: string) => ({ url: `https://picsum.photos/seed/${seed}/600/800` });
const hex = (name: string) => PRODUCT_COLORS.find((c) => c.name === name)?.hex;

interface CatDef {
  name: string;
  slug: string;
  description: string;
  image?: { url: string; alt?: string };
  children?: CatDef[];
}

/** A stable square image for a category circle (overridable per-category / via admin). */
const catImg = (slug: string, name: string) => ({
  url: `https://picsum.photos/seed/taaj-cat-${slug}/600/600`,
  alt: name,
});

/** Parent departments with Maheshwari subcategories (weave / motif / border). */
const TAXONOMY: CatDef[] = [
  {
    name: 'Sarees',
    slug: 'sarees',
    description: 'Handwoven Maheshwari sarees with signature reversible borders and lustrous pallus.',
    children: [
      { name: 'Maheshwari Silk Sarees', slug: 'maheshwari-silk-sarees', description: 'Classic silk-cotton Maheshwari sarees with traditional zari borders.' },
      { name: 'Garbha Reshami Silk Sarees', slug: 'garbha-reshami-silk-sarees', description: 'Regal Garbha Reshami weave — rich texture with a soft, luxurious fall.' },
      { name: 'Buti / Motif Sarees', slug: 'buti-motif-sarees', description: 'All-over woven buti motifs — flower, diamond, swastika and V-shape patterns.' },
      { name: 'Butta Pallu Sarees', slug: 'butta-pallu-sarees', description: 'Statement pallus with leaf, coin and flower butta on contrast grounds.' },
      { name: 'Tissue Silk Sarees', slug: 'tissue-silk-sarees', description: 'Shimmering tissue weave with a fine metallic sheen for occasions.' },
      { name: 'Zari Border Sarees', slug: 'zari-border-sarees', description: 'Understated bodies framed by gleaming pure-zari borders.' },
      { name: 'Zari Checks Sarees', slug: 'zari-checks-sarees', description: 'Woven zari check grids across the body — light and elegant.' },
      { name: 'Ganga-Jamuna Border Sarees', slug: 'ganga-jamuna-border-sarees', description: 'The signature dual-colour Ganga-Jamuna contrast border.' },
      { name: 'Resham Border Sarees', slug: 'resham-border-sarees', description: 'Soft resham (silk-thread) borders in rich contrast colours.' },
      { name: 'Silver Zari Sarees', slug: 'silver-zari-sarees', description: 'Cool silver-zari borders and motifs for an elegant sheen.' },
      { name: 'Lotus Butta Sarees', slug: 'lotus-butta-sarees', description: 'The graceful lotus butta motif woven across the body and pallu.' },
      { name: 'Multi-Colour Maheshwari Sarees', slug: 'multi-colour-maheshwari-sarees', description: 'Vibrant multi-colour bodies and borders for festive drapes.' },
      { name: 'Cotton Handloom Sarees', slug: 'cotton-handloom-sarees', description: 'Breathable pure-cotton handloom sarees for everyday grace.' },
      { name: 'Bagh Print Sarees', slug: 'bagh-print-sarees', description: 'Traditional hand block Bagh-print sarees in natural dyes.' },
      { name: 'Dabu Print Sarees', slug: 'dabu-print-sarees', description: 'Mud-resist Dabu hand-block prints on soft cotton.' },
      { name: 'Chanderi Sarees', slug: 'chanderi-sarees', description: 'Sheer, lightweight Chanderi silk-cotton sarees with fine zari.' },
      { name: 'Pure Silk Sarees', slug: 'pure-silk-sarees', description: 'Premium pure-silk Maheshwari drapes for weddings and receptions.' },
    ],
  },
  {
    name: 'Suits',
    slug: 'suits',
    description: 'Elegant handloom suit sets in breathable cotton-silk with woven dupattas.',
    children: [
      { name: 'Maheshwari Silk Suits', slug: 'maheshwari-silk-suits', description: 'Cotton-silk unstitched suit sets with woven borders and dupatta.' },
      { name: 'Cotton Handblock Suits', slug: 'cotton-handblock-suits', description: 'Pure-cotton suits with traditional hand-block prints.' },
      { name: 'Bagh Print Suits', slug: 'bagh-print-suits', description: 'Heritage Bagh block-print suit sets in natural dyes.' },
      { name: 'Tissue Suits', slug: 'tissue-suits', description: 'Shimmering tissue suit sets for festive occasions.' },
      { name: 'Chanderi Suits', slug: 'chanderi-suits', description: 'Lightweight Chanderi silk-cotton suit sets.' },
      { name: 'Ajrakh Suits', slug: 'ajrakh-suits', description: 'Natural-dye Ajrakh block-print suit sets.' },
    ],
  },
  {
    name: 'Chunari',
    slug: 'chunari',
    description: 'Traditional chunari and dupattas with timeless Maheshwari weaves and motifs.',
    children: [
      { name: 'Maheshwari Chunari', slug: 'maheshwari-chunari', description: 'Festive chunari with delicate weaves for pooja and celebrations.' },
      { name: 'Silk Dupatta', slug: 'silk-dupatta', description: 'Handwoven silk dupattas to pair with suits and kurtas.' },
    ],
  },
];

interface VariantDef {
  color: string;
  quantity: number;
  price?: number;
}
interface ProductDef {
  name: string;
  sku: string;
  sub: string; // subcategory slug the product belongs to
  mrp: number;
  price: number;
  fabric: string;
  pattern: string;
  occasion: string[];
  tags: string[];
  shortDescription: string;
  flags?: { isFeatured?: boolean; isBestSeller?: boolean; isNewArrival?: boolean };
  quantity?: number; // for non-variant products
  variants?: VariantDef[];
}

const PRODUCTS: ProductDef[] = [
  {
    name: 'Emerald Maheshwari Silk-Cotton Saree',
    sku: 'TH-SAR-101', sub: 'maheshwari-silk-sarees', mrp: 3200, price: 2499,
    fabric: 'Silk Cotton', pattern: 'Zari Border', occasion: ['Festive', 'Wedding'], tags: ['handloom', 'saree', 'maheshwari'],
    shortDescription: 'A lightweight silk-cotton saree with a lustrous zari border and reversible pallu.',
    flags: { isFeatured: true, isBestSeller: true },
    variants: [
      { color: 'Green', quantity: 8 },
      { color: 'Pink', quantity: 5 },
      { color: 'Blue', quantity: 6, price: 2599 },
    ],
  },
  {
    name: 'Maroon Handwoven Maheshwari Saree',
    sku: 'TH-SAR-102', sub: 'cotton-handloom-sarees', mrp: 2800, price: 2299,
    fabric: 'Cotton', pattern: 'Temple Border', occasion: ['Festive'], tags: ['handloom', 'saree'],
    shortDescription: 'Deep maroon handloom saree with a classic temple border.',
    flags: { isBestSeller: true }, quantity: 12,
  },
  {
    name: 'Ivory & Gold Maheshwari Saree',
    sku: 'TH-SAR-103', sub: 'buti-motif-sarees', mrp: 3600, price: 2999,
    fabric: 'Silk Cotton', pattern: 'Buti', occasion: ['Wedding', 'Reception'], tags: ['premium', 'saree'],
    shortDescription: 'Timeless ivory saree with delicate gold buttis across the body.',
    flags: { isFeatured: true, isNewArrival: true },
    variants: [
      { color: 'Beige', quantity: 7 },
      { color: 'Yellow', quantity: 4 },
    ],
  },
  {
    name: 'Reversible Border Maheshwari Saree',
    sku: 'TH-SAR-104', sub: 'zari-border-sarees', mrp: 3000, price: 2399,
    fabric: 'Cotton Silk', pattern: 'Reversible Border', occasion: ['Daily', 'Office'], tags: ['saree', 'handloom'],
    shortDescription: 'Signature reversible border saree, easy to drape and everyday-elegant.',
    flags: { isNewArrival: true },
    variants: [
      { color: 'Purple', quantity: 6 },
      { color: 'Red', quantity: 0 },
      { color: 'Black', quantity: 5 },
    ],
  },
  {
    name: 'Peacock Blue Garbha Reshami Saree',
    sku: 'TH-SAR-105', sub: 'garbha-reshami-silk-sarees', mrp: 3400, price: 2799,
    fabric: 'Silk Cotton', pattern: 'Garbha Reshami', occasion: ['Festive'], tags: ['saree', 'premium'],
    shortDescription: 'Rich peacock-blue Garbha Reshami saree with fine zari stripes.', quantity: 9,
    flags: { isNewArrival: true },
  },
  {
    name: 'Lavender Buti Maheshwari Saree',
    sku: 'TH-SAR-106', sub: 'buti-motif-sarees', mrp: 2900, price: 2299,
    fabric: 'Cotton Silk', pattern: 'Buti', occasion: ['Daily', 'Office'], tags: ['saree'],
    shortDescription: 'Soft lavender saree with scattered buttis — light and graceful.', quantity: 11,
  },
  {
    name: 'Golden Tissue Maheshwari Saree',
    sku: 'TH-SAR-107', sub: 'tissue-silk-sarees', mrp: 4200, price: 3499,
    fabric: 'Tissue Silk', pattern: 'Tissue Weave', occasion: ['Wedding', 'Reception'], tags: ['saree', 'premium', 'tissue'],
    shortDescription: 'A luminous tissue-silk saree with a delicate golden shimmer.',
    flags: { isFeatured: true, isNewArrival: true }, quantity: 6,
  },
  {
    name: 'Rani Pink Ganga-Jamuna Saree',
    sku: 'TH-SAR-108', sub: 'ganga-jamuna-border-sarees', mrp: 3300, price: 2699,
    fabric: 'Silk Cotton', pattern: 'Ganga-Jamuna Border', occasion: ['Festive', 'Wedding'], tags: ['saree'],
    shortDescription: 'Vibrant rani-pink saree with the signature dual-colour contrast border.',
    flags: { isBestSeller: true }, quantity: 8,
  },
  {
    name: 'Beige Maheshwari Cotton-Silk Suit Set',
    sku: 'TH-SUIT-201', sub: 'maheshwari-silk-suits', mrp: 2600, price: 1999,
    fabric: 'Cotton Silk', pattern: 'Solid with Border', occasion: ['Daily', 'Office'], tags: ['suit', 'handloom'],
    shortDescription: 'Breathable unstitched cotton-silk suit set with a woven border dupatta.',
    flags: { isBestSeller: true }, quantity: 15,
  },
  {
    name: 'Teal Handloom Suit Set',
    sku: 'TH-SUIT-202', sub: 'maheshwari-silk-suits', mrp: 2400, price: 1899,
    fabric: 'Cotton', pattern: 'Woven Motifs', occasion: ['Festive', 'Daily'], tags: ['suit'],
    shortDescription: 'Elegant teal suit set with subtle woven motifs.',
    flags: { isNewArrival: true },
    variants: [
      { color: 'Blue', quantity: 8 },
      { color: 'Green', quantity: 6 },
    ],
  },
  {
    name: 'Indigo Bagh Print Cotton Suit',
    sku: 'TH-SUIT-203', sub: 'bagh-print-suits', mrp: 2700, price: 2199,
    fabric: 'Cotton', pattern: 'Bagh Print', occasion: ['Festive', 'Daily'], tags: ['suit', 'bagh'],
    shortDescription: 'Hand block-printed indigo Bagh suit set in natural dyes.', quantity: 10,
    flags: { isNewArrival: true },
  },
  {
    name: 'Sunflower Yellow Maheshwari Chunari',
    sku: 'TH-CHU-301', sub: 'maheshwari-chunari', mrp: 1400, price: 999,
    fabric: 'Cotton', pattern: 'Bandhani-inspired', occasion: ['Festive', 'Pooja'], tags: ['chunari', 'handloom'],
    shortDescription: 'Bright chunari with a delicate bandhani-inspired weave.',
    flags: { isNewArrival: true }, quantity: 20,
  },
  {
    name: 'Marigold Orange Chunari',
    sku: 'TH-CHU-302', sub: 'maheshwari-chunari', mrp: 1300, price: 899,
    fabric: 'Cotton', pattern: 'Zari Dots', occasion: ['Pooja'], tags: ['chunari'],
    shortDescription: 'Festive marigold chunari with fine zari dots.',
    flags: { isBestSeller: true }, quantity: 18,
  },
  {
    name: 'Emerald Silk Dupatta',
    sku: 'TH-CHU-303', sub: 'silk-dupatta', mrp: 1500, price: 1099,
    fabric: 'Silk Cotton', pattern: 'Woven Border', occasion: ['Wedding', 'Pooja'], tags: ['dupatta', 'premium'],
    shortDescription: 'Handwoven emerald silk dupatta with a woven zari border.', quantity: 14,
  },
];

async function upsertCategory(def: CatDef, parentId: string | null, sortOrder: number): Promise<string> {
  const doc = await Category.findOneAndUpdate(
    { slug: def.slug },
    {
      $set: {
        name: def.name,
        description: def.description,
        image: def.image ?? catImg(def.slug, def.name),
        parent: parentId,
        sortOrder,
        isActive: true,
        seo: { title: `${def.name} — TAAJ Handloom`, description: def.description },
      },
      $setOnInsert: { slug: def.slug },
    },
    { new: true, upsert: true },
  );
  return doc.id;
}

async function run() {
  await connectDatabase();

  // Wipe products/variants so their category mapping stays in sync with the taxonomy.
  await Promise.all([Product.deleteMany({}), ProductVariant.deleteMany({})]);

  // Upsert the category tree (parents first, then children).
  const catMap = new Map<string, string>();
  let parentOrder = 1;
  for (const parent of TAXONOMY) {
    const parentId = await upsertCategory(parent, null, parentOrder++);
    catMap.set(parent.slug, parentId);
    let childOrder = 1;
    for (const child of parent.children ?? []) {
      const childId = await upsertCategory(child, parentId, childOrder++);
      catMap.set(child.slug, childId);
    }
  }
  logger.info(`Categories ready: ${catMap.size} total (${TAXONOMY.length} parents)`);

  let created = 0;
  for (const def of PRODUCTS) {
    const sku = def.sku.toUpperCase();
    const categoryId = catMap.get(def.sub);
    if (!categoryId) {
      logger.warn(`Skipping ${sku}: unknown subcategory ${def.sub}`);
      continue;
    }

    const hasVariants = Boolean(def.variants?.length);
    const gallerySeed = slugify(def.name);

    const product = await Product.create({
      name: def.name,
      slug: slugify(def.name),
      sku,
      category: categoryId,
      shortDescription: def.shortDescription,
      description: `${def.shortDescription} Handcrafted in Maheshwar, Madhya Pradesh by TAAJ Handloom. Colours may vary slightly due to the handwoven nature of the craft.`,
      careInstructions: 'Dry clean recommended. First wash separately in cold water.',
      pricing: { mrp: def.mrp, price: def.price, wholesalePrice: Math.round(def.price * 0.8), minWholesaleQty: 5 },
      attributes: { fabric: def.fabric, material: def.fabric, pattern: def.pattern, occasion: def.occasion, tags: def.tags },
      media: {
        mainImage: img(`${gallerySeed}-1`),
        gallery: [img(`${gallerySeed}-2`), img(`${gallerySeed}-3`)],
      },
      flags: {
        isFeatured: def.flags?.isFeatured ?? false,
        isBestSeller: def.flags?.isBestSeller ?? false,
        isNewArrival: def.flags?.isNewArrival ?? false,
        isActive: true,
      },
      hasVariants,
      baseStock: hasVariants
        ? { quantity: 0, reserved: 0, sold: 0, lowStockThreshold: 3 }
        : { quantity: def.quantity ?? 10, reserved: 0, sold: 0, lowStockThreshold: 3 },
      salesCount: def.flags?.isBestSeller ? 25 : 0,
      seo: { title: def.name, description: def.shortDescription },
    });

    if (def.variants) {
      for (const v of def.variants) {
        await ProductVariant.create({
          product: product.id,
          sku: `${sku}-${v.color.slice(0, 3).toUpperCase()}`,
          color: { name: v.color, hex: hex(v.color) },
          price: v.price,
          stock: { quantity: v.quantity, reserved: 0, sold: 0, lowStockThreshold: 2 },
          images: [img(`${gallerySeed}-${v.color.toLowerCase()}`)],
          isActive: true,
        });
      }
    }
    created++;
  }

  // ── Hero banners (Phase B) ──────────────────────────────────────────
  const heroImg = (seed: string, w: number, h: number) => ({
    url: `https://picsum.photos/seed/${seed}/${w}/${h}`,
  });
  const HERO_BANNERS = [
    {
      title: 'Authentic Maheshwari Handloom',
      subtitle: 'Handcrafted in Maheshwar, Madhya Pradesh — direct from our looms.',
      ctaLabel: 'Shop Sarees',
      ctaHref: '/sarees',
    },
    {
      title: 'Tradition Woven in Every Thread',
      subtitle: 'Silk-cotton weaves, signature borders and reversible pallus.',
      ctaLabel: 'Explore Collection',
      ctaHref: '/products',
    },
    {
      title: 'Direct from the Manufacturer',
      subtitle: 'Special wholesale pricing for retailers, boutiques and resellers.',
      ctaLabel: 'Wholesale Inquiry',
      ctaHref: '/wholesale',
    },
  ];
  await Banner.deleteMany({ type: 'HERO' });
  await Banner.insertMany(
    HERO_BANNERS.map((b, i) => ({
      ...b,
      type: 'HERO',
      desktopImage: heroImg(`taaj-hero-${i + 1}`, 1600, 760),
      mobileImage: heroImg(`taaj-hero-mobile-${i + 1}`, 900, 1100),
      sortOrder: i + 1,
      isActive: true,
    })),
  );
  logger.info(`✅ Seed complete — ${created} products + ${HERO_BANNERS.length} hero banners`);
  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'Seed failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
