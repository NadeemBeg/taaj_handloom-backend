import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';

const app = createApp();
const adminToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ADMIN' });
const orderToken = signAccessToken({ sub: new Types.ObjectId().toString(), role: 'ORDER_MANAGER' });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Image uploads', () => {
  it('reports Cloudinary as not configured in tests', async () => {
    const res = await request(app).get('/api/v1/uploads/status').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(false);
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).post('/api/v1/uploads/image');
    expect(res.status).toBe(401);
  });

  it('forbids ORDER_MANAGER (403)', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set(auth(orderToken))
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no file (400)', async () => {
    const res = await request(app).post('/api/v1/uploads/image').set(auth(adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects a non-image file (400)', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set(auth(adminToken))
      .attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid image but returns 503 when Cloudinary is unconfigured', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/image')
      .set(auth(adminToken))
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/i);
  });
});
