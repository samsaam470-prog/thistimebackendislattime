CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','inactive')),
  version INTEGER NOT NULL DEFAULT 1,
  public_id TEXT UNIQUE,
  parent_version_id TEXT,
  root_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  instructions TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  answer_display_preference TEXT NOT NULL DEFAULT 'full',
  branch_group TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  label TEXT NOT NULL,
  code TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  branch_target TEXT,
  is_other INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_email TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_option_ids TEXT DEFAULT '[]',
  selected_option_codes TEXT DEFAULT '[]',
  text_answer TEXT,
  other_text TEXT,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interviews_created ON interviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_recent ON submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_interview ON questions(interview_id);
