import { Types, type FilterQuery } from 'mongoose';
import { Product, type ProductDoc } from '../../models/Product.js';
import { ProductVariant } from '../../models/ProductVariant.js';
import { Category } from '../../models/Category.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '@taaj/shared';
import { buildPaginationMeta, getSkip } from '../../utils/pagination.js';
import type { PaginationMeta } from '@taaj/shared';
import type {
  CreateProductInput,
  UpdateProductInput,
  CreateVariantInput,
  ProductListQuery,
} from './product.validators.js';

// ── slug / lookup helpers ─────────────────────────────────────────────
async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
   
  while (await Product.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

/** Resolve a category slug or id to an ObjectId string; null if not found. */
async function resolveCategoryId(slugOrId: string): Promise<string | null> {
  if (Types.ObjectId.isValid(slugOrId)) return slugOrId;
  const cat = await Category.findOne({ slug: slugOrId.toLowerCase() }).select('_id');
  return cat ? cat.id : null;
}

const SORT_MAP: Record<ProductListQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { 'pricing.price': 1 },
  price_desc: { 'pricing.price': -1 },
  popular: { salesCount: -1, createdAt: -1 },
  best_selling: { salesCount: -1 },
};

// ── catalog listing ───────────────────────────────────────────────────
export async function listProducts(
  query: ProductListQuery,
  opts: { includeInactive?: boolean } = {},
): Promise<{ items: ProductDoc[]; meta: PaginationMeta }> {
  const and: FilterQuery<ProductDoc>[] = [];

  if (!opts.includeInactive) and.push({ 'flags.isActive': true });

  if (query.category) {
    // Resolve the category, then expand a parent to include its subcategories'
    // products so a parent landing page (/sarees) shows the whole department.
    const cat = await Category.findOne(
      Types.ObjectId.isValid(query.category)
        ? { _id: query.category }
        : { slug: query.category.toLowerCase() },
    ).select('_id');
    if (!cat) {
      // A non-resolving category slug should yield no results, not all results.
      and.push({ category: new Types.ObjectId() });
    } else {
      const childIds = await Category.find({ parent: cat._id }).distinct('_id');
      and.push({ category: { $in: [cat._id, ...childIds] } });
    }
  }
  if (query.subcategory) {
    const id = await resolveCategoryId(query.subcategory);
    and.push({ subcategory: id ?? new Types.ObjectId() });
  }

  if (query.minPrice != null) and.push({ 'pricing.price': { $gte: query.minPrice } });
  if (query.maxPrice != null) and.push({ 'pricing.price': { $lte: query.maxPrice } });

  if (query.isNewArrival) and.push({ 'flags.isNewArrival': true });
  if (query.isBestSeller) and.push({ 'flags.isBestSeller': true });
  if (query.isFeatured) and.push({ 'flags.isFeatured': true });

  if (query.hasDiscount) and.push({ $expr: { $lt: ['$pricing.price', '$pricing.mrp'] } });

  if (query.fabric) and.push({ 'attributes.fabric': new RegExp(`^${escapeRegex(query.fabric)}$`, 'i') });
  if (query.pattern) and.push({ 'attributes.pattern': new RegExp(`^${escapeRegex(query.pattern)}$`, 'i') });
  if (query.occasion) and.push({ 'attributes.occasion': new RegExp(`^${escapeRegex(query.occasion)}$`, 'i') });

  // Color filter → products having an active variant of that color.
  if (query.color?.length) {
    const productIds = await ProductVariant.distinct('product', {
      isActive: true,
      'color.name': { $in: query.color },
    });
    and.push({ _id: { $in: productIds } });
  }

  // Availability filter (accounts for both variant and non-variant products).
  if (query.inStock != null) {
    const inStockVariantProductIds = await ProductVariant.distinct('product', {
      isActive: true,
      $expr: { $gt: [{ $subtract: ['$stock.quantity', '$stock.reserved'] }, 0] },
    });
    const nonVariantInStock = {
      hasVariants: false,
      $expr: { $gt: [{ $subtract: ['$baseStock.quantity', '$baseStock.reserved'] }, 0] },
    };
    if (query.inStock) {
      and.push({ $or: [nonVariantInStock, { hasVariants: true, _id: { $in: inStockVariantProductIds } }] });
    } else {
      and.push({
        $or: [
          { hasVariants: false, $expr: { $lte: [{ $subtract: ['$baseStock.quantity', '$baseStock.reserved'] }, 0] } },
          { hasVariants: true, _id: { $nin: inStockVariantProductIds } },
        ],
      });
    }
  }

  const filter: FilterQuery<ProductDoc> = and.length ? { $and: and } : {};

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(SORT_MAP[query.sort])
      .skip(getSkip(query.page, query.limit))
      .limit(query.limit)
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug'),
    Product.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(total, query.page, query.limit) };
}

