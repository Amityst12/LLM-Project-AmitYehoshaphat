import express from 'express';
import cors from 'cors';
import { casesRouter } from './routes/cases.js';
import { circuitBreaker } from './utils/circuitBreaker.js';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Routes ---
app.use('/api/cases', casesRouter);

// --- Budget Endpoint ---
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
