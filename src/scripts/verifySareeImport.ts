import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';

const PREFIXES = /^(MHS|GRS|LBS|TSS|ZCS|GJB|BBS|BSB|MBB|SBC|SBM|HPS|KPS|DBS|CTS|NYS|STB|SBZ|VBS|ZLS)\d{3}$/;

async function run() {
  await connectDatabase();
  const imported = await Product.find({ sku: { $regex: PREFIXES } }).populate('category', 'name slug');
  const all = await Product.countDocuments();

  // duplicate SKUs across the whole collection
  const dupes = await Product.aggregate([
    { $group: { _id: '$sku', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  // duplicate slugs
  const dupeSlugs = await Product.aggregate([
    { $group: { _id: '$slug', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);

  const badStock = imported.filter(
    (p) => p.baseStock?.quantity !== 50 || p.baseStock?.lowStockThreshold !== 3,
  );
  const inactive = imported.filter((p) => !p.flags?.isActive);
  const noCategory = imported.filter((p) => !p.category);
  const noImage = imported.filter((p) => !p.media?.mainImage?.url);

  const featured = imported.filter((p) => p.flags?.isFeatured).length;
  const bestseller = imported.filter((p) => p.flags?.isBestSeller).length;
  const newArrival = imported.filter((p) => p.flags?.isNewArrival).length;

  const catCounts = new Map<string, number>();
  for (const p of imported) {
    const c = p.category as unknown as { name?: string } | null;
    const key = c?.name ?? '(none)';
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }

  const totalCats = await Category.countDocuments();
  const sample = imported.slice(0, 5).map((p) => ({
    sku: p.sku,
    name: p.name,
    price: p.pricing?.price,
    qty: p.baseStock?.quantity,
    img: p.media?.mainImage?.url,
  }));

  console.log('===== SAREE IMPORT VERIFICATION =====');
  console.log('Total products in DB        :', all);
  console.log('Imported saree products     :', imported.length);
  console.log('Total categories in DB      :', totalCats);
  console.log('Duplicate SKUs              :', dupes.length, dupes.map((d) => d._id).join(', '));
  console.log('Duplicate slugs             :', dupeSlugs.length);
  console.log('Wrong stock (≠50/≠3)        :', badStock.length);
  console.log('Inactive imported products  :', inactive.length);
  console.log('Missing category            :', noCategory.length);
  console.log('Missing main image          :', noImage.length);
  console.log('Flags — Featured            :', featured);
  console.log('Flags — Best Seller         :', bestseller);
  console.log('Flags — New Arrival         :', newArrival);
  console.log('\nProducts per category:');
  [...catCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toString().padStart(3)}  ${k}`));
  console.log('\nSample:');
  sample.forEach((s) => console.log(' ', JSON.stringify(s)));

  await disconnectDatabase();
}

run().catch(async (e) => {
  console.error(e);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
