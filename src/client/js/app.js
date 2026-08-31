/**
 * The Tribunal — Client-Side Application
 * Multi-Agent Adversarial Deliberation & Unmerged Protocol UI
 */

const SAMPLE_CASES = [
  {
    defendant: 'ApexHealth AI Diagnostics',
    act: 'Silently deprioritized low-income zip codes in emergency organ transplant triage algorithms to optimize hospital survival-rate metrics',
    question: 'Does systemic algorithmic triage optimization that produces disparate racial and economic mortality violate non-derogable medical ethics?',
  },
  {
    defendant: 'NeuroLink Cognitive Systems',
    act: 'Inserted commercial targeted subconscious advertisements into consumer neural interface dream-state memory consolidation cycles',
    question: 'Does unconsented commercial manipulation of subconscious neurological states constitute actionable battery and cognitive liberty violation?',
  },
  {
    defendant: 'Automated Defense Systems Corp',
    act: 'Deployed lethal autonomous border sentry drones programmed to engage armed intruders without human-in-the-loop authorization',
    question: 'Is delegating irrevocable lethal force decisions to autonomous neural network models inherently unlawful under international humanitarian law?',
  },
];

const DEFAULT_MODELS = [
  { id: 'google/gemini-2.0-flash-001', name: 'Google Gemini 2.0 Flash (Fast & Economical)' },
  { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Google Gemini 2.0 Flash Lite (Free Tier)' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (Cost Effective)' },
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini (High Quality)' },
];

let availableModels = DEFAULT_MODELS;

// DOM Elements
const form = document.getElementById('charge-sheet-form');
const btnSubmit = document.getElementById('btn-submit');
const btnSpinner = document.getElementById('submit-spinner');
const btnLoadSample = document.getElementById('btn-load-sample');

const defendantInput = document.getElementById('defendant-input');
const actInput = document.getElementById('act-input');
const questionInput = document.getElementById('question-input');

const defendantCharCount = document.getElementById('defendant-char-count');
const actCharCount = document.getElementById('act-char-count');
const questionCharCount = document.getElementById('question-char-count');

const defendantError = document.getElementById('defendant-error');
const actError = document.getElementById('act-error');
const questionError = document.getElementById('question-error');

const nversionToggle = document.getElementById('nversion-toggle');
const uniformContainer = document.getElementById('uniform-model-container');
const nversionContainer = document.getElementById('nversion-models-container');
const uniformSelect = document.getElementById('uniform-model-select');

// Stepper Elements
const stepCase = document.getElementById('step-case');
const stepAdvocates = document.getElementById('step-advocates');
const stepJudges = document.getElementById('step-judges');
const stepVerdicts = document.getElementById('step-verdicts');
const line1 = document.getElementById('line-1');
const line2 = document.getElementById('line-2');
const line3 = document.getElementById('line-3');

// Results & Dashboard Elements
const verdictsGrid = document.getElementById('verdicts-grid');
const advocatesGrid = document.getElementById('advocates-grid');
const budgetProgressFill = document.getElementById('budget-progress-fill');
const spentText = document.getElementById('spent-text');
const headerBudgetValue = document.getElementById('header-budget-value');
const headerCircuitStatus = document.getElementById('header-circuit-status');
const pipelineStatusBadge = document.getElementById('pipeline-status-badge');

const metricCost = document.getElementById('metric-cost');
const metricTokens = document.getElementById('metric-tokens');
const metricLatency = document.getElementById('metric-latency');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupCharCounters();
  setupSampleLoader();
  setupNVersionToggle();
  fetchModels();
  fetchBudget();
});

function setupCharCounters() {
  const update = (input, counter) => {
    const len = input.value.length;
    counter.textContent = `${len} / 500`;
    if (len >= 480) {
      counter.style.color = '#f87171';
    } else {
      counter.style.color = '#9ca3af';
    }
  };

  defendantInput.addEventListener('input', () => update(defendantInput, defendantCharCount));
  actInput.addEventListener('input', () => update(actInput, actCharCount));
  questionInput.addEventListener('input', () => update(questionInput, questionCharCount));
}

function setupSampleLoader() {
  btnLoadSample.addEventListener('click', () => {
    const randomCase = SAMPLE_CASES[Math.floor(Math.random() * SAMPLE_CASES.length)];
    defendantInput.value = randomCase.defendant;
    actInput.value = randomCase.act;
    questionInput.value = randomCase.question;

    defendantCharCount.textContent = `${defendantInput.value.length} / 500`;
    actCharCount.textContent = `${actInput.value.length} / 500`;
    questionCharCount.textContent = `${questionInput.value.length} / 500`;

    clearErrors();
  });
}

function setupNVersionToggle() {
  nversionToggle.addEventListener('change', () => {
    if (nversionToggle.checked) {
      uniformContainer.classList.add('hidden');
      nversionContainer.classList.remove('hidden');
    } else {
      uniformContainer.classList.remove('hidden');
      nversionContainer.classList.add('hidden');
    }
  });
}

