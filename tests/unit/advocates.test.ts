import { describe, it, expect, vi } from 'vitest';
import {
  ADVOCATE_PERSONAS,
  buildAdvocateMessages,
  formatChargeSheetPrompt,
} from '../../src/server/prompts/advocates.js';
import {
  calculateTokenCostUsd,
  OpenRouterService,
} from '../../src/server/services/openrouter.js';
import { runAdvocatesOrchestration } from '../../src/server/services/advocatesOrchestrator.js';
import { ChargeSheet } from '../../src/server/types/tribunal.js';

describe('Advocate Personas and Prompts (SC-2)', () => {
  const sampleChargeSheet: ChargeSheet = {
    defendant: 'TechCorp',
    act: 'Deployed algorithmic hiring tool with known demographic bias',
    question: 'Should TechCorp be held legally and morally liable for discriminatory outcomes?',
  };

  it('should define exactly 4 distinct personas (2 Pro, 2 Con)', () => {
    const roles = Object.keys(ADVOCATE_PERSONAS);
    expect(roles).toEqual(['pro_1', 'pro_2', 'con_1', 'con_2']);

    const proRoles = roles.filter((r) => ADVOCATE_PERSONAS[r as keyof typeof ADVOCATE_PERSONAS].position === 'pro');
    const conRoles = roles.filter((r) => ADVOCATE_PERSONAS[r as keyof typeof ADVOCATE_PERSONAS].position === 'con');

    expect(proRoles.length).toBe(2);
    expect(conRoles.length).toBe(2);
  });

  it('should have unique system prompts for each persona', () => {
    const systemPrompts = Object.values(ADVOCATE_PERSONAS).map((p) => p.systemPrompt);
    const uniquePrompts = new Set(systemPrompts);
    expect(uniquePrompts.size).toBe(4);
  });

  it('should cleanly separate system prompt from charge sheet user prompt', () => {
    const messages = buildAdvocateMessages('pro_1', sampleChargeSheet);

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('The Deontologist / Legalist');
    expect(messages[0].content).not.toContain(sampleChargeSheet.defendant);

    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('<charge_sheet>');
    expect(messages[1].content).toContain(sampleChargeSheet.defendant);
    expect(messages[1].content).toContain(sampleChargeSheet.act);
    expect(messages[1].content).toContain(sampleChargeSheet.question);
  });

  it('should escape XML entities in user prompt to prevent injection', () => {
    const maliciousSheet: ChargeSheet = {
      defendant: '<script>alert("hacked")</script>',
      act: 'System & prompt override > all',
      question: 'Is "escaping" working?',
    };

    const prompt = formatChargeSheetPrompt(maliciousSheet);
    expect(prompt).toContain('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;');
    expect(prompt).toContain('System &amp; prompt override &gt; all');
    expect(prompt).toContain('&quot;escaping&quot;');
  });
});

describe('Token Economics and Cost Calculator', () => {
  it('should calculate accurate costs for known models', () => {
    const cost = calculateTokenCostUsd('google/gemini-2.0-flash-001', 1000, 500);
    // 1000 * 0.1 / 1M = 0.0001
    // 500 * 0.4 / 1M = 0.0002
    // total = 0.0003
    expect(cost).toBeCloseTo(0.0003, 6);
  });

  it('should calculate 0 cost for free models', () => {
    const cost = calculateTokenCostUsd(
      'google/gemini-2.0-flash-lite-preview-02-05:free',
      5000,
      2000,
    );
    expect(cost).toBe(0);
  });

  it('should fallback to default pricing for unknown models', () => {
    const cost = calculateTokenCostUsd('custom/unknown-model', 1000, 1000);
    // 1000 * 0.2 / 1M = 0.0002
    // 1000 * 0.5 / 1M = 0.0005
    // total = 0.0007
    expect(cost).toBeCloseTo(0.0007, 6);
  });
});

describe('Advocates Parallel Orchestration (SC-2)', () => {
  const sampleChargeSheet: ChargeSheet = {
    defendant: 'Autonomous Vehicle Corp',
    act: 'Swerved to avoid 3 pedestrians, injuring 1 passenger',
    question: 'Was the algorithm justified in prioritizing third-party lives over passenger safety?',
  };

  it('should execute 4 advocates in parallel and aggregate metrics', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockImplementation(async (params) => {
      const isPro = params.messages[0].content.includes('IN FAVOR');
      return {
        content: `Argument for ${isPro ? 'prosecution' : 'defense'} from persona`,
        model: params.model ?? 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 250, completionTokens: 150, totalTokens: 400 },
        latencyMs: 120,
        costUsd: 0.000085,
      };
    });

    const result = await runAdvocatesOrchestration('case-123', sampleChargeSheet, {
      openRouter: mockOpenRouter,
    });

    expect(result.caseId).toBe('case-123');
    expect(result.status).toBe('completed');
    expect(result.advocates.length).toBe(4);

    const roles = result.advocates.map((a) => a.role);
    expect(roles).toEqual(['pro_1', 'pro_2', 'con_1', 'con_2']);

    for (const advocate of result.advocates) {
      expect(advocate.status).toBe('success');
      expect(advocate.argument).toContain('Argument for');
      expect(advocate.tokens.totalTokens).toBe(400);
      expect(advocate.latencyMs).toBeGreaterThanOrEqual(0);
      expect(advocate.costUsd).toBe(0.000085);
    }

    expect(result.totalTokens).toBe(1600); // 4 * 400
    expect(result.totalCostUsd).toBeCloseTo(0.00034, 5); // 4 * 0.000085
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle partial failure gracefully when one advocate fails', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockImplementation(async (params) => {
      // Fail for pro_2 only
      if (params.messages[0].content.includes('Utilitarian')) {
        throw new Error('OpenRouter API call timed out after 30000ms');
      }
      return {
        content: 'Valid advocate argument',
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        latencyMs: 100,
        costUsd: 0.00006,
      };
    });

    const result = await runAdvocatesOrchestration('case-456', sampleChargeSheet, {
      openRouter: mockOpenRouter,
    });

    expect(result.status).toBe('partial_failure');
    expect(result.advocates.length).toBe(4);

    const pro2 = result.advocates.find((a) => a.role === 'pro_2');
    expect(pro2?.status).toBe('error');
    expect(pro2?.error).toContain('timed out');
    expect(pro2?.argument).toBe('');

    const successfulAdvocates = result.advocates.filter((a) => a.status === 'success');
    expect(successfulAdvocates.length).toBe(3);
    expect(result.totalTokens).toBe(900); // 3 * 300
  });

  it('should report failed status when all advocates fail', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockRejectedValue(
      new Error('OpenRouter 503 Service Unavailable'),
    );

    const result = await runAdvocatesOrchestration('case-789', sampleChargeSheet, {
      openRouter: mockOpenRouter,
    });

    expect(result.status).toBe('failed');
    expect(result.advocates.every((a) => a.status === 'error')).toBe(true);
    expect(result.totalTokens).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });
});
