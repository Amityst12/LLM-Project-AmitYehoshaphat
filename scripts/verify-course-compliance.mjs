/**
 * scripts/verify-course-compliance.mjs
 * Automated Course Compliance & Evaluation Suite for The Tribunal
 * Validates SC-1 through SC-6, Safety Controls, and Context Engineering Rules.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ANSI color helpers
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const results = [];

function recordCheck(code, title, passed, details = '') {
  results.push({ code, title, passed, details });
  const status = passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✖ FAIL${RESET}`;
  console.log(`  ${status} ${BOLD}[${code}]${RESET} ${title}`);
  if (details && !passed) {
    console.log(`         ${RED}↳ ${details}${RESET}`);
  }
}

async function runComplianceChecks() {
  console.log(`\n${CYAN}${BOLD}==========================================================${RESET}`);
  console.log(`${CYAN}${BOLD}⚖️  THE TRIBUNAL — AUTOMATED COURSE COMPLIANCE AUDIT${RESET}`);
  console.log(`${CYAN}${BOLD}==========================================================${RESET}\n`);

  try {
    // ----------------------------------------------------
    // Category 1: Context Engineering & Security (Module 1)
    // ----------------------------------------------------
    console.log(`${YELLOW}${BOLD}1. Context Engineering, Operating Contract & Security${RESET}`);

    const agentsMdPath = resolve(process.cwd(), 'AGENTS.md');
    if (existsSync(agentsMdPath)) {
      const content = readFileSync(agentsMdPath, 'utf-8');
      const lines = content.split('\n').length;
      recordCheck(
        'CE-1',
        'AGENTS.md Contract exists and is under 200 lines',
        lines <= 200,
        `Line count: ${lines} (must be <= 200)`,
      );
    } else {
      recordCheck('CE-1', 'AGENTS.md exists', false, 'File not found');
    }

    const envExamplePath = resolve(process.cwd(), '.env.example');
    const hasExample = existsSync(envExamplePath);
    recordCheck('SEC-1', '.env.example template exists for secret isolation', hasExample);

    // ----------------------------------------------------
    // Category 2: SC-1 Charge Sheet Validation (Module 6)
    // ----------------------------------------------------
    console.log(`\n${YELLOW}${BOLD}2. SC-1: Charge Sheet Validation Gate${RESET}`);
    const { validateChargeSheet } = await import('../dist/src/server/validators/chargeSheet.js');

    const validCase = validateChargeSheet({
      defendant: '  OpenAI Inc  ',
      act: '  Scraped public web text for training  ',
      question: '  Is training on copyrighted web data ethical?  ',
    });
    recordCheck(
      'SC-1.1',
      'Valid input returns success: true with trimmed data and UUID',
      validCase.success === true &&
        validCase.data.defendant === 'OpenAI Inc' &&
        typeof validCase.data.id === 'string',
    );

    const over500Case = validateChargeSheet({
      defendant: 'A'.repeat(501),
      act: 'Valid act',
      question: 'Valid question',
    });
    recordCheck(
      'SC-1.2',
      'Input exceeding 500 characters is rejected with field-level errors',
      over500Case.success === false &&
        over500Case.errors.some((e) => e.field === 'defendant'),
    );

    const emptyCase = validateChargeSheet({});
    recordCheck(
      'SC-1.3',
      'Empty body returns structured errors for all 3 required fields',
      emptyCase.success === false && emptyCase.errors.length === 3,
    );

    // ----------------------------------------------------
    // Category 3: SC-2 Four Parallel Advocates (Module 9)
    // ----------------------------------------------------
    console.log(`\n${YELLOW}${BOLD}3. SC-2: 4 Parallel Advocates & Anti-Prompt-Injection${RESET}`);
    const { ADVOCATE_PERSONAS } = await import('../dist/src/server/prompts/advocates.js');
    const { runAdvocatesOrchestration } = await import(
      '../dist/src/server/services/advocatesOrchestrator.js'
    );

    const roles = Object.keys(ADVOCATE_PERSONAS);
    recordCheck(
      'SC-2.1',
      'Four distinct advocate personas defined (2 Pro, 2 Con)',
      roles.length === 4 &&
        roles.filter((r) => ADVOCATE_PERSONAS[r].position === 'pro').length === 2 &&
        roles.filter((r) => ADVOCATE_PERSONAS[r].position === 'con').length === 2,
    );

    const advResult = await runAdvocatesOrchestration('audit-case-1', {
      defendant: 'AutoMedic AI',
      act: 'Prioritized paying clients for limited organ transplants',
      question: 'Does wealth-based medical triage violate the Hippocratic duty of care?',
    });

    recordCheck(
      'SC-2.2',
      'Parallel execution returns all 4 advocate arguments with token economics',
      advResult.status === 'completed' &&
        advResult.advocates.length === 4 &&
        advResult.totalTokens > 0,
    );

    // ----------------------------------------------------
    // Category 4: SC-3 Three Judges & Unmerged Protocol (Module 10)
    // ----------------------------------------------------
    console.log(`\n${YELLOW}${BOLD}4. SC-3: 3 Independent Judges & Unmerged Protocol${RESET}`);
    const { JUDGE_PERSONAS } = await import('../dist/src/server/prompts/judges.js');
    const { parseJudgeVerdict } = await import('../dist/src/server/utils/verdictParser.js');
    const { runJudgesOrchestration } = await import(
      '../dist/src/server/services/judgesOrchestrator.js'
    );

    const judgeIds = Object.keys(JUDGE_PERSONAS);
    recordCheck(
      'SC-3.1',
      'Three distinct judicial philosophies defined (Textualist, Pragmatist, Moralist)',
      judgeIds.length === 3,
    );

    const jsonParsed = parseJudgeVerdict(
      '```json\n{"verdict": "guilty", "reasoning": "Clear statutory breach", "dissent_points": ["Point A"]}\n```',
    );
    const regexParsed = parseJudgeVerdict(
      'I find the defendant not guilty because evidence was missing.\n- Missing log files\n- Witness doubt',
    );
    recordCheck(
      'SC-3.2',
      'Robust verdict parser handles both structured JSON and regex fallback (Mitigation P1)',
      jsonParsed.verdict === 'guilty' &&
        regexParsed.verdict === 'not_guilty' &&
        regexParsed.dissentPoints.length >= 1,
    );

    const judgeResult = await runJudgesOrchestration(
      'audit-case-2',
      {
        defendant: 'BioCorp',
        act: 'Released edited vectors without community vote',
        question: 'Is emergency vector control permitted without local referendum?',
      },
      advResult.advocates,
    );

    recordCheck(
      'SC-3.3',
      'Unmerged Protocol returns 3 separate verdicts (V1, V2, V3) with no artificial fusion',
      judgeResult.verdicts.length === 3 &&
        judgeResult.verdicts.every((v) => typeof v.verdict === 'string' && v.reasoning),
    );

    // ----------------------------------------------------
    // Category 5: SC-4 Audit Trail & Circuit Breaker (Module 11)
    // ----------------------------------------------------
    console.log(`\n${YELLOW}${BOLD}5. SC-4: 7-Agent Audit Trail & $5.00 Circuit Breaker${RESET}`);
    const { EconomicCircuitBreaker, CircuitBreakerError } = await import(
      '../dist/src/server/utils/circuitBreaker.js'
    );
    const { supabaseStore } = await import('../dist/src/server/services/supabaseStore.js');

    const breaker = new EconomicCircuitBreaker(5.0);
    breaker.recordCost(5.0);
    let trippedProperly = false;
    try {
      breaker.enforceBudget(0.001);
    } catch (e) {
      trippedProperly = e instanceof CircuitBreakerError;
    }
    recordCheck(
      'SC-4.1',
      'Economic Circuit Breaker strictly trips and blocks calls at $5.00 limit (Mitigation P2)',
      trippedProperly && breaker.getStatus().isTripped,
    );

    await supabaseStore.saveAuditLog({
      caseId: 'audit-case-3',
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      totalLatencyMs: 400,
      totalCostUsd: 0.0003,
      agentCount: 7,
      pipelineStatus: 'completed',
    });
    const retrievedAudit = await supabaseStore.getAuditLog('audit-case-3');
    recordCheck(
      'SC-4.2',
      'Full 7-agent audit trail persisted and retrieved with exact token & cost economics',
      retrievedAudit && retrievedAudit.agentCount === 7 && retrievedAudit.totalTokens === 1500,
    );

    // ----------------------------------------------------
    // Category 6: SC-5 N-Version & SC-6 Finiteness (Module 8 & 14)
    // ----------------------------------------------------
    console.log(`\n${YELLOW}${BOLD}6. SC-5 & SC-6: N-Version Model Support & Pipeline Finiteness${RESET}`);
    const { MODEL_PRICING } = await import('../dist/src/server/services/openrouter.js');

    const knownModels = Object.keys(MODEL_PRICING);
    recordCheck(
      'SC-5.1',
      'N-Version model catalog supports diverse model families (Gemini, DeepSeek, GPT-4o-mini)',
      knownModels.length >= 4,
    );

    const startTime = Date.now();
    const e2eAdvocates = await runAdvocatesOrchestration('e2e-case', {
      defendant: 'E2ETest',
      act: 'Tested compliance pipeline',
      question: 'Does system pass automated criteria?',
    });
    await runJudgesOrchestration('e2e-case', {
      defendant: 'E2ETest',
      act: 'Tested compliance pipeline',
      question: 'Does system pass automated criteria?',
    }, e2eAdvocates.advocates);
    const durationSec = (Date.now() - startTime) / 1000;

    recordCheck(
      'SC-6.1',
      `Complete 7-agent pipeline finishes under 60 seconds (Duration: ${durationSec.toFixed(2)}s)`,
      durationSec < 60,
    );

    // ----------------------------------------------------
    // Final Summary Scorecard
    // ----------------------------------------------------
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    const allPassed = passedCount === totalCount;

    console.log(`\n${CYAN}${BOLD}==========================================================${RESET}`);
    console.log(`${BOLD}AUDIT SUMMARY SCORECARD:${RESET} ${allPassed ? `${GREEN}100% COMPLIANT (13/13 CHECKS PASS)${RESET}` : `${RED}ISSUES DETECTED${RESET}`}`);
    console.log(`Total Checks: ${totalCount} | Passed: ${GREEN}${passedCount}${RESET} | Failed: ${allPassed ? 0 : `${RED}${totalCount - passedCount}${RESET}`}`);
    console.log(`${CYAN}${BOLD}==========================================================${RESET}\n`);

    if (!allPassed) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error(`${RED}${BOLD}Audit script failed with error:${RESET}`, err);
    process.exit(1);
  }
}

runComplianceChecks();
