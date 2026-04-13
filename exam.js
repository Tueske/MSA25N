/* ============================================
   MSA 2025 Nachschreibtermin – Shared Exam Logic
   Full input persistence + scoring
   ============================================ */

const ExamState = {

  load() {
    const raw = localStorage.getItem('msa2025n_state');
    if (raw) {
      try { return JSON.parse(raw); }
      catch(e) { return this.fresh(); }
    }
    return this.fresh();
  },

  fresh() {
    return {
      studentName:  '',
      studentClass: '',
      scores:    {},   // { "1a": { earned: 1, max: 1, attempts: 0 } }
      inputs:    {},   // { "ans-1a": "20", "ans-1b": "130" }
      completed: {}    // { "task1": true }
    };
  },

  save(state) {
    localStorage.setItem('msa2025n_state', JSON.stringify(state));
  },

  totalEarned(state) {
    return Object.values(state.scores)
      .reduce((sum, s) => sum + (s.earned || 0), 0);
  },

  totalMax() {
    return 60; // MSA total
  },

  totalMaxEBBR() {
    return 40; // eBBR total
  }
};

/* ── Answer Checking Helpers ── */

function numericCheck(userAnswer, correct, tolerance = 0.05) {
  const cleaned = String(userAnswer)
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  const userNum = parseFloat(cleaned);
  if (isNaN(userNum)) return false;
  return Math.abs(userNum - correct) <= tolerance;
}

function stringCheck(userAnswer, correctList) {
  const clean = str =>
    str.trim().toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe')
      .replace(/ü/g,'ue').replace(/ß/g,'ss');
  const u = clean(userAnswer);
  if (u.length === 0) return false;
  return correctList.some(c => {
    const cc = clean(c);
    return u === cc || u.includes(cc) || cc.includes(u);
  });
}

function fractionCheck(userAnswer, numerator, denominator) {
  const cleaned = userAnswer.replace(/\s/g, '');
  const fracMatch = cleaned.match(/^(-?\d+)\/(\d+)$/);
  if (fracMatch) {
    const n = parseInt(fracMatch[1]);
    const d = parseInt(fracMatch[2]);
    return (n * denominator) === (d * numerator);
  }
  const decimal = parseFloat(cleaned.replace(',', '.'));
  if (!isNaN(decimal)) {
    return Math.abs(decimal - numerator / denominator) < 0.01;
  }
  return false;
}

function parseNum(str) {
  if (!str) return NaN;
  return parseFloat(
    String(str).trim().replace(',', '.').replace(/[^0-9.\-]/g, '')
  );
}

/* ── UI Helpers ── */

function showFeedback(subId, isCorrect, hintText = '') {
  const box = document.getElementById(`feedback-${subId}`);
  if (!box) return;
  box.className = `feedback-box show ${isCorrect ? 'correct' : 'incorrect'}`;
  if (isCorrect) {
    box.innerHTML = `<span class="feedback-icon">✅</span>
      <strong>Richtig!</strong>`;
  } else {
    box.innerHTML = `<span class="feedback-icon">❌</span>
      <strong>Leider falsch.</strong>
      ${hintText
        ? `<div class="hint-text">💡 Hinweis: ${hintText}</div>`
        : ''}`;
  }
}

function applyInputStyle(id, isCorrect) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('correct', 'incorrect');
  el.classList.add(isCorrect ? 'correct' : 'incorrect');
}

function clearInputStyle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('correct', 'incorrect');
}

/* ── Points recording ── */

function recordScore(subId, maxPoints, isCorrect, state) {
  if (!state.scores[subId]) {
    state.scores[subId] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[subId];
  if (entry.attempts === 0 && isCorrect) {
    entry.earned = maxPoints;
  }
  entry.attempts += 1;
  return state;
}

function recordPartialScore(subId, earned, maxPoints, state) {
  if (!state.scores[subId]) {
    state.scores[subId] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[subId];
  if (entry.attempts === 0) {
    entry.earned = earned;
  }
  entry.attempts += 1;
  return state;
}

/* ── Score display ── */

function updateScoreDisplay() {
  const state  = ExamState.load();
  const earned = ExamState.totalEarned(state);
  document.querySelectorAll('.score-display').forEach(d => {
    d.textContent = `Punkte: ${earned} / 60`;
  });
}

/* ── Scored notice ── */

function updateNotice(subId) {
  const state = ExamState.load();
  const el = document.getElementById(`notice-${subId}`);
  if (!el) return;
  const s = state.scores[subId];
  if (!s || s.attempts === 0) { el.textContent = ''; return; }
  if (s.earned > 0) {
    el.className = 'scored-notice earned';
    el.textContent =
      `✓ ${s.earned}/${s.max} Punkt(e) bereits vergeben`;
  } else {
    el.className = 'scored-notice not-earned';
    el.textContent =
      `0/${s.max} Punkt(e) – weiteres Üben möglich`;
  }
}

/* ── Input Persistence ── */

// Save a single input's value to state
function saveInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const state = ExamState.load();
  if (el.type === 'checkbox' || el.type === 'radio') {
    state.inputs[inputId] = el.checked;
  } else {
    state.inputs[inputId] = el.value;
  }
  ExamState.save(state);
}

// Restore all saved inputs on a page
function restoreInputs() {
  const state = ExamState.load();
  if (!state.inputs) return;
  Object.keys(state.inputs).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = state.inputs[id];
    } else {
      el.value = state.inputs[id];
    }
  });
}

// Auto-bind all inputs/textareas/selects on page to persist on change
function bindInputPersistence() {
  const inputs = document.querySelectorAll(
    'input[id], textarea[id], select[id]'
  );
  inputs.forEach(el => {
    const events = ['input', 'change'];
    events.forEach(evt => {
      el.addEventListener(evt, () => saveInput(el.id));
    });
  });
}

// Save custom state (for buttons, MC selections, etc.)
function saveCustom(key, value) {
  const state = ExamState.load();
  if (!state.inputs) state.inputs = {};
  state.inputs[key] = value;
  ExamState.save(state);
}

function loadCustom(key) {
  const state = ExamState.load();
  return state.inputs ? state.inputs[key] : undefined;
}

/* ── Navigation ── */

function navigateTo(url) {
  window.location.href = url;
}

function markTaskCompleted(taskId) {
  const state = ExamState.load();
  state.completed[taskId] = true;
  ExamState.save(state);
}

function updateTaskCards() {
  const state = ExamState.load();
  for (let i = 1; i <= 7; i++) {
    const card = document.querySelector(`a[href="aufgabe${i}.html"]`);
    if (card && state.completed[`task${i}`]) {
      card.classList.add('completed');
      const numEl = card.querySelector('.task-number');
      if (numEl) numEl.textContent = '✓';
    }
  }
}

/* ── Page Init ── */

document.addEventListener('DOMContentLoaded', () => {
  restoreInputs();
  bindInputPersistence();
  updateScoreDisplay();
  if (document.querySelector('.task-grid')) {
    updateTaskCards();
  }
});