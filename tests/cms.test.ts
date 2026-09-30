import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { User } from '../src/models/User.js';
import { Category } from '../src/models/Category.js';
import { Product } from '../src/models/Product.js';
import { hashPassword } from '../src/utils/password.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const adminToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ADMIN' });
const orderMgrToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ORDER_MANAGER' });

const heroBody = {
  type: 'HERO',
  title: 'Authentic Maheshwari Handloom',
  desktopImage: { url: 'https://x.test/hero.jpg' },
  ctaLabel: 'Shop',
  ctaHref: '/sarees',
  sortOrder: 1,
};

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Banners', () => {
  it('creates, lists (public active only), updates and deletes', async () => {
    const created = await request(app).post('/api/v1/banners').set(auth(adminToken)).send(heroBody);
    expect(created.status).toBe(201);
    const id = created.body.data.banner._id;

    const pub = await request(app).get('/api/v1/banners?type=HERO');
    expect(pub.status).toBe(200);
    expect(pub.body.data.banners).toHaveLength(1);

    // Hide it → public list drops it, admin list still shows it.
    await request(app).patch(`/api/v1/banners/${id}`).set(auth(adminToken)).send({ isActive: false });
    expect((await request(app).get('/api/v1/banners?type=HERO')).body.data.banners).toHaveLength(0);
    const adminList = await request(app).get('/api/v1/banners/admin?type=HERO').set(auth(adminToken));
    expect(adminList.body.data.banners).toHaveLength(1);

    const del = await request(app).delete(`/api/v1/banners/${id}`).set(auth(adminToken));
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/v1/banners/admin').set(auth(adminToken))).body.data.banners).toHaveLength(0);
  });

  it('excludes banners outside their schedule window from the public feed', async () => {
    const past = new Date(Date.now() - 86400000);
    await request(app).post('/api/v1/banners').set(auth(adminToken)).send({ ...heroBody, endsAt: past });
    const pub = await request(app).get('/api/v1/banners');
    expect(pub.body.data.banners).toHaveLength(0);
  });

  it('requires admin to write', async () => {
    expect((await request(app).post('/api/v1/banners').send(heroBody)).status).toBe(401);
    expect((await request(app).post('/api/v1/banners').set(auth(orderMgrToken)).send(heroBody)).status).toBe(403);
  });
});

describe('Website settings', () => {
  it('auto-creates defaults on first read and applies updates', async () => {
    const first = await request(app).get('/api/v1/settings');
    expect(first.status).toBe(200);
    expect(first.body.data.settings.brand.name).toBe('TAAJ Handloom');
    expect(first.body.data.settings.whatsappNumber).toBe('919999999999');
    expect(first.body.data.settings.homeSections.length).toBeGreaterThan(0);

    const patched = await request(app)
      .patch('/api/v1/settings')
      .set(auth(adminToken))
      .send({ whatsappNumber: '917000012345', social: { instagram: 'https://instagram.com/taaj' } });
    expect(patched.status).toBe(200);
    expect(patched.body.data.settings.whatsappNumber).toBe('917000012345');

    // Singleton — a second read reflects the update, not a new doc.
    const again = await request(app).get('/api/v1/settings');
    expect(again.body.data.settings.social.instagram).toBe('https://instagram.com/taaj');
  });

  it('rejects unknown fields and anonymous writes', async () => {
    expect((await request(app).patch('/api/v1/settings').send({ whatsappNumber: '1' })).status).toBe(401);
    const bad = await request(app).patch('/api/v1/settings').set(auth(adminToken)).send({ nope: true });
    expect(bad.status).toBe(400);
  });
});

