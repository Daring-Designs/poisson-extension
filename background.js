// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  Poisson — Background Service Worker (background.js)                       ║
// ║                                                                            ║
// ║  WHAT THIS FILE DOES:                                                      ║
// ║  This is the core "noise engine." It runs as a Chrome Manifest V3 service  ║
// ║  worker — meaning it has NO access to any webpage's DOM, cookies, or       ║
// ║  content. It can only:                                                     ║
// ║    1. Open new tabs to publicly-accessible URLs (listed below)             ║
// ║    2. Inject interact.js into those tabs to simulate browsing              ║
// ║    3. Close those tabs when done                                           ║
// ║    4. Track bandwidth of its OWN noise tabs via webRequest headers         ║
// ║    5. Store logs, stats, and settings in chrome.storage.local              ║
// ║                                                                            ║
// ║  WHAT THIS FILE DOES NOT DO:                                               ║
// ║  - Does NOT read, store, or transmit any of your personal browsing data    ║
// ║  - Does NOT access your cookies, passwords, history, or bookmarks          ║
// ║  - Does NOT make any network requests except opening the noise tabs        ║
// ║  - Does NOT communicate with any external server (no telemetry/analytics)  ║
// ║  - Does NOT modify any page you visit — only pages IT opens                ║
// ║  - Does NOT run in your existing tabs — only in tabs it creates            ║
// ║                                                                            ║
// ║  HOW SCHEDULING WORKS:                                                     ║
// ║  Uses a Poisson process (exponential inter-arrival times) to space out     ║
// ║  noise actions at random intervals. This makes the traffic pattern look    ║
// ║  like natural human browsing rather than mechanical. Chrome's alarm API    ║
// ║  has a 1-minute minimum, so we batch multiple tasks per alarm tick.        ║
// ║                                                                            ║
// ║  ALL URLS ARE HARDCODED BELOW — you can read every site this extension     ║
// ║  will ever visit. Nothing is fetched from a remote server.                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝


// ─── Search Engines ─────────────────────────────────────────────────────────────
// These are the search engines used for "search" type noise tasks.
// Each has a URL template where {query} is replaced with a random search term.
// Weights control how often each engine is chosen (higher = more frequent).
// Users can enable/disable individual engines and adjust weights in Settings.

const SEARCH_ENGINES = [
  { id: 'google',     name: 'Google',     url: 'https://www.google.com/search?q={query}',            weight: 55 },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}',                  weight: 20 },
  { id: 'bing',       name: 'Bing',       url: 'https://www.bing.com/search?q={query}',              weight: 15 },
  { id: 'yahoo',      name: 'Yahoo',      url: 'https://search.yahoo.com/search?p={query}',          weight: 10 },
];


// ─── Browse Sites ───────────────────────────────────────────────────────────────
// These are the websites opened for "browse" type noise tasks.
// Organized by category so users can enable/disable entire categories.
// These are all mainstream, publicly-accessible websites — no obscure or
// potentially harmful sites. The goal is to generate traffic that looks like
// a normal person browsing popular websites.

const BROWSE_SITES = [
  // ── News (indices 0–15) ──
  'https://www.cnn.com', 'https://www.bbc.com', 'https://www.reuters.com', 'https://www.npr.org',
  'https://apnews.com', 'https://www.nytimes.com', 'https://www.washingtonpost.com',
  'https://www.theguardian.com', 'https://www.foxnews.com', 'https://www.aljazeera.com',
  'https://www.msnbc.com', 'https://news.yahoo.com', 'https://www.usatoday.com',
  'https://www.politico.com', 'https://www.theatlantic.com', 'https://www.axios.com',
  // ── Tech (indices 16–29) ──
  'https://arstechnica.com', 'https://www.theverge.com', 'https://www.wired.com',
  'https://techcrunch.com', 'https://news.ycombinator.com', 'https://www.tomshardware.com',
  'https://www.anandtech.com', 'https://www.engadget.com', 'https://www.zdnet.com',
  'https://www.cnet.com', 'https://slashdot.org', 'https://www.techmeme.com',
  'https://www.macrumors.com', 'https://9to5mac.com',
  // ── Shopping (indices 30–43) ──
  'https://www.amazon.com', 'https://www.ebay.com', 'https://www.walmart.com',
  'https://www.target.com', 'https://www.etsy.com', 'https://www.bestbuy.com',
  'https://www.wayfair.com', 'https://www.homedepot.com', 'https://www.ikea.com',
  'https://www.zappos.com', 'https://www.costco.com', 'https://www.lowes.com',
  'https://www.nordstrom.com', 'https://www.macys.com',
  // ── Social Media (indices 44–55) ──
  'https://www.reddit.com', 'https://www.youtube.com', 'https://twitter.com',
  'https://www.facebook.com', 'https://www.instagram.com', 'https://www.linkedin.com',
  'https://www.pinterest.com', 'https://www.tiktok.com', 'https://www.tumblr.com',
  'https://mastodon.social', 'https://www.threads.net', 'https://bsky.app',
  // ── Forums (indices 56–63) ──
  'https://stackoverflow.com', 'https://www.quora.com',
  'https://www.reddit.com/r/technology', 'https://www.reddit.com/r/science',
  'https://www.reddit.com/r/worldnews', 'https://www.reddit.com/r/askscience',
  'https://www.reddit.com/r/explainlikeimfive', 'https://www.reddit.com/r/personalfinance',
  'https://www.reddit.com/r/cooking', 'https://www.reddit.com/r/fitness',
  // ── Education (indices 64–71) ──
  'https://en.wikipedia.org/wiki/Special:Random', 'https://www.khanacademy.org',
  'https://www.coursera.org', 'https://ocw.mit.edu', 'https://arxiv.org',
  'https://www.edx.org', 'https://www.britannica.com', 'https://www.duolingo.com',
  // ── Entertainment (indices 72–82) ──
  'https://www.imdb.com', 'https://www.rottentomatoes.com', 'https://open.spotify.com',
  'https://www.twitch.tv', 'https://www.netflix.com', 'https://letterboxd.com',
  'https://www.metacritic.com', 'https://www.ign.com', 'https://www.gamespot.com',
  'https://store.steampowered.com', 'https://www.goodreads.com',
  // ── Health (indices 83–88) ──
  'https://www.webmd.com', 'https://www.mayoclinic.org', 'https://www.healthline.com',
  'https://my.clevelandclinic.org', 'https://medlineplus.gov', 'https://www.nih.gov',
  // ── Finance (indices 89–96) ──
  'https://finance.yahoo.com', 'https://www.bloomberg.com', 'https://www.marketwatch.com',
  'https://www.investopedia.com', 'https://www.cnbc.com', 'https://www.fool.com',
  'https://www.bankrate.com', 'https://www.nerdwallet.com',
  // ── Travel (indices 97–102) ──
  'https://www.tripadvisor.com', 'https://www.booking.com', 'https://www.airbnb.com',
  'https://www.expedia.com', 'https://www.lonelyplanet.com', 'https://www.kayak.com',
  // ── Food (indices 103–109) ──
  'https://www.allrecipes.com', 'https://www.seriouseats.com', 'https://www.bonappetit.com',
  'https://www.foodnetwork.com', 'https://www.epicurious.com', 'https://www.simplyrecipes.com',
  'https://www.budgetbytes.com',
  // ── Sports (indices 110–117) ──
  'https://www.espn.com', 'https://bleacherreport.com', 'https://theathletic.com',
  'https://www.cbssports.com', 'https://www.si.com', 'https://www.nfl.com',
  'https://www.nba.com', 'https://www.mlb.com',
];

