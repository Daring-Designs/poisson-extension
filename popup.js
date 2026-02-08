// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Poisson — Popup Controller (popup.js)                                     ║
// ║                                                                            ║
// ║  This script controls the extension popup UI. It communicates with the     ║
// ║  background service worker via chrome.runtime.sendMessage to:              ║
// ║    - Start/stop the noise engine                                           ║
// ║    - Read current status, stats, logs, and bandwidth data                  ║
// ║    - Update settings (intensity, engines, task mix, categories)            ║
// ║                                                                            ║
// ║  All data displayed comes from chrome.storage.local via the background     ║
// ║  script. No external network requests are made by this popup.              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ─── DOM Helpers ────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let refreshTimer = null;   // Auto-refresh interval while popup is open
let currentTab = 'status'; // Which tab is currently visible

// ─── Tab Navigation ─────────────────────────────────────────────────────────────
// Switches between Status, Log, and Settings panels.

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
    currentTab = btn.dataset.tab;
    refresh(); // Immediately refresh the newly-visible tab
  });
});

// ─── Messaging ──────────────────────────────────────────────────────────────────
// All communication with the background script goes through this function.
// See background.js message handlers for the full list of supported actions.

function send(action, value) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, value }, resolve);
  });
}

// ─── Status Tab ─────────────────────────────────────────────────────────────────

// Start/Stop buttons — these are the primary user controls
$('#btn-start').addEventListener('click', async () => {
  await send('start');
  refresh();
});

$('#btn-stop').addEventListener('click', async () => {
  await send('stop');
  refresh();
});

// Intensity selector — changes the Poisson lambda (noise frequency)
$('#intensity-selector').addEventListener('click', async (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  $$('#intensity-selector .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  await send('set-intensity', pill.dataset.value);
});

// Fetch current status from background and update the UI
async function refreshStatus() {
  const status = await send('get-status');
  if (!status) return;

  // Toggle between stopped and running views
  if (status.running) {
    $('#stopped-view').style.display = 'none';
    $('#running-view').style.display = 'flex';
    $('#running-view').style.flexDirection = 'column';
    $('#running-view').style.gap = '12px';
  } else {
    $('#stopped-view').style.display = '';
    $('#running-view').style.display = 'none';
  }

  // Update daily stat counters
  const stats = status.stats || {};
  $('#stat-searches').textContent = stats.searches || 0;
  $('#stat-browses').textContent = stats.browses || 0;
  $('#stat-ads').textContent = stats.adClicks || 0;
  $('#stat-total').textContent = stats.totalActions || 0;

  // Days active count
  const daysActive = Array.isArray(stats.daysActive) ? stats.daysActive.length : 0;
  $('#stat-days').textContent = daysActive;

  // Highlight the current intensity level
  $$('#intensity-selector .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.value === (status.intensity || 'medium'));
  });

  // Update bandwidth display
  await refreshBandwidth(status.sessionBandwidth || 0);
}

// Fetch bandwidth data and update the chart + text values
async function refreshBandwidth(sessionBytes) {
  const bw = await send('get-bandwidth');
  if (!bw) return;

  // Session bandwidth (since last Start)
  $('#bw-session').textContent = formatBytes(sessionBytes);

  // Today's total bandwidth
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayBytes = bw.daily?.[todayKey] || 0;
  $('#bw-today').textContent = formatBytes(todayBytes);

  // Draw the 24-hour sparkline chart
  drawBandwidthChart(bw.hourly || {});
}

// Draw a bar chart showing hourly bandwidth over the last 24 hours.
// Each bar represents one hour. The chart auto-scales to the max value.
function drawBandwidthChart(hourlyData) {
  const canvas = $('#bw-chart');
  const ctx = canvas.getContext('2d');

  // Handle high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Build an array of the last 24 hours of bandwidth data
  const now = new Date();
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const key = d.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    hours.push(hourlyData[key] || 0);
  }

  // Scale bars relative to the maximum value
  const maxVal = Math.max(...hours, 1);
  const barWidth = (w - 16) / 24;
  const pad = 8;

  for (let i = 0; i < 24; i++) {
    const barH = (hours[i] / maxVal) * (h - 12);
    const x = pad + i * barWidth;
    const y = h - 4 - barH;

    ctx.fillStyle = 'rgba(79, 140, 255, 0.6)';
    ctx.beginPath();
    // roundRect for slightly rounded bar tops
    ctx.roundRect(x + 1, y, Math.max(barWidth - 2, 1), barH, 1);
    ctx.fill();
  }
}


