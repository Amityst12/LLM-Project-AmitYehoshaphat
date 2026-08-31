import { describe, it, expect, vi } from 'vitest';
import {
  JUDGE_PERSONAS,
  buildJudgeMessages,
  formatDeliberationPrompt,
} from '../../src/server/prompts/judges.js';
import {
  parseJudgeVerdict,
  normalizeVerdictDecision,
} from '../../src/server/utils/verdictParser.js';
import { runJudgesOrchestration } from '../../src/server/services/judgesOrchestrator.js';
import { OpenRouterService } from '../../src/server/services/openrouter.js';
import { AdvocateResponse, ChargeSheet } from '../../src/server/types/tribunal.js';

describe('Verdict Parser & Mitigation P1 (Unit)', () => {
  it('should parse clean pure JSON output correctly', () => {
    const raw = JSON.stringify({
      verdict: 'guilty',
      reasoning: 'The defendant violated clear statutory provisions.',
      dissent_points: ['Defense argued necessity', 'Lack of malice'],
    });

    const parsed = parseJudgeVerdict(raw);
    expect(parsed.verdict).toBe('guilty');
    expect(parsed.reasoning).toBe('The defendant violated clear statutory provisions.');
    expect(parsed.dissentPoints).toEqual(['Defense argued necessity', 'Lack of malice']);
  });

  it('should extract JSON from markdown code fences (```json ... ```)', () => {
    const raw = `Here is my ruling:
\`\`\`json
{
  "verdict": "not_guilty",
  "reasoning": "The evidence does not meet the beyond reasonable doubt standard.",
  "dissent_points": ["Pro advocates presented compelling utility concerns"]
}
\`\`\`
Signed, Judge.`;

    const parsed = parseJudgeVerdict(raw);
    expect(parsed.verdict).toBe('not_guilty');
    expect(parsed.reasoning).toContain('beyond reasonable doubt');
    expect(parsed.dissentPoints).toHaveLength(1);
  });

  it('should extract JSON embedded in conversational prose', () => {
    const raw = `After deliberation, my formal finding is:
{"verdict": "undecided", "reasoning": "Tension between legal duty and human rights is unresolved.", "dissent_points": []}
Thank you.`;

    const parsed = parseJudgeVerdict(raw);
    expect(parsed.verdict).toBe('undecided');
    expect(parsed.reasoning).toContain('Tension between legal duty');
    expect(parsed.dissentPoints).toEqual([]);
  });

  it('should fallback to regex parser when LLM outputs non-JSON freeform text (Mitigation P1)', () => {
    const raw = `In my opinion, the defendant is clearly guilty of negligence.
The primary reasons are:
- Failure to adhere to basic safety standards
- Disregard of known risks
Therefore liability is established.`;

    const parsed = parseJudgeVerdict(raw);
    expect(parsed.verdict).toBe('guilty');
    expect(parsed.reasoning).toBe(raw);
    expect(parsed.dissentPoints).toEqual([
      'Failure to adhere to basic safety standards',
      'Disregard of known risks',
    ]);
  });

  it('should correctly identify not guilty in freeform text without false-matching guilty', () => {
    const raw = `I find the defendant not guilty due to lack of jurisdiction and insufficient evidence.`;
    const parsed = parseJudgeVerdict(raw);
    expect(parsed.verdict).toBe('not_guilty');
  });

  it('should normalize varied verdict terminology', () => {
    expect(normalizeVerdictDecision('not guilty')).toBe('not_guilty');
    expect(normalizeVerdictDecision('innocent')).toBe('not_guilty');
    expect(normalizeVerdictDecision('not-liable')).toBe('not_guilty');
    expect(normalizeVerdictDecision('guilty')).toBe('guilty');
    expect(normalizeVerdictDecision('liable')).toBe('guilty');
    expect(normalizeVerdictDecision('culpable')).toBe('guilty');
    expect(normalizeVerdictDecision('anything_else')).toBe('undecided');
    expect(normalizeVerdictDecision(null)).toBe('undecided');
  });
});