// Maps category names to index ranges in the BROWSE_SITES array above.
// This is how we filter sites when the user disables a category in Settings.
const SITE_CATEGORIES = {
  news:          { start: 0,   end: 16 },
  tech:          { start: 16,  end: 30 },
  shopping:      { start: 30,  end: 44 },
  social:        { start: 44,  end: 56 },
  forums:        { start: 56,  end: 64 },
  education:     { start: 64,  end: 72 },
  entertainment: { start: 72,  end: 83 },
  health:        { start: 83,  end: 89 },
  finance:       { start: 89,  end: 97 },
  travel:        { start: 97,  end: 103 },
  food:          { start: 103, end: 110 },
  sports:        { start: 110, end: 118 },
};


// ─── Ad-Heavy Sites ─────────────────────────────────────────────────────────────
// Sites known for heavy ad loads. Visiting these generates more sub-resource
// requests (ad network calls, tracking pixels, etc.) which adds realistic noise
// to your network traffic profile.

const AD_SITES = [
  'https://weather.com', 'https://www.allrecipes.com', 'https://www.webmd.com',
  'https://www.dictionary.com', 'https://www.speedtest.net', 'https://www.accuweather.com',
  'https://www.thesaurus.com', 'https://www.mapquest.com', 'https://www.about.com',
  'https://www.ehow.com', 'https://www.answers.com', 'https://www.livestrong.com',
  'https://www.investopedia.com', 'https://www.healthline.com', 'https://www.howstuffworks.com',
  'https://www.thespruce.com', 'https://www.wikihow.com', 'https://www.weather.gov',
];


// ─── Search Terms ───────────────────────────────────────────────────────────────
// Random search queries used for "search" type tasks.
// Designed to look like natural human searches — a mix of specific product
// queries, how-to questions, and general curiosity. Covering many topics
// makes the noise diverse and realistic.

