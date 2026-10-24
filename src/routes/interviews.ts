import { Hono } from 'hono';
import { z } from 'zod';
import { adminAuthMiddleware } from '../middleware/auth';
import { generateId, generatePublicId } from '../utils/ids';
import type { Bindings } from '../types';

const interviewsRouter = new Hono<{ Bindings: Bindings }>();
interviewsRouter.use('*', adminAuthMiddleware);

const optionSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1),
  code: z.string().trim().min(1),
  display_order: z.number().int().nonnegative(),
  branch_target: z.string().optional().nullable(),
  is_other: z.boolean().optional().default(false),
});

const questionSchema = z.object({
  id: z.string().optional(),
  question_text: z.string().trim().min(1),
  question_type: z.enum([
    'single_choice', 'multiple_choice', 'multiple_choice_other',
    'dropdown', 'short_text', 'long_text'
  ]),
  instructions: z.string().optional().nullable(),
  why_asking: z.string().optional().nullable(),
  is_required: z.boolean().default(true),
  display_order: z.number().int().nonnegative(),
  page_number: z.number().int().min(1).max(15),
  answer_display_preference: z.enum(['full', 'mapping']).default('full'),
  branch_side: z.enum(['agency', 'freelancer', 'both']).default('both'),
  options: z.array(optionSchema).default([]),
  branch_group: z.string().optional().nullable(),
});

const interviewSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  questions: z.array(questionSchema).min(1),
});

async function insertQuestion(
  db: D1Database,
  interviewId: string,
  q: z.infer<typeof questionSchema>,
  now: string
): Promise<void> {
  const qId = q.id ?? generateId('q');
  await db.prepare(
    `INSERT INTO questions (
      id, interview_id, question_text, question_type, instructions, why_asking,
      is_required, display_order, page_number, answer_display_preference,
      branch_side, branch_group, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    qId,
    interviewId,
    q.question_text,
    q.question_type,
    q.instructions ?? null,
    q.why_asking ?? null,
    q.is_required ? 1 : 0,
    q.display_order,
    q.page_number,
    q.answer_display_preference,
    q.branch_side,
    q.branch_group ?? null,
    now,
    now
  ).run();

  for (const opt of q.options) {
    await db.prepare(
      `INSERT INTO options (id, question_id, label, code, display_order, branch_target, is_other)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      opt.id ?? generateId('opt'),
      qId,
      opt.label,
      opt.code,
      opt.display_order,
      opt.branch_target ?? null,
      opt.is_other ? 1 : 0
    ).run();
  }
}

interviewsRouter.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, description, status, version, public_id, parent_version_id, root_version_id, created_at, updated_at, published_at
     FROM interviews ORDER BY created_at DESC LIMIT 200`
  ).all();
  return c.json({ interviews: results });
});

interviewsRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = interviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.format() }, 400);
  }

  const db = c.env.DB;
  const interviewId = generateId('int');
  const now = new Date().toISOString();

  await db.prepare(
    `INSERT INTO interviews (id, title, description, status, version, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', 1, ?, ?)`
  ).bind(interviewId, parsed.data.title, parsed.data.description ?? null, now, now).run();

  for (const q of parsed.data.questions) {
    await insertQuestion(db, interviewId, q, now);
  }

  return c.json({ success: true, interview_id: interviewId, version: 1 }, 201);
});

interviewsRouter.get('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const interview = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(id).first();
  if (!interview) return c.json({ error: 'Interview not found.' }, 404);

  const { results: questions } = await db.prepare(
    `SELECT * FROM questions WHERE interview_id = ? ORDER BY display_order ASC`
  ).bind(id).all();

  const fullQuestions = [];
  for (const q of questions as any[]) {
    const { results: options } = await db.prepare(
      `SELECT * FROM options WHERE question_id = ? ORDER BY display_order ASC`
    ).bind(q.id).all();
    fullQuestions.push({ ...q, options });
  }

  return c.json({ interview: { ...interview, questions: fullQuestions } });
});

interviewsRouter.put('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const existing = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(id).first() as any;
  if (!existing) return c.json({ error: 'Interview not found.' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = interviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', details: parsed.error.format() }, 400);
  }

  const now = new Date().toISOString();

  if (existing.status === 'published') {
    const newId = generateId('int');
    const nextVersion = Number(existing.version) + 1;
    const rootId = existing.root_version_id ?? existing.id;

    await db.prepare(
      `INSERT INTO interviews (id, title, description, status, version, parent_version_id, root_version_id, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
    ).bind(
      newId,
      parsed.data.title,
      parsed.data.description ?? null,
      nextVersion,
      existing.id,
      rootId,
      now,
      now
    ).run();

    for (const q of parsed.data.questions) {
      await insertQuestion(db, newId, q, now);
    }

    return c.json({ success: true, interview_id: newId, version: nextVersion }, 201);
  }

  await db.prepare(
    `UPDATE interviews SET title = ?, description = ?, updated_at = ? WHERE id = ?`
  ).bind(parsed.data.title, parsed.data.description ?? null, now, id).run();

  await db.prepare(`DELETE FROM questions WHERE interview_id = ?`).bind(id).run();

  for (const q of parsed.data.questions) {
    await insertQuestion(db, id, q, now);
  }

  return c.json({ success: true, interview_id: id, version: existing.version });
});

interviewsRouter.post('/:id/publish', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const interview = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(id).first() as any;
  if (!interview) return c.json({ error: 'Interview not found.' }, 404);

  const publicId = interview.public_id ?? generatePublicId();
  const now = new Date().toISOString();

  await db.prepare(
    `UPDATE interviews SET status = 'published', public_id = ?, published_at = ?, updated_at = ? WHERE id = ?`
  ).bind(publicId, now, now, id).run();

  return c.json({ success: true, interview_id: id, public_id: publicId, status: 'published' });
});

interviewsRouter.post('/:id/deactivate', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const now = new Date().toISOString();
  await db.prepare(`UPDATE interviews SET status = 'inactive', updated_at = ? WHERE id = ?`).bind(now, id).run();
  return c.json({ success: true, status: 'inactive' });
});

interviewsRouter.post('/:id/activate', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const now = new Date().toISOString();
  await db.prepare(`UPDATE interviews SET status = 'published', updated_at = ? WHERE id = ?`).bind(now, id).run();
  return c.json({ success: true, status: 'published' });
});

// DELETE = freeze (marks as inactive, keeps all data)
interviewsRouter.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const interview = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(id).first();
  if (!interview) return c.json({ error: 'Interview not found.' }, 404);

  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE interviews SET status = 'inactive', updated_at = ? WHERE id = ?`
  ).bind(now, id).run();

  return c.json({ success: true, status: 'inactive', message: 'Interview frozen. Data preserved.' });
});

export default interviewsRouter;
