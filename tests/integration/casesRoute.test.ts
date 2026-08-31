import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server/app.js';

describe('POST /api/cases (SC-1 Integration)', () => {
  // --- Invalid requests ---
  describe('invalid input -> 400', () => {
    it('should return 400 with field errors for empty body', async () => {
      const res = await request(app).post('/api/cases').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors.length).toBe(3);
    });

    it('should return 400 with field errors for missing defendant', async () => {
      const res = await request(app).post('/api/cases').send({
        act: 'Some act',
        question: 'Some question',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
      );
    });

    it('should return 400 for fields exceeding 500 chars', async () => {
      const res = await request(app).post('/api/cases').send({
        defendant: 'A'.repeat(501),
        act: 'Valid act',
        question: 'Valid question',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'defendant' })]),
      );
    });
  });

  // --- Valid requests ---
  describe('valid input -> 201', () => {
    it('should return 201 with a valid UUID for valid input', async () => {
      const res = await request(app).post('/api/cases').send({
        defendant: 'OpenAI',
        act: 'Training on copyrighted data',
        question: 'Is it ethical to use public internet data for training?',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      // UUID v4 format
      expect(res.body.data.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should trim whitespace and return cleaned data', async () => {
      const res = await request(app).post('/api/cases').send({
        defendant: '  OpenAI  ',
        act: '  Training  ',
        question: '  Is it ethical?  ',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.defendant).toBe('OpenAI');
      expect(res.body.data.act).toBe('Training');
      expect(res.body.data.question).toBe('Is it ethical?');
    });
  });
});
