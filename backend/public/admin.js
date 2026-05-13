/**
 * admin.js
 *
 * Admin panel functionality for editing vocabulary and running build scripts
 */

// ── Theme Toggle ──────────────────────────────────────────────────────────

const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  html.classList.toggle('dark');
  localStorage.setItem('admin-theme', html.classList.contains('dark') ? 'dark' : 'light');
});

// Load saved theme
if (localStorage.getItem('admin-theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

// ── Tab Navigation ───────────────────────────────────────────────────────

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    // Deactivate all tabs
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));

    // Activate selected tab
    btn.classList.add('active');
    document.getElementById(tabName).classList.add('active');
  });
});

// ── API Helpers ───────────────────────────────────────────────────────────

async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (data) options.body = JSON.stringify(data);

  const response = await fetch(`/api/admin${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `API error: ${response.statusText}`);
  }

  return response.json();
}

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('statusMessage');
  statusEl.innerHTML = `<div class="status ${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => statusEl.innerHTML = '', type === 'error' ? 5000 : 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── EDITOR TAB ────────────────────────────────────────────────────────────

const searchInput = document.getElementById('searchInput');
const langSelect = document.getElementById('langSelect');
const searchBtn = document.getElementById('searchBtn');
const wordList = document.getElementById('wordList');
const editorForm = document.getElementById('editorForm');

let currentWords = [];
let currentWord = null;

searchBtn.addEventListener('click', loadWords);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loadWords();
});

