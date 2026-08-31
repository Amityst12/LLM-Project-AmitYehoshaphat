# Technical Specification — The Tribunal
# ========================================
# Status: LOCKED
# Created: 2026-08-31
# Methodology: Agentic Software Engineering (5-Part Spec)

---

## Part 1: Goal and Reason

### Goal
Build a full-stack multi-agent deliberation system ("The Tribunal")
that accepts a structured Charge Sheet, orchestrates 4 adversarial
Advocates and 3 independent Judges via OpenRouter, and presents
unmerged verdicts with full cost/latency transparency.

### Reason (Why)
Single-agent LLM responses to complex ethical/legal questions are
inherently biased and sycophantic.  By separating argumentation from
adjudication — and refusing to merge verdicts — we force genuine
dialectical tension and expose disagreement rather than hiding it
behind a false consensus.

### Deliverable
A deployed full-stack web application (Node.js/TypeScript backend,
browser frontend, Supabase database, Netlify hosting) that implements
the complete Tribunal pipeline.

---

## Part 2: Testable Success Criteria

Each criterion is designed to satisfy Knuth's 5 properties of a
well-defined algorithm: **Finiteness, Definiteness, Input, Output,
and Effectiveness.**

### SC-1: Charge Sheet Validation (Input + Definiteness)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Input        | JSON object with 3 string fields: defendant, act,      |
|              | question                                               |
| Rule         | All 3 fields must be non-empty strings (trimmed),       |
|              | max 500 chars each                                     |
| Output       | On valid: 201 Created with case ID                     |
|              | On invalid: 400 Bad Request with field-level errors    |
| Test         | Submit empty/missing fields -> expect 400              |
|              | Submit valid fields -> expect 201 + UUID               |

### SC-2: Advocate Orchestration (Effectiveness + Finiteness)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Input        | Validated Charge Sheet (case ID)                       |
| Process      | 4 parallel OpenRouter calls: 2 Pro advocates,          |
|              | 2 Con advocates, each with unique system prompt        |
| Output       | 4 Advocate Response objects, each containing:          |
|              | role, position (pro/con), argument text, model used,   |
|              | tokens (prompt + completion), latency_ms, cost_usd     |
| Timeout      | 30 seconds per advocate; on timeout -> error object    |
| Finiteness   | Pipeline proceeds after all 4 resolve or timeout       |
| Test         | Mock OpenRouter -> expect 4 responses with all fields  |
|              | Simulate timeout -> expect error + pipeline continues  |

### SC-3: Judge Deliberation (Effectiveness + Output)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Input        | 4 Advocate responses + original Charge Sheet           |
| Process      | 3 parallel OpenRouter calls, each Judge receives ALL   |
|              | 4 advocate arguments                                  |
| Output       | 3 Verdict objects, each containing:                    |
|              | judge_id, verdict (guilty/not_guilty/undecided),       |
|              | reasoning text, dissent_points (array of strings),     |
|              | model used, tokens, latency_ms, cost_usd              |
| Constraint   | Verdicts are NEVER merged — stored and displayed       |
|              | individually                                           |
| Test         | Mock advocates -> expect 3 structured verdicts         |
|              | Verify JSON schema compliance of each verdict          |

### SC-4: Audit Trail and Agent Economics (Output + Definiteness)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Tracked      | For every agent call: model_name, tokens_prompt,       |
|              | tokens_completion, latency_ms, cost_usd               |
| Aggregation  | Total pipeline: total_tokens, total_latency_ms,        |
|              | total_cost_usd                                         |
| Storage      | All metrics persisted to Supabase audit_log table      |
| Display      | Frontend shows per-agent and total metrics              |
| Budget Guard | If cumulative cost exceeds 5 USD -> circuit breaker    |
|              | blocks further API calls                               |
| Test         | Run pipeline -> verify all metrics are non-null        |
|              | Simulate cost > 5 USD -> expect circuit breaker error  |