async function fetchModels() {
  try {
    const res = await fetch('/api/models');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        availableModels = data.data;
        populateModelDropdowns();
      }
      if (data.simulationMode) {
        const badge = document.getElementById('demo-mode-badge');
        if (badge) badge.classList.remove('hidden');
      }
    }
  } catch {
    populateModelDropdowns();
  }
}

function populateModelDropdowns() {
  const agentSelects = [
    'model-pro_1',
    'model-pro_2',
    'model-con_1',
    'model-con_2',
    'model-judge_1',
    'model-judge_2',
    'model-judge_3',
  ];

  agentSelects.forEach((selectId, index) => {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = '';
    availableModels.forEach((m, mIndex) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      // Stagger default selections for diverse N-version simulation
      if (mIndex === index % availableModels.length) {
        opt.selected = true;
      }
      el.appendChild(opt);
    });
  });
}

async function fetchBudget() {
  try {
    const res = await fetch('/api/budget');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        updateBudgetUI(data.data);
      }
    }
  } catch {
    // Graceful fallback
  }
}

function updateBudgetUI(budget) {
  const spent = Number(budget.totalSpentUsd || 0);
  const max = Number(budget.maxBudgetUsd || 5.0);
  const percent = Math.min(100, (spent / max) * 100);

  spentText.textContent = `$${spent.toFixed(4)}`;
  headerBudgetValue.textContent = `$${spent.toFixed(4)} / $${max.toFixed(2)}`;
  budgetProgressFill.style.width = `${percent}%`;

  if (budget.isTripped) {
    headerCircuitStatus.className = 'status-indicator status-tripped';
    headerCircuitStatus.title = 'Circuit Breaker TRIPPED: $5.00 limit reached';
    budgetProgressFill.style.background = '#ef4444';
  } else {
    headerCircuitStatus.className = 'status-indicator status-active';
    headerCircuitStatus.title = 'Circuit Breaker Normal';
  }
}

function clearErrors() {
  defendantError.textContent = '';
  actError.textContent = '';
  questionError.textContent = '';
}

function setStepper(step) {
  const steps = [stepCase, stepAdvocates, stepJudges, stepVerdicts];
  const lines = [line1, line2, line3];

  steps.forEach((s, idx) => {
    s.classList.remove('active', 'complete');
    if (idx < step - 1) {
      s.classList.add('complete');
    } else if (idx === step - 1) {
      s.classList.add('active');
    }
  });

  lines.forEach((l, idx) => {
    if (idx < step - 1) {
      l.style.background = '#10b981';
    } else {
      l.style.background = '#374151';
    }
  });
}

