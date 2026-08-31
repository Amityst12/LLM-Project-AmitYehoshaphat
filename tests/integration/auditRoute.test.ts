import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app.js';
import { openRouterService } from '../../src/server/services/openrouter.js';
import { caseStore } from '../../src/server/services/caseStore.js';
import { circuitBreaker } from '../../src/server/utils/circuitBreaker.js';

describe('Audit Trail & Circuit Breaker Endpoints (SC-4 Integration)', () => {
  beforeEach(() => {
    caseStore.clear();
    circuitBreaker.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  it('should deliver full case details and audit trail across entire pipeline', async () => {
    // 1. Create Case
    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'AeroDrone',
      act: 'Operated autonomous delivery drones over restricted school airspace',
      question: 'Does commercial logistics urgency justify airspace regulation violations?',
    });

    expect(caseRes.status).toBe(201);
    const caseId = caseRes.body.data.id;

    // 2. Mock OpenRouter
    vi.spyOn(openRouterService, 'completeChat').mockImplementation(async (params) => {
      const isJudge = params.messages[0].content.includes('Judge');
      if (isJudge) {
        return {
          content: JSON.stringify({
            verdict: 'guilty',
            reasoning: 'Airspace safety rules are non-derogable.',
            dissent_points: [],
          }),
          model: 'google/gemini-2.0-flash-001',
          tokens: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
          latencyMs: 120,
          costUsd: 0.00007,
        };
      }

      return {
        content: 'Advocate speech argument',
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        latencyMs: 100,
        costUsd: 0.00006,
      };
    });

    // 3. Deliberate (runs advocates + judges)
    const delibRes = await request(app).post(`/api/cases/${caseId}/deliberate`).send();
    expect(delibRes.status).toBe(200);

    // 4. Test GET /api/cases/:id
    const fullRes = await request(app).get(`/api/cases/${caseId}`);
    expect(fullRes.status).toBe(200);
    expect(fullRes.body.success).toBe(true);

    const fullData = fullRes.body.data;
    expect(fullData.id).toBe(caseId);
    expect(fullData.defendant).toBe('AeroDrone');
    expect(fullData.advocates).toHaveLength(4);
    expect(fullData.verdicts).toHaveLength(3);
    expect(fullData.audit).toBeDefined();
    expect(fullData.audit.agentCount).toBe(7);
    expect(fullData.audit.totalCostUsd).toBeGreaterThan(0);

    // 5. Test GET /api/cases/:id/audit
    const auditRes = await request(app).get(`/api/cases/${caseId}/audit`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.success).toBe(true);
    expect(auditRes.body.data.caseId).toBe(caseId);
    expect(auditRes.body.data.agentCount).toBe(7);
    expect(auditRes.body.data.pipelineStatus).toBe('completed');
  });

  it('should return 404 for audit log when case does not exist or has no audit', async () => {
    const res = await request(app).get('/api/cases/non-existent-case-id/audit');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('should return budget status via GET /api/budget', async () => {
    circuitBreaker.recordCost(0.45);

    const res = await request(app).get('/api/budget');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.maxBudgetUsd).toBe(5.0);
    expect(res.body.data.totalSpentUsd).toBe(0.45);
    expect(res.body.data.remainingBudgetUsd).toBe(4.55);
    expect(res.body.data.isTripped).toBe(false);
  });

  it('should trigger circuit breaker 429 when budget limit is exhausted', async () => {
    // Exhaust budget
    circuitBreaker.recordCost(5.0);

    const caseRes = await request(app).post('/api/cases').send({
      defendant: 'HighSpender Corp',
      act: 'Act requiring excessive API budget',
      question: 'Will circuit breaker halt execution?',
    });

    const caseId = caseRes.body.data.id;

    // Attempting to run advocates should be rejected by circuit breaker with HTTP 429
    const advRes = await request(app).post(`/api/cases/${caseId}/advocates`).send();
    expect(advRes.status).toBe(429);
    expect(advRes.body.success).toBe(false);
    expect(advRes.body.error).toContain('Circuit breaker');
    expect(advRes.body.circuitBreaker.isTripped).toBe(true);
  });
});
