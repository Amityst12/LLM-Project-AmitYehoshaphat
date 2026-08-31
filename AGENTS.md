# AGENTS.md — Project Operating Contract
# ========================================
# This file defines the binding rules for every agent (human or AI)
# contributing to this repository.

## 1. Project Identity

- **Project:** LLM-Project-AmitYehoshaphat
- **Language/Runtime:** Node.js ≥ 20 / TypeScript 5.x (strict mode)
- **Package Manager:** npm (lock file committed)
- **Monorepo:** No — single-package repository

---

## 2. Development Commands

| Action              | Command                |
|---------------------|------------------------|
| Install deps        | `npm install`          |
| Build               | `npm run build`        |
| Run (dev)           | `npm run dev`          |
| Lint                | `npm run lint`         |
| Format              | `npm run format`       |
| Unit tests          | `npm test`             |
| Integration tests   | `npm run test:int`     |
| All quality gates   | `npm run verify`       |

> **Rule:** `npm run verify` MUST pass before every commit.
> It runs, in order: lint → build → unit tests → integration tests.

---

## 3. Security — Absolute Rules

1. **NEVER** commit API keys, tokens, passwords, or any secret to this repository.
2. All secrets MUST be loaded from environment variables at runtime.
3. A `.env.example` file MUST exist with placeholder keys and comments.
   Real `.env` files are git-ignored.
4. The pre-commit hook scans staged files for common secret patterns
   (`OPENAI_API_KEY=sk-...`, `ghp_`, `Bearer ...`, etc.) and **blocks**
   the commit if any are detected.
5. Pull requests that introduce secrets — even in test fixtures — MUST be
   rejected.

---

## 4. Testing & Quality Gates

- Every user-facing feature MUST have at least one unit test.
- Integration tests cover external-service interactions using mocks/stubs.
- Minimum code-coverage target: **80 %** (lines).
- Gate checklist before merging:
  - [ ] `npm run verify` passes locally
  - [ ] No new lint warnings
  - [ ] Commit messages follow the convention below
  - [ ] `docs/` updated if behaviour changed

---

## 5. Git Discipline — Atomic Commits

### Commit message format

`<type>(<scope>): <WHY the change was made>`

**Types:** feat | fix | refactor | docs | test | chore | ci

### Rules

1. Each commit is **atomic**: it contains exactly one logical change that
   leaves the project in a buildable, testable state.
2. The message body explains **why**, not what.  The diff already shows *what*.
3. Do NOT bundle unrelated changes (e.g., a bug fix + a new feature).
4. Reference relevant issue numbers when available.

### Examples

`
feat(chat): support streaming responses to reduce perceived latency
fix(auth): validate token expiry to prevent silent 401 loops
docs(framing): add stakeholder map after reverse-interview session
`

---

## 6. File & Folder Conventions

`
/
├── src/              # Application source (TypeScript)
├── tests/            # Unit & integration tests
│   ├── unit/
│   └── integration/
├── docs/             # Project documentation & framing
├── scripts/          # Helper scripts (pre-commit, CI)
├── .env.example      # Secret placeholder template
├── AGENTS.md         # THIS FILE — project contract
└── tsconfig.json     # TypeScript configuration
`

---

## 7. Definition of Done (DoD) — Default

A task is "done" when **all** of the following are true:

1. Code compiles with zero errors (`npm run build`).
2. Lint passes with zero warnings (`npm run lint`).
3. All existing tests pass; new tests cover the change.
4. `docs/` updated if external behaviour changed.
5. Atomic commit pushed with a *why*-first message.
6. Peer review approved (when working in a team).

---

## 8. Out-of-Scope Defaults

Unless explicitly negotiated, the following are **out of scope**:

- Production deployment & DevOps pipelines
- UI/UX design and front-end implementation
- Performance benchmarking and optimisation
- Internationalisation (i18n) and localisation

---

## 9. Agent Behaviour (AI-Specific)

- Always read this file before starting work on a task.
- When uncertain, **ask** — do not assume.
- Prefer small, verifiable steps over large speculative changes.
- Log reasoning in commit messages and PR descriptions.
- Never bypass quality gates, even "just to test something quickly".
