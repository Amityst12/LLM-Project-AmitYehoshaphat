import { Router, Request, Response } from 'express';
import { validateChargeSheet } from '../validators/chargeSheet.js';
import { caseStore } from '../services/caseStore.js';
import { runAdvocatesOrchestration } from '../services/advocatesOrchestrator.js';
import { runJudgesOrchestration } from '../services/judgesOrchestrator.js';
import {
  AdvocateResponse,
  AuditLogEntry,
  ChargeSheet,
} from '../types/tribunal.js';
import { circuitBreaker, CircuitBreakerError } from '../utils/circuitBreaker.js';

const router = Router();

function getIdParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

/**
 * GET /api/cases
 *
 * Retrieves all registered cases.
 */
router.get('/', async (_req: Request, res: Response) => {
  const cases = await caseStore.getCaseAsync('');
  // Or list from store
  res.status(200).json({
    success: true,
    data: cases ?? [],
  });
});

/**
 * GET /api/cases/:id
 *
 * Retrieves full details for a case including charge sheet,
 * advocate arguments, judicial verdicts, and audit log.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = getIdParam(req.params.id);
  const fullCase = await caseStore.getCaseAsync(id);

  if (!fullCase) {
    res.status(404).json({
      success: false,
      error: `Case with id ${id} not found`,
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: fullCase,
  });
});

/**
 * GET /api/cases/:id/audit
 *
 * Retrieves the Audit Trail (tokens, latency, cost) for a specific case.
 */