const SEARCH_TERMS = [
  // Tech — programming & tutorials
  'python tutorial for beginners', 'how to use git branches', 'javascript async await explained',
  'best vs code extensions 2025', 'react vs vue comparison', 'docker compose tutorial',
  'rust programming getting started', 'linux command line basics', 'sql join types explained',
  'how to deploy a website', 'typescript generics guide', 'nginx reverse proxy setup',
  'kubernetes for beginners', 'graphql vs rest api', 'web scraping with python',
  'machine learning tutorial', 'css grid layout examples', 'bash scripting tutorial',
  'how to set up a VPN server', 'raspberry pi home server projects',
  // Tech — hardware & self-hosting
  'best mechanical keyboard 2025', 'NAS build guide', 'home lab setup ideas',
  'proxmox vs esxi comparison', 'best budget monitor for programming',
  'custom PC build guide', 'home automation with home assistant',
  'best wireless earbuds review', 'SSD vs NVMe speed comparison',
  'synology vs qnap nas', 'unraid setup tutorial', 'plex media server setup',
  'wireguard vpn configuration', 'pihole ad blocker setup', 'zigbee vs z-wave smart home',
  // Shopping — product reviews
  'lodge cast iron skillet 12 inch review', 'best running shoes for flat feet',
  'dyson v15 vs shark vacuum', 'instant pot recipes for beginners',
  'best noise canceling headphones under 200', 'air fryer worth buying',
  'standing desk converter review', 'best backpack for travel 2025',
  'roomba j7 vs s9 comparison', 'best ergonomic office chair',
  'yeti tumbler vs hydro flask', 'kindle paperwhite review 2025',
  'best smart watch for android', 'electric toothbrush recommendations',
  'best mattress for side sleepers', 'portable charger high capacity review',
  'best wireless mouse for work', 'espresso machine under 500',
  'dutch oven best brands', 'weighted blanket benefits and reviews',
  // Shopping — deals & comparisons
  'amazon prime day deals 2025', 'best black friday laptop deals',
  'costco vs sams club membership worth it', 'refurbished macbook where to buy',
  'cheapest grocery delivery service', 'best credit card cashback rewards',
  'coupon stacking tips', 'is walmart plus worth it',
  // News & current events
  'latest world news today', 'climate change latest research',
  'space exploration news 2025', 'artificial intelligence regulations',
  'renewable energy developments', 'supply chain issues update',
  'housing market forecast 2025', 'electric vehicle adoption statistics',
  'cybersecurity threats current', 'immigration policy changes',
  'infrastructure bill status', 'pandemic preparedness plans',
  // Lifestyle — recipes
  'best pizza dough recipe', 'sourdough starter guide', 'easy weeknight dinner ideas',
  'slow cooker beef stew recipe', 'homemade pasta from scratch',
  'thai green curry recipe authentic', 'chocolate chip cookie recipe chewy',
  'meal prep ideas for the week', 'vegetarian protein sources',
  'how to smoke a brisket', 'best banana bread recipe moist',
  'ramen broth recipe from scratch', 'overnight oats combinations',
  'how to make sushi at home', 'cast iron pizza recipe',
  // Lifestyle — fitness & outdoors
  'beginner workout plan at home', 'couch to 5k training plan',
  'best stretches for lower back pain', 'yoga for beginners youtube',
  'how many calories walking 10000 steps', 'strength training over 40',
  'best hiking trails near me', 'camping gear essentials checklist',
  'cycling training plan beginner', 'how to start rock climbing',
  // Lifestyle — home & garden
  'how to fix a leaky faucet', 'best indoor plants low light',
  'raised garden bed plans', 'how to paint a room like a pro',
  'composting for beginners', 'when to plant tomatoes',
  'bathroom renovation ideas budget', 'how to unclog a drain naturally',
  'best lawn mower 2025', 'kitchen organization ideas',
  'how to install laminate flooring', 'fence repair DIY',
  // Health
  'headache causes and remedies', 'vitamin D deficiency symptoms',
  'how to lower blood pressure naturally', 'benefits of intermittent fasting',
  'best exercises for knee pain', 'how much sleep do adults need',
  'anxiety coping techniques', 'iron rich foods list',
  'probiotics benefits explained', 'how to improve posture',
  'allergy season tips', 'meditation for beginners guide',
  'stretches for desk workers', 'cold vs flu symptoms difference',
  'healthy snack ideas', 'signs of dehydration',
  // Finance
  'how to start investing for beginners', 'roth ira vs traditional ira',
  'best high yield savings accounts 2025', 'how to build credit score fast',
  'budgeting methods comparison', '401k contribution limits 2025',
  'index fund investing strategy', 'tax deductions commonly missed',
  'emergency fund how much to save', 'refinance mortgage when worth it',
  'cryptocurrency for beginners', 'student loan repayment strategies',
  'side hustle ideas 2025', 'how compound interest works',
  'estate planning basics', 'health insurance marketplace options',
  // Entertainment
  'best movies on netflix right now', 'top rated tv shows 2025',
  'video game recommendations PC', 'best podcasts true crime',
  'new book releases this month', 'board games for adults',
  'best albums 2025', 'movie theater showtimes near me',
  'upcoming video game releases', 'best documentaries streaming',
  'indie music recommendations', 'book club suggestions fiction',
  'best comedy specials streaming', 'classic films must watch list',
  // Education & learning
  'how does the stock market work', 'history of the roman empire',
  'quantum computing explained simply', 'how do vaccines work',
  'climate change causes and effects', 'how to learn a new language fast',
  'world war 2 timeline events', 'how does electricity work',
  'evolution explained for beginners', 'how the internet works explained',
  'philosophy introduction books', 'astronomy for beginners',
  'how to write a research paper', 'critical thinking skills',
  'statistics basics tutorial', 'geology interesting facts',
  // Automotive
  'best electric cars 2025', 'how to change a tire step by step',
  'oil change how often', 'car maintenance schedule by mileage',
  'EV charging stations near me', 'tesla vs rivian comparison',
  'used car buying checklist', 'best family SUV 2025',
  'hybrid vs plug in hybrid difference', 'car insurance comparison tips',
  'how to jump start a car', 'best dash cam review',
  'tire pressure monitoring system', 'ceramic coating worth it',
  // Travel
  'best travel destinations 2025', 'packing list international travel',
  'cheapest flights search tips', 'best travel credit cards',
  'national parks to visit', 'travel insurance worth it',
  'japan travel itinerary 2 weeks', 'europe train travel tips',
  'best beach vacations affordable', 'road trip planning app',
  'how to avoid jet lag', 'passport renewal process',
  // Misc natural queries
  'why is the sky blue', 'how tall is mount everest',
  'what time is it in tokyo', 'how to tie a tie',
  'who won the game last night', 'weather this weekend',
  'best restaurants downtown', 'how to remove a stain',
  'convert celsius to fahrenheit', 'how to write a resume',
  'dog breeds for apartments', 'cat behavior explained',
  'best coffee beans whole bean', 'how to sharpen kitchen knives',
  'what to watch tonight', 'diy gift ideas birthday',
];


