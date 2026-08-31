-- ==========================================================
-- The Tribunal: Supabase PostgreSQL Database Schema
-- ==========================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cases Table: Stores the initial Charge Sheet & status
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  defendant VARCHAR(500) NOT NULL,
  act VARCHAR(500) NOT NULL,
  question VARCHAR(500) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'created', -- 'created' | 'advocates_completed' | 'deliberated' | 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Advocate Speeches Table: Stores the 4 parallel advocate arguments
CREATE TABLE IF NOT EXISTS advocate_speeches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- 'pro_1' | 'pro_2' | 'con_1' | 'con_2'
  position VARCHAR(20) NOT NULL, -- 'pro' | 'con'
  persona_name VARCHAR(100) NOT NULL,
  argument TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success' | 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Judge Verdicts Table: Stores the 3 unmerged judicial verdicts
CREATE TABLE IF NOT EXISTS judge_verdicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  judge_id VARCHAR(50) NOT NULL, -- 'judge_1' | 'judge_2' | 'judge_3'
  persona_name VARCHAR(100) NOT NULL,
  verdict VARCHAR(30) NOT NULL, -- 'guilty' | 'not_guilty' | 'undecided'
  reasoning TEXT NOT NULL,
  dissent_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success' | 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Audit Logs Table: Aggregate token, latency, and cost economics
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  total_latency_ms INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
  agent_count INT NOT NULL DEFAULT 0,
  pipeline_status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_advocate_speeches_case_id ON advocate_speeches(case_id);
CREATE INDEX IF NOT EXISTS idx_judge_verdicts_case_id ON judge_verdicts(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_case_id ON audit_logs(case_id);
