import { Router } from 'express';
import { validateChargeSheet } from '../validators/chargeSheet.js';
import { caseStore } from '../services/caseStore.js';
import { runAdvocatesOrchestration } from '../services/advocatesOrchestrator.js';

const router = Router();

/**
 * POST /api/cases
 *
 * Accepts a Charge Sheet (defendant, act, question), validates it,
 * saves it in the case store, and returns the case data with ID.
 */
router.post('/', (req, res) => {
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
router.post('/:id/advocates', async (req, res) => {
  const { id } = req.params;
  const existingCase = caseStore.getCase(id);

  // If case not found in store, check if chargeSheet is provided in body
  let chargeSheet = existingCase
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

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Advocate orchestration failed';
    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

export { router as casesRouter };
