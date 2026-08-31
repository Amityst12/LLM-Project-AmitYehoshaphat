import { describe, it, expect } from 'vitest';
import { handler } from '../../netlify/functions/api.js';

type LambdaHandler = (
  event: unknown,
  context: unknown,
) => Promise<{ statusCode: number; body: string }>;

describe('Netlify Serverless Handler (Unit)', () => {
  const serverlessFn = handler as unknown as LambdaHandler;

  it('should process a GET /health event and return 200 OK', async () => {
    const mockEvent = {
      httpMethod: 'GET',
      path: '/health',
      headers: {},
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
    };

    const mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'api',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:api',
      memoryLimitInMB: '1024',
      awsRequestId: 'req-123',
      logGroupName: '/aws/lambda/api',
      logStreamName: '2026/09/01/[$LATEST]123',
      getRemainingTimeInMillis: () => 5000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    const response = await serverlessFn(mockEvent, mockContext);

    expect(response).toBeDefined();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toEqual({ status: 'ok' });
  });

  it('should process a GET /api/models event and return models catalog', async () => {
    const mockEvent = {
      httpMethod: 'GET',
      path: '/api/models',
      headers: {},
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
    };

    const mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'api',
      functionVersion: '1',
      invokedFunctionArn: '',
      memoryLimitInMB: '1024',
      awsRequestId: 'req-456',
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 5000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    const response = await serverlessFn(mockEvent, mockContext);

    expect(response).toBeDefined();
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(4);
  });

  it('should return 404 for non-existent routes', async () => {
    const mockEvent = {
      httpMethod: 'GET',
      path: '/api/unknown-route',
      headers: {},
      queryStringParameters: null,
      body: null,
      isBase64Encoded: false,
    };

    const mockContext = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'api',
      functionVersion: '1',
      invokedFunctionArn: '',
      memoryLimitInMB: '1024',
      awsRequestId: 'req-789',
      logGroupName: '',
      logStreamName: '',
      getRemainingTimeInMillis: () => 5000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    const response = await serverlessFn(mockEvent, mockContext);

    expect(response).toBeDefined();
    expect(response.statusCode).toBe(404);
  });
});
