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
      results:   {},   // NEW: stores per-subId evaluation state
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
  const cleaned = String(userAnswer).replace(/\s/g, '');
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

/* ═══════════════════════════════════════════
   SCORING
   All functions load fresh from storage,
   modify exactly what they need,
   and save back immediately.
   No return value — callers do not hold state.
   ═══════════════════════════════════════════ */

function recordScore(subId, maxPoints, isCorrect) {
  const state = ExamState.load();
  if (!state.scores[subId]) {
    state.scores[subId] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[subId];
  if (entry.attempts === 0 && isCorrect) {
    entry.earned = maxPoints;
  }
  entry.attempts += 1;
  ExamState.save(state);
}

function recordPartialScore(subId, earned, maxPoints) {
  const state = ExamState.load();
  if (!state.scores[subId]) {
    state.scores[subId] = { earned: 0, max: maxPoints, attempts: 0 };
  }
  const entry = state.scores[subId];
  if (entry.attempts === 0) {
    entry.earned = earned;
  }
  entry.attempts += 1;
  ExamState.save(state);
}

function recordStepScore(stepKey, isCorrect) {
  /* Step scores are structural (no points awarded).
     We only track attempts for persistence of step state. */
  const state = ExamState.load();
  const key = `step_${stepKey}`;
  if (!state.scores[key]) {
    state.scores[key] = { earned: 0, max: 0, attempts: 0 };
  }
  state.scores[key].attempts += 1;
  ExamState.save(state);
}

function getAttempts(subId) {
  const state = ExamState.load();
  return state.scores[subId] ? state.scores[subId].attempts : 0;
}

function getStepAttempts(stepKey) {
  const state = ExamState.load();
  const key = `step_${stepKey}`;
  return state.scores[key] ? state.scores[key].attempts : 0;
}

/* ═══════════════════════════════════════════
   RESULT PERSISTENCE
   Stores the last evaluation result per element:
     'correct' | 'incorrect' | null
   Also stores feedback HTML per subId.
   ═══════════════════════════════════════════ */

function saveResult(elementId, result) {
  /* result: 'correct' | 'incorrect' */
  const state = ExamState.load();
  if (!state.results) state.results = {};
  state.results[elementId] = result;
  ExamState.save(state);
}

function loadResult(elementId) {
  const state = ExamState.load();
  return state.results ? (state.results[elementId] || null) : null;
}

function saveFeedback(subId, html, cssClass) {
  const state = ExamState.load();
  if (!state.results) state.results = {};
  state.results[`fb_${subId}`] = { html, cssClass };
  ExamState.save(state);
}

function restoreFeedback(subId) {
  const state = ExamState.load();
  if (!state.results) return;
  const fb = state.results[`fb_${subId}`];
  if (!fb) return;
  const box = document.getElementById(`feedback-${subId}`);
  if (!box) return;
  box.className = `feedback-box show ${fb.cssClass}`;
  box.innerHTML = fb.html;
}

function saveInlineFeedback(fbId, html, cssClass) {
  const state = ExamState.load();
  if (!state.results) state.results = {};
  state.results[`ifb_${fbId}`] = { html, cssClass };
  ExamState.save(state);
}

function restoreInlineFeedback(fbId) {
  const state = ExamState.load();
  if (!state.results) return;
  const fb = state.results[`ifb_${fbId}`];
  if (!fb) return;
  const el = document.getElementById(`ifb-${fbId}`);
  if (!el) return;
  el.className = `inline-feedback show ${fb.cssClass}`;
  el.innerHTML = fb.html;
}

/* ── Updated showFeedback — also persists ── */
function showFeedback(subId, isCorrect, hintText = '', earnedPoints = null, maxPoints = null) {
  const box = document.getElementById(`feedback-${subId}`);
  if (!box) return;
  const cssClass = isCorrect ? 'correct' : 'incorrect';
  let html;
  if (isCorrect) {
    html = `<span class="feedback-icon">✅</span><strong>Richtig!</strong>`;
  } else {
    html = `<span class="feedback-icon">❌</span><strong>Leider falsch.</strong>`
      + (hintText ? `<div class="hint-text">💡 Hinweis: ${hintText}</div>` : '');
  }
  if (earnedPoints !== null && maxPoints !== null) {
    html += `<div class="points-info">Erhaltene Punkte: ${earnedPoints} / ${maxPoints}</div>`;
  }
  box.className = `feedback-box show ${cssClass}`;
  box.innerHTML = html;
  saveFeedback(subId, html, cssClass);
}

/* ── Input style helpers — also persist ── */

function applyInputStyle(id, isCorrect) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('correct', 'incorrect');
  const cls = isCorrect ? 'correct' : 'incorrect';
  el.classList.add(cls);
  saveResult(id, cls);
}

function clearInputStyle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('correct', 'incorrect');
}

function restoreInputStyles() {
  /* Re-apply saved correct/incorrect classes to all inputs */
  const state = ExamState.load();
  if (!state.results) return;
  Object.keys(state.results).forEach(id => {
    /* Skip feedback entries */
    if (id.startsWith('fb_') || id.startsWith('ifb_')) return;
    const result = state.results[id];
    if (result !== 'correct' && result !== 'incorrect') return;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('correct','incorrect');
    el.classList.add(result);
  });
}

/* ── MC feedback rule (no green reveal on wrong) ── */

function markMCResult(containerId, chosenVal, isCorrect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.mc-option, .step-mc-option').forEach(o => {
    o.classList.remove('correct','incorrect');
    if (o.dataset.val === chosenVal) {
      o.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
  });
  /* Persist MC result state */
  saveResult(`mc_${containerId}_chosen`, chosenVal);
  saveResult(`mc_${containerId}_result`, isCorrect ? 'correct' : 'incorrect');
}

function restoreMCResults(containerId) {
  const chosenVal = loadResult(`mc_${containerId}_chosen`);
  const result    = loadResult(`mc_${containerId}_result`);
  if (!chosenVal || !result) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.mc-option, .step-mc-option').forEach(o => {
    o.classList.remove('correct','incorrect');
    if (o.dataset.val === chosenVal) {
      o.classList.add(result);
    }
  });
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
  const el    = document.getElementById(`notice-${subId}`);
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

function navigateTo(url) { window.location.href = url; }

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
  restoreInputStyles();
  bindInputPersistence();
  updateScoreDisplay();
  if (document.querySelector('.task-grid')) updateTaskCards();
});