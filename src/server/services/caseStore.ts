import { AdvocateResponse, CaseData, ChargeSheet, JudgeVerdict } from '../types/tribunal.js';

/**
 * In-memory case store for development and testing.
 * (Will integrate with Supabase in persistence iteration).
 */
class CaseStore {
  private cases: Map<string, CaseData> = new Map();

  public saveCase(id: string, chargeSheet: ChargeSheet): CaseData {
    const existing = this.cases.get(id);
    const caseData: CaseData = {
      id,
      defendant: chargeSheet.defendant,
      act: chargeSheet.act,
      question: chargeSheet.question,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      advocates: existing?.advocates,
      verdicts: existing?.verdicts,
    };
    this.cases.set(id, caseData);
    return caseData;
  }

  public saveAdvocates(id: string, advocates: AdvocateResponse[]): CaseData | undefined {
    const existing = this.cases.get(id);
    if (!existing) return undefined;
    existing.advocates = advocates;
    return existing;
  }

  public saveVerdicts(id: string, verdicts: JudgeVerdict[]): CaseData | undefined {
    const existing = this.cases.get(id);
    if (!existing) return undefined;
    existing.verdicts = verdicts;
    return existing;
  }

  public getCase(id: string): CaseData | undefined {
    return this.cases.get(id);
  }

  public clear(): void {
    this.cases.clear();
  }
}

export const caseStore = new CaseStore();
