ALTER TABLE questions ADD COLUMN branch_side TEXT DEFAULT 'both';
ALTER TABLE questions ADD COLUMN why_asking TEXT;

CREATE INDEX IF NOT EXISTS idx_questions_branch ON questions(interview_id, branch_side);
