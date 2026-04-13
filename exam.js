/* ============================================
   MSA 2025 Nachschreibtermin – Shared Exam Logic
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
      scores:    {},
      inputs:    {},
      completed: {}
    };
  },

  save(state) {
    localStorage.setItem('msa2025n_state', JSON.stringify(state));
  },

  totalEarned(state) {
    return Object.values(state.scores)
      .reduce((sum, s) => sum + (s.earned || 0), 0);
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

/* ── Input style helpers ── */

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

/* ── Feedback box ── */

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

/* ══════════════════════════════════════════
   SCORING
   Rules:
   - Points awarded ONLY on the first attempt.
   - Attempts and earned points are persisted
     in localStorage.
   - From attempt 2 onwards: feedback only,
     no points change.
   ══════════════════════════════════════════ */

function recordScore(subId, maxPoints, isCorrect, state) {
  if (!state.scores[subId]) {
    state.scores[subId] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[subId];
  /* Only award on first attempt */
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

/*
  recordStepScore – for individual guided steps.
  Each step has its own key (e.g. "2a-step1").
  Returns whether this is the first attempt.
*/
function recordStepScore(stepKey, maxPoints, isCorrect, state) {
  const key = `step_${stepKey}`;
  if (!state.scores[key]) {
    state.scores[key] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[key];
  if (entry.attempts === 0 && isCorrect) {
    entry.earned = maxPoints;
  }
  entry.attempts += 1;
  return state;
}

function isFirstAttempt(subId, state) {
  return !state.scores[subId] || state.scores[subId].attempts === 0;
}

function isFirstStepAttempt(stepKey, state) {
  const key = `step_${stepKey}`;
  return !state.scores[key] || state.scores[key].attempts === 0;
}

/* ── Score display ── */

function updateScoreDisplay() {
  const state  = ExamState.load();
  const earned = ExamState.totalEarned(state);
  document.querySelectorAll('.score-display').forEach(d => {
    d.textContent = `Punkte: ${earned} / 60`;
  });
}

/* ── scored-notice ── */

function updateNotice(subId) {
  const state = ExamState.load();
  const el = document.getElementById(`notice-${subId}`);
  if (!el) return;
  const s = state.scores[subId];
  if (!s || s.attempts === 0) { el.textContent = ''; return; }
  if (s.earned > 0) {
    el.className = 'scored-notice earned';
    el.textContent = `✓ ${s.earned}/${s.max} Punkt(e) vergeben`;
  } else {
    el.className = 'scored-notice not-earned';
    el.textContent = `0/${s.max} Punkt(e) – weiteres Üben möglich`;
  }
}

/* ══════════════════════════════════════════
   MC FEEDBACK RULE
   Wrong answer: only the chosen option turns red.
   The correct answer is NOT revealed (no green).
   Correct answer: chosen option turns green.
   From attempt 2 onwards: same visual rule,
   but the scored-notice already shows 0 pts.
   ══════════════════════════════════════════ */

/*
  markMCResult(container, chosenVal, correctVal, isCorrect)
  - If correct: chosen option → green
  - If wrong:   chosen option → red only
                correct option stays neutral
*/
function markMCResult(container, chosenVal, correctVal, isCorrect) {
  if (!container) return;
  container.querySelectorAll('.mc-option, .step-mc-option').forEach(o => {
    o.classList.remove('correct', 'incorrect');
    /* Only colour the chosen option */
    if (o.dataset.val === chosenVal) {
      o.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
  });
}

/* ── Input Persistence ── */

function saveInput(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const state = ExamState.load();
  if (!state.inputs) state.inputs = {};
  if (el.type === 'checkbox' || el.type === 'radio') {
    state.inputs[inputId] = el.checked;
  } else {
    state.inputs[inputId] = el.value;
  }
  ExamState.save(state);
}

function restoreInputs() {
  const state = ExamState.load();
  if (!state.inputs) return;
  Object.keys(state.inputs).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = state.inputs[id];
    } else {
      el.value = state.inputs[id] || '';
    }
  });
}

function bindInputPersistence() {
  document.querySelectorAll('input[id], textarea[id], select[id]')
    .forEach(el => {
      ['input','change'].forEach(evt => {
        el.addEventListener(evt, () => saveInput(el.id));
      });
    });
}

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