describe('Coupons', () => {
  it('creates (uppercasing the code), rejects duplicates, updates and deletes', async () => {
    const created = await request(app)
      .post('/api/v1/coupons')
      .set(auth(adminToken))
      .send({ code: 'festive10', type: 'PERCENT', value: 10, minSubtotal: 1000 });
    expect(created.status).toBe(201);
    expect(created.body.data.coupon.code).toBe('FESTIVE10');
    const id = created.body.data.coupon._id;

    const dup = await request(app).post('/api/v1/coupons').set(auth(adminToken)).send({ code: 'festive10', value: 5 });
    expect(dup.status).toBe(409);

    const upd = await request(app).patch(`/api/v1/coupons/${id}`).set(auth(adminToken)).send({ value: 15 });
    expect(upd.body.data.coupon.value).toBe(15);

    expect((await request(app).delete(`/api/v1/coupons/${id}`).set(auth(adminToken))).status).toBe(200);
    expect((await request(app).get('/api/v1/coupons').set(auth(adminToken))).body.data.coupons).toHaveLength(0);
  });

  it('validates a coupon publicly: caps at maxDiscount and enforces the minimum', async () => {
    await request(app)
      .post('/api/v1/coupons')
      .set(auth(adminToken))
      .send({ code: 'festive20', type: 'PERCENT', value: 20, minSubtotal: 2000, maxDiscount: 800 });

    const ok = await request(app).post('/api/v1/coupons/validate').send({ code: 'FESTIVE20', subtotal: 2500 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.discount).toBe(500);

    const capped = await request(app).post('/api/v1/coupons/validate').send({ code: 'festive20', subtotal: 5000 });
    expect(capped.body.data.discount).toBe(800); // 20% of 5000 = 1000, capped

    const belowMin = await request(app).post('/api/v1/coupons/validate').send({ code: 'FESTIVE20', subtotal: 1000 });
    expect(belowMin.status).toBe(400);
  });
});

describe('Admin users (RBAC)', () => {
  async function makeSuperAdmin() {
    const user = await User.create({
      name: 'Root', email: 'root@taaj.test', role: 'SUPER_ADMIN',
      passwordHash: await hashPassword('changeme123'),
    });
    return { user, token: signAccessToken({ sub: user.id, role: 'SUPER_ADMIN' }) };
  }

  it('lets a super admin list, create and update users, with a self-lockout guard', async () => {
    const { user, token } = await makeSuperAdmin();

    const created = await request(app)
      .post('/api/v1/auth/users')
      .set(auth(token))
      .send({ name: 'Stock Staff', email: 'stock@taaj.test', password: 'password123', role: 'INVENTORY_MANAGER' });
    expect(created.status).toBe(201);
    const staffId = created.body.data.user._id ?? created.body.data.user.id;

    const list = await request(app).get('/api/v1/auth/users').set(auth(token));
    expect(list.body.data.users.length).toBe(2);

    const promote = await request(app).patch(`/api/v1/auth/users/${staffId}`).set(auth(token)).send({ role: 'ORDER_MANAGER' });
    expect(promote.body.data.user.role).toBe('ORDER_MANAGER');

    // Cannot demote / deactivate self.
    const selfDemote = await request(app).patch(`/api/v1/auth/users/${user.id}`).set(auth(token)).send({ isActive: false });
    expect(selfDemote.status).toBe(400);
  });

  it('forbids a plain ADMIN from managing users', async () => {
    expect((await request(app).get('/api/v1/auth/users').set(auth(adminToken))).status).toBe(403);
  });
});

describe('Orders — wholesale pricing + coupon', () => {
  const contact = { name: 'Bulk Buyer', phone: '9876500000' };
  const shippingAddress = { line1: '9 Loom St', city: 'Maheshwar', state: 'Madhya Pradesh', pincode: '451224', country: 'India' };

  async function makeProduct() {
    const cat = await Category.create({ name: 'Sarees', slug: 'sarees' });
    return Product.create({
      name: 'Wholesale Saree', slug: 'wholesale-saree', sku: 'TH-WS-1', category: cat.id,
      pricing: { mrp: 3000, price: 2499, wholesalePrice: 2000, minWholesaleQty: 1 },
      media: { mainImage: { url: 'https://x.test/a.jpg' } },
      baseStock: { quantity: 10, reserved: 0, sold: 0, lowStockThreshold: 1 },
    });
  }

  it('prices a wholesale order at the wholesale rate and applies a coupon', async () => {
    const product = await makeProduct();
    await request(app).post('/api/v1/coupons').set(auth(adminToken)).send({ code: 'BULK10', type: 'PERCENT', value: 10, minSubtotal: 1000 });

    const res = await request(app).post('/api/v1/orders').send({
      contact, shippingAddress,
      items: [{ product: product.id, quantity: 1 }],
      customerType: 'wholesale',
      couponCode: 'BULK10',
    });
    expect(res.status).toBe(201);
    const order = res.body.data.order;
    expect(order.customerType).toBe('WHOLESALE');
    expect(order.items[0].unitPrice).toBe(2000); // wholesale, not 2499
    expect(order.items[0].priceType).toBe('WHOLESALE');
    expect(order.amounts.subtotal).toBe(2000);
    expect(order.amounts.discount).toBe(200); // 10% of 2000
    expect(order.amounts.total).toBe(1800);
    expect(order.coupon.code).toBe('BULK10');
    expect(res.body.data.whatsappUrl).toContain('wa.me');
  });

  it('ignores an invalid coupon instead of failing the order', async () => {
    const product = await makeProduct();
    const res = await request(app).post('/api/v1/orders').send({
      contact, shippingAddress,
      items: [{ product: product.id, quantity: 1 }],
      couponCode: 'NOPE',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.amounts.discount).toBe(0);
    expect(res.body.data.order.customerType).toBe('INDIVIDUAL');
  });
});

describe('Audit log', () => {
  it('records an authenticated write and lists it', async () => {
    await request(app).post('/api/v1/coupons').set(auth(adminToken)).send({ code: 'AUDIT5', value: 5 });

    // The recorder writes on the response "finish" event (async); poll briefly.
    let entries: unknown[] = [];
    for (let i = 0; i < 20 && entries.length === 0; i++) {
      const res = await request(app).get('/api/v1/audit-logs').set(auth(adminToken));
      entries = res.body.data.items;
      if (entries.length === 0) await new Promise((r) => setTimeout(r, 25));
    }
    expect(entries.length).toBeGreaterThan(0);
    expect((entries[0] as { action: string }).action).toBe('POST');
    expect((entries[0] as { entity: string }).entity).toBe('coupons');
  });
});
