import { BudgetStatus } from '../types/tribunal.js';

export const DEFAULT_MAX_BUDGET_USD = 5.0;

export class CircuitBreakerError extends Error {
  public readonly currentCostUsd: number;
  public readonly maxBudgetUsd: number;

  constructor(currentCostUsd: number, maxBudgetUsd: number, message?: string) {
    super(
      message ??
        `Circuit breaker tripped: cumulative cost $${currentCostUsd.toFixed(4)} USD exceeds hard ceiling of $${maxBudgetUsd.toFixed(2)} USD.`,
    );
    this.name = 'CircuitBreakerError';
    this.currentCostUsd = currentCostUsd;
    this.maxBudgetUsd = maxBudgetUsd;
  }
}

/**
 * Economic Circuit Breaker (Mitigation P2).
 * Hard ceiling of $5.00 USD total across all LLM operations to prevent cost overruns.
 */
export class EconomicCircuitBreaker {
  private maxBudgetUsd: number;
  private totalSpentUsd: number;

  constructor(maxBudgetUsd: number = DEFAULT_MAX_BUDGET_USD) {
    this.maxBudgetUsd = maxBudgetUsd;
    this.totalSpentUsd = 0;
  }

  /**
   * Pre-check before executing an LLM API call.
   * Throws CircuitBreakerError if the budget is exhausted.
   */
  public checkBudget(estimatedCostUsd = 0.0001): { allowed: boolean; reason?: string } {
    if (this.totalSpentUsd + estimatedCostUsd > this.maxBudgetUsd) {
      const reason = `Budget limit of $${this.maxBudgetUsd.toFixed(2)} USD exceeded (spent: $${this.totalSpentUsd.toFixed(4)} USD). Circuit breaker active.`;
      return { allowed: false, reason };
    }
    return { allowed: true };
  }

  /**
   * Enforce budget: throws if budget limit reached.
   */
  public enforceBudget(estimatedCostUsd = 0.0001): void {
    const check = this.checkBudget(estimatedCostUsd);
    if (!check.allowed) {
      throw new CircuitBreakerError(this.totalSpentUsd, this.maxBudgetUsd, check.reason);
    }
  }

  /**
   * Record actual cost incurred after an LLM call.
   */
  public recordCost(costUsd: number): void {
    if (costUsd > 0) {
      this.totalSpentUsd = Number((this.totalSpentUsd + costUsd).toFixed(8));
    }
  }

  /**
   * Get current budget status metrics.
   */
  public getStatus(): BudgetStatus {
    const remaining = Math.max(0, Number((this.maxBudgetUsd - this.totalSpentUsd).toFixed(8)));
    return {
      totalSpentUsd: this.totalSpentUsd,
      maxBudgetUsd: this.maxBudgetUsd,
      remainingBudgetUsd: remaining,
      isTripped: this.totalSpentUsd >= this.maxBudgetUsd,
    };
  }

  /**
   * Reset budget state (used for testing or administrative reset).
   */
  public reset(newMaxBudget?: number): void {
    this.totalSpentUsd = 0;
    if (typeof newMaxBudget === 'number' && newMaxBudget > 0) {
      this.maxBudgetUsd = newMaxBudget;
    }
  }
}

export const circuitBreaker = new EconomicCircuitBreaker();
