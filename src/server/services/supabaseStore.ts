import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AdvocateResponse,
  AuditLogEntry,
  CaseData,
  CaseFullDetails,
  ChargeSheet,
  JudgeVerdict,
} from '../types/tribunal.js';

export interface CaseRepository {
  saveCase(id: string, chargeSheet: ChargeSheet): Promise<CaseData>;
  getCase(id: string): Promise<CaseFullDetails | undefined>;
  saveAdvocates(caseId: string, advocates: AdvocateResponse[]): Promise<void>;
  saveVerdicts(caseId: string, verdicts: JudgeVerdict[]): Promise<void>;
  saveAuditLog(audit: AuditLogEntry): Promise<AuditLogEntry>;
  getAuditLog(caseId: string): Promise<AuditLogEntry | undefined>;
  getAllCases(): Promise<CaseData[]>;
  clear(): void;
}

/**
 * Supabase Data Store with seamless In-Memory fallback for testing and offline environments.
 */
export class SupabaseStore implements CaseRepository {
  private client: SupabaseClient | null = null;
  private inMemoryCases = new Map<string, CaseData>();
  private inMemoryAdvocates = new Map<string, AdvocateResponse[]>();
  private inMemoryVerdicts = new Map<string, JudgeVerdict[]>();
  private inMemoryAuditLogs = new Map<string, AuditLogEntry>();

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl ?? process.env.SUPABASE_URL;
    const key = supabaseKey ?? process.env.SUPABASE_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      try {
        this.client = createClient(url, key);
      } catch {
        this.client = null;
      }
    }
  }

  public isUsingDatabase(): boolean {
    return this.client !== null;
  }

  public async saveCase(id: string, chargeSheet: ChargeSheet): Promise<CaseData> {
    const caseData: CaseData = {
      id,
      defendant: chargeSheet.defendant,
      act: chargeSheet.act,
      question: chargeSheet.question,
      status: 'created',
      createdAt: new Date().toISOString(),
    };

    this.inMemoryCases.set(id, caseData);

    if (this.client) {
      try {
        await this.client.from('cases').upsert({
          id: caseData.id,
          defendant: caseData.defendant,
          act: caseData.act,
          question: caseData.question,
          status: caseData.status,
          created_at: caseData.createdAt,
        });
      } catch {
        // Fallback gracefully to in-memory on DB errors
      }
    }

    return caseData;
  }

  public async getCase(id: string): Promise<CaseFullDetails | undefined> {
    const inMemCase = this.inMemoryCases.get(id);

    if (this.client) {
      try {
        const { data: caseRow } = await this.client
          .from('cases')
          .select('*')
          .eq('id', id)
          .single();

        if (caseRow) {
          const { data: advocateRows } = await this.client
            .from('advocate_speeches')
            .select('*')
            .eq('case_id', id);

          const { data: verdictRows } = await this.client
            .from('judge_verdicts')
            .select('*')
            .eq('case_id', id);

          const { data: auditRow } = await this.client
            .from('audit_logs')
            .select('*')
            .eq('case_id', id)
            .maybeSingle();

          const advocates: AdvocateResponse[] = (advocateRows || []).map((row) => ({
            role: row.role,
            position: row.position,
            personaName: row.persona_name,
            argument: row.argument,
            model: row.model,
            tokens: {
              promptTokens: row.prompt_tokens,
              completionTokens: row.completion_tokens,
              totalTokens: row.total_tokens,
            },
            latencyMs: row.latency_ms,
            costUsd: Number(row.cost_usd),
            status: row.status,
            error: row.error_message,
          }));

          const verdicts: JudgeVerdict[] = (verdictRows || []).map((row) => ({
            judgeId: row.judge_id,
            personaName: row.persona_name,
            verdict: row.verdict,
            reasoning: row.reasoning,
            dissentPoints: Array.isArray(row.dissent_points) ? row.dissent_points : [],
            model: row.model,
            tokens: {
              promptTokens: row.prompt_tokens,
              completionTokens: row.completion_tokens,
              totalTokens: row.total_tokens,
            },
            latencyMs: row.latency_ms,
            costUsd: Number(row.cost_usd),
            status: row.status,
            error: row.error_message,
          }));

          const audit: AuditLogEntry | undefined = auditRow
            ? {
                id: auditRow.id,
                caseId: auditRow.case_id,
                promptTokens: auditRow.prompt_tokens,
                completionTokens: auditRow.completion_tokens,
                totalTokens: auditRow.total_tokens,
                totalLatencyMs: auditRow.total_latency_ms,
                totalCostUsd: Number(auditRow.total_cost_usd),
                agentCount: auditRow.agent_count,
                pipelineStatus: auditRow.pipeline_status,
                createdAt: auditRow.created_at,
              }
            : undefined;

          return {
            id: caseRow.id,
            defendant: caseRow.defendant,
            act: caseRow.act,
            question: caseRow.question,
            status: caseRow.status,
            createdAt: caseRow.created_at,
            advocates,
            verdicts,
            audit,
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }

    if (!inMemCase) return undefined;

    return {
      ...inMemCase,
      advocates: this.inMemoryAdvocates.get(id),
      verdicts: this.inMemoryVerdicts.get(id),
      audit: this.inMemoryAuditLogs.get(id),
    };
  }

  public async saveAdvocates(caseId: string, advocates: AdvocateResponse[]): Promise<void> {
    this.inMemoryAdvocates.set(caseId, advocates);
    const existing = this.inMemoryCases.get(caseId);
    if (existing) {
      existing.advocates = advocates;
      existing.status = 'advocates_completed';
    }

    if (this.client) {
      try {
        const rows = advocates.map((adv) => ({
          case_id: caseId,
          role: adv.role,
          position: adv.position,
          persona_name: adv.personaName,
          argument: adv.argument,
          model: adv.model,
          prompt_tokens: adv.tokens.promptTokens,
          completion_tokens: adv.tokens.completionTokens,
          total_tokens: adv.tokens.totalTokens,
          latency_ms: adv.latencyMs,
          cost_usd: adv.costUsd,
          status: adv.status,
          error_message: adv.error,
        }));

        await this.client.from('advocate_speeches').insert(rows);
        await this.client
          .from('cases')
          .update({ status: 'advocates_completed' })
          .eq('id', caseId);
      } catch {
        // Fallback gracefully
      }
    }
  }

  public async saveVerdicts(caseId: string, verdicts: JudgeVerdict[]): Promise<void> {
    this.inMemoryVerdicts.set(caseId, verdicts);
    const existing = this.inMemoryCases.get(caseId);
    if (existing) {
      existing.verdicts = verdicts;
      existing.status = 'deliberated';
    }

    if (this.client) {
      try {
        const rows = verdicts.map((v) => ({
          case_id: caseId,
          judge_id: v.judgeId,
          persona_name: v.personaName,
          verdict: v.verdict,
          reasoning: v.reasoning,
          dissent_points: v.dissentPoints,
          model: v.model,
          prompt_tokens: v.tokens.promptTokens,
          completion_tokens: v.tokens.completionTokens,
          total_tokens: v.tokens.totalTokens,
          latency_ms: v.latencyMs,
          cost_usd: v.costUsd,
          status: v.status,
          error_message: v.error,
        }));

        await this.client.from('judge_verdicts').insert(rows);
        await this.client
          .from('cases')
          .update({ status: 'deliberated' })
          .eq('id', caseId);
      } catch {
        // Fallback gracefully
      }
    }
  }

  public async saveAuditLog(audit: AuditLogEntry): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      ...audit,
      id: audit.id ?? crypto.randomUUID(),
      createdAt: audit.createdAt ?? new Date().toISOString(),
    };

    this.inMemoryAuditLogs.set(audit.caseId, entry);

    if (this.client) {
      try {
        await this.client.from('audit_logs').insert({
          id: entry.id,
          case_id: entry.caseId,
          prompt_tokens: entry.promptTokens,
          completion_tokens: entry.completionTokens,
          total_tokens: entry.totalTokens,
          total_latency_ms: entry.totalLatencyMs,
          total_cost_usd: entry.totalCostUsd,
          agent_count: entry.agentCount,
          pipeline_status: entry.pipelineStatus,
          created_at: entry.createdAt,
        });
      } catch {
        // Fallback gracefully
      }
    }

    return entry;
  }

  public async getAuditLog(caseId: string): Promise<AuditLogEntry | undefined> {
    if (this.client) {
      try {
        const { data } = await this.client
          .from('audit_logs')
          .select('*')
          .eq('case_id', caseId)
          .single();

        if (data) {
          return {
            id: data.id,
            caseId: data.case_id,
            promptTokens: data.prompt_tokens,
            completionTokens: data.completion_tokens,
            totalTokens: data.total_tokens,
            totalLatencyMs: data.total_latency_ms,
            totalCostUsd: Number(data.total_cost_usd),
            agentCount: data.agent_count,
            pipelineStatus: data.pipeline_status,
            createdAt: data.created_at,
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return this.inMemoryAuditLogs.get(caseId);
  }

  public async getAllCases(): Promise<CaseData[]> {
    if (this.client) {
      try {
        const { data } = await this.client
          .from('cases')
          .select('*')
          .order('created_at', { ascending: false });

        if (data) {
          return data.map((row) => ({
            id: row.id,
            defendant: row.defendant,
            act: row.act,
            question: row.question,
            status: row.status,
            createdAt: row.created_at,
          }));
        }
      } catch {
        // Fallback
      }
    }

    return Array.from(this.inMemoryCases.values());
  }

  public clear(): void {
    this.inMemoryCases.clear();
    this.inMemoryAdvocates.clear();
    this.inMemoryVerdicts.clear();
    this.inMemoryAuditLogs.clear();
  }
}

export const supabaseStore = new SupabaseStore();