### SC-5: N-Version Model Toggle (Definiteness)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Default      | All 7 agents use the same model (configurable)         |
| Toggle       | UI switch enables per-agent model assignment            |
| Validation   | Selected models must exist in OpenRouter catalog        |
| Test         | Toggle on -> each agent config shows model selector    |
|              | Toggle off -> all agents show single model             |

### SC-6: End-to-End Pipeline (Finiteness)
| Property     | Specification                                          |
|--------------|--------------------------------------------------------|
| Input        | Charge Sheet via web form                              |
| Process      | Validate -> 4 Advocates (parallel) -> 3 Judges        |
|              | (parallel) -> Persist to DB -> Return results          |
| Output       | Complete Tribunal result with verdicts + audit data     |
| Latency      | Total pipeline < 60 seconds under normal conditions     |
| Test         | Integration test: submit charge sheet -> receive       |
|              | complete result with 3 verdicts and audit trail        |

---

## Part 3: Architectural Guidance and Boundaries

### 4-Layer Architecture

```
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|  Browser (FE)    |<--->|  Backend (API)    |<--->|  OpenRouter      |
|  - Charge form   |     |  - Express/TS     |     |  - LLM APIs     |
|  - Verdict view  |     |  - Pipeline mgr   |     |  - Multi-model  |
|  - Metrics dash  |     |  - Prompt engine   |     |                  |
|                  |     |  - Cost tracker   |     |                  |
+------------------+     +--------+----------+     +------------------+
                                  |
                         +--------v----------+
                         |                   |
                         |  Supabase (DB)    |
                         |  - cases          |
                         |  - advocates      |
                         |  - verdicts       |
                         |  - audit_log      |
                         |                   |
                         +-------------------+
                                  |
                         +--------v----------+
                         |  Netlify (Deploy) |
                         +-------------------+
```

### Multi-Agent Pipeline Flow

```
                    +---> Advocate-Pro-1  ---+
                    |                        |
Charge Sheet -------+---> Advocate-Pro-2  ---+---> [Collect 4] ---+
  (validated)       |                        |                    |
                    +---> Advocate-Con-1 ---+                    |
                    |                        |                    |
                    +---> Advocate-Con-2 ---+                    |
                                                                  |
                    +---> Judge-1 -----------+                    |
                    |                        |                    |
  4 Arguments ------+---> Judge-2 -----------+---> [3 Verdicts]  |
   (from above)     |                        |    (unmerged)      |
                    +---> Judge-3 -----------+                    |
                                                                  |
                                              Audit Trail --------+
                                              (persisted to DB)
```

### Key Boundaries

1. **Frontend NEVER calls OpenRouter directly.** All LLM calls go
   through the backend.
2. **No secret leaks:** API keys, system prompts, and DB credentials
   exist only in server-side environment variables.
3. **Verdicts are never merged.** The Unmerged Protocol is a core
   architectural constraint, not a limitation.
4. **Pipeline is one-shot.** No conversational state between runs.
5. **Budget ceiling is enforced server-side** with a circuit breaker.

### Technology Stack

| Layer      | Technology                    | Notes                      |
|------------|-------------------------------|----------------------------|
| Frontend   | HTML/CSS/JS or React (TBD)    | Served via Netlify          |
| Backend    | Node.js + Express + TypeScript| API server                  |
| LLM Gateway| OpenRouter API                | Unified multi-model access  |
| Database   | Supabase (PostgreSQL)         | Free tier                   |
| Deployment | Netlify                       | Frontend + serverless fns   |
| Testing    | Jest / Vitest                 | Unit + integration          |
| Linting    | ESLint + Prettier             | Enforced via pre-commit     |

---

## Part 4: Validation Approach

### 4.1 Unit Tests

| Component             | What is tested                              |
|-----------------------|---------------------------------------------|
| Charge Sheet Validator| Empty fields, oversized fields, valid input |
| Prompt Builder        | System prompts contain role/persona tokens  |
| Cost Calculator       | Token-to-USD conversion accuracy            |
| Response Parser       | Structured verdict extraction from raw LLM  |
| Circuit Breaker       | Triggers at threshold; resets correctly      |

