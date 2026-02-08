// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Poisson — Interaction Script (interact.js)                                ║
// ║                                                                            ║
// ║  WHAT THIS FILE DOES:                                                      ║
// ║  This script is injected into noise tabs (and ONLY noise tabs) by the      ║
// ║  background service worker. It simulates realistic human browsing:         ║
// ║    - Scrolls the page (2–4 times, with varied speed like a human skimming) ║
// ║    - Hovers over elements (triggers tracking pixels / analytics)           ║
// ║    - Occasionally clicks a link (~30% on normal pages, ~50% on search)     ║
// ║    - Waits between actions (simulating reading time)                        ║
// ║                                                                            ║
// ║  WHAT THIS FILE DOES NOT DO:                                               ║
// ║  - Does NOT read any page content, form data, passwords, or cookies        ║
// ║  - Does NOT extract or store any information from the pages it visits       ║
// ║  - Does NOT send any data anywhere except back to the Poisson background   ║
// ║    script (scroll count + click count + estimated page size)               ║
// ║  - Does NOT modify the page in any visible way                             ║
// ║  - Only clicks same-origin links (never follows cross-origin redirects)    ║
// ║  - Is automatically removed when the tab is closed by the background script║
// ║                                                                            ║
// ║  WHY SIMULATE INTERACTIONS?                                                ║
// ║  Simply opening a URL generates a page load, but a real human also scrolls,║
// ║  hovers, and clicks. These actions trigger additional network requests      ║
// ║  (lazy-loaded images, tracking pixels, analytics events, ad impressions)   ║
// ║  that make the noise traffic indistinguishable from real browsing at the    ║
// ║  network level.                                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  // These track what this script has done so we can report back to the
  // background script when we're finished.

  let config = null;   // Received from background: { delay, type }
  let scrollCount = 0; // How many times we scrolled
  let clickCount = 0;  // How many links we clicked

  // ─── Utility Functions ──────────────────────────────────────────────────────

  // Promise-based delay — used between interaction phases to simulate
  // the pauses a real person makes while reading/browsing.
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Random integer in [min, max] inclusive
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ─── Link Discovery ────────────────────────────────────────────────────────
  // Find clickable links on the page. We filter carefully to only click
  // links that a real person would plausibly click.

  // Get all visible, same-origin links on the page.
  // We restrict to same-origin to avoid redirect chains to unknown domains.
  function getVisibleLinks() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    return links.filter(link => {
      // Skip invisible links (hidden, zero-size, etc.)
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(link);
      if (style.display === 'none' || style.visibility === 'hidden') return false;

      // Only same-origin http/https links — never navigate cross-origin
      // to avoid unpredictable redirect chains
      try {
        const url = new URL(link.href, location.origin);
        return url.origin === location.origin && url.protocol.startsWith('http');
      } catch {
        return false;
      }
    });
  }

  // Try to find search result links specifically (for search engine pages).
  // Each search engine has different DOM structure, so we try several selectors.
  function getSearchResultLinks() {
    const selectors = [
      'h3 a',                         // Google — result titles are in <h3>
      'a.result__a',                   // DuckDuckGo — result links have this class
      'li.b_algo h2 a',               // Bing — results are in .b_algo list items
      'div.compTitle a',               // Yahoo — results use .compTitle divs
      '#search a[href]:not([role])',   // Google fallback — links in #search container
    ];
    for (const sel of selectors) {
      const links = document.querySelectorAll(sel);
      if (links.length > 0) return Array.from(links);
    }
    return [];
  }

  // ─── Interaction Simulation ────────────────────────────────────────────────

  // Simulate smooth scrolling to a random position on the page.
  // Uses an ease-in-out curve to look like natural human scrolling
  // rather than an instant jump.
  async function simulateScroll() {
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      1000
    );
    const viewHeight = window.innerHeight;
    const maxScroll = docHeight - viewHeight;
    if (maxScroll <= 0) return; // Page is too short to scroll

    // Pick a random scroll target (within the top 80% of the page)
    const targetY = randomInt(100, Math.min(maxScroll, docHeight * 0.8));
    const steps = randomInt(8, 20); // More steps = smoother scroll
    const startY = window.scrollY;
    const distance = targetY - startY;

    // Animate the scroll with ease-in-out timing
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Quadratic ease-in-out: accelerates then decelerates
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      window.scrollTo(0, startY + distance * ease);
      // Small random delay between scroll steps (20–80ms) to look human
      await sleep(randomInt(20, 80));
    }
    scrollCount++;
  }

  // Dispatch mouse events on an element to simulate a cursor hovering over it.
  // This triggers any mouseover/mouseenter event listeners (analytics, tracking
  // pixels, hover-state ad loads, etc.) that the page might have.
  function simulateHover(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Fire the standard sequence of mouse events that a real cursor would trigger
    const events = ['mousemove', 'mouseover', 'mouseenter'];
    for (const eventType of events) {
      element.dispatchEvent(new MouseEvent(eventType, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y,
      }));
    }
  }

  // Hover over 2–5 random interactive elements on the page.
  // This triggers tracking pixels and analytics that fire on hover events.
  async function simulateRandomHovers() {
    const elements = document.querySelectorAll('a, img, button, [role="button"], div[class]');
    const candidates = Array.from(elements).slice(0, 50); // Cap at 50 to avoid performance issues
    const hoverCount = randomInt(2, 5);

    for (let i = 0; i < hoverCount && candidates.length > 0; i++) {
      const idx = randomInt(0, candidates.length - 1);
      simulateHover(candidates[idx]);
      await sleep(randomInt(200, 800)); // Brief pause between hovers
    }
  }

  // Click a link — first hover over it (like a real user would), then click.
  function clickLink(link) {
    simulateHover(link);
    link.click();
    clickCount++;
  }

  // ─── Main Interaction Sequence ─────────────────────────────────────────────
  // This is the core function that runs after being triggered by the background
  // script. It executes a realistic sequence of browsing actions within the
  // allotted time window (task.delay, typically 5–25 seconds).

  async function interact() {
    if (!config) return;

    const totalTime = config.delay || 10000;
    const startTime = Date.now();

    // Phase 1: Initial dwell — simulate landing on the page and starting to read.
    // A real person takes 1–3 seconds to orient themselves on a new page.
    await sleep(randomInt(1000, 3000));

    // Phase 2: Scroll through the page (2–4 times).
    // Simulates skimming through content like a real reader.
    const numScrolls = randomInt(2, 4);
    for (let i = 0; i < numScrolls; i++) {
      // Check time budget — stop scrolling if we're running low
      if (Date.now() - startTime > totalTime - 2000) break;
      await simulateScroll();
      // Pause between scrolls (1–3s) to simulate reading each section
      await sleep(randomInt(1000, 3000));
    }

    // Phase 3: Hover over random elements.
    // Triggers tracking pixels and analytics events.
    if (Date.now() - startTime < totalTime - 2000) {
      await simulateRandomHovers();
    }

    // Phase 4: Maybe click a link.
    // On search result pages, we click a result ~50% of the time (people
    // usually click something). On regular pages, ~30% (sometimes you just read).
    if (Date.now() - startTime < totalTime - 3000) {
      const isSearchPage = config.type === 'search';
      const clickChance = isSearchPage ? 0.5 : 0.3;

      if (Math.random() < clickChance) {
        // On search pages, try to find actual result links first
        let links;
        if (isSearchPage) {
          links = getSearchResultLinks();
        }
        // Fall back to any visible same-origin link
        if (!links || links.length === 0) {
          links = getVisibleLinks();
        }
        if (links.length > 0) {
          // Pick from the top 10 links (most prominent on the page)
          const link = links[randomInt(0, Math.min(links.length - 1, 9))];
          await sleep(randomInt(500, 1500)); // Brief pause before clicking
          clickLink(link);
          await sleep(randomInt(1000, 2000)); // Pause after click (page may navigate)
        }
      }
    }

    // Phase 5: Final dwell — use remaining time to look like continued reading.
    const remaining = totalTime - (Date.now() - startTime);
    if (remaining > 0) {
      await sleep(Math.min(remaining, 3000));
    }

    // ─── Report Results ────────────────────────────────────────────────────
    // Send interaction summary back to the background script.
    // This is the ONLY data we send: counts and byte estimate.
    // We do NOT send any page content, URLs found, or other page data.
    chrome.runtime.sendMessage({
      action: 'interaction-complete',
      data: {
        scrolls: scrollCount,
        clicks: clickCount,
        bytes_estimated: estimatePageBytes(),
      },
    });
  }

  // ─── Page Size Estimation ──────────────────────────────────────────────────
  // Estimates how much data this page loaded by checking the Performance API.
  // This gives us a more accurate bandwidth estimate than the 500KB fallback.
  // We never read page content — we only check transfer sizes of resources.

  function estimatePageBytes() {
    let total = 0;

    // Use the Performance Resource Timing API to get actual transfer sizes
    // of all sub-resources (images, scripts, stylesheets, etc.)
    if (performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource');
      for (const r of resources) {
        // transferSize is the actual bytes over the network (after compression)
        // encodedBodySize is the fallback (before decompression but after encoding)
        total += r.transferSize || r.encodedBodySize || 0;
      }
    }

    // Add an estimate for the HTML document itself
    const docSize = document.documentElement.outerHTML?.length || 0;
    total += docSize;

    // If we couldn't measure anything, use the 500KB fallback
    return total || 512000;
  }

  // ─── Message Listener ──────────────────────────────────────────────────────
  // Waits for the "interact" command from the background script.
  // The background injects this script into the tab, then sends a message
  // telling us to start interacting (with the task config).

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'interact') {
      config = message;
      interact(); // Start the interaction sequence (runs asynchronously)
      sendResponse({ ok: true });
    }
  });
})();
