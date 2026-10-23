import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import authRouter from './routes/auth';
import interviewsRouter from './routes/interviews';
import publicRouter from './routes/public';
import dashboardRouter from './routes/dashboard';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: (origin, c) => {
    const configured = c.env.FRONTEND_ORIGIN?.trim();
    if (!configured) return '*';
    return configured;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'Content-Disposition'],
  credentials: false,
  maxAge: 600,
}));

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal_server_error' }, 500);
});

app.get('/api/health', (c) =>
  c.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() })
);

app.route('/api/auth', authRouter);
app.route('/api/interviews', interviewsRouter);
app.route('/api/public/interviews', publicRouter);
app.route('/api/dashboard', dashboardRouter);

export default app;
