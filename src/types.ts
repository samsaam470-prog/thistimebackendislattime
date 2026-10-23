export interface Bindings {
  DB: D1Database;
  ADMIN_USER: string;
  ADMIN_PASS: string;
  JWT_KEY: string;
  FRONTEND_ORIGIN?: string;
}