describe('Judicial Personas and Prompts (SC-3)', () => {
  const sampleChargeSheet: ChargeSheet = {
    defendant: 'CyberDefense Ltd',
    act: 'Counter-hacked foreign servers without state authorization',
    question: 'Is offensive private counter-cyberwarfare legally and ethically permissible?',
  };

  const sampleAdvocates: AdvocateResponse[] = [
    {
      role: 'pro_1',
      position: 'pro',
      personaName: 'The Deontologist',
      argument: 'Violation of national sovereignty statutes.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 100,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'pro_2',
      position: 'pro',
      personaName: 'The Utilitarian',
      argument: 'High risk of cyber escalation and collateral damage.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 100,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'con_1',
      position: 'con',
      personaName: 'The Humanist',
      argument: 'Act of pure self-defense to protect hospital infrastructure.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 100,
      costUsd: 0.00003,
      status: 'success',
    },
    {
      role: 'con_2',
      position: 'con',
      personaName: 'The Realist',
      argument: 'State failed to protect private actors in cyberspace.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 100,
      costUsd: 0.00003,
      status: 'success',
    },
  ];

  it('should define exactly 3 distinct judicial personas', () => {
    const judgeIds = Object.keys(JUDGE_PERSONAS);
    expect(judgeIds).toEqual(['judge_1', 'judge_2', 'judge_3']);

    const personas = Object.values(JUDGE_PERSONAS).map((p) => p.personaName);
    expect(new Set(personas).size).toBe(3);
  });

  it('should mandate JSON output in all judicial system prompts', () => {
    for (const persona of Object.values(JUDGE_PERSONAS)) {
      expect(persona.systemPrompt).toContain('Output Format Requirement (MANDATORY)');
      expect(persona.systemPrompt).toContain('"verdict"');
      expect(persona.systemPrompt).toContain('"reasoning"');
      expect(persona.systemPrompt).toContain('"dissent_points"');
    }
  });

  it('should include all 4 advocate arguments in user prompt with XML isolation', () => {
    const prompt = formatDeliberationPrompt(sampleChargeSheet, sampleAdvocates);

    expect(prompt).toContain('<charge_sheet>');
    expect(prompt).toContain(sampleChargeSheet.defendant);
    expect(prompt).toContain('<advocate_arguments>');

    for (const adv of sampleAdvocates) {
      expect(prompt).toContain(`role="${adv.role}"`);
      expect(prompt).toContain(adv.argument);
    }
  });

  it('should build full judge messages array with system and user prompts', () => {
    const messages = buildJudgeMessages('judge_1', sampleChargeSheet, sampleAdvocates);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('The Textualist / Formalist');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('<charge_sheet>');

    expect(() =>
      buildJudgeMessages('unknown_judge' as unknown as import('../../src/server/types/tribunal.js').JudgeId, sampleChargeSheet, sampleAdvocates),
    ).toThrow('Unknown judge id');
  });
});

