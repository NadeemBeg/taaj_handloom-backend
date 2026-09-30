import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { Category } from '../src/models/Category.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();

const adminToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ADMIN' });
const orderMgrToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ORDER_MANAGER' });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const IMG = { url: 'https://cdn.example.com/main.jpg' };

async function makeCategory(name = 'Sarees') {
  return Category.create({ name, slug: name.toLowerCase() });
}

function productBody(over: Record<string, unknown> = {}) {
  return {
    name: 'Maheshwari Saree',
    sku: 'TH-SAR-001',
    category: '', // filled by caller
    pricing: { mrp: 3000, price: 2499 },
    media: { mainImage: IMG },
    attributes: { fabric: 'Cotton Silk', pattern: 'Zari', occasion: ['Festive'], tags: ['handloom'] },
    baseStock: { quantity: 10, lowStockThreshold: 2 },
    ...over,
  };
}

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Category CRUD + authorization', () => {
  it('creates a category and auto-generates a slug', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set(auth(adminToken))
      .send({ name: 'Chunari' });
    expect(res.status).toBe(201);
    expect(res.body.data.category.slug).toBe('chunari');
  });

  it('rejects category creation without a token (401)', async () => {
    const res = await request(app).post('/api/v1/categories').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('lists only active categories publicly', async () => {
    await Category.create({ name: 'Active', slug: 'active' });
    await Category.create({ name: 'Hidden', slug: 'hidden', isActive: false });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(1);
    expect(res.body.data.categories[0].slug).toBe('active');
  });
});

describe('Product creation', () => {
  it('creates a product (admin) with a generated slug', async () => {
    const cat = await makeCategory();
    const res = await request(app)
      .post('/api/v1/products')
      .set(auth(adminToken))
      .send(productBody({ category: cat.id }));
    expect(res.status).toBe(201);
    expect(res.body.data.product.slug).toBe('maheshwari-saree');
    expect(res.body.data.product.sku).toBe('TH-SAR-001');
  });

  it('rejects a duplicate SKU (409)', async () => {
    const cat = await makeCategory();
    await request(app).post('/api/v1/products').set(auth(adminToken)).send(productBody({ category: cat.id }));
    const dup = await request(app)
      .post('/api/v1/products')
      .set(auth(adminToken))
      .send(productBody({ category: cat.id, name: 'Another', slug: 'another' }));
    expect(dup.status).toBe(409);
  });

  it('rejects price greater than MRP (400)', async () => {
    const cat = await makeCategory();
    const res = await request(app)
      .post('/api/v1/products')
      .set(auth(adminToken))
      .send(productBody({ category: cat.id, pricing: { mrp: 1000, price: 2000 } }));
    expect(res.status).toBe(400);
  });

  it('forbids ORDER_MANAGER from creating products (403)', async () => {
    const cat = await makeCategory();
    const res = await request(app)
      .post('/api/v1/products')
      .set(auth(orderMgrToken))
      .send(productBody({ category: cat.id }));
    expect(res.status).toBe(403);
  });
});

describe('Catalog listing, filtering & sorting', () => {
  async function seedCatalog() {
    const sarees = await Category.create({ name: 'Sarees', slug: 'sarees' });
    const suits = await Category.create({ name: 'Suits', slug: 'suits' });
    const mk = (over: Record<string, unknown>) =>
      request(app).post('/api/v1/products').set(auth(adminToken)).send(productBody(over));

    await mk({ category: sarees.id, name: 'Green Saree', sku: 'S1', pricing: { mrp: 3000, price: 2000 } });
    await mk({ category: sarees.id, name: 'Pricey Saree', sku: 'S2', pricing: { mrp: 6000, price: 6000 }, baseStock: { quantity: 0 } });
    await mk({ category: suits.id, name: 'Cheap Suit', sku: 'S3', pricing: { mrp: 1500, price: 1200 } });
    return { sarees, suits };
  }

  it('paginates and returns meta', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/v1/products?limit=2&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('filters by category slug', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/v1/products?category=suits');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].sku).toBe('S3');
  });

  it('filters by price range and sorts price ascending', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/v1/products?maxPrice=2500&sort=price_asc');
    const skus = res.body.data.items.map((p: { sku: string }) => p.sku);
    expect(skus).toEqual(['S3', 'S1']); // 1200 then 2000
  });

  it('filters hasDiscount (price < mrp)', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/v1/products?hasDiscount=true');
    const skus = res.body.data.items.map((p: { sku: string }) => p.sku).sort();
    expect(skus).toEqual(['S1', 'S3']); // S2 has no discount
  });

  it('filters inStock=false to out-of-stock products', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/v1/products?inStock=false');
    const skus = res.body.data.items.map((p: { sku: string }) => p.sku);
    expect(skus).toEqual(['S2']); // quantity 0
  });
});

describe('Variants', () => {
  async function createProductDoc() {
    const cat = await makeCategory();
    const res = await request(app).post('/api/v1/products').set(auth(adminToken)).send(productBody({ category: cat.id }));
    return res.body.data.product;
  }

  it('adds a variant, flips hasVariants, and lists it', async () => {
    const product = await createProductDoc();
    const add = await request(app)
      .post(`/api/v1/products/${product._id}/variants`)
      .set(auth(adminToken))
      .send({ sku: 'TH-SAR-001-GRN', color: { name: 'Green', hex: '#4F7A5C' }, stock: { quantity: 5 } });
    expect(add.status).toBe(201);

    const detail = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(detail.body.data.product.hasVariants).toBe(true);
    expect(detail.body.data.variants).toHaveLength(1);
  });

  it('filters products by variant color', async () => {
    const product = await createProductDoc();
    await request(app)
      .post(`/api/v1/products/${product._id}/variants`)
      .set(auth(adminToken))
      .send({ sku: 'TH-SAR-001-PNK', color: { name: 'Pink' }, stock: { quantity: 5 } });

    const res = await request(app).get('/api/v1/products?color=Pink');
    expect(res.body.data.items).toHaveLength(1);
    const none = await request(app).get('/api/v1/products?color=Blue');
    expect(none.body.data.items).toHaveLength(0);
  });

  it('rejects duplicate variant SKU (409)', async () => {
    const product = await createProductDoc();
    const body = { sku: 'DUP-1', color: { name: 'Red' } };
    await request(app).post(`/api/v1/products/${product._id}/variants`).set(auth(adminToken)).send(body);
    const dup = await request(app).post(`/api/v1/products/${product._id}/variants`).set(auth(adminToken)).send(body);
    expect(dup.status).toBe(409);
  });
});

describe('Search', () => {
  it('finds products by name and sku', async () => {
    const cat = await makeCategory();
    await request(app).post('/api/v1/products').set(auth(adminToken)).send(productBody({ category: cat.id, name: 'Emerald Weave', sku: 'EMR-9' }));

    const byName = await request(app).get('/api/v1/products/search?q=emerald');
    expect(byName.body.data.results).toHaveLength(1);
    const bySku = await request(app).get('/api/v1/products/search?q=EMR-9');
    expect(bySku.body.data.results).toHaveLength(1);
    const none = await request(app).get('/api/v1/products/search?q=zzznope');
    expect(none.body.data.results).toHaveLength(0);
  });
});
