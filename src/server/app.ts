import express from 'express';
import cors from 'cors';
import { casesRouter } from './routes/cases.js';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Routes ---
app.use('/api/cases', casesRouter);

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export { app };
