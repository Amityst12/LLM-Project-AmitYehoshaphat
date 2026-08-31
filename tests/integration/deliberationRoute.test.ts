import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app.js';
import { openRouterService } from '../../src/server/services/openrouter.js';
import { caseStore } from '../../src/server/services/caseStore.js';

describe('POST /api/cases/:id/deliberate (SC-3 Integration)', () => {
  beforeEach(() => {
    caseStore.clear();
    vi.restoreAllMocks();
  });

  it('should run 3 independent judges on existing case with advocates and return unmerged verdicts', async () => {
    // 1. Create case
    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'Algorithmic Bail System',
      act: 'Assigned 95% recidivism risk based on zip code demographic proxies',
      question: 'Is proxy-based algorithmic risk assessment constitutionally permissible?',
    });

    expect(caseRes.status).toBe(201);
    const caseId = caseRes.body.data.id;

    // 2. Mock OpenRouter for both advocates and judges
    vi.spyOn(openRouterService, 'completeChat').mockImplementation(async (params) => {
      const isJudge = params.messages[0].content.includes('Judge');
      if (isJudge) {
        return {
          content: JSON.stringify({
            verdict: 'not_guilty',
            reasoning: 'Proxy metrics violated equal protection guarantees.',
            dissent_points: ['Advocate pro_2 argued statistical predictive validity'],
          }),
          model: 'google/gemini-2.0-flash-001',
          tokens: { promptTokens: 350, completionTokens: 150, totalTokens: 500 },
          latencyMs: 140,
          costUsd: 0.000095,
        };
      }

      return {
        content: 'Advocate argument text',
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        latencyMs: 100,
        costUsd: 0.00006,
      };
    });

    // 3. Run advocates
    const advRes = await request(app).post(`/api/cases/${caseId}/advocates`).send();
    expect(advRes.status).toBe(200);

    // 4. Run judicial deliberation
    const delibRes = await request(app).post(`/api/cases/${caseId}/deliberate`).send();

    expect(delibRes.status).toBe(200);
    expect(delibRes.body.success).toBe(true);

    const data = delibRes.body.data;
    expect(data.caseId).toBe(caseId);
    expect(data.status).toBe('completed');
    expect(data.verdicts).toHaveLength(3);

    const judgeIds = data.verdicts.map((v: { judgeId: string }) => v.judgeId);
    expect(judgeIds).toEqual(['judge_1', 'judge_2', 'judge_3']);

    for (const verdict of data.verdicts) {
      expect(verdict.status).toBe('success');
      expect(verdict.verdict).toBe('not_guilty');
      expect(verdict.reasoning).toContain('equal protection');
      expect(verdict.dissentPoints).toHaveLength(1);
      expect(verdict.tokens.totalTokens).toBe(500);
      expect(verdict.costUsd).toBe(0.000095);
    }

    expect(data.totalTokens).toBe(1500); // 3 * 500
    expect(data.totalCostUsd).toBeCloseTo(0.000285, 5);
    expect(data.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should auto-run advocates if deliberate is called on a fresh case without pre-run advocates', async () => {
    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'GeneEdit Inc',
      act: 'CRISPR modification of human embryos without ethics board approval',
      question: 'Does therapeutic necessity justify bypassing regulatory bioethics moratoriums?',
    });

    const caseId = caseRes.body.data.id;

    vi.spyOn(openRouterService, 'completeChat').mockResolvedValue({
      content: JSON.stringify({
        verdict: 'guilty',
        reasoning: 'Bioethics moratorium is binding law.',
        dissent_points: [],
      }),
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 250, completionTokens: 100, totalTokens: 350 },
      latencyMs: 110,
      costUsd: 0.000065,
    });

    const res = await request(app).post(`/api/cases/${caseId}/deliberate`).send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdicts).toHaveLength(3);
  });

  it('should support the /api/cases/:id/judges alias route', async () => {
    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'Orbital Mining Corp',
      act: 'Harvested asteroid minerals in contested celestial territory',
      question: 'Does the Outer Space Treaty prohibit private commercial asteroid extraction?',
    });

    const caseId = caseRes.body.data.id;

    vi.spyOn(openRouterService, 'completeChat').mockResolvedValue({
      content: JSON.stringify({
        verdict: 'undecided',
        reasoning: 'Treaty ambiguity requires multilateral diplomatic clarification.',
        dissent_points: ['Private enterprise rights vs common heritage of mankind'],
      }),
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: 100,
      costUsd: 0.00006,
    });

    const res = await request(app).post(`/api/cases/${caseId}/judges`).send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdicts).toHaveLength(3);
  });

  it('should return 404 when case ID does not exist', async () => {
    const res = await request(app).post('/api/cases/non-existent-case-id/deliberate').send();

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not found');
  });
});