async function loadWords() {
  try {
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';

    const search = searchInput.value;
    const lang = langSelect.value;

    const result = await apiCall(
      `/vocab?lang=${lang}&search=${encodeURIComponent(search)}&limit=100`
    );

    currentWords = result.words;
    renderWordList();
    showStatus(`Found ${result.words.length} words`, 'info');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

function renderWordList() {
  wordList.innerHTML = '';

  if (currentWords.length === 0) {
    wordList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No words found</div>';
    return;
  }

  currentWords.forEach(word => {
    const item = document.createElement('div');
    item.className = 'word-item';
    item.innerHTML = `
      <div class="word-header">${escapeHtml(word.word)}</div>
      <div class="word-meta">${escapeHtml(word.display)} • ${word.pos}</div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.word-item').forEach(w => w.classList.remove('active'));
      item.classList.add('active');
      editWord(word);
    });

    wordList.appendChild(item);
  });
}

function editWord(word) {
  currentWord = word;
  editorForm.classList.add('active');

  document.getElementById('editWord').value = word.word;
  document.getElementById('editDisplay').value = word.display || '';
  document.getElementById('editPos').value = word.pos || 'noun';
  document.getElementById('editBand').value = word.frequency?.band || 'A1';
  document.getElementById('editDomain').value = (word.domains && word.domains[0]) || 'General';
  document.getElementById('editGlosses').value = (word.glosses || []).join('|');
  document.getElementById('editSynonyms').value = (word.relations?.synonyms || []).join(', ');
  document.getElementById('editExamples').value = (word.examples || []).join('\n');
  document.getElementById('editNotes').value = word.notes || '';
  document.getElementById('editIPA').value = word.linguistic?.ipa || '';
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  try {
    if (!currentWord) return;

    const updated = {
      display: document.getElementById('editDisplay').value,
      pos: document.getElementById('editPos').value,
      notes: document.getElementById('editNotes').value,
      glosses: document.getElementById('editGlosses').value.split('|').map(g => g.trim()),
      examples: document.getElementById('editExamples').value.split('\n').map(e => e.trim()).filter(e => e),
      relations: {
        ...currentWord.relations,
        synonyms: document.getElementById('editSynonyms').value.split(',').map(s => s.trim()).filter(s => s)
      },
      frequency: {
        ...currentWord.frequency,
        band: document.getElementById('editBand').value
      },
      linguistic: {
        ...currentWord.linguistic,
        ipa: document.getElementById('editIPA').value
      },
      domains: [document.getElementById('editDomain').value]
    };

    document.getElementById('saveBtn').disabled = true;
    document.getElementById('saveBtn').textContent = 'Saving...';

    await apiCall(
      `/vocab/${currentWord.word}?lang=${langSelect.value}`,
      'POST',
      updated
    );

    showStatus('✓ Word saved successfully', 'success');
    loadWords(); // Refresh list
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('saveBtn').textContent = '💾 Save Changes';
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (currentWord) editWord(currentWord);
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  editorForm.classList.remove('active');
  currentWord = null;
});

// ── SCRIPTS TAB ───────────────────────────────────────────────────────────

const scriptOutput = document.getElementById('scriptOutput');
const scriptBtns = {
  spanish: document.getElementById('genSpanishBtn'),
  portuguese: document.getElementById('genPortugueseBtn'),
  italian: document.getElementById('genItalianBtn'),
  french: document.getElementById('genFrenchBtn'),
  enrichVocab: document.getElementById('enrichVocabBtn'),
  enrich: document.getElementById('enrichSpanishBtn'),
  all: document.getElementById('runAllBtn')
};

Object.entries(scriptBtns).forEach(([lang, btn]) => {
  btn.addEventListener('click', async () => {
    await runScript(lang);
  });
});

// Export buttons
const exportBtns = {
  spanish: document.getElementById('exportSpanishBtn'),
  portuguese: document.getElementById('exportPortugueseBtn'),
  italian: document.getElementById('exportItalianBtn'),
  french: document.getElementById('exportFrenchBtn')
};

Object.entries(exportBtns).forEach(([lang, btn]) => {
  btn.addEventListener('click', async () => {
    await exportLanguageCSV(lang);
  });
});

async function runScript(script) {
  try {
    const endpoint = script === 'all' ? '/scripts/all' :
                     script === 'enrich' ? '/scripts/enrich' :
                     script === 'enrichVocab' ? '/scripts/enrich' :
                     `/scripts/generate`;

    const btn = scriptBtns[script];
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Running...';

    scriptOutput.style.display = 'block';
    scriptOutput.textContent = 'Running script...\n';

    let data = {};
    if (script !== 'all' && script !== 'enrich' && script !== 'enrichVocab') {
      data = { lang: script };
    } else if (script === 'enrich' || script === 'enrichVocab') {
      data = { lang: langSelect.value || 'spanish' };
    }

    const result = await apiCall(endpoint, 'POST', data);

    scriptOutput.textContent = '';

    if (script === 'all') {
      Object.entries(result.results).forEach(([key, value]) => {
        scriptOutput.textContent += `\n=== ${key.toUpperCase()} ===\n`;
        scriptOutput.textContent += value.output || value.error || 'No output';
      });
    } else {
      scriptOutput.textContent = result.output || result.error || 'Script completed';
    }

    showStatus(`✓ ${script} script completed`, 'success');
  } catch (err) {
    scriptOutput.style.display = 'block';
    scriptOutput.textContent = `ERROR:\n${err.message}`;
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    const btn = scriptBtns[script];
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || 'Run';
  }
}

// ── STATISTICS TAB ────────────────────────────────────────────────────────

const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const statsContainer = document.getElementById('statsContainer');

refreshStatsBtn.addEventListener('click', loadStatistics);

async function loadStatistics() {
  try {
    refreshStatsBtn.disabled = true;
    refreshStatsBtn.textContent = '🔄 Loading...';

    const result = await apiCall('/stats');

    statsContainer.innerHTML = '';

    Object.entries(result.stats).forEach(([lang, stats]) => {
      const langDiv = document.createElement('div');
      langDiv.innerHTML = `
        <h3 style="margin-top: 1.5rem; margin-bottom: 1rem; color: var(--accent);">
          ${lang.charAt(0).toUpperCase() + lang.slice(1)}
        </h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Words</div>
            <div class="stat-value">${stats.total}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">With Examples</div>
            <div class="stat-value">${stats.withExamples}</div>
            <div class="coverage-bar">
              <div class="bar">
                <div class="bar-fill" style="width: ${stats.coverage.examples}%"></div>
              </div>
              <div class="bar-label">${stats.coverage.examples}%</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">With Synonyms</div>
            <div class="stat-value">${stats.withSynonyms}</div>
            <div class="coverage-bar">
              <div class="bar">
                <div class="bar-fill" style="width: ${stats.coverage.synonyms}%"></div>
              </div>
              <div class="bar-label">${stats.coverage.synonyms}%</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">With IPA</div>
            <div class="stat-value">${stats.withIPA}</div>
            <div class="coverage-bar">
              <div class="bar">
                <div class="bar-fill" style="width: ${stats.coverage.ipa}%"></div>
              </div>
              <div class="bar-label">${stats.coverage.ipa}%</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Verbs</div>
            <div class="stat-value">${stats.verbs}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Nouns</div>
            <div class="stat-value">${stats.nouns}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Adjectives</div>
            <div class="stat-value">${stats.adjectives}</div>
          </div>
        </div>
      `;
      statsContainer.appendChild(langDiv);
    });

    showStatus('✓ Statistics loaded', 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    refreshStatsBtn.disabled = false;
    refreshStatsBtn.textContent = '🔄 Refresh Statistics';
  }
}

// ── EXPORT TAB ───────────────────────────────────────────────────────

async function exportLanguageCSV(lang) {
  try {
    const btn = exportBtns[lang];
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Downloading...';

    // Make POST request to export endpoint
    const response = await fetch(`/api/admin/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang })
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    // Get CSV as blob
    const csv = await response.text();
    const blob = new Blob([csv], { type: 'text/csv' });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lang}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    showStatus(`✓ Exported ${lang}.csv`, 'success');
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
  } finally {
    const btn = exportBtns[lang];
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || '↓ Export ' + lang.charAt(0).toUpperCase() + lang.slice(1);
  }
}

// Load stats on page load
loadStatistics();

console.log('✓ Admin panel loaded');
