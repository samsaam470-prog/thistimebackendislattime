import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/auth';
import type { Bindings } from '../types';

const dashboardRouter = new Hono<{ Bindings: Bindings }>();
dashboardRouter.use('*', adminAuthMiddleware);

dashboardRouter.get('/summary', async (c) => {
  const db = c.env.DB;

  const active = await db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'published'`).first() as any;
  const drafts = await db.prepare(`SELECT COUNT(*) as c FROM interviews WHERE status = 'draft'`).first() as any;
  const subs = await db.prepare(`SELECT COUNT(*) as c FROM submissions`).first() as any;

  const { results: recentInterviews } = await db.prepare(
    `SELECT id, title, status, version, created_at FROM interviews ORDER BY created_at DESC LIMIT 5`
  ).all();

  const { results: recentSubmissions } = await db.prepare(
    `SELECT s.id, s.participant_name, s.participant_email, s.submitted_at, i.title as interview_title
     FROM submissions s JOIN interviews i ON s.interview_id = i.id
     ORDER BY s.submitted_at DESC LIMIT 5`
  ).all();

  return c.json({
    summary: {
      active_interviews: active?.c || 0,
      draft_interviews: drafts?.c || 0,
      total_submissions: subs?.c || 0,
    },
    recentInterviews,
    recentSubmissions,
  });
});

dashboardRouter.get('/interviews/:id/submissions', async (c) => {
  const db = c.env.DB;
  const interviewId = c.req.param('id');

  const interview = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(interviewId).first();
  if (!interview) return c.json({ error: 'Interview not found' }, 404);

  const { results: submissions } = await db.prepare(
    `SELECT * FROM submissions WHERE interview_id = ? ORDER BY submitted_at DESC`
  ).bind(interviewId).all();

  const { results: questions } = await db.prepare(
    `SELECT id, question_text, display_order, branch_side FROM questions WHERE interview_id = ? ORDER BY display_order ASC`
  ).bind(interviewId).all();

  const detailed = [];
  for (const sub of submissions as any[]) {
    const { results: answers } = await db.prepare(
      `SELECT * FROM answers WHERE submission_id = ?`
    ).bind(sub.id).all();
    detailed.push({ ...sub, answers });
  }

  return c.json({ interview, questions, submissions: detailed });
});

dashboardRouter.get('/submissions/:submissionId', async (c) => {
  const db = c.env.DB;
  const submissionId = c.req.param('submissionId');

  const submission = await db.prepare(`SELECT * FROM submissions WHERE id = ?`).bind(submissionId).first();
  if (!submission) return c.json({ error: 'Submission not found' }, 404);

  const { results: answers } = await db.prepare(
    `SELECT * FROM answers WHERE submission_id = ?`
  ).bind(submissionId).all();

  return c.json({ submission, answers });
});

dashboardRouter.get('/interviews/:id/submissions/export', async (c) => {
  const db = c.env.DB;
  const interviewId = c.req.param('id');
  const mode = c.req.query('mode') === 'full' ? 'full' : 'mapping';

  const interview = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(interviewId).first();
  if (!interview) return c.json({ error: 'Interview not found' }, 404);

  const { results: questions } = await db.prepare(
    `SELECT id, display_order FROM questions WHERE interview_id = ? ORDER BY display_order ASC`
  ).bind(interviewId).all();

  const { results: allOptions } = await db.prepare(
    `SELECT o.id, o.label, o.code, o.question_id FROM options o
     JOIN questions q ON o.question_id = q.id WHERE q.interview_id = ?`
  ).bind(interviewId).all();

  const labelById = new Map<string, string>();
  const codeById = new Map<string, string>();
  for (const opt of allOptions as any[]) {
    labelById.set(opt.id, opt.label);
    codeById.set(opt.id, opt.code);
  }

  const { results: submissions } = await db.prepare(
    `SELECT * FROM submissions WHERE interview_id = ? ORDER BY submitted_at ASC`
  ).bind(interviewId).all();

  const escape = (val: string): string => {
    let v = val ?? '';
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };

  const headers = ['Submission ID', 'Name', 'Email', 'Submitted At', ...questions.map((_, i) => `Q${i + 1}`)];
  const rows = [headers.map(escape).join(',')];

  for (const sub of submissions as any[]) {
    const { results: answers } = await db.prepare(
      `SELECT * FROM answers WHERE submission_id = ?`
    ).bind(sub.id).all();

    const ansByQ = new Map<string, any>();
    for (const a of answers as any[]) ansByQ.set(a.question_id, a);

    const cells: string[] = [];
    for (const q of questions as any[]) {
      const a = ansByQ.get(q.id);
      let val = '';
      if (a) {
        if (a.text_answer) {
          val = a.text_answer;
        } else if (a.selected_option_ids) {
          try {
            const ids = JSON.parse(a.selected_option_ids);
            if (mode === 'mapping') {
              val = ids.map((id: string) => codeById.get(id) ?? id).join(',');
            } else {
              val = ids.map((id: string) => labelById.get(id) ?? id).join('; ');
            }
          } catch { val = ''; }
        }
        if (a.other_text) val += ` (Other: ${a.other_text})`;
      }
      cells.push(escape(val));
    }

    rows.push([escape(sub.id), escape(sub.participant_name), escape(sub.participant_email), escape(sub.submitted_at), ...cells].join(','));
  }

  const csv = rows.join('\n');
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="interview-${interviewId}-submissions.csv"`);
  return c.body(csv);
});

export default dashboardRouter;
