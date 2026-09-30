import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { ProductVariant } from '../src/models/ProductVariant.js';
import { InventoryTransaction } from '../src/models/InventoryTransaction.js';
import {
  reserveStock,
  releaseReservation,
  commitSale,
  availableOf,
} from '../src/modules/inventory/inventory.service.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();
const invToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'INVENTORY_MANAGER' });
const orderToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ORDER_MANAGER' });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function makeProduct(stock = { quantity: 10, reserved: 0, sold: 0, lowStockThreshold: 3 }) {
  const cat = await Category.create({ name: 'Sarees', slug: 'sarees' });
  return Product.create({
    name: 'Saree',
    slug: 'saree',
    sku: 'TH-1',
    category: cat.id,
    pricing: { mrp: 3000, price: 2500 },
    media: { mainImage: { url: 'https://x.test/a.jpg' } },
    baseStock: stock,
  });
}

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Stock adjustment + audit', () => {
  it('applies a positive change and writes a transaction with prev/new/change', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(invToken))
      .send({ product: product.id, change: 5, reason: 'NEW_STOCK', note: 'restock' });

    expect(res.status).toBe(200);
    expect(res.body.data.stock.quantity).toBe(15);

    const tx = await InventoryTransaction.findOne({ product: product.id });
    expect(tx).not.toBeNull();
    expect(tx!.previousStock).toBe(10);
    expect(tx!.newStock).toBe(15);
    expect(tx!.change).toBe(5);
    expect(tx!.reason).toBe('NEW_STOCK');
  });

  it('accrues sold on a negative SALE adjustment', async () => {
    const product = await makeProduct();
    await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(invToken))
      .send({ product: product.id, change: -4, reason: 'SALE' });

    const fresh = await Product.findById(product.id);
    expect(fresh!.baseStock!.quantity).toBe(6);
    expect(fresh!.baseStock!.sold).toBe(4);
  });

  it('rejects a change that drives stock below zero (400)', async () => {
    const product = await makeProduct({ quantity: 3, reserved: 0, sold: 0, lowStockThreshold: 1 });
    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(invToken))
      .send({ product: product.id, change: -5, reason: 'DAMAGE' });
    expect(res.status).toBe(400);
  });

  it('rejects a zero change and an invalid reason (validation 400)', async () => {
    const product = await makeProduct();
    const zero = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(invToken))
      .send({ product: product.id, change: 0, reason: 'NEW_STOCK' });
    expect(zero.status).toBe(400);

    const badReason = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(invToken))
      .send({ product: product.id, change: 1, reason: 'NONSENSE' });
    expect(badReason.status).toBe(400);
  });
});

describe('Authorization', () => {
  it('blocks ORDER_MANAGER from adjusting stock (403)', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(orderToken))
      .send({ product: product.id, change: 1, reason: 'NEW_STOCK' });
    expect(res.status).toBe(403);
  });

  it('blocks unauthenticated access (401)', async () => {
    const res = await request(app).get('/api/v1/inventory/low-stock');
    expect(res.status).toBe(401);
  });
});

describe('Low stock', () => {
  it('lists products at or below threshold', async () => {
    await makeProduct({ quantity: 2, reserved: 0, sold: 0, lowStockThreshold: 3 }); // low
    const cat = await Category.findOne({ slug: 'sarees' });
    await Product.create({
      name: 'Plenty',
      slug: 'plenty',
      sku: 'TH-2',
      category: cat!.id,
      pricing: { mrp: 100, price: 90 },
      media: { mainImage: { url: 'https://x.test/b.jpg' } },
      baseStock: { quantity: 50, reserved: 0, sold: 0, lowStockThreshold: 3 },
    });

    const res = await request(app).get('/api/v1/inventory/low-stock').set(auth(invToken));
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].sku).toBe('TH-1');
  });
});

describe('Transaction history', () => {
  it('paginates and filters by reason', async () => {
    const product = await makeProduct();
    const send = (change: number, reason: string) =>
      request(app).post('/api/v1/inventory/adjust').set(auth(invToken)).send({ product: product.id, change, reason });
    await send(5, 'NEW_STOCK');
    await send(-2, 'SALE');
    await send(3, 'MANUFACTURING');

    const all = await request(app).get('/api/v1/inventory/transactions?limit=2').set(auth(invToken));
    expect(all.body.data.meta.total).toBe(3);
    expect(all.body.data.items).toHaveLength(2);

    const sales = await request(app).get('/api/v1/inventory/transactions?reason=SALE').set(auth(invToken));
    expect(sales.body.data.items).toHaveLength(1);
    expect(sales.body.data.items[0].reason).toBe('SALE');
  });
});

describe('Reservation lifecycle (service)', () => {
  it('reserve reduces available; release restores it', async () => {
    const product = await makeProduct({ quantity: 10, reserved: 0, sold: 0, lowStockThreshold: 3 });
    await reserveStock(product.id, null, 4);
    let fresh = await Product.findById(product.id);
    expect(availableOf(fresh!.baseStock as never)).toBe(6);

    await releaseReservation(product.id, null, 4);
    fresh = await Product.findById(product.id);
    expect(availableOf(fresh!.baseStock as never)).toBe(10);
  });

  it('rejects reserving more than available', async () => {
    const product = await makeProduct({ quantity: 5, reserved: 0, sold: 0, lowStockThreshold: 1 });
    await expect(reserveStock(product.id, null, 6)).rejects.toThrow(/Insufficient/);
  });

  it('commitSale decrements on-hand, clears reservation, increments sold, and logs', async () => {
    const product = await makeProduct({ quantity: 10, reserved: 3, sold: 0, lowStockThreshold: 3 });
    await commitSale(product.id, null, 3);
    const fresh = await Product.findById(product.id);
    expect(fresh!.baseStock!.quantity).toBe(7);
    expect(fresh!.baseStock!.reserved).toBe(0);
    expect(fresh!.baseStock!.sold).toBe(3);

    const tx = await InventoryTransaction.findOne({ product: product.id, reason: 'SALE' });
    expect(tx!.change).toBe(-3);
  });

  it('works on a variant stock target', async () => {
    const product = await makeProduct();
    const variant = await ProductVariant.create({
      product: product.id,
      sku: 'TH-1-GRN',
      color: { name: 'Green' },
      stock: { quantity: 8, reserved: 0, sold: 0, lowStockThreshold: 2 },
    });
    await reserveStock(product.id, variant.id, 2);
    const fresh = await ProductVariant.findById(variant.id);
    expect(availableOf(fresh!.stock as never)).toBe(6);
  });
});