// ─── Log Tab ────────────────────────────────────────────────────────────────────
// Displays a scrollable feed of every action the extension has taken.
// Each entry shows: timestamp, type badge, URL/message, duration, interactions.
// System events (start/stop, settings changes) also appear here.

$('#btn-clear-log').addEventListener('click', async () => {
  await send('clear-logs');
  refresh();
});

async function refreshLog() {
  const { logs } = await send('get-logs');
  const list = $('#log-list');
  const countEl = $('#log-count');

  if (!logs || logs.length === 0) {
    list.innerHTML = '<div class="log-empty">No activity yet. Start the engine to generate noise.</div>';
    countEl.textContent = '0 entries';
    return;
  }

  countEl.textContent = `${logs.length} entr${logs.length === 1 ? 'y' : 'ies'}`;

  list.innerHTML = logs.map(entry => {
    // Format timestamp as HH:MM:SS
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString('en-US', { hour12: false });

    // ── System log entries (engine start/stop, settings changes, etc.) ──
    if (entry.type === 'system') {
      return `
        <div class="log-entry log-entry-system">
          <span class="log-time">${timeStr}</span>
          <span class="log-badge system">sys</span>
          <div class="log-body">
            <span class="log-system-msg">${escapeHtml(entry.message || '')}</span>
          </div>
        </div>
      `;
    }

    // ── Task log entries (search, browse, ad_click) ──
    const url = truncateUrl(entry.url, 35);
    const duration = entry.duration_ms ? Math.round(entry.duration_ms / 1000) + 's' : '';
    const bytes = entry.bytes_estimated ? formatBytes(entry.bytes_estimated) : '';

    // Build interaction summary (e.g., "3 scrolls, 1 click")
    const interactions = [];
    if (entry.interactions?.scrolls) interactions.push(`${entry.interactions.scrolls} scrolls`);
    if (entry.interactions?.clicks) interactions.push(`${entry.interactions.clicks} click${entry.interactions.clicks > 1 ? 's' : ''}`);
    const interStr = interactions.join(', ');

    // Search entries show the engine name and query
    let detail = '';
    if (entry.type === 'search' && entry.engine) {
      detail = `<span class="log-query">${escapeHtml(entry.engine)}: ${escapeHtml(entry.query || '')}</span>`;
    }

    // Status indicator — shows if the task succeeded, timed out, or failed
    let statusBadge = '';
    if (entry.status === 'timeout') {
      statusBadge = '<span class="log-status log-status-warn">timeout</span>';
    } else if (entry.status === 'tab_failed') {
      statusBadge = '<span class="log-status log-status-error">failed</span>';
    }

    // Badge text — "ad" instead of "ad_click" for space
    const badgeText = entry.type === 'ad_click' ? 'ad' : entry.type;

    // Build the metadata line: duration, interactions, bandwidth, status
    const metaParts = [duration, interStr, bytes].filter(Boolean);

    return `
      <div class="log-entry">
        <span class="log-time">${timeStr}</span>
        <span class="log-badge ${entry.type}">${badgeText}</span>
        <div class="log-body">
          <span class="log-url" title="${escapeHtml(entry.url)}">${escapeHtml(url)}</span>
          ${detail}
          <span class="log-meta">${metaParts.join(' · ')}${statusBadge ? ' ' + statusBadge : ''}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Shorten a URL for display: show hostname + path, truncated to maxLen chars
function truncateUrl(url, maxLen) {
  try {
    const u = new URL(url);
    let display = u.hostname + u.pathname;
    // Remove trailing slash for cleaner display
    if (display.endsWith('/')) display = display.slice(0, -1);
    if (display.length > maxLen) display = display.slice(0, maxLen) + '...';
    return display;
  } catch {
    return url?.slice(0, maxLen) || '';
  }
}

// Safely escape HTML to prevent XSS from URL/query content
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}


// ─── Settings Tab ───────────────────────────────────────────────────────────────
// All settings are saved to chrome.storage.local via the background script.
// Nothing leaves the browser.

const ENGINES = [
  { id: 'google',     name: 'Google' },
  { id: 'duckduckgo', name: 'DuckDuckGo' },
  { id: 'bing',       name: 'Bing' },
  { id: 'yahoo',      name: 'Yahoo' },
];

const CATEGORIES = [
  'news', 'tech', 'shopping', 'social', 'forums', 'education',
  'entertainment', 'health', 'finance', 'travel', 'food', 'sports',
];

async function renderSettings() {
  const settings = await send('get-settings');
  if (!settings) return;

  // ── Search Engine toggles + weight selectors ──
  const engineList = $('#engine-list');
  engineList.innerHTML = ENGINES.map(e => {
    const s = settings.engines?.[e.id] || { enabled: true, weight: 25 };
    return `
      <div class="engine-row">
        <label class="toggle">
          <input type="checkbox" data-engine="${e.id}" ${s.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <label>${e.name}</label>
        <div class="engine-weight">
          <select data-engine-weight="${e.id}">
            <option value="10" ${s.weight <= 15 ? 'selected' : ''}>Low</option>
            <option value="30" ${s.weight > 15 && s.weight <= 40 ? 'selected' : ''}>Med</option>
            <option value="55" ${s.weight > 40 ? 'selected' : ''}>High</option>
          </select>
        </div>
      </div>
    `;
  }).join('');

  // Save engine settings when any toggle or weight changes
  engineList.addEventListener('change', async (e) => {
    const checkbox = e.target.closest('[data-engine]');
    const select = e.target.closest('[data-engine-weight]');
    if (checkbox || select) await saveEngineSettings();
  });

  // ── Task mix sliders ──
  const tw = settings.taskWeights || { search: 45, browse: 40, ad_click: 15 };
  $('#mix-search').value = tw.search;
  $('#mix-browse').value = tw.browse;
  $('#mix-ad').value = tw.ad_click;
  $('#mix-search-val').textContent = tw.search + '%';
  $('#mix-browse-val').textContent = tw.browse + '%';
  $('#mix-ad-val').textContent = tw.ad_click + '%';

  // ── Site category toggles ──
  const catList = $('#category-list');
  catList.innerHTML = CATEGORIES.map(cat => {
    const enabled = settings.categories?.[cat] !== false;
    return `
      <div class="category-row">
        <label class="toggle">
          <input type="checkbox" data-category="${cat}" ${enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <label>${cat.charAt(0).toUpperCase() + cat.slice(1)}</label>
      </div>
    `;
  }).join('');

  // Save category settings when any toggle changes
  catList.addEventListener('change', async () => {
    const cats = {};
    $$('[data-category]').forEach(cb => {
      cats[cb.dataset.category] = cb.checked;
    });
    // Safety: ensure at least one category is always enabled
    if (!Object.values(cats).some(v => v)) {
      cats.news = true;
      const newsCheckbox = $('[data-category="news"]');
      if (newsCheckbox) newsCheckbox.checked = true;
    }
    await send('set-categories', cats);
  });
}

// Collect current engine UI state and send to background for persistence
async function saveEngineSettings() {
  const engines = {};
  let anyEnabled = false;
  ENGINES.forEach(e => {
    const cb = $(`[data-engine="${e.id}"]`);
    const sel = $(`[data-engine-weight="${e.id}"]`);
    const enabled = cb?.checked ?? true;
    const weight = parseInt(sel?.value || '30', 10);
    engines[e.id] = { enabled, weight };
    if (enabled) anyEnabled = true;
  });
  // Safety: ensure at least one engine is always enabled
  if (!anyEnabled) {
    engines.google = { enabled: true, weight: 55 };
    const googleCb = $('[data-engine="google"]');
    if (googleCb) googleCb.checked = true;
  }
  await send('set-engines', engines);
}

// Task mix slider handlers — update the percentage label on drag,
// save to storage on release.
['search', 'browse', 'ad'].forEach(key => {
  const slider = $(`#mix-${key}`);
  if (!slider) return;
  // Update label while dragging
  slider.addEventListener('input', () => {
    $(`#mix-${key}-val`).textContent = slider.value + '%';
  });
  // Save when user releases the slider
  slider.addEventListener('change', async () => {
    const weights = {
      search: parseInt($('#mix-search').value, 10),
      browse: parseInt($('#mix-browse').value, 10),
      ad_click: parseInt($('#mix-ad').value, 10),
    };
    await send('set-task-weights', weights);
  });
});


// ─── Auto-Refresh ───────────────────────────────────────────────────────────────
// The popup refreshes every 3 seconds so stats and logs stay current.
// Only the currently-visible tab is refreshed to minimize message overhead.

async function refresh() {
  if (currentTab === 'status') await refreshStatus();
  else if (currentTab === 'log') await refreshLog();
  else if (currentTab === 'settings') await renderSettings();
}

// Format bytes as human-readable (B / KB / MB / GB)
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// Initial load — populate whichever tab is visible
refresh();

// Auto-refresh every 3 seconds while the popup is open
refreshTimer = setInterval(refresh, 3000);

// Clean up the interval when the popup closes
window.addEventListener('unload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
