import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { casesRouter } from './routes/cases.js';
import { circuitBreaker } from './utils/circuitBreaker.js';
import { MODEL_PRICING } from './services/openrouter.js';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Static Frontend Files ---
const clientPath = path.resolve(process.cwd(), 'src/client');
app.use(express.static(clientPath));

// --- Routes ---
app.use('/api/cases', casesRouter);

// --- Models Catalog Endpoint (SC-5) ---
app.get('/api/models', (_req, res) => {
  const models = [
    {
      id: 'google/gemini-2.0-flash-001',
      name: 'Google Gemini 2.0 Flash ($0.10 / $0.40 per 1M)',
      pricing: MODEL_PRICING['google/gemini-2.0-flash-001'],
    },
    {
      id: 'google/gemini-2.0-flash-lite-preview-02-05:free',
      name: 'Google Gemini 2.0 Flash Lite (Free Tier)',
      pricing: MODEL_PRICING['google/gemini-2.0-flash-lite-preview-02-05:free'],
    },
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat ($0.14 / $0.28 per 1M)',
      pricing: MODEL_PRICING['deepseek/deepseek-chat'],
    },
    {
      id: 'openai/gpt-4o-mini',
      name: 'OpenAI GPT-4o Mini ($0.15 / $0.60 per 1M)',
      pricing: MODEL_PRICING['openai/gpt-4o-mini'],
    },
  ];

  res.json({
    success: true,
    data: models,
  });
});

// --- Budget Endpoint (SC-4) ---
app.get('/api/budget', (_req, res) => {
  res.json({
    success: true,
    data: circuitBreaker.getStatus(),
  });
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export { app };
