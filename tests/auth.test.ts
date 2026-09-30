import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/auth/auth.service.js';
import { startTestDb, stopTestDb, clearTestDb } from './helpers/testDb.js';

const app = createApp();

const SUPER = { name: 'Super', email: 'super@taaj.test', password: 'supersecret1', role: 'SUPER_ADMIN' as const };
const ORDERS = { name: 'Om', email: 'orders@taaj.test', password: 'ordersecret1', role: 'ORDER_MANAGER' as const };

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedUsers() {
  await createUser(SUPER);
  await createUser(ORDERS);
}

describe('Auth flow', () => {
  it('logs in with valid credentials and returns an access token + user', async () => {
    await seedUsers();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: SUPER.email, password: SUPER.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(SUPER.email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    // refresh cookie is set, http-only
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('taaj_rt='))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it('rejects invalid credentials with 401', async () => {
    await seedUsers();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: SUPER.email, password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('validates the login body (400 on bad email)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nope', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('returns the current user from /me with a valid token', async () => {
    await seedUsers();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ORDERS.email, password: ORDERS.password });
    const token = login.body.data.accessToken;

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(ORDERS.email);
    expect(me.body.data.user.role).toBe('ORDER_MANAGER');
  });

  it('blocks /me without a token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('refreshes the session using the cookie and rotates the token', async () => {
    await seedUsers();
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: SUPER.email, password: SUPER.password });

    const refreshed = await agent.post('/api/v1/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    // logout clears the session; a subsequent refresh fails
    const out = await agent.post('/api/v1/auth/logout');
    expect(out.status).toBe(200);
    const afterLogout = await agent.post('/api/v1/auth/refresh');
    expect(afterLogout.status).toBe(401);
  });
});

describe('RBAC', () => {
  it('forbids a non-super-admin from creating users (403)', async () => {
    await seedUsers();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ORDERS.email, password: ORDERS.password });
    const token = login.body.data.accessToken;

    const res = await request(app)
      .post('/api/v1/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'x@taaj.test', password: 'password123', role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('allows a super admin to create a user (201)', async () => {
    await seedUsers();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: SUPER.email, password: SUPER.password });
    const token = login.body.data.accessToken;

    const res = await request(app)
      .post('/api/v1/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Admin', email: 'new@taaj.test', password: 'password123', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('ADMIN');
  });
});
