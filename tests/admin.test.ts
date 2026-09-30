import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { Customer } from '../src/models/Customer.js';
import { InventoryTransaction } from '../src/models/InventoryTransaction.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();
const adminToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ADMIN' });
const invToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'INVENTORY_MANAGER' });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const contact = { name: 'Asha Devi', phone: '9876543210' };
const shippingAddress = { line1: '12 Ahilya Rd', city: 'Maheshwar', state: 'Madhya Pradesh', pincode: '451224', country: 'India' };

async function makeProduct(qty = 10) {
  const cat = await Category.create({ name: 'Sarees', slug: 'sarees' });
  return Product.create({
    name: 'Maheshwari Saree',
    slug: 'maheshwari-saree',
    sku: 'TH-SAR-001',
    category: cat.id,
    pricing: { mrp: 3000, price: 2499 },
    media: { mainImage: { url: 'https://x.test/a.jpg' } },
    baseStock: { quantity: qty, reserved: 0, sold: 0, lowStockThreshold: 1 },
  });
}
async function placeOrder(productId: string, quantity = 2) {
  const res = await request(app)
    .post('/api/v1/orders')
    .send({ contact, shippingAddress, items: [{ product: productId, quantity }] });
  return res.body.data.order;
}

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Admin order management', () => {
  it('lists orders and filters by status', async () => {
    const p = await makeProduct();
    await placeOrder(p.id);
    const res = await request(app).get('/api/v1/orders/admin?status=NEW').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.meta.total).toBe(1);
  });

  it('fetches full order detail by id', async () => {
    const p = await makeProduct();
    const order = await placeOrder(p.id);
    const res = await request(app).get(`/api/v1/orders/admin/${order._id}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.order.contact.phone).toBe(contact.phone);
  });

  it('commits stock exactly once on fulfilment and restocks on cancel', async () => {
    const p = await makeProduct(10);
    const order = await placeOrder(p.id, 2);

    // → CONFIRMED commits stock
    const confirm = await request(app)
      .patch(`/api/v1/orders/admin/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'CONFIRMED' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.order.stockCommitted).toBe(true);

    let fresh = await Product.findById(p.id);
    expect(fresh!.baseStock!.quantity).toBe(8);
    expect(fresh!.baseStock!.sold).toBe(2);
    expect(await InventoryTransaction.countDocuments({ reason: 'SALE' })).toBe(1);

    // → SHIPPED must NOT deduct again
    await request(app).patch(`/api/v1/orders/admin/${order._id}/status`).set(auth(adminToken)).send({ status: 'SHIPPED' });
    fresh = await Product.findById(p.id);
    expect(fresh!.baseStock!.quantity).toBe(8);

    // → CANCELLED restocks
    const cancel = await request(app)
      .patch(`/api/v1/orders/admin/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'CANCELLED' });
    expect(cancel.body.data.order.stockCommitted).toBe(false);
    fresh = await Product.findById(p.id);
    expect(fresh!.baseStock!.quantity).toBe(10);
    expect(await InventoryTransaction.countDocuments({ reason: 'RETURN' })).toBe(1);
  });

  it('records status history', async () => {
    const p = await makeProduct();
    const order = await placeOrder(p.id);
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${order._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'WHATSAPP_CONTACTED' });
    const history = res.body.data.order.statusHistory;
    expect(history[history.length - 1].status).toBe('WHATSAPP_CONTACTED');
  });

  it('blocks INVENTORY_MANAGER from order admin (403) and anonymous (401)', async () => {
    const forbidden = await request(app).get('/api/v1/orders/admin').set(auth(invToken));
    expect(forbidden.status).toBe(403);
    const anon = await request(app).get('/api/v1/orders/admin');
    expect(anon.status).toBe(401);
  });
});

describe('Customers', () => {
  it('lists customers created via orders and returns detail with orders', async () => {
    const p = await makeProduct();
    await placeOrder(p.id);
    const list = await request(app).get('/api/v1/customers').set(auth(adminToken));
    expect(list.body.data.items).toHaveLength(1);
    const id = list.body.data.items[0]._id;
    const detail = await request(app).get(`/api/v1/customers/${id}`).set(auth(adminToken));
    expect(detail.body.data.customer.phone).toBe(contact.phone);
    expect(detail.body.data.orders).toHaveLength(1);
  });
});

describe('Wholesale', () => {
  it('creates a wholesale profile, flips customer type, and rejects duplicates', async () => {
    const customer = await Customer.create({ name: 'Bulk Buyer', phone: '9000000000' });
    const create = await request(app)
      .post('/api/v1/wholesale')
      .set(auth(adminToken))
      .send({ customer: customer.id, businessName: 'Buyer Traders', minOrderQty: 10 });
    expect(create.status).toBe(201);

    const fresh = await Customer.findById(customer.id);
    expect(fresh!.type).toBe('WHOLESALE');

    const dup = await request(app)
      .post('/api/v1/wholesale')
      .set(auth(adminToken))
      .send({ customer: customer.id, businessName: 'Again' });
    expect(dup.status).toBe(409);

    const list = await request(app).get('/api/v1/wholesale').set(auth(adminToken));
    expect(list.body.data.items).toHaveLength(1);
  });
});

describe('Reports', () => {
  it('returns dashboard counts and order breakdowns', async () => {
    const p = await makeProduct();
    await placeOrder(p.id);
    const res = await request(app).get('/api/v1/reports/dashboard').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.counts.products).toBe(1);
    expect(res.body.data.counts.orders).toBe(1);
    expect(res.body.data.counts.customers).toBe(1);
    expect(res.body.data.ordersByStatus).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'NEW', count: 1 })]),
    );
  });
});
