import {
  AdvocateResponse,
  AdvocateRole,
  AdvocatesOrchestrationResult,
  ChargeSheet,
} from '../types/tribunal.js';
import { ADVOCATE_PERSONAS, buildAdvocateMessages } from '../prompts/advocates.js';
import { OpenRouterService, openRouterService } from './openrouter.js';

export interface OrchestratorOptions {
  modelMap?: Partial<Record<AdvocateRole, string>>;
  defaultModel?: string;
  timeoutMs?: number;
  openRouter?: OpenRouterService;
}

const ADVOCATE_ROLES: AdvocateRole[] = ['pro_1', 'pro_2', 'con_1', 'con_2'];

/**
 * Orchestrates 4 parallel advocate LLM calls via OpenRouter.
 * Implements SC-2: 2 Pro + 2 Con running concurrently with distinct personas.
 */
export async function runAdvocatesOrchestration(
  caseId: string,
  chargeSheet: ChargeSheet,
  options: OrchestratorOptions = {},
): Promise<AdvocatesOrchestrationResult> {
  const service = options.openRouter ?? openRouterService;
  const startTime = performance.now();

  const advocatePromises = ADVOCATE_ROLES.map(async (role): Promise<AdvocateResponse> => {
    const persona = ADVOCATE_PERSONAS[role];
    const model = options.modelMap?.[role] ?? options.defaultModel;
    const roleStartTime = performance.now();

    try {
      const messages = buildAdvocateMessages(role, chargeSheet);
      const result = await service.completeChat({
        model,
        messages,
        timeoutMs: options.timeoutMs,
      });

      return {
        role,
        position: persona.position,
        personaName: persona.personaName,
        argument: result.content,
        model: result.model,
        tokens: result.tokens,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        status: 'success',
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - roleStartTime);
      const errorMessage = err instanceof Error ? err.message : 'Unknown advocate error';

      return {
        role,
        position: persona.position,
        personaName: persona.personaName,
        argument: '',
        model: model ?? 'unknown',
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs,
        costUsd: 0,
        status: 'error',
        error: errorMessage,
      };
    }
  });

  // Execute all 4 advocates in parallel
  const advocates = await Promise.all(advocatePromises);
  const totalLatencyMs = Math.round(performance.now() - startTime);

  const totalTokens = advocates.reduce((sum, adv) => sum + adv.tokens.totalTokens, 0);
  const totalCostUsd = Number(
    advocates.reduce((sum, adv) => sum + adv.costUsd, 0).toFixed(8),
  );

  const successCount = advocates.filter((a) => a.status === 'success').length;
  let status: AdvocatesOrchestrationResult['status'] = 'completed';
  if (successCount === 0) {
    status = 'failed';
  } else if (successCount < advocates.length) {
    status = 'partial_failure';
  }

  return {
    caseId,
    advocates,
    totalTokens,
    totalCostUsd,
    totalLatencyMs,
    status,
  };
}
