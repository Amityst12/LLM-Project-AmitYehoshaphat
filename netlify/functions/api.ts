import serverless from 'serverless-http';
import { app } from '../../src/server/app.js';

/**
 * Netlify Serverless Function handler wrapping the Express application.
 */
export const handler = serverless(app);
