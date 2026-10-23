import { Hono } from 'hono';
import { z } from 'zod';
import { createToken, verifyToken } from '../middleware/auth';
import type { Bindings } from '../types';

const authRouter = new Hono<{ Bindings: Bindings }>();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (c) => {
  const { ADMIN_USER, ADMIN_PASS, JWT_KEY } = c.env;
  if (!ADMIN_USER || !ADMIN_PASS || !JWT_KEY) {
    return c.json({ error: 'config_error', message: 'Auth not configured.' }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.format() }, 400);
  }

  const { username, password } = parsed.data;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return c.json({ error: 'invalid_credentials', message: 'Invalid credentials.' }, 401);
  }

  const token = await createToken(username, JWT_KEY);
  return c.json({ success: true, token, user: username }, 200);
});

authRouter.get('/me', async (c) => {
  const JWT_KEY = c.env.JWT_KEY;
  if (!JWT_KEY) {
    return c.json({ authenticated: false }, 401);
  }
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ authenticated: false }, 401);
  }
  const token = authHeader.slice(7).trim();
  const user = await verifyToken(token, JWT_KEY);
  if (!user || user !== c.env.ADMIN_USER) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({ authenticated: true, user });
});

export default authRouter;
