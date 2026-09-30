import request from 'supertest';
import { createApp } from '../src/app.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { ProductVariant } from '../src/models/ProductVariant.js';
import { Order } from '../src/models/Order.js';
import { Customer } from '../src/models/Customer.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();

const contact = { name: 'Asha Devi', phone: '9876543210' };
const shippingAddress = {
  line1: '12 Ahilya Road',
  city: 'Maheshwar',
  state: 'Madhya Pradesh',
  pincode: '451224',
  country: 'India',
};

async function makeProduct(over: Record<string, unknown> = {}) {
  const cat = await Category.create({ name: 'Sarees', slug: 'sarees' });
  return Product.create({
    name: 'Maheshwari Saree',
    slug: 'maheshwari-saree',
    sku: 'TH-SAR-001',
    category: cat.id,
    pricing: { mrp: 3000, price: 2499 },
    media: { mainImage: { url: 'https://x.test/a.jpg' } },
    baseStock: { quantity: 5, reserved: 0, sold: 0, lowStockThreshold: 1 },
    ...over,
  });
}

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Create order', () => {
  it('creates an order, computes totals from DB pricing, and returns a WhatsApp link', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ contact, shippingAddress, items: [{ product: product.id, quantity: 2 }] });

    expect(res.status).toBe(201);
    const { order, whatsappUrl } = res.body.data;
    expect(order.orderNumber).toMatch(/^TH-\d{6}-\d{4}$/);
    expect(order.amounts.subtotal).toBe(4998); // 2499 * 2, from DB
    expect(order.amounts.total).toBe(4998);
    expect(order.status).toBe('NEW');
    expect(order.source).toBe('WEBSITE');
    expect(order.items[0].snapshot.sku).toBe('TH-SAR-001');

    expect(whatsappUrl).toContain('https://wa.me/');
    expect(whatsappUrl).toContain(encodeURIComponent(order.orderNumber));

    // persisted + customer upserted
    expect(await Order.countDocuments()).toBe(1);
    const customer = await Customer.findOne({ phone: contact.phone });
    expect(customer!.orderCount).toBe(1);
  });

  it('does not trust client-sent price (recomputes from DB)', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post('/api/v1/orders')
      .send({
        contact,
        shippingAddress,
        items: [{ product: product.id, quantity: 1, unitPrice: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.order.amounts.total).toBe(2499);
  });

  it('rejects insufficient stock (400)', async () => {
    const product = await makeProduct({ baseStock: { quantity: 1, reserved: 0, sold: 0, lowStockThreshold: 0 } });
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ contact, shippingAddress, items: [{ product: product.id, quantity: 3 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Insufficient stock/);
  });

  it('requires a variant when the product has variants (400)', async () => {
    const product = await makeProduct({ hasVariants: true });
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ contact, shippingAddress, items: [{ product: product.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('accepts a valid variant and snapshots its colour + sku', async () => {
    const product = await makeProduct({ hasVariants: true });
    const variant = await ProductVariant.create({
      product: product.id,
      sku: 'TH-SAR-001-GRN',
      color: { name: 'Green', hex: '#4F7A5C' },
      price: 2599,
      stock: { quantity: 4, reserved: 0, sold: 0, lowStockThreshold: 1 },
    });
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ contact, shippingAddress, items: [{ product: product.id, variant: variant.id, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.order.items[0].snapshot.color).toBe('Green');
    expect(res.body.data.order.items[0].snapshot.sku).toBe('TH-SAR-001-GRN');
    expect(res.body.data.order.amounts.total).toBe(2599); // variant price override
  });

  it('validates contact + address (bad phone/pincode → 400)', async () => {
    const product = await makeProduct();
    const res = await request(app)
      .post('/api/v1/orders')
      .send({
        contact: { name: 'X', phone: '123' },
        shippingAddress: { ...shippingAddress, pincode: '12' },
        items: [{ product: product.id, quantity: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty cart (400)', async () => {
    const res = await request(app).post('/api/v1/orders').send({ contact, shippingAddress, items: [] });
    expect(res.status).toBe(400);
  });

  it('generates sequential order numbers within a month', async () => {
    const product = await makeProduct({ baseStock: { quantity: 50, reserved: 0, sold: 0, lowStockThreshold: 1 } });
    const place = () =>
      request(app).post('/api/v1/orders').send({ contact, shippingAddress, items: [{ product: product.id, quantity: 1 }] });
    const a = await place();
    const b = await place();
    const seqA = Number(a.body.data.order.orderNumber.split('-')[2]);
    const seqB = Number(b.body.data.order.orderNumber.split('-')[2]);
    expect(seqB).toBe(seqA + 1);
  });
});

describe('Order lookup (public summary)', () => {
  it('returns a non-PII summary and 404 for unknown', async () => {
    const product = await makeProduct();
    const created = await request(app)
      .post('/api/v1/orders')
      .send({ contact, shippingAddress, items: [{ product: product.id, quantity: 1 }] });
    const num = created.body.data.order.orderNumber;

    const res = await request(app).get(`/api/v1/orders/${num}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order.orderNumber).toBe(num);
    expect(res.body.data.order).not.toHaveProperty('contact');
    expect(res.body.data.order).not.toHaveProperty('shippingAddress');

    const missing = await request(app).get('/api/v1/orders/TH-000000-9999');
    expect(missing.status).toBe(404);
  });
});