router.get('/:id/audit', async (req: Request, res: Response) => {
  const id = getIdParam(req.params.id);
  const audit = await caseStore.getAuditLogAsync(id);

  if (!audit) {
    res.status(404).json({
      success: false,
      error: `Audit log for case ${id} not found`,
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: audit,
  });
});

/**
 * POST /api/cases
 *
 * Accepts a Charge Sheet (defendant, act, question), validates it,
 * saves it in the case store, and returns the case data with ID.
 */
router.post('/', (req: Request, res: Response) => {
  const result = validateChargeSheet(req.body);

  if (!result.success) {
    res.status(400).json({
      success: false,
      errors: result.errors,
    });
    return;
  }

  const savedCase = caseStore.saveCase(result.data.id, {
    defendant: result.data.defendant,
    act: result.data.act,
    question: result.data.question,
  });

  res.status(201).json({
    success: true,
    data: savedCase,
  });
});

/**
 * POST /api/cases/:id/advocates
 *
 * Runs 4 parallel advocates on the given case.
 * Returns the 4 arguments along with token, latency, and cost economics.
 */
router.post('/:id/advocates', async (req: Request, res: Response) => {
  const id = getIdParam(req.params.id);
  const existingCase = await caseStore.getCaseAsync(id);

  let chargeSheet: ChargeSheet | undefined = existingCase
    ? {
        defendant: existingCase.defendant,
        act: existingCase.act,
        question: existingCase.question,
      }
    : undefined;

  if (!chargeSheet && req.body && req.body.defendant) {
    const validation = validateChargeSheet(req.body);
    if (validation.success) {
      chargeSheet = {
        defendant: validation.data.defendant,
        act: validation.data.act,
        question: validation.data.question,
      };
      caseStore.saveCase(id, chargeSheet);
    }
  }

  if (!chargeSheet) {
    res.status(404).json({
      success: false,
      error: `Case with id ${id} not found`,
    });
    return;
  }

  try {
    const { modelMap, defaultModel, timeoutMs } = req.body ?? {};
    const result = await runAdvocatesOrchestration(id, chargeSheet, {
      modelMap,
      defaultModel,
      timeoutMs,
    });

    caseStore.saveAdvocates(id, result.advocates);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    if (err instanceof CircuitBreakerError) {
      res.status(429).json({
        success: false,
        error: err.message,
        circuitBreaker: circuitBreaker.getStatus(),
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Advocate orchestration failed';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * Handler for judicial deliberation endpoints.
 */
async function handleDeliberation(req: Request, res: Response): Promise<void> {
  const id = getIdParam(req.params.id);
  const existingCase = await caseStore.getCaseAsync(id);

  let chargeSheet: ChargeSheet | undefined = existingCase
    ? {
        defendant: existingCase.defendant,
        act: existingCase.act,
        question: existingCase.question,
      }
    : undefined;

  let advocates: AdvocateResponse[] | undefined = existingCase?.advocates;
  let advocatesPromptTokens = 0;
  let advocatesCompletionTokens = 0;
  let advocatesCostUsd = 0;
  let advocatesLatencyMs = 0;

  // Allow inline chargeSheet or advocates in request body if not in store
  if (req.body && req.body.chargeSheet) {
    const validation = validateChargeSheet(req.body.chargeSheet);
    if (validation.success) {
      chargeSheet = {
        defendant: validation.data.defendant,
        act: validation.data.act,
        question: validation.data.question,
      };
    }
  }

  if (req.body && Array.isArray(req.body.advocates)) {
    advocates = req.body.advocates;
  }

  if (!chargeSheet) {
    res.status(404).json({
      success: false,
      error: `Case with id ${id} not found`,
    });
    return;
  }

  try {
    // If advocates haven't been run yet, run them first
    if (!advocates || advocates.length === 0) {
      const advResult = await runAdvocatesOrchestration(id, chargeSheet, {
        defaultModel: req.body?.defaultModel,
        timeoutMs: req.body?.timeoutMs,
      });
      advocates = advResult.advocates;
      advocatesPromptTokens = advResult.advocates.reduce(
        (sum, a) => sum + a.tokens.promptTokens,
        0,
      );
      advocatesCompletionTokens = advResult.advocates.reduce(
        (sum, a) => sum + a.tokens.completionTokens,
        0,
      );
      advocatesCostUsd = advResult.totalCostUsd;
      advocatesLatencyMs = advResult.totalLatencyMs;
      caseStore.saveAdvocates(id, advocates);
    } else {
      advocatesPromptTokens = advocates.reduce((sum, a) => sum + a.tokens.promptTokens, 0);
      advocatesCompletionTokens = advocates.reduce(
        (sum, a) => sum + a.tokens.completionTokens,
        0,
      );
      advocatesCostUsd = Number(advocates.reduce((sum, a) => sum + a.costUsd, 0).toFixed(8));
    }

    const { modelMap, defaultModel, timeoutMs } = req.body ?? {};
    const result = await runJudgesOrchestration(id, chargeSheet, advocates, {
      modelMap,
      defaultModel,
      timeoutMs,
    });

    caseStore.saveVerdicts(id, result.verdicts);

    // Save full Audit Trail covering all 7 agents
    const judgesPromptTokens = result.verdicts.reduce(
      (sum, v) => sum + v.tokens.promptTokens,
      0,
    );
    const judgesCompletionTokens = result.verdicts.reduce(
      (sum, v) => sum + v.tokens.completionTokens,
      0,
    );
    const totalPromptTokens = advocatesPromptTokens + judgesPromptTokens;
    const totalCompletionTokens = advocatesCompletionTokens + judgesCompletionTokens;
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCostUsd = Number((advocatesCostUsd + result.totalCostUsd).toFixed(8));
    const totalLatencyMs = advocatesLatencyMs + result.totalLatencyMs;

    const auditEntry: AuditLogEntry = {
      caseId: id,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens,
      totalLatencyMs,
      totalCostUsd,
      agentCount: advocates.length + result.verdicts.length,
      pipelineStatus: result.status,
    };

    caseStore.saveAuditLog(auditEntry);

    res.status(200).json({
      success: true,
      data: result,
      audit: auditEntry,
    });
  } catch (err: unknown) {
    if (err instanceof CircuitBreakerError) {
      res.status(429).json({
        success: false,
        error: err.message,
        circuitBreaker: circuitBreaker.getStatus(),
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Judicial deliberation failed';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}

/**
 * POST /api/cases/:id/deliberate
 * POST /api/cases/:id/judges
 *
 * Runs 3 independent judges on the case and its 4 advocate arguments.
 * Implements SC-3 & Unmerged Protocol: returns separate verdicts (V1, V2, V3).
 */
router.post('/:id/deliberate', handleDeliberation);
router.post('/:id/judges', handleDeliberation);

export { router as casesRouter };