// ── single product (+ variants) ──────────────────────────────────────
export async function getProductBySlug(
  slug: string,
): Promise<{ product: ProductDoc; variants: unknown[] }> {
  const product = await Product.findOne({ slug: slug.toLowerCase() })
    .populate('category', 'name slug')
    .populate('subcategory', 'name slug');
  if (!product) throw ApiError.notFound('Product not found');

  const variants = product.hasVariants
    ? await ProductVariant.find({ product: product.id, isActive: true })
    : [];
  return { product, variants };
}

// ── search / autocomplete ────────────────────────────────────────────
export async function searchProducts(q: string, limit: number): Promise<ProductDoc[]> {
  const regex = new RegExp(escapeRegex(q), 'i');
  return Product.find({
    'flags.isActive': true,
    $or: [
      { name: regex },
      { sku: regex },
      { 'attributes.tags': regex },
      { 'attributes.fabric': regex },
    ],
  })
    .select('name slug sku pricing media.mainImage')
    .limit(limit);
}

// ── admin CRUD ───────────────────────────────────────────────────────
export async function createProduct(input: CreateProductInput): Promise<ProductDoc> {
  await assertCategoryExists(input.category);
  const slug = await ensureUniqueSlug(input.slug || input.name);
  const sku = input.sku.toUpperCase();
  const existing = await Product.exists({ sku });
  if (existing) throw ApiError.conflict('A product with this SKU already exists');
  return Product.create({ ...input, slug, sku });
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductDoc> {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (input.category) await assertCategoryExists(input.category);

  if (input.slug || input.name) {
    product.set('slug', await ensureUniqueSlug(input.slug || input.name!, id));
  }
  if (input.sku) {
    const sku = input.sku.toUpperCase();
    if (await Product.exists({ sku, _id: { $ne: id } })) {
      throw ApiError.conflict('A product with this SKU already exists');
    }
    product.set('sku', sku);
  }

  const { slug: _s, sku: _k, ...rest } = input;
  product.set(rest);
  await product.save();
  return product;
}

export async function deleteProduct(id: string): Promise<void> {
  const product = await Product.findByIdAndDelete(id);
  if (!product) throw ApiError.notFound('Product not found');
  await ProductVariant.deleteMany({ product: id });
}

// ── variants ─────────────────────────────────────────────────────────
export async function listVariants(productId: string) {
  await assertProductExists(productId);
  return ProductVariant.find({ product: productId });
}

export async function addVariant(productId: string, input: CreateVariantInput) {
  const product = await assertProductExists(productId);
  const sku = input.sku.toUpperCase();
  if (await ProductVariant.exists({ sku })) {
    throw ApiError.conflict('A variant with this SKU already exists');
  }
  const variant = await ProductVariant.create({ ...input, sku, product: productId });
  if (!product.hasVariants) {
    product.set('hasVariants', true);
    await product.save();
  }
  return variant;
}

export async function updateVariant(variantId: string, input: Partial<CreateVariantInput>) {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) throw ApiError.notFound('Variant not found');
  if (input.sku) {
    const sku = input.sku.toUpperCase();
    if (await ProductVariant.exists({ sku, _id: { $ne: variantId } })) {
      throw ApiError.conflict('A variant with this SKU already exists');
    }
    variant.set('sku', sku);
  }
  const { sku: _s, ...rest } = input;
  variant.set(rest);
  await variant.save();
  return variant;
}

export async function deleteVariant(variantId: string): Promise<void> {
  const variant = await ProductVariant.findByIdAndDelete(variantId);
  if (!variant) throw ApiError.notFound('Variant not found');

  const remaining = await ProductVariant.countDocuments({ product: variant.product });
  if (remaining === 0) {
    await Product.findByIdAndUpdate(variant.product, { hasVariants: false });
  }
}

// ── internals ────────────────────────────────────────────────────────
async function assertCategoryExists(id: string) {
  if (!(await Category.exists({ _id: id }))) throw ApiError.badRequest('Category does not exist');
}
async function assertProductExists(id: string): Promise<ProductDoc> {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
