import {
  AdvocateResponse,
  AuditLogEntry,
  CaseData,
  CaseFullDetails,
  ChargeSheet,
  JudgeVerdict,
} from '../types/tribunal.js';
import { supabaseStore } from './supabaseStore.js';

/**
 * Case Store facade providing unified access across synchronous in-memory & async Supabase operations.
 */
class CaseStore {
  public saveCase(id: string, chargeSheet: ChargeSheet): CaseData {
    // Synchronously write to in-memory store and fire async DB write
    void supabaseStore.saveCase(id, chargeSheet);
    return {
      id,
      defendant: chargeSheet.defendant,
      act: chargeSheet.act,
      question: chargeSheet.question,
      status: 'created',
      createdAt: new Date().toISOString(),
    };
  }

  public saveAdvocates(id: string, advocates: AdvocateResponse[]): void {
    void supabaseStore.saveAdvocates(id, advocates);
  }

  public saveVerdicts(id: string, verdicts: JudgeVerdict[]): void {
    void supabaseStore.saveVerdicts(id, verdicts);
  }

  public saveAuditLog(audit: AuditLogEntry): void {
    void supabaseStore.saveAuditLog(audit);
  }

  public async getCaseAsync(id: string): Promise<CaseFullDetails | undefined> {
    return supabaseStore.getCase(id);
  }

  public async getAuditLogAsync(id: string): Promise<AuditLogEntry | undefined> {
    return supabaseStore.getAuditLog(id);
  }

  public clear(): void {
    supabaseStore.clear();
  }
}

export const caseStore = new CaseStore();
export { supabaseStore };
