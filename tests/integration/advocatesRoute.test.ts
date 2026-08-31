import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app.js';
import { openRouterService } from '../../src/server/services/openrouter.js';
import { caseStore } from '../../src/server/services/caseStore.js';

describe('POST /api/cases/:id/advocates (SC-2 Integration)', () => {
  beforeEach(() => {
    caseStore.clear();
    vi.restoreAllMocks();
  });

  it('should run 4 parallel advocates for an existing case and return economics', async () => {
    // 1. Create case
    const createRes = await request(app).post('/api/cases').send({
      defendant: 'BioHealth Corp',
      act: 'Price-gouged essential insulin by 800% during supply shortage',
      question: 'Is pharmaceutical price gouging during emergency conditions ethically defensible?',
    });

    expect(createRes.status).toBe(201);
    const caseId = createRes.body.data.id;

    // 2. Mock OpenRouter completion
    vi.spyOn(openRouterService, 'completeChat').mockImplementation(async (params) => {
      const isPro = params.messages[0].content.includes('IN FAVOR');
      return {
        content: `Comprehensive argument for ${isPro ? 'liability' : 'market justification'}.`,
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        latencyMs: 150,
        costUsd: 0.00011,
      };
    });

    // 3. Call advocates endpoint
    const advocatesRes = await request(app)
      .post(`/api/cases/${caseId}/advocates`)
      .send({ defaultModel: 'google/gemini-2.0-flash-001' });

    expect(advocatesRes.status).toBe(200);
    expect(advocatesRes.body.success).toBe(true);

    const data = advocatesRes.body.data;
    expect(data.caseId).toBe(caseId);
    expect(data.status).toBe('completed');
    expect(data.advocates).toHaveLength(4);

    const roles = data.advocates.map((a: { role: string }) => a.role);
    expect(roles).toEqual(['pro_1', 'pro_2', 'con_1', 'con_2']);

    for (const adv of data.advocates) {
      expect(adv.status).toBe('success');
      expect(adv.argument).toContain('Comprehensive argument');
      expect(adv.tokens.totalTokens).toBe(500);
      expect(adv.costUsd).toBe(0.00011);
      expect(adv.latencyMs).toBeGreaterThanOrEqual(0);
    }

    expect(data.totalTokens).toBe(2000); // 4 * 500
    expect(data.totalCostUsd).toBeCloseTo(0.00044, 5);
    expect(data.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return 404 when case ID does not exist and no body is provided', async () => {
    const res = await request(app).post('/api/cases/non-existent-uuid/advocates').send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not found');
  });

  it('should accept inline charge sheet when case ID not previously saved', async () => {
    vi.spyOn(openRouterService, 'completeChat').mockResolvedValue({
      content: 'Inline argument content',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      latencyMs: 90,
      costUsd: 0.00006,
    });

    const res = await request(app)
      .post('/api/cases/adhoc-case-001/advocates')
      .send({
        defendant: 'SmartCity AI',
        act: 'Shared real-time citizen movement data with advertising brokers',
        question: 'Does public space sensor monetization violate foundational civil liberties?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.advocates).toHaveLength(4);
  });
});
