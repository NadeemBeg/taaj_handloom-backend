/**
 * Test environment defaults. Set BEFORE any module reads process.env
 * (env.ts validates on import). These are throwaway values for tests only.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/taaj_handloom_test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_0123456789';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_0123456789';
process.env.COOKIE_SECRET = 'test_cookie_secret_0123456789';
process.env.WHATSAPP_NUMBER = '919999999999';
process.env.LOG_LEVEL = 'silent';
