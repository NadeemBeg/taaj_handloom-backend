import { Category, type CategoryDoc } from '../../models/Category.js';
import { Product } from '../../models/Product.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '@taaj/shared';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validators.js';

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  // Loop until we find a slug not used by another document.
   
  while (await Category.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    candidate = `${root}-${n++}`;
  }
  return candidate;
}

export async function listCategories(opts: { includeInactive?: boolean } = {}): Promise<CategoryDoc[]> {
  const filter = opts.includeInactive ? {} : { isActive: true };
  return Category.find(filter).sort({ sortOrder: 1, name: 1 });
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDoc> {
  const category = await Category.findOne({ slug: slug.toLowerCase() });
  if (!category) throw ApiError.notFound('Category not found');
  return category;
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryDoc> {
  const slug = await ensureUniqueSlug(input.slug || input.name);
  return Category.create({ ...input, slug });
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDoc> {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (input.slug || input.name) {
    category.set('slug', await ensureUniqueSlug(input.slug || input.name!, id));
  }
  const { slug: _slug, name: _name, ...rest } = input;
  category.set({ ...rest, ...(input.name ? { name: input.name } : {}) });
  await category.save();
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  const [hasChildren, hasProducts] = await Promise.all([
    Category.exists({ parent: id }),
    Product.exists({ $or: [{ category: id }, { subcategory: id }] }),
  ]);
  if (hasChildren) throw ApiError.conflict('Remove or reassign subcategories first');
  if (hasProducts) throw ApiError.conflict('Category has products; reassign them first');

  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound('Category not found');
}
