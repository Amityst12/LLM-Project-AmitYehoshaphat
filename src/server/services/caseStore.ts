import { CaseData, ChargeSheet } from '../types/tribunal.js';

/**
 * In-memory case store for development and testing.
 * (Will integrate with Supabase in persistence iteration).
 */
class CaseStore {
  private cases: Map<string, CaseData> = new Map();

  public saveCase(id: string, chargeSheet: ChargeSheet): CaseData {
    const caseData: CaseData = {
      id,
      defendant: chargeSheet.defendant,
      act: chargeSheet.act,
      question: chargeSheet.question,
      createdAt: new Date().toISOString(),
    };
    this.cases.set(id, caseData);
    return caseData;
  }

  public getCase(id: string): CaseData | undefined {
    return this.cases.get(id);
  }

  public clear(): void {
    this.cases.clear();
  }
}

export const caseStore = new CaseStore();