### 4.2 Integration Tests (Mocked OpenRouter)

| Scenario                  | Expected Outcome                         |
|---------------------------|------------------------------------------|
| Happy path pipeline       | 4 advocate + 3 judge responses, audit OK |
| Single advocate timeout   | 3 valid + 1 error; pipeline continues    |
| Judge returns invalid JSON| Fallback parsing; error logged in audit  |
| Budget exceeded mid-run   | Circuit breaker fires; partial result    |
| OpenRouter 429 (rate limit)| Exponential backoff; retry up to 3x     |
| OpenRouter 500            | Error captured; audit trail records it   |

### 4.3 Manual / Smoke Tests

| Test                        | Method                                  |
|-----------------------------|-----------------------------------------|
| Full pipeline via UI        | Submit charge sheet; verify 3 verdicts  |
| Metrics dashboard accuracy  | Compare UI numbers to Supabase records  |
| N-Version toggle            | Switch models; verify different outputs |
| No secrets in frontend      | Browser DevTools: search for "sk-", keys|

### 4.4 Quality Gates (Automated)

```bash
npm run verify
# Runs: lint -> build -> unit tests -> integration tests
# Must pass before every commit (enforced by pre-commit hook)
```

---

## Part 5: Known Pitfalls and Mitigations

### P1: Free-Form Judge Output
**Risk:** Judges ignore the requested JSON structure and return
narrative text, breaking the verdict parser.
**Mitigation:**
- System prompt explicitly demands JSON with a schema example.
- Server-side validation with fallback: if JSON parsing fails,
  extract verdict keyword via regex and log a warning.
- Integration test covers this scenario.

### P2: Budget Overrun
**Risk:** 7 LLM calls per pipeline run could exceed the 5 USD
lifetime budget, especially with expensive models.
**Mitigation:**
- Default to cheapest viable models (Gemini Flash, DeepSeek).
- Server-side circuit breaker tracks cumulative cost in Supabase.
- Before each API call, check remaining budget; block if insufficient.
- Audit trail makes every cent visible.

### P3: High Latency
**Risk:** 7 LLM calls in sequence would create unacceptable wait
times (potentially > 2 minutes).
**Mitigation:**
- Advocates run in parallel (Promise.all with timeout).
- Judges run in parallel after all advocates complete.
- Maximum 2 sequential stages, not 7.
- Per-agent timeout of 30 seconds with graceful degradation.

### P4: OpenRouter API Instability
**Risk:** Rate limiting (429), server errors (500), or network
timeouts disrupt the pipeline.
**Mitigation:**
- Exponential backoff retry (max 3 attempts per agent).
- 30-second timeout per agent call.
- Partial results are still saved and displayed.
- Audit trail records every failure for debugging.

### P5: Prompt Injection via Charge Sheet
**Risk:** A malicious user crafts a Charge Sheet that manipulates
advocate or judge system prompts.
**Mitigation:**
- User input is always placed in a clearly delimited user-message
  block, separate from system prompts.
- Input length capped at 500 chars per field.
- System prompts are server-side only, never visible to the client.

### P6: Supabase Free-Tier Limits
**Risk:** Database storage or connection limits exceeded.
**Mitigation:**
- Each pipeline run produces ~7 rows (4 advocates + 3 judges) plus
  1 case row and 1 audit summary — minimal footprint.
- Old cases can be archived/deleted via admin script if needed.

---

## Appendix: File Structure (Target)

```
/
├── src/
│   ├── server/              # Express API server
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Pipeline orchestrator, LLM gateway
│   │   ├── prompts/         # System prompt templates
│   │   ├── validators/      # Charge sheet validation
│   │   └── utils/           # Cost calculator, circuit breaker
│   └── client/              # Frontend assets
│       ├── index.html
│       ├── styles/
│       └── scripts/
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── framing.md           # Problem framing (this project)
│   └── spec.md              # THIS FILE — technical specification
├── scripts/
│   └── check-secrets.sh     # Pre-commit secret scanner
├── .env.example
├── AGENTS.md
├── package.json
└── tsconfig.json
```