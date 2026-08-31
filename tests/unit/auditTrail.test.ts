import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/server/services/supabaseStore.js';
import {
  AdvocateResponse,
  AuditLogEntry,
  ChargeSheet,
  JudgeVerdict,
} from '../../src/server/types/tribunal.js';

describe('SupabaseStore & Audit Trail Persistence (SC-4)', () => {
  let store: SupabaseStore;

  const sampleSheet: ChargeSheet = {
    defendant: 'DeepBio Inc',
    act: 'Patented naturally occurring gene variants extracted from indigenous populations',
    question: 'Is patenting unmodified biological data collected without informed consent valid?',
  };

  const sampleAdvocates: AdvocateResponse[] = [
    {
      role: 'pro_1',
      position: 'pro',
      personaName: 'The Legalist',
      argument: 'Statutory novelty test was not satisfied.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 120,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'pro_2',
      position: 'pro',
      personaName: 'The Utilitarian',
      argument: 'Stifles global medical research collaboration.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 110,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'con_1',
      position: 'con',
      personaName: 'The Humanist',
      argument: 'Heavy capital investments enabled discovery.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 130,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'con_2',
      position: 'con',
      personaName: 'The Realist',
      argument: 'Global biosecurity competition requires domestic patenting.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 115,
      costUsd: 0.00003,
      status: 'success',
    },
  ];

  const sampleVerdicts: JudgeVerdict[] = [
    {
      judgeId: 'judge_1',
      personaName: 'The Textualist',
      verdict: 'guilty',
      reasoning: 'Unmodified biological DNA is unpatentable subject matter.',
      dissentPoints: [],
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: 200,
      costUsd: 0.00006,
      status: 'success',
    },
    {
      judgeId: 'judge_2',
      personaName: 'The Pragmatist',
      verdict: 'not_guilty',
      reasoning: 'Investment incentives outweigh procedural collection ambiguities.',
      dissentPoints: ['Biopiracy concerns from moralist'],
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: 190,
      costUsd: 0.00006,
      status: 'success',
    },
    {
      judgeId: 'judge_3',
      personaName: 'The Moralist',
      verdict: 'guilty',
      reasoning: 'Violates bodily integrity and sovereign human dignity.',
      dissentPoints: ['Commercial investment arguments'],
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: 210,
      costUsd: 0.00006,
      status: 'success',
    },
  ];

  beforeEach(() => {
    store = new SupabaseStore();
    store.clear();
  });

  it('should save and retrieve a case', async () => {
    const saved = await store.saveCase('case-001', sampleSheet);
    expect(saved.id).toBe('case-001');
    expect(saved.defendant).toBe(sampleSheet.defendant);

    const retrieved = await store.getCase('case-001');
    expect(retrieved).toBeDefined();
    expect(retrieved?.defendant).toBe(sampleSheet.defendant);
  });

  it('should save advocates and update case status', async () => {
    await store.saveCase('case-002', sampleSheet);
    await store.saveAdvocates('case-002', sampleAdvocates);

    const fullCase = await store.getCase('case-002');
    expect(fullCase?.advocates).toHaveLength(4);
    expect(fullCase?.status).toBe('advocates_completed');
  });

  it('should save verdicts and update case status to deliberated', async () => {
    await store.saveCase('case-003', sampleSheet);
    await store.saveAdvocates('case-003', sampleAdvocates);
    await store.saveVerdicts('case-003', sampleVerdicts);

    const fullCase = await store.getCase('case-003');
    expect(fullCase?.verdicts).toHaveLength(3);
    expect(fullCase?.status).toBe('deliberated');
  });

  it('should save and retrieve full audit trail across all 7 agents', async () => {
    const totalPrompt = 4 * 100 + 3 * 200; // 1000
    const totalCompletion = 4 * 50 + 3 * 100; // 500
    const totalTokens = totalPrompt + totalCompletion; // 1500
    const totalCost = Number((4 * 0.00003 + 3 * 0.00006).toFixed(8)); // 0.00030

    const auditEntry: AuditLogEntry = {
      caseId: 'case-004',
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens,
      totalLatencyMs: 650,
      totalCostUsd: totalCost,
      agentCount: 7,
      pipelineStatus: 'completed',
    };

    await store.saveCase('case-004', sampleSheet);
    const savedAudit = await store.saveAuditLog(auditEntry);
    expect(savedAudit.id).toBeDefined();

    const retrievedAudit = await store.getAuditLog('case-004');
    expect(retrievedAudit).toBeDefined();
    expect(retrievedAudit?.totalTokens).toBe(1500);
    expect(retrievedAudit?.totalCostUsd).toBeCloseTo(0.0003, 5);
    expect(retrievedAudit?.agentCount).toBe(7);

    const fullCase = await store.getCase('case-004');
    expect(fullCase?.audit).toBeDefined();
    expect(fullCase?.audit?.totalCostUsd).toBeCloseTo(0.0003, 5);
  });

  it('should list all cases via getAllCases', async () => {
    await store.saveCase('c-1', sampleSheet);
    await store.saveCase('c-2', { ...sampleSheet, defendant: 'OtherCorp' });

    const all = await store.getAllCases();
    expect(all).toHaveLength(2);
  });

  it('should return undefined when case does not exist', async () => {
    const nonExistent = await store.getCase('does-not-exist');
    expect(nonExistent).toBeUndefined();
  });

  it('should report isUsingDatabase false when credentials not provided', () => {
    expect(store.isUsingDatabase()).toBe(false);
  });
});
