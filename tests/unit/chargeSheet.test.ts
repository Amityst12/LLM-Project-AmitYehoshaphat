import { describe, it, expect } from 'vitest';
import { validateChargeSheet } from '../../src/server/validators/chargeSheet.js';

describe('Charge Sheet Validator (SC-1)', () => {
  // --- Valid input ---
  describe('valid input', () => {
    it('should accept a valid charge sheet with all three fields', () => {
      const result = validateChargeSheet({
        defendant: 'OpenAI',
        act: 'Training on copyrighted data without consent',
        question: 'Is it ethical to train AI on public internet data?',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defendant).toBe('OpenAI');
        expect(result.data.act).toBe('Training on copyrighted data without consent');
        expect(result.data.question).toBe('Is it ethical to train AI on public internet data?');
      }
    });

    it('should trim whitespace from all fields', () => {
      const result = validateChargeSheet({
        defendant: '  OpenAI  ',
        act: '  Training on copyrighted data  ',
        question: '  Is it ethical?  ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defendant).toBe('OpenAI');
        expect(result.data.act).toBe('Training on copyrighted data');
        expect(result.data.question).toBe('Is it ethical?');
      }
    });
  });

  // --- Missing fields ---
  describe('missing fields', () => {
    it('should reject when defendant is missing', () => {
      const result = validateChargeSheet({
        act: 'Some act',
        question: 'Some question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
        );
      }
    });

    it('should reject when act is missing', () => {
      const result = validateChargeSheet({
        defendant: 'Someone',
        question: 'Some question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'act' })]),
        );
      }
    });

    it('should reject when question is missing', () => {
      const result = validateChargeSheet({
        defendant: 'Someone',
        act: 'Some act',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'question' })]),
        );
      }
    });

    it('should report all missing fields at once', () => {
      const result = validateChargeSheet({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBe(3);
        const fields = result.errors.map((e) => e.field);
        expect(fields).toContain('defendant');
        expect(fields).toContain('act');
        expect(fields).toContain('question');
      }
    });
  });

  // --- Empty strings ---
  describe('empty strings', () => {
    it('should reject empty string defendant', () => {
      const result = validateChargeSheet({
        defendant: '',
        act: 'Some act',
        question: 'Some question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
        );
      }
    });

    it('should reject whitespace-only strings as empty', () => {
      const result = validateChargeSheet({
        defendant: '   ',
        act: 'Some act',
        question: 'Some question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
        );
      }
    });
  });

  // --- Max length (500 chars) ---
  describe('field length limits', () => {
    it('should accept fields at exactly 500 characters', () => {
      const str500 = 'A'.repeat(500);
      const result = validateChargeSheet({
        defendant: str500,
        act: str500,
        question: str500,
      });

      expect(result.success).toBe(true);
    });

    it('should reject defendant exceeding 500 characters', () => {
      const result = validateChargeSheet({
        defendant: 'A'.repeat(501),
        act: 'Valid act',
        question: 'Valid question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
        );
      }
    });

    it('should reject act exceeding 500 characters', () => {
      const result = validateChargeSheet({
        defendant: 'Valid',
        act: 'B'.repeat(501),
        question: 'Valid question',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'act' })]),
        );
      }
    });

    it('should reject question exceeding 500 characters', () => {
      const result = validateChargeSheet({
        defendant: 'Valid',
        act: 'Valid act',
        question: 'C'.repeat(501),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'question' })]),
        );
      }
    });

    it('should report multiple length violations at once', () => {
      const result = validateChargeSheet({
        defendant: 'D'.repeat(501),
        act: 'E'.repeat(501),
        question: 'F'.repeat(501),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBe(3);
      }
    });
  });

  // --- Error structure ---
  describe('error structure', () => {
    it('should return field-level errors with field name and message', () => {
      const result = validateChargeSheet({ defendant: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        for (const error of result.errors) {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
          expect(typeof error.field).toBe('string');
          expect(typeof error.message).toBe('string');
        }
      }
    });
  });
});