// ─── Default Configuration ──────────────────────────────────────────────────────

// Task type weights — controls the probability of each noise task type.
// These are relative weights (don't need to sum to 100). Users can adjust
// these in the Settings tab using the task mix sliders.
const DEFAULT_TASK_WEIGHTS = { search: 45, browse: 40, ad_click: 15 };

// How long (in ms) to keep a noise tab open before closing it.
// Each task type has a [min, max] range — actual delay is randomized within.
// This simulates how long a real person might spend on each type of page.
const DELAY_RANGES = {
  search:   [5000,  15000],  // 5–15 seconds on search results
  browse:   [8000,  25000],  // 8–25 seconds browsing a page
  ad_click: [6000,  12000],  // 6–12 seconds on ad-heavy sites
};

// Poisson intensity levels — lambda is the average number of tasks per MINUTE.
// Higher lambda = more frequent noise. The Poisson process uses exponential
// inter-arrival times to make timing look natural/random rather than periodic.
const INTENSITY_LEVELS = {
  low:      { lambda: 0.3,  label: 'Low (~18/hr)' },    // ~one task every 3.3 minutes
  medium:   { lambda: 1.0,  label: 'Med (~60/hr)' },    // ~one task per minute
  high:     { lambda: 2.5,  label: 'High (~150/hr)' },   // ~one task every 24 seconds
  paranoid: { lambda: 5.0,  label: 'Max (~300/hr)' },    // ~one task every 12 seconds
};

// Maximum number of log entries to keep in storage. Oldest entries are dropped
// when this limit is reached. Each entry is ~200 bytes, so 500 entries ≈ 100KB.
const LOG_BUFFER_SIZE = 500;

// Name of the Chrome alarm that fires every minute to trigger task execution.
const ALARM_NAME = 'poisson-tick';

// When we can't determine actual page size from HTTP headers, assume this many
// bytes per page load. This is a conservative estimate for bandwidth tracking.
const BYTES_PER_PAGE_FALLBACK = 512000; // 500KB


// ─── Runtime State ──────────────────────────────────────────────────────────────
// These variables live in memory only — they're reset if the service worker
// restarts. Persistent state (running, stats, logs) is in chrome.storage.local.

let running = false;              // Is the noise engine currently active?
let pendingTasks = [];            // Tasks queued for the current alarm period
let noiseTabIds = new Set();      // Tab IDs of currently-open noise tabs (used to filter webRequest)
let sessionBandwidth = 0;         // Bytes generated this session (since last Start)

// ─── Service Worker Wake-Up Guard ────────────────────────────────────────────
// Chrome MV3 terminates the service worker after ~30 seconds of inactivity.
// When it restarts, all in-memory state is lost (running=false, pendingTasks=[]).
// This guard restores the `running` flag from chrome.storage.local and re-creates
// the alarm + first task batch if the engine was supposed to be running.
// Every handler that depends on `running` must await this before proceeding.

let _initPromise = null;

async function ensureInitialized() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const { running: wasRunning } = await chrome.storage.local.get('running');
    if (wasRunning && !running) {
      running = true;
      // Re-create the alarm if it was lost during service worker restart
      const existingAlarm = await chrome.alarms.get(ALARM_NAME);
      if (!existingAlarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
      }
      // Generate tasks so the next alarm tick has something to dispatch
      if (pendingTasks.length === 0) {
        await scheduleTasks();
      }
    }
  })();
  return _initPromise;
}


// ─── Utility Functions ──────────────────────────────────────────────────────────

// Random integer in [min, max] inclusive
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Sample from an exponential distribution with rate parameter `lambda`.
// Used to generate Poisson-process inter-arrival times.
// Returns a random value in (0, +inf) with mean = 1/lambda.
function exponentialRandom(lambda) {
  // Inverse CDF method: if U ~ Uniform(0,1), then -ln(1-U)/lambda ~ Exp(lambda)
  return -Math.log(1 - Math.random()) / lambda;
}

