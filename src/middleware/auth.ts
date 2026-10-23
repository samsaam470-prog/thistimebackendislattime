import { SignJWT, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../types';

export async function createToken(username: string, jwtKey: string): Promise<string> {
  const secret = new TextEncoder().encode(jwtKey);
  return await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
}

export async function verifyToken(token: string, jwtKey: string): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(jwtKey);
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const adminAuthMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const jwtKey = c.env.JWT_KEY;
  if (!jwtKey) {
    return c.json({ error: 'config_error', message: 'JWT_KEY not configured.' }, 500);
  }
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', message: 'Missing bearer token.' }, 401);
  }
  const token = authHeader.slice(7).trim();
  const user = await verifyToken(token, jwtKey);
  if (!user || user !== c.env.ADMIN_USER) {
    return c.json({ error: 'unauthorized', message: 'Invalid or expired token.' }, 401);
  }
  await next();
};
