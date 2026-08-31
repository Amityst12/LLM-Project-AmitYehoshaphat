import { z } from 'zod';
import crypto from 'node:crypto';

const MAX_FIELD_LENGTH = 500;

/**
 * Zod v4 schema for Charge Sheet validation.
 * Enforces SC-1: 3 required string fields, trimmed, max 500 chars each.
 */
const chargeSheetSchema = z.object({
  defendant: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { message: 'defendant must not be empty' })
        .max(MAX_FIELD_LENGTH, {
          message: `defendant must be at most ${MAX_FIELD_LENGTH} characters`,
        }),
    ),
  act: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { message: 'act must not be empty' })
        .max(MAX_FIELD_LENGTH, {
          message: `act must be at most ${MAX_FIELD_LENGTH} characters`,
        }),
    ),
  question: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { message: 'question must not be empty' })
        .max(MAX_FIELD_LENGTH, {
          message: `question must be at most ${MAX_FIELD_LENGTH} characters`,
        }),
    ),
});

/** Field-level error returned when validation fails. */
export interface FieldError {
  field: string;
  message: string;
}

/** Successful validation result with trimmed data + generated UUID. */
export interface ValidationSuccess {
  success: true;
  data: {
    id: string;
    defendant: string;
    act: string;
    question: string;
  };
}

/** Failed validation result with per-field errors. */
export interface ValidationFailure {
  success: false;
  errors: FieldError[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate a Charge Sheet input object.
 *
 * @param input - Raw input (typically from request body)
 * @returns ValidationSuccess with trimmed data + UUID, or ValidationFailure with field-level errors
 */
export function validateChargeSheet(input: unknown): ValidationResult {
  const result = chargeSheetSchema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: {
        id: crypto.randomUUID(),
        defendant: result.data.defendant,
        act: result.data.act,
        question: result.data.question,
      },
    };
  }

  const errors: FieldError[] = result.error.issues.map((issue) => ({
    field: (issue.path[0] as string) ?? 'unknown',
    message: issue.message,
  }));

  return { success: false, errors };
}