// Pick a random item from an array of objects, weighted by each item's `weight` property.
// Higher weight = more likely to be chosen. Used for engine selection.
function weightedRandom(items, weightKey = 'weight') {
  const totalWeight = items.reduce((sum, item) => sum + item[weightKey], 0);
  let r = Math.random() * totalWeight;
  for (const item of items) {
    r -= item[weightKey];
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// Pick a uniformly random element from an array.
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Safety check: only allow http: and https: URLs. Prevents opening
// javascript:, data:, file:, chrome:, or other potentially dangerous schemes.
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Format a byte count as a human-readable string (B, KB, MB, GB).
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

// "2025-02-08" — used as a key for daily stats and bandwidth tracking.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// "2025-02-08T14" — used as a key for hourly bandwidth tracking.
function currentHourKey() {
  return new Date().toISOString().slice(0, 13);
}


// ─── Logging System ─────────────────────────────────────────────────────────────
// All significant events are logged so users can see exactly what the extension
// is doing. Logs are stored as a ring buffer in chrome.storage.local.
//
// Log entry types:
//   "search"    — searched for a term on a search engine
//   "browse"    — opened a website
//   "ad_click"  — visited an ad-heavy site
//   "system"    — engine start/stop, settings changes, errors, scheduling info
//
// Every log entry includes a timestamp so the user can correlate events
// with their own browsing activity and verify the extension's behavior.

async function addLog(entry) {
  const { logs } = await chrome.storage.local.get('logs');
  const arr = logs || [];

  // Add to the front (newest first) for display in the popup
  arr.unshift(entry);

  // Trim to ring buffer size — oldest entries are silently dropped
  if (arr.length > LOG_BUFFER_SIZE) arr.length = LOG_BUFFER_SIZE;

  await chrome.storage.local.set({ logs: arr });
}

// Convenience: log a system-level event (not a noise task).
// These show up in the log as "system" type entries so users can see
// when the engine was started/stopped, when settings changed, errors, etc.
async function logSystem(message) {
  await addLog({
    timestamp: Date.now(),
    type: 'system',
    message,
    url: null,
    engine: null,
    query: null,
    duration_ms: null,
    interactions: null,
    bytes_estimated: 0,
    status: 'info',
  });
}

async function clearLogs() {
  await chrome.storage.local.set({ logs: [] });
  await logSystem('Logs cleared by user');
}


// ─── Storage Helpers ────────────────────────────────────────────────────────────
// All persistent data lives in chrome.storage.local. This is a key-value store
// that survives browser restarts, extension updates, and service worker restarts.
// Data stored: running state, intensity level, engine/category/weight settings,
// stats counters, log entries, and bandwidth history.
// NOTHING is ever sent to any server — all data stays on your machine.

async function loadState() {
  const data = await chrome.storage.local.get([
    'running', 'intensity', 'engineSettings', 'taskWeights',
    'categorySettings', 'stats', 'logs', 'bandwidthHourly',
    'bandwidthDaily', 'sessionStart',
  ]);
  return data;
}

async function saveRunning(val) {
  running = val;
  await chrome.storage.local.set({ running: val });
}

async function getIntensity() {
  const { intensity } = await chrome.storage.local.get('intensity');
  return intensity || 'medium';
}

// Returns engine settings — which engines are enabled and their weights.
// Falls back to defaults (all enabled with standard weights) if no settings saved.
async function getEngineSettings() {
  const { engineSettings } = await chrome.storage.local.get('engineSettings');
  if (engineSettings) return engineSettings;

  // Default: all engines enabled with their built-in weights
  const defaults = {};
  for (const e of SEARCH_ENGINES) {
    defaults[e.id] = { enabled: true, weight: e.weight };
  }
  return defaults;
}

async function getTaskWeights() {
  const { taskWeights } = await chrome.storage.local.get('taskWeights');
  return taskWeights || { ...DEFAULT_TASK_WEIGHTS };
}

// Returns which site categories are enabled. Defaults to all enabled.
async function getCategorySettings() {
  const { categorySettings } = await chrome.storage.local.get('categorySettings');
  if (categorySettings) return categorySettings;

  const defaults = {};
  for (const cat of Object.keys(SITE_CATEGORIES)) {
    defaults[cat] = true;
  }
  return defaults;
}

// ─── Stats Tracking ─────────────────────────────────────────────────────────────
// Simple counters for display in the popup. Daily counters reset automatically
// when the date changes. "daysActive" tracks unique days the engine has run.

async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return stats || {
    today: todayKey(),
    searches: 0,
    browses: 0,
    adClicks: 0,
    totalActions: 0,
    daysActive: [],
  };
}

async function saveStats(stats) {
  const today = todayKey();

  // Auto-reset daily counters when the date rolls over
  if (stats.today !== today) {
    stats.today = today;
    stats.searches = 0;
    stats.browses = 0;
    stats.adClicks = 0;
  }

  // Ensure daysActive is an array (handles legacy Set format)
  const toSave = { ...stats };
  if (toSave.daysActive instanceof Set) {
    toSave.daysActive = [...toSave.daysActive];
  }
  if (!Array.isArray(toSave.daysActive)) {
    toSave.daysActive = [];
  }

  // Track today as an active day
  if (!toSave.daysActive.includes(today)) {
    toSave.daysActive.push(today);
  }

  await chrome.storage.local.set({ stats: toSave });
}


// ─── Bandwidth Tracking ─────────────────────────────────────────────────────────
// Tracks estimated data usage from noise tabs only. Stored as:
//   - hourly totals (last 24 hours) — used for the sparkline chart
//   - daily totals (last 30 days)
//   - session total (in-memory, resets on engine restart)
//
// Bandwidth is estimated from HTTP Content-Length headers when available,
// with a 500KB fallback per page when headers are missing. This is a rough
// estimate — actual data may be higher due to sub-resources, or lower if
// pages are cached. It's meant to give you a general sense of data volume.

async function trackBandwidth(bytes) {
  sessionBandwidth += bytes;

  const hourKey = currentHourKey();
  const dayKey = todayKey();

  const { bandwidthHourly, bandwidthDaily } = await chrome.storage.local.get([
    'bandwidthHourly', 'bandwidthDaily',
  ]);

  // Rolling hourly window — keep the most recent 24 data points
  const hourly = bandwidthHourly || {};
  hourly[hourKey] = (hourly[hourKey] || 0) + bytes;
  const hourKeys = Object.keys(hourly).sort();
  while (hourKeys.length > 24) {
    delete hourly[hourKeys.shift()];
  }

  // Rolling daily window — keep the most recent 30 days
  const daily = bandwidthDaily || {};
  daily[dayKey] = (daily[dayKey] || 0) + bytes;
  const dayKeys = Object.keys(daily).sort();
  while (dayKeys.length > 30) {
    delete daily[dayKeys.shift()];
  }

  await chrome.storage.local.set({ bandwidthHourly: hourly, bandwidthDaily: daily });
}


// ─── Task Generation ────────────────────────────────────────────────────────────
// Generates individual noise tasks. Each task specifies: what type (search,
// browse, or ad_click), which URL to open, and how long to keep it open.

// Pick a random task type using the configured weights.
// Higher weight = higher probability of that type being chosen.
async function pickTaskType() {
  const weights = await getTaskWeights();
  const total = weights.search + weights.browse + weights.ad_click;
  const r = Math.random() * total;

  if (r < weights.search) return 'search';
  if (r < weights.search + weights.browse) return 'browse';
  return 'ad_click';
}

// Get the list of browse sites filtered by the user's enabled categories.
async function getEnabledSites() {
  const cats = await getCategorySettings();
  const sites = [];

  for (const [cat, range] of Object.entries(SITE_CATEGORIES)) {
    if (cats[cat]) {
      sites.push(...BROWSE_SITES.slice(range.start, range.end));
    }
  }

  // Fallback: if the user somehow disabled ALL categories, use the full list
  // rather than generating zero noise.
  return sites.length > 0 ? sites : BROWSE_SITES;
}

// Generate a single noise task with all details needed to execute it.
async function generateTask() {
  const type = await pickTaskType();

  if (type === 'search') {
    const engineSettings = await getEngineSettings();
    const enabledEngines = SEARCH_ENGINES.filter(e => engineSettings[e.id]?.enabled);

    // If no search engines are enabled, fall back to a browse task
    if (enabledEngines.length === 0) {
      const sites = await getEnabledSites();
      const url = pickRandom(sites);
      return { type: 'browse', url, delay: randomInt(...DELAY_RANGES.browse) };
    }

    // Apply user-configured weights to enabled engines
    const enginesWithWeights = enabledEngines.map(e => ({
      ...e, weight: engineSettings[e.id]?.weight ?? e.weight,
    }));

    // Pick a random engine and search term
    const engine = weightedRandom(enginesWithWeights);
    const query = pickRandom(SEARCH_TERMS);
    const url = engine.url.replace('{query}', encodeURIComponent(query));

    return {
      type: 'search',
      url,
      engine: engine.name,
      query,
      delay: randomInt(...DELAY_RANGES.search),
    };
  }

  if (type === 'browse') {
    const sites = await getEnabledSites();
    const url = pickRandom(sites);
    return { type: 'browse', url, delay: randomInt(...DELAY_RANGES.browse) };
  }

  // ad_click — pick a random ad-heavy site
  const url = pickRandom(AD_SITES);
  return { type: 'ad_click', url, delay: randomInt(...DELAY_RANGES.ad_click) };
}


// ─── Task Execution ─────────────────────────────────────────────────────────────
// Opens a noise tab, injects the interaction script, waits for it to finish,
// then closes the tab and logs the result.
//
// SECURITY NOTES:
// - Tabs are opened with `active: false` so they don't steal focus from the user
// - Only http/https URLs are allowed (validated by isValidUrl)
// - The tab is ALWAYS closed afterward, even if errors occur
// - We track which tab IDs are ours (noiseTabIds) so bandwidth tracking only
//   counts traffic from noise tabs, never from the user's real tabs

async function executeTask(task) {
  // Don't execute if engine was stopped while this task was queued
  if (!running) return;

  // Safety: validate the URL before opening it
  if (!isValidUrl(task.url)) {
    await logSystem(`Skipped invalid URL: ${task.url}`);
    return;
  }

  const startTime = Date.now();
  let tab;

  // Step 1: Open a new background tab to the target URL
  try {
    tab = await chrome.tabs.create({ url: task.url, active: false });
    noiseTabIds.add(tab.id);
  } catch (err) {
    // Tab creation failed — log it and move on. This can happen if Chrome
    // is low on resources or the URL was rejected by Chrome.
    await addLog({
      timestamp: Date.now(),
      type: task.type,
      url: task.url,
      engine: task.engine || null,
      query: task.query || null,
      duration_ms: Date.now() - startTime,
      interactions: { scrolls: 0, clicks: 0 },
      bytes_estimated: 0,
      status: 'tab_failed',
      message: `Failed to open tab: ${err.message}`,
    });
    return;
  }

  // Step 2: Wait for page load, inject interaction script, wait for completion
  return new Promise((resolve) => {
    // Safety timeout — if the page hangs or the content script never responds,
    // we still clean up the tab. Set to delay + 10s buffer.
    const timeout = setTimeout(() => {
      cleanup('timeout');
    }, task.delay + 10000);

    // Cleanup function — closes tab, logs the result, updates stats.
    // Called on success, timeout, or error.
    async function cleanup(status, interactions) {
      clearTimeout(timeout);
      noiseTabIds.delete(tab.id);

      const duration = Date.now() - startTime;
      const bytes = interactions?.bytes_estimated || BYTES_PER_PAGE_FALLBACK;

      // Always close the tab — ignore errors (tab may already be closed)
      try { await chrome.tabs.remove(tab.id); } catch {}

      // Track bandwidth for this page load
      await trackBandwidth(bytes);

      // Update daily and all-time stats
      const stats = await getStats();
      if (task.type === 'search') stats.searches++;
      else if (task.type === 'browse') stats.browses++;
      else stats.adClicks++;
      stats.totalActions = (stats.totalActions || 0) + 1;
      await saveStats(stats);

      // Build a descriptive message for the log entry
      let message;
      if (task.type === 'search') {
        message = `Searched "${task.query}" on ${task.engine}`;
      } else if (task.type === 'ad_click') {
        message = `Visited ad-heavy site`;
      } else {
        message = `Browsed page`;
      }

      if (status === 'timeout') {
        message += ' (timed out)';
      } else if (status === 'tab_failed') {
        message += ' (tab failed)';
      }

      if (interactions) {
        const parts = [];
        if (interactions.scrolls) parts.push(`${interactions.scrolls} scrolls`);
        if (interactions.clicks) parts.push(`${interactions.clicks} clicks`);
        if (parts.length) message += ` — ${parts.join(', ')}`;
      }

      // Write the log entry
      await addLog({
        timestamp: Date.now(),
        type: task.type,
        url: task.url,
        engine: task.engine || null,
        query: task.query || null,
        duration_ms: duration,
        interactions: interactions || { scrolls: 0, clicks: 0 },
        bytes_estimated: bytes,
        status: status || 'success',
        message,
      });

      resolve();
    }

    // Listen for the tab to finish loading its initial page
    function onUpdated(tabId, changeInfo) {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);

      // Inject the interaction script (interact.js) into the loaded page.
      // This script will scroll, hover, and maybe click links to simulate
      // realistic human behavior. See interact.js for full details.
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['interact.js'],
      }).then(() => {
        // Tell the injected script to start interacting, passing the
        // task type and how long it has to work.
        chrome.tabs.sendMessage(tab.id, {
          action: 'interact',
          delay: task.delay,
          type: task.type,
        }).catch(() => {
          // Content script may not be ready yet — retry once after 500ms.
          // This is a timing issue where executeScript resolves but the
          // script hasn't fully initialized its message listener yet.
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'interact',
              delay: task.delay,
              type: task.type,
            }).catch(() => cleanup('timeout'));
          }, 500);
        });
      }).catch(() => {
        // Script injection failed — this happens on restricted pages like
        // chrome:// URLs, the Chrome Web Store, or pages with strict CSP.
        // We still count it as a visit (the page loaded and generated
        // network traffic), just without interaction simulation.
        setTimeout(() => {
          cleanup('success', { scrolls: 0, clicks: 0, bytes_estimated: BYTES_PER_PAGE_FALLBACK });
        }, task.delay);
      });
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Listen for the "I'm done" message from interact.js.
    // The content script sends this after completing its interaction sequence.
    function onMessage(message, sender) {
      if (sender.tab?.id !== tab.id) return;
      if (message.action === 'interaction-complete') {
        chrome.runtime.onMessage.removeListener(onMessage);
        cleanup('success', message.data);
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
  });
}