describe('Judges Parallel Orchestration & Unmerged Protocol (SC-3)', () => {
  const sampleChargeSheet: ChargeSheet = {
    defendant: 'BioGen',
    act: 'Released genetically modified mosquitoes without local referendum',
    question: 'Does public health urgency override local participatory consent?',
  };

  const sampleAdvocates: AdvocateResponse[] = [
    {
      role: 'pro_1',
      position: 'pro',
      personaName: 'The Deontologist',
      argument: 'Consent violation is categorical breach.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      latencyMs: 80,
      costUsd: 0.00002,
      status: 'success',
    },
    {
      role: 'pro_2',
      position: 'pro',
      personaName: 'The Utilitarian',
      argument: 'Erosion of public trust will harm future health initiatives.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      latencyMs: 80,
      costUsd: 0.00002,
      status: 'success',
    },
    {
      role: 'con_1',
      position: 'con',
      personaName: 'The Humanist',
      argument: 'Urgent action saved lives from impending dengue fever outbreak.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      latencyMs: 80,
      costUsd: 0.00002,
      status: 'success',
    },
    {
      role: 'con_2',
      position: 'con',
      personaName: 'The Realist',
      argument: 'Referendums are impractical for time-sensitive vector control.',
      model: 'google/gemini-2.0-flash-001',
      tokens: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
      latencyMs: 80,
      costUsd: 0.00002,
      status: 'success',
    },
  ];

  it('should produce 3 independent unmerged verdicts with aggregated economics', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockImplementation(async (params) => {
      const isJudge1 = params.messages[0].content.includes('Textualist');
      const isJudge2 = params.messages[0].content.includes('Pragmatist');

      const verdictDecision = isJudge1 ? 'guilty' : isJudge2 ? 'not_guilty' : 'undecided';

      return {
        content: JSON.stringify({
          verdict: verdictDecision,
          reasoning: `Ruling by ${isJudge1 ? 'Textualist' : isJudge2 ? 'Pragmatist' : 'Moralist'}`,
          dissent_points: [`Dissent against opposing reasoning`],
        }),
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
        latencyMs: 150,
        costUsd: 0.00012,
      };
    });

    const result = await runJudgesOrchestration('case-777', sampleChargeSheet, sampleAdvocates, {
      openRouter: mockOpenRouter,
    });

    expect(result.caseId).toBe('case-777');
    expect(result.status).toBe('completed');
    expect(result.verdicts).toHaveLength(3);

    // Verify unmerged protocol: 3 distinct verdicts (V1, V2, V3) coexist
    const judgeIds = result.verdicts.map((v) => v.judgeId);
    expect(judgeIds).toEqual(['judge_1', 'judge_2', 'judge_3']);

    const decisions = result.verdicts.map((v) => v.verdict);
    expect(decisions).toEqual(['guilty', 'not_guilty', 'undecided']);

    for (const v of result.verdicts) {
      expect(v.status).toBe('success');
      expect(v.dissentPoints).toHaveLength(1);
      expect(v.tokens.totalTokens).toBe(600);
      expect(v.costUsd).toBe(0.00012);
    }

    expect(result.totalTokens).toBe(1800); // 3 * 600
    expect(result.totalCostUsd).toBeCloseTo(0.00036, 5);
    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle partial failure if one judge throws an error', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockImplementation(async (params) => {
      if (params.messages[0].content.includes('Pragmatist')) {
        throw new Error('Judge 2 rate limit error');
      }
      return {
        content: JSON.stringify({
          verdict: 'guilty',
          reasoning: 'Guilty ruling',
          dissent_points: [],
        }),
        model: 'google/gemini-2.0-flash-001',
        tokens: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
        latencyMs: 100,
        costUsd: 0.00007,
      };
    });

    const result = await runJudgesOrchestration('case-888', sampleChargeSheet, sampleAdvocates, {
      openRouter: mockOpenRouter,
    });

    expect(result.status).toBe('partial_failure');
    expect(result.verdicts).toHaveLength(3);

    const judge2 = result.verdicts.find((v) => v.judgeId === 'judge_2');
    expect(judge2?.status).toBe('error');
    expect(judge2?.error).toContain('rate limit');

    const successfulJudges = result.verdicts.filter((v) => v.status === 'success');
    expect(successfulJudges).toHaveLength(2);
    expect(result.totalTokens).toBe(800); // 2 * 400
  });

  it('should report failed status if all judges fail', async () => {
    const mockOpenRouter = new OpenRouterService('mock-key');

    vi.spyOn(mockOpenRouter, 'completeChat').mockRejectedValue(
      new Error('OpenRouter API Down'),
    );

    const result = await runJudgesOrchestration('case-999', sampleChargeSheet, sampleAdvocates, {
      openRouter: mockOpenRouter,
    });

    expect(result.status).toBe('failed');
    expect(result.verdicts.every((v) => v.status === 'error')).toBe(true);
    expect(result.totalTokens).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });
});