// Form Submission & Multi-Agent Deliberation Pipeline
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const defendant = defendantInput.value.trim();
  const act = actInput.value.trim();
  const question = questionInput.value.trim();

  // Client-side validation
  let hasError = false;
  if (!defendant) {
    defendantError.textContent = 'Defendant is required';
    hasError = true;
  }
  if (!act) {
    actError.textContent = 'Act description is required';
    hasError = true;
  }
  if (!question) {
    questionError.textContent = 'Legal / Ethical question is required';
    hasError = true;
  }

  if (hasError) return;

  // Build model configuration
  let payload = {
    chargeSheet: { defendant, act, question },
  };

  if (nversionToggle.checked) {
    payload.modelMap = {
      pro_1: document.getElementById('model-pro_1').value,
      pro_2: document.getElementById('model-pro_2').value,
      con_1: document.getElementById('model-con_1').value,
      con_2: document.getElementById('model-con_2').value,
      judge_1: document.getElementById('model-judge_1').value,
      judge_2: document.getElementById('model-judge_2').value,
      judge_3: document.getElementById('model-judge_3').value,
    };
  } else {
    payload.defaultModel = uniformSelect.value;
  }

  // UI state: Start
  btnSubmit.disabled = true;
  btnSpinner.classList.remove('hidden');
  pipelineStatusBadge.textContent = 'Orchestrating...';
  pipelineStatusBadge.className = 'badge badge-info';
  setStepper(2); // Advocates phase

  verdictsGrid.innerHTML = `
    <div class="empty-state">
      <div class="btn-spinner" style="margin: 0 auto 12px; border-color: rgba(59, 130, 246, 0.3); border-top-color: #3b82f6;"></div>
      Phase 1: 4 Parallel Advocates are formulating adversarial arguments...<br>
      Phase 2: 3 Independent Judges will deliberate without consensus merging.
    </div>
  `;
  advocatesGrid.innerHTML = '';

  try {
    // 1. Create Case
    const caseRes = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defendant, act, question }),
    });

    if (!caseRes.ok) {
      const err = await caseRes.json();
      throw new Error(err.errors?.[0]?.message || 'Failed to submit charge sheet');
    }

    const caseData = await caseRes.json();
    const caseId = caseData.data.id;

    setStepper(3); // Judges phase

    // 2. Run Deliberation Pipeline (Auto-runs advocates then judges)
    const delibRes = await fetch(`/api/cases/${caseId}/deliberate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (delibRes.status === 429) {
      const errData = await delibRes.json();
      throw new Error(`Circuit Breaker Tripped: ${errData.error}`);
    }

    if (!delibRes.ok) {
      const errData = await delibRes.json();
      throw new Error(errData.error || 'Deliberation failed');
    }

    const delibData = await delibRes.json();

    // 3. Fetch Full Case with Advocates for complete rendering
    const fullCaseRes = await fetch(`/api/cases/${caseId}`);
    const fullCaseData = await fullCaseRes.json();

    setStepper(4); // Complete

    // Render Unmerged Verdicts & Advocates
    renderVerdicts(delibData.data.verdicts);
    renderAdvocates(fullCaseData.data.advocates || []);
    renderEconomics(delibData.audit || delibData.data);

    pipelineStatusBadge.textContent = 'Deliberated';
    pipelineStatusBadge.className = 'badge badge-info';
    await fetchBudget();
  } catch (err) {
    pipelineStatusBadge.textContent = 'Failed';
    pipelineStatusBadge.className = 'badge badge-outline';
    verdictsGrid.innerHTML = `
      <div class="empty-state" style="border-color: #ef4444; color: #f87171;">
        <strong>Pipeline Error:</strong> ${escapeHtml(err.message)}
      </div>
    `;
  } finally {
    btnSubmit.disabled = false;
    btnSpinner.classList.add('hidden');
  }
});

function renderVerdicts(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) {
    verdictsGrid.innerHTML = '<div class="empty-state">No verdicts returned.</div>';
    return;
  }

  verdictsGrid.innerHTML = '';

  verdicts.forEach((v) => {
    const card = document.createElement('div');
    const verdictClass = v.verdict.toLowerCase().replace(/[-\s]+/g, '_');
    card.className = `verdict-card ${verdictClass}`;

    const dissentsHtml =
      Array.isArray(v.dissentPoints) && v.dissentPoints.length > 0
        ? `
        <div class="dissent-box">
          <div class="dissent-title">Dissent & Tension Points</div>
          <ul class="dissent-list">
            ${v.dissentPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>
        </div>
      `
        : '';

    card.innerHTML = `
      <div class="judge-header">
        <div>
          <div class="judge-title">${escapeHtml(v.judgeId.toUpperCase())}</div>
          <div class="judge-persona">${escapeHtml(v.personaName)}</div>
        </div>
        <span class="verdict-badge badge-${verdictClass}">
          ${v.verdict.replace(/_/g, ' ')}
        </span>
      </div>
      <div class="verdict-reasoning">${escapeHtml(v.reasoning)}</div>
      ${dissentsHtml}
      <div class="verdict-meta">
        <span>Model: ${escapeHtml(v.model.split('/')[1] || v.model)}</span>
        <span>${v.latencyMs}ms | ${v.tokens?.totalTokens || 0} tokens | $${Number(v.costUsd || 0).toFixed(6)}</span>
      </div>
    `;

    verdictsGrid.appendChild(card);
  });
}

function renderAdvocates(advocates) {
  if (!Array.isArray(advocates) || advocates.length === 0) {
    advocatesGrid.innerHTML = '';
    return;
  }

  advocatesGrid.innerHTML = '';

  advocates.forEach((adv) => {
    const card = document.createElement('div');
    card.className = `advocate-card ${adv.position}`;

    card.innerHTML = `
      <div class="advocate-header">
        <span class="advocate-name">${escapeHtml(adv.role.toUpperCase())}: ${escapeHtml(adv.personaName)}</span>
        <span class="advocate-position pos-${adv.position}">${adv.position.toUpperCase()}</span>
      </div>
      <div class="advocate-argument">${escapeHtml(adv.argument || '[No argument generated]')}</div>
      <div class="advocate-meta">
        <span>${escapeHtml(adv.model.split('/')[1] || adv.model)}</span>
        <span>${adv.latencyMs}ms | ${adv.tokens?.totalTokens || 0} tokens | $${Number(adv.costUsd || 0).toFixed(6)}</span>
      </div>
    `;

    advocatesGrid.appendChild(card);
  });
}

function renderEconomics(audit) {
  if (!audit) return;
  metricCost.textContent = `$${Number(audit.totalCostUsd || 0).toFixed(6)}`;
  metricTokens.textContent = (audit.totalTokens || 0).toLocaleString();
  metricLatency.textContent = `${audit.totalLatencyMs || 0} ms`;
}

function escapeHtml(unsafe) {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