// ─── Poisson Scheduling ─────────────────────────────────────────────────────────
// Generates a batch of tasks for the next 60-second alarm period using
// Poisson-process timing.
//
// How it works:
// 1. The alarm fires every 60 seconds
// 2. We generate exponential random inter-arrival times that sum to ~60s
// 3. Each arrival becomes a task, scheduled at its cumulative offset
// 4. When the alarm fires, we dispatch each task at its scheduled time
//
// This means at "medium" intensity (lambda=1.0/min), we get ~1 task per
// minute on average, but the exact timing is random — sometimes 2 tasks
// close together, sometimes a longer gap. This randomness is the whole point.

async function scheduleTasks() {
  if (!running) return;

  const intensity = await getIntensity();
  const { lambda } = INTENSITY_LEVELS[intensity] || INTENSITY_LEVELS.medium;

  // Generate tasks with Poisson inter-arrival times for the next 60 seconds.
  // lambda is tasks/minute, so we use lambda/60 for tasks/second.
  pendingTasks = [];
  let elapsed = 0;

  while (elapsed < 60) {
    const gap = exponentialRandom(lambda / 60);
    elapsed += gap;

    if (elapsed < 60) {
      const task = await generateTask();
      task._executeAt = elapsed; // seconds from now when this task should fire
      pendingTasks.push(task);
    }
  }

  // Log how many tasks are queued for this period
  if (pendingTasks.length > 0) {
    await logSystem(
      `Scheduled ${pendingTasks.length} task${pendingTasks.length === 1 ? '' : 's'} ` +
      `for the next 60s (intensity: ${intensity}, lambda: ${lambda}/min)`
    );
  }
}

