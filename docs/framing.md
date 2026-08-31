# Problem Framing Document — The Tribunal
# =========================================
# Status: LOCKED — Reverse Interview Complete
# Created: 2026-08-31
# Last Updated: 2026-08-31

## 1. Problem Statement

Single-agent LLM systems suffer from built-in biases, sycophantic
confidence, and an inability to present dialectical complexity on
ethical, legal, and value-laden questions.  A user who submits a
complex dilemma receives a superficial answer that *appears*
authoritative but lacks adversarial critique.

**The Tribunal** solves this by orchestrating a structured multi-agent
pipeline that separates:

1. **Adversarial argumentation** — 4 Advocates (2 Pro, 2 Con) running
   in parallel with distinct personas and system prompts.
2. **Independent adjudication** — 3 Judges producing separate verdicts
   (V₁, V₂, V₃) under an *Unmerged Protocol*: verdicts are displayed
   side-by-side, never artificially fused.

Full cost, latency, and token transparency is maintained throughout.

---

## 2. Stakeholders

| Stakeholder              | Role                          | Key Concern                              |
|---------------------------|-------------------------------|------------------------------------------|
| End User (researcher /    | Submits a Charge Sheet;       | Receive a multi-dimensional, transparent |
|  developer / curious      |  reads verdicts and dissents  |  analysis — not a single biased answer   |
|  individual)              |                               |                                          |
| Course Evaluator          | Assesses project against      | Evidence of Agentic SE methodology:      |
|                           |  Agentic SE methodology       |  atomic commits, context files, gates    |
| Developer (Amit)          | Builds and maintains system   | Clean architecture, testability,         |
|                           |                               |  budget compliance (max 5 USD API cap)   |
| AI Agent (Antigravity)    | Senior dev agent              | Follow AGENTS.md, never bypass gates     |

---

## 3. Definition of Done (DoD)

A release is **done** when ALL of the following hold:

1. **Charge Sheet Validation:** Server-side validation of 3 required
   fields — Defendant, The Act, The Question.
2. **4 Parallel Advocates:** 2 Pro + 2 Con with distinct system prompts
   and personas, running concurrently via OpenRouter.
3. **3 Independent Judges:** Produce 3 separate verdicts with reasoning
   (V₁, V₂, V₃).
4. **Unmerged Protocol:** All 3 verdicts displayed side-by-side in the
   UI — no artificial merging — with dissent points highlighted.
5. **Agent Economics and Audit Trail:** Real-time tracking persisted to
   Supabase: tokens consumed, per-agent latency, total cost in USD.
6. **N-Version Toggle:** A switch allowing single-model or per-agent
   model assignment via OpenRouter.
7. **Quality Gates:** npm run verify passes; zero API keys in code.

---

## 4. Assumptions (Challenged and Confirmed)

| #  | Assumption                                             | Status     |
|----|--------------------------------------------------------|------------|
| A1 | OpenRouter provides a unified API for multiple LLMs    | Confirmed  |
| A2 | Free/cheap models (Gemini Flash, DeepSeek) are         | Confirmed  |
|    | sufficient for adversarial argumentation quality       |            |
| A3 | Parallel API calls stay within 5 USD total budget      | To verify  |
| A4 | 4 advocates + 3 judges is the right ratio for depth    | Confirmed  |
|    | vs. cost                                               |            |
| A5 | Supabase free tier handles expected load                | Confirmed  |
| A6 | Netlify free tier is sufficient for deployment          | Confirmed  |

---

## 5. Constraints

- **Budget:** Max 5 USD total for API calls; use cheapest viable models.
- **Security:** All API keys, prompts, and DB credentials stay in
  backend environment variables only — never exposed to browser.
- **Code Discipline:** AGENTS.md contract; atomic commits with
  why-first messages.
- **Pipeline, Not Chat:** The process is a one-shot structured pipeline
  (Charge Sheet in -> Verdicts out), not a multi-turn conversation.

---

## 6. Out of Scope (Explicit)

1. **Authentication and RBAC** — no user accounts or permissions.
2. **Billing / Payments** — no Stripe or payment processing.
3. **Verdict Merging** — intentionally unmerged; no "winner" algorithm.
4. **Multi-turn Chat** — the pipeline is end-to-end, not conversational.
5. **Local Model Fine-Tuning** — we use models as-is via OpenRouter.
6. **Production DevOps** — beyond Netlify deployment, no CI/CD pipelines.
7. **i18n / Localisation** — English-only UI.
8. **Performance Benchmarking** — beyond basic latency tracking.

---

## 7. Risks and Open Questions

| #  | Risk / Question                                        | Mitigation / Status                |
|----|--------------------------------------------------------|------------------------------------|
| R1 | Judges return free-form text instead of structured     | Enforce JSON schema in system      |
|    | verdicts                                               | prompt; validate server-side       |
| R2 | API costs exceed 5 USD budget                          | Track per-call costs; hard ceiling |
|    |                                                        | with circuit breaker               |
| R3 | High latency from 7 sequential/parallel LLM calls      | Advocates run in parallel; judges  |
|    |                                                        | run in parallel after advocates    |
| R4 | OpenRouter rate limiting or downtime                   | Retry with exponential backoff;    |
|    |                                                        | timeout after 30s per agent        |
| R5 | Model output quality varies across free-tier models     | N-Version toggle lets user pick    |
|    |                                                        | models; default to best free ones  |

---

## 8. Reverse Interview Summary

Interview conducted on 2026-08-31 between the Developer (Amit) and
the AI Agent (Antigravity).  Five questions were asked to challenge
hidden assumptions, sharpen the DoD, identify stakeholders, and lock
the out-of-scope boundary.  All answers are reflected in sections 1-7
above.

### Architecture Overview (4 Layers)

```
Browser (Frontend)  <->  Backend (Node/TS)  <->  OpenRouter APIs
                              |
                        Supabase (DB)
                              |
                     Netlify (Deployment)
```

### Pipeline Flow

```
Charge Sheet -> [4 Advocates ||] -> [3 Judges ||] -> Unmerged Verdicts + Audit
```