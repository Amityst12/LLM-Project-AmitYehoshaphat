import { describe, it, expect, beforeEach } from 'vitest';
import {
  EconomicCircuitBreaker,
  CircuitBreakerError,
  DEFAULT_MAX_BUDGET_USD,
} from '../../src/server/utils/circuitBreaker.js';

describe('Economic Circuit Breaker (Mitigation P2)', () => {
  let breaker: EconomicCircuitBreaker;

  beforeEach(() => {
    breaker = new EconomicCircuitBreaker(5.0);
  });

  it('should initialize with default 5.00 USD budget and 0 spent', () => {
    const status = breaker.getStatus();
    expect(status.maxBudgetUsd).toBe(DEFAULT_MAX_BUDGET_USD);
    expect(status.totalSpentUsd).toBe(0);
    expect(status.remainingBudgetUsd).toBe(5.0);
    expect(status.isTripped).toBe(false);
  });

  it('should allow operations when spent cost is below limit', () => {
    const check1 = breaker.checkBudget(0.01);
    expect(check1.allowed).toBe(true);

    breaker.recordCost(1.5);
    expect(breaker.getStatus().totalSpentUsd).toBe(1.5);
    expect(breaker.getStatus().remainingBudgetUsd).toBe(3.5);
    expect(breaker.getStatus().isTripped).toBe(false);

    expect(() => breaker.enforceBudget(0.5)).not.toThrow();
  });

  it('should trip immediately when cumulative cost reaches 5.00 USD', () => {
    breaker.recordCost(5.0);

    const status = breaker.getStatus();
    expect(status.isTripped).toBe(true);
    expect(status.remainingBudgetUsd).toBe(0);

    const check = breaker.checkBudget(0.001);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Budget limit of $5.00 USD exceeded');

    expect(() => breaker.enforceBudget(0.001)).toThrow(CircuitBreakerError);
  });

  it('should trip when next estimated cost would exceed budget', () => {
    breaker.recordCost(4.999);

    const check = breaker.checkBudget(0.002);
    expect(check.allowed).toBe(false);

    expect(() => breaker.enforceBudget(0.002)).toThrowError(
      /Budget limit of \$5\.00 USD exceeded/,
    );
  });

  it('should reset budget cleanly and un-trip the breaker', () => {
    breaker.recordCost(5.5);
    expect(breaker.getStatus().isTripped).toBe(true);

    breaker.reset();
    const status = breaker.getStatus();
    expect(status.totalSpentUsd).toBe(0);
    expect(status.remainingBudgetUsd).toBe(5.0);
    expect(status.isTripped).toBe(false);
    expect(breaker.checkBudget().allowed).toBe(true);
  });

  it('should support resetting with a custom max budget', () => {
    breaker.reset(10.0);
    expect(breaker.getStatus().maxBudgetUsd).toBe(10.0);
    expect(breaker.getStatus().remainingBudgetUsd).toBe(10.0);
  });
});
