import { Router } from 'express';
import { validateChargeSheet } from '../validators/chargeSheet.js';

const router = Router();

/**
 * POST /api/cases
 *
 * Accepts a Charge Sheet (defendant, act, question), validates it,
 * and returns a case ID on success or field-level errors on failure.
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

  res.status(201).json({
    success: true,
    data: result.data,
  });
});

export { router as casesRouter };
