import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app.js';
import { openRouterService } from '../../src/server/services/openrouter.js';
import { caseStore } from '../../src/server/services/caseStore.js';
import { circuitBreaker } from '../../src/server/utils/circuitBreaker.js';

describe('Full Multi-Agent Pipeline End-to-End (SC-6 & SC-5)', () => {
  beforeEach(() => {
    caseStore.clear();
    circuitBreaker.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  it('should execute the full 7-agent pipeline end-to-end with N-version models under 60 seconds (SC-6)', async () => {
    const startTime = Date.now();

    // 1. Submit Charge Sheet (SC-1)
    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'AeroQuantum Autonomous Air-Traffic',
      act: 'Rerouted emergency medical helicopter to avoid commercial flight delays',
      question: 'Is algorithmic prioritization of commercial network flow over emergency craft justifiable?',
    });

    expect(caseRes.status).toBe(201);
    expect(caseRes.body.success).toBe(true);
    const caseId = caseRes.body.data.id;

    // 2. Mock OpenRouter completion with distinct agent models
    vi.spyOn(openRouterService, 'completeChat').mockImplementation(async (params) => {
      const isJudge = params.messages[0].content.includes('Judge');
      const isPro = params.messages[0].content.includes('IN FAVOR');

      if (isJudge) {
        return {
          content: JSON.stringify({
            verdict: 'guilty',
            reasoning: 'Human life prioritization is categorical and cannot be bargained away.',
            dissent_points: ['Commercial airline efficiency arguments from Pragmatist'],
          }),
          model: params.model ?? 'google/gemini-2.0-flash-001',
          tokens: { promptTokens: 300, completionTokens: 150, totalTokens: 450 },
          latencyMs: 130,
          costUsd: 0.00009,
        };
      }

      return {
        content: `Argument for ${isPro ? 'prosecution' : 'defense'} from persona.`,
        model: params.model ?? 'deepseek/deepseek-chat',
        tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        latencyMs: 100,
        costUsd: 0.00005,
      };
    });

    // 3. Run Deliberation with N-Version Model Configuration (SC-5)
    const modelMap = {
      pro_1: 'google/gemini-2.0-flash-001',
      pro_2: 'deepseek/deepseek-chat',
      con_1: 'openai/gpt-4o-mini',
      con_2: 'google/gemini-2.0-flash-lite-preview-02-05:free',
      judge_1: 'google/gemini-2.0-flash-001',
      judge_2: 'deepseek/deepseek-chat',
      judge_3: 'openai/gpt-4o-mini',
    };

    const delibRes = await request(app)
      .post(`/api/cases/${caseId}/deliberate`)
      .send({ modelMap });

    expect(delibRes.status).toBe(200);
    expect(delibRes.body.success).toBe(true);

    const data = delibRes.body.data;
    expect(data.caseId).toBe(caseId);
    expect(data.status).toBe('completed');

    // 4. Verify Unmerged Judicial Protocol (SC-3)
    expect(data.verdicts).toHaveLength(3);
    const judgeIds = data.verdicts.map((v: { judgeId: string }) => v.judgeId);
    expect(judgeIds).toEqual(['judge_1', 'judge_2', 'judge_3']);

    for (const v of data.verdicts) {
      expect(v.verdict).toBe('guilty');
      expect(v.reasoning).toBeTruthy();
      expect(v.dissentPoints).toBeInstanceOf(Array);
      expect(v.status).toBe('success');
    }

    // 5. Verify 7-Agent Audit Trail (SC-4)
    const auditRes = await request(app).get(`/api/cases/${caseId}/audit`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.agentCount).toBe(7);
    expect(auditRes.body.data.totalTokens).toBeGreaterThan(0);
    expect(auditRes.body.data.totalCostUsd).toBeGreaterThan(0);

    // 6. Verify Full Case Retrieval
    const fullCaseRes = await request(app).get(`/api/cases/${caseId}`);
    expect(fullCaseRes.status).toBe(200);
    expect(fullCaseRes.body.data.advocates).toHaveLength(4);
    expect(fullCaseRes.body.data.verdicts).toHaveLength(3);
    expect(fullCaseRes.body.data.audit).toBeDefined();

    // 7. Verify Timing Constraint (Knuth Finiteness < 60 seconds)
    const totalElapsedSeconds = (Date.now() - startTime) / 1000;
    expect(totalElapsedSeconds).toBeLessThan(60);
  });

  it('should serve the model catalog via GET /api/models (SC-5)', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);

    const modelIds = res.body.data.map((m: { id: string }) => m.id);
    expect(modelIds).toContain('google/gemini-2.0-flash-001');
    expect(modelIds).toContain('deepseek/deepseek-chat');
    expect(modelIds).toContain('openai/gpt-4o-mini');
  });

  it('should serve the frontend web page via static handler', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('THE TRIBUNAL');
    expect(res.text).toContain('Charge Sheet');
  });
});