// Called every 60 seconds by the Chrome alarm.
async function onAlarm(alarm) {
  if (alarm.name !== ALARM_NAME) return;
  await ensureInitialized();
  if (!running) return;

  // Grab the tasks generated during the previous scheduling pass
  const tasks = [...pendingTasks];
  pendingTasks = [];

  // Generate the NEXT batch of tasks (so they're ready when the next alarm fires)
  scheduleTasks();

  // Dispatch each task at its scheduled time offset within this 60-second window.
  // setTimeout is fine here — the service worker stays alive while tasks are pending.
  for (const task of tasks) {
    const delayMs = (task._executeAt || 0) * 1000;
    setTimeout(() => executeTask(task), delayMs);
  }
}


// ─── Bandwidth Tracking via webRequest ──────────────────────────────────────────
// Listens to HTTP response headers from our noise tabs ONLY (filtered by tab ID)
// to get actual Content-Length values for more accurate bandwidth estimates.
//
// IMPORTANT: This listener only fires for tabs in the noiseTabIds set — it does
// NOT see any traffic from the user's real browsing tabs. The <all_urls> filter
// is required by the Chrome API to intercept requests, but we immediately return
// if the tab ID isn't one of ours.

chrome.webRequest.onCompleted.addListener(
  (details) => {
    // ONLY process requests from our noise tabs — skip everything else
    if (!noiseTabIds.has(details.tabId)) return;

    // Look for Content-Length header to get actual response size
    const contentLength = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-length'
    );
    const bytes = contentLength ? parseInt(contentLength.value, 10) : 0;

    if (bytes > 0) {
      trackBandwidth(bytes);
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);


// ─── Engine Start / Stop ────────────────────────────────────────────────────────
// These are the only two functions that change the running state.

async function startEngine() {
  _initPromise = null; // Reset init guard so future wake-ups re-read storage
  await saveRunning(true);
  sessionBandwidth = 0;
  await chrome.storage.local.set({ sessionStart: Date.now() });

  const intensity = await getIntensity();
  await logSystem(
    `Engine started — intensity: ${intensity}, ` +
    `target rate: ${INTENSITY_LEVELS[intensity]?.label || '?'}`
  );

  // Generate the first batch of tasks immediately
  await scheduleTasks();

  // Set up recurring alarm to fire every minute for ongoing scheduling.
  // Chrome guarantees minimum period of 1 minute for alarms.
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

async function stopEngine() {
  _initPromise = null; // Reset init guard so future wake-ups re-read storage
  const taskCount = noiseTabIds.size;
  await saveRunning(false);
  chrome.alarms.clear(ALARM_NAME);
  pendingTasks = [];

  // Close any noise tabs that are still open
  for (const tabId of noiseTabIds) {
    try { await chrome.tabs.remove(tabId); } catch {}
  }
  noiseTabIds.clear();

  await logSystem(
    `Engine stopped — closed ${taskCount} active noise tab${taskCount === 1 ? '' : 's'}, ` +
    `session bandwidth: ${formatBytes(sessionBandwidth)}`
  );
}


// ─── Message Handlers ───────────────────────────────────────────────────────────
// Handles messages from the popup UI (popup.js). The popup sends commands like
// "start", "stop", "get-status" etc. and we respond with the requested data.
// This is the ONLY communication channel — no external network calls.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ensureInitialized();
    switch (message.action) {

      // ── Engine controls ──
      case 'start': {
        await startEngine();
        sendResponse({ ok: true });
        break;
      }
      case 'stop': {
        await stopEngine();
        sendResponse({ ok: true });
        break;
      }

      // ── Settings updates ──
      // All settings are saved to chrome.storage.local so they persist.
      case 'set-intensity': {
        const oldIntensity = await getIntensity();
        await chrome.storage.local.set({ intensity: message.value });
        await logSystem(`Intensity changed: ${oldIntensity} -> ${message.value}`);
        // Regenerate scheduled tasks with the new intensity
        if (running) await scheduleTasks();
        sendResponse({ ok: true });
        break;
      }
      case 'set-engines': {
        await chrome.storage.local.set({ engineSettings: message.value });
        const enabled = Object.entries(message.value)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k);
        await logSystem(`Search engines updated: ${enabled.join(', ') || 'none'}`);
        sendResponse({ ok: true });
        break;
      }
      case 'set-task-weights': {
        await chrome.storage.local.set({ taskWeights: message.value });
        const w = message.value;
        await logSystem(`Task mix updated: search=${w.search}, browse=${w.browse}, ad=${w.ad_click}`);
        sendResponse({ ok: true });
        break;
      }
      case 'set-categories': {
        await chrome.storage.local.set({ categorySettings: message.value });
        const enabled = Object.entries(message.value)
          .filter(([, v]) => v)
          .map(([k]) => k);
        await logSystem(`Site categories updated: ${enabled.join(', ')}`);
        sendResponse({ ok: true });
        break;
      }

      // ── Data queries (read-only) ──
      case 'get-status': {
        const state = await loadState();
        const stats = await getStats();
        sendResponse({
          running,
          intensity: state.intensity || 'medium',
          stats,
          sessionBandwidth,
          sessionStart: state.sessionStart || null,
        });
        break;
      }
      case 'get-logs': {
        const { logs } = await chrome.storage.local.get('logs');
        sendResponse({ logs: logs || [] });
        break;
      }
      case 'get-bandwidth': {
        const { bandwidthHourly, bandwidthDaily } = await chrome.storage.local.get([
          'bandwidthHourly', 'bandwidthDaily',
        ]);
        sendResponse({
          hourly: bandwidthHourly || {},
          daily: bandwidthDaily || {},
          session: sessionBandwidth,
        });
        break;
      }
      case 'get-settings': {
        const engines = await getEngineSettings();
        const weights = await getTaskWeights();
        const categories = await getCategorySettings();
        sendResponse({ engines, taskWeights: weights, categories });
        break;
      }

      // ── Log management ──
      case 'clear-logs': {
        await clearLogs();
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: 'unknown action' });
    }
  })();

  // Return true to keep the message channel open for the async response.
  // Without this, Chrome would close the channel before our async handler finishes.
  return true;
});


// ─── Lifecycle Events ───────────────────────────────────────────────────────────
// These ensure the engine resumes after browser restarts or extension updates.
// The "running" flag is persisted in chrome.storage.local, so if the user had
// the engine on when Chrome closed, it picks back up automatically.

chrome.runtime.onInstalled.addListener(async (details) => {
  const { running: wasRunning } = await chrome.storage.local.get('running');

  if (details.reason === 'install') {
    await logSystem('Extension installed — welcome to Poisson!');
  } else if (details.reason === 'update') {
    await logSystem(`Extension updated to v${chrome.runtime.getManifest().version}`);
  }

  if (wasRunning) {
    await logSystem('Resuming engine after install/update event');
    await startEngine();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const { running: wasRunning } = await chrome.storage.local.get('running');
  if (wasRunning) {
    await logSystem('Resuming engine after browser startup');
    await startEngine();
  }
});

// Wire up the alarm handler for recurring scheduling
chrome.alarms.onAlarm.addListener(onAlarm);
