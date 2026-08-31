/**
 * Core domain types for The Tribunal multi-agent system.
 */

export type AdvocateRole = 'pro_1' | 'pro_2' | 'con_1' | 'con_2';

export type AdvocatePosition = 'pro' | 'con';

export type JudgeId = 'judge_1' | 'judge_2' | 'judge_3';

export type VerdictDecision = 'guilty' | 'not_guilty' | 'undecided';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AdvocateResponse {
  role: AdvocateRole;
  position: AdvocatePosition;
  personaName: string;
  argument: string;
  model: string;
  tokens: TokenUsage;
  latencyMs: number;
  costUsd: number;
  status: 'success' | 'error';
  error?: string;
}

export interface JudgeVerdict {
  judgeId: JudgeId;
  personaName: string;
  verdict: VerdictDecision;
  reasoning: string;
  dissentPoints: string[];
  model: string;
  tokens: TokenUsage;
  latencyMs: number;
  costUsd: number;
  status: 'success' | 'error';
  error?: string;
}

export interface ChargeSheet {
  defendant: string;
  act: string;
  question: string;
}

export interface CaseData extends ChargeSheet {
  id: string;
  createdAt: string;
  advocates?: AdvocateResponse[];
  verdicts?: JudgeVerdict[];
}

export interface AdvocatesOrchestrationResult {
  caseId: string;
  advocates: AdvocateResponse[];
  totalTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  status: 'completed' | 'partial_failure' | 'failed';
}

export interface DeliberationResult {
  caseId: string;
  verdicts: JudgeVerdict[];
  totalTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  status: 'completed' | 'partial_failure' | 'failed';
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterCompletionParams {
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface OpenRouterCompletionResult {
  content: string;
  model: string;
  tokens: TokenUsage;
  latencyMs: number;
  costUsd: number;
}
