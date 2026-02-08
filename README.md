# Poisson — Browsing Noise Generator

A Chrome extension that pollutes your browsing profile with realistic decoy traffic, making it harder for anyone watching your network — ISPs, data brokers, government surveillance programs, or ad-tech companies — to build an accurate picture of who you are and what you care about.

## Why This Exists

Your browsing history is not private. It never has been.

**Your ISP sees everything.** Every domain you visit, every search you make, every page you load — your internet provider logs it. In the US, ISPs can [legally sell your browsing data](https://www.eff.org/deeplinks/2017/03/five-creepy-things-your-isp-could-do-if-congress-repeals-fccs-privacy-protections) to advertisers and data brokers. They don't need your permission.

**Data brokers build profiles on you.** Companies like Acxiom, Oracle Data Cloud, and LexisNexis aggregate your browsing patterns with purchase history, location data, and public records to build detailed profiles — your political views, health concerns, financial situation, relationships — and sell them to anyone willing to pay. There are [virtually no federal regulations](https://www.eff.org/issues/data-brokers) stopping them.

**Government surveillance is pervasive.** Programs like the NSA's [XKEYSCORE](https://en.wikipedia.org/wiki/XKeyscore) can search and analyze your internet activity in real time. Section 702 of FISA allows warrantless collection of communications. The [FBI has purchased](https://www.brennancenter.org/our-work/analysis-opinion/federal-agencies-are-secretly-buying-consumer-data) commercial location and browsing data rather than obtaining warrants. Even if you have nothing to hide, mass surveillance creates chilling effects on free expression and political dissent.

**Ad-tech tracks you across the web.** Google, Meta, and thousands of smaller companies use cookies, fingerprinting, and tracking pixels to follow you from site to site. Your browsing profile determines what ads you see, what prices you're shown, and increasingly, what [credit and insurance decisions](https://themarkup.org/allstates-algorithm/2020/02/25/car-insurance-suckers-list) are made about you.

**VPNs don't solve this.** A VPN hides your IP address, but your ISP still sees you connecting to the VPN, the VPN provider sees all your traffic instead, and tracking pixels and browser fingerprinting work regardless of your IP. VPNs shift trust — they don't eliminate surveillance.

### How Noise Helps

Poisson takes a different approach: **signal dilution**. Instead of trying to hide your traffic (which is increasingly difficult), it buries your real browsing in a flood of realistic decoy activity. If you visit 50 pages today and Poisson visits 500 more on your behalf — across news, shopping, health, finance, social media, and dozens of other categories — anyone analyzing your traffic sees noise, not signal.

This is the same principle behind [chaff](<https://en.wikipedia.org/wiki/Chaff_(countermeasure)>) in radar countermeasures and [differential privacy](https://en.wikipedia.org/wiki/Differential_privacy) in data science: adding noise makes it statistically harder to extract meaningful patterns.

Poisson generates traffic that looks human — it uses randomized Poisson-process timing (not mechanical intervals), scrolls pages, hovers over elements, clicks links, and varies its patterns — so the noise is not trivially distinguishable from real browsing at the network level.

## What It Does

- Opens random websites in background tabs across 12 categories (news, tech, shopping, health, finance, etc.)
- Performs realistic searches on Google, DuckDuckGo, Bing, and Yahoo with natural-sounding queries
- Simulates human behavior in each tab: scrolling, hovering, clicking links, pausing to "read"
- Uses Poisson-process scheduling so timing looks natural, not robotic
- Tracks its own bandwidth usage so you can monitor data consumption
- Logs every action so you can see exactly what it's doing at all times
- Runs entirely locally — no accounts, no servers, no data sent anywhere

## What It Does NOT Do

- Does not read, store, or transmit any of your personal browsing data
- Does not access your cookies, passwords, history, or bookmarks
- Does not run in or modify your real browsing tabs
- Does not communicate with any external server
- Does not require an account or any personal information
- Does not phone home, collect telemetry, or track you in any way

The entire codebase is ~2,500 lines of commented JavaScript. Every URL it will ever visit is hardcoded in the source. You can read it all.

## Installation

Poisson is not on the Chrome Web Store. You install it manually by loading the source code directly. This takes about 60 seconds.

### Step 1: Download the Extension

**Option A — Clone with Git:**
```bash
git clone https://github.com/daring-designs/poisson-extension.git
```

**Option B — Download ZIP:**
Download and extract the repository to a folder on your computer (e.g., `~/poisson-extension`). Remember where you put it.

### Step 2: Open Chrome Extensions Page

1. Open Chrome
2. Type `chrome://extensions` in the address bar and press Enter
3. Enable **Developer mode** using the toggle in the top-right corner

### Step 3: Load the Extension

1. Click **"Load unpacked"** in the top-left
2. Navigate to the `poisson-extension` folder you downloaded
3. Select the folder (the one containing `manifest.json`) and click **Open**

The Poisson icon (a pufferfish) should appear in your browser toolbar. If it's hidden, click the puzzle piece icon in the toolbar and pin Poisson.

### Step 4: Start Generating Noise

1. Click the Poisson icon in the toolbar
2. Click **"Start Engine"**
3. That's it — background tabs will start opening and closing automatically

### Updating

If you pull or download a new version, go to `chrome://extensions` and click the reload button on the Poisson card, or just click **"Load unpacked"** again and select the same folder.

### Uninstalling

Go to `chrome://extensions`, find Poisson, and click **Remove**.

## Usage

### Status Tab
Shows daily stats (searches, page visits, ad clicks), all-time counters, and a bandwidth sparkline chart. The intensity selector controls how much noise is generated:

| Level | Rate | Description |
|-------|------|-------------|
| **Low** | ~18/hr | Light background noise. Minimal resource usage. |
| **Med** | ~60/hr | Moderate noise. Good default for daily use. |
| **High** | ~150/hr | Heavy noise. Noticeably more tabs opening/closing. |
| **Max** | ~300/hr | Maximum noise. Uses more bandwidth and CPU. |

### Log Tab
A live feed of every action the extension takes. Each entry shows the timestamp, task type, URL visited, duration, and what interactions were performed (scrolls, clicks). System events like engine start/stop and settings changes also appear here. You can see exactly what the extension is doing at all times.

### Settings Tab
- **Search Engines** — Enable/disable Google, DuckDuckGo, Bing, Yahoo and set their relative frequency
- **Task Mix** — Adjust the ratio of searches vs. page visits vs. ad-site visits
- **Site Categories** — Toggle entire categories of sites on or off (news, tech, shopping, social, health, finance, etc.)

## How It Works (Technical)

Poisson uses a [Poisson process](https://en.wikipedia.org/wiki/Poisson_point_process) to schedule noise tasks. Instead of opening a tab every N seconds (which is trivially detectable as non-human), it generates random inter-arrival times from an exponential distribution. This produces the same kind of irregular, bursty timing pattern that real human browsing exhibits.

Each task:
1. Opens a background tab (`active: false` — you won't see it steal focus)
2. Waits for the page to load
3. Injects a script that scrolls, hovers over elements, and sometimes clicks a link
4. Closes the tab after 5–25 seconds (randomized by task type)
5. Logs everything

Chrome's alarm API has a 1-minute minimum interval, so Poisson batches multiple tasks per alarm tick, dispatching them at their calculated Poisson offsets within each 60-second window.

All data (logs, stats, settings, bandwidth history) is stored locally in `chrome.storage.local`. Nothing is ever sent to any server.

## Privacy & Transparency

This extension is designed to be fully auditable:

- **Every URL is in the source code.** Open `background.js` and read the `BROWSE_SITES`, `AD_SITES`, and `SEARCH_ENGINES` arrays. Those are the only sites it will ever visit.
- **Every action is logged.** Open the Log tab to see a timestamped record of everything the extension has done.
- **No network calls except noise tabs.** The extension makes zero HTTP requests of its own — the only network activity comes from the tabs it opens to public websites.
- **No data collection.** No analytics, no telemetry, no crash reporting, no "anonymous" usage stats. Nothing leaves your machine.
- **The code is commented.** Every file has a header explaining what it does and what it explicitly does not do.

## Is This Legal?

**Yes.** Visiting publicly accessible websites is legal. That's all Poisson does.

There is no law against opening CNN, Amazon, or Wikipedia in a browser tab. There is no law against doing so automatically, or against doing it to obscure your browsing patterns. Poisson does not bypass any access controls, does not circumvent authentication, does not scrape or exfiltrate data, and does not violate the [Computer Fraud and Abuse Act (CFAA)](https://en.wikipedia.org/wiki/Computer_Fraud_and_Abuse_Act) — it simply loads public web pages in a standard browser, the same way you do every day.

Tools that generate cover traffic for privacy are well-established and legal:

- **[TrackMeNot](https://trackmenot.io/)** — A browser extension developed by researchers at NYU and elsewhere that has issued randomized search queries since 2006. It has been widely covered in academic privacy literature and is available on major browser extension stores.
- **[AdNauseam](https://adnauseam.io/)** — An extension that clicks every ad in the background to pollute ad-tech profiles. Developed by the same NYU research group. Google [banned it from the Chrome Web Store](https://www.bleepingcomputer.com/news/google/google-bans-adnauseam-from-chrome-the-ad-blocker-that-clicks-on-all-ads/) (which tells you it works), but the extension itself is legal.
- **Noise-generating proxies and cover traffic tools** have been discussed in academic privacy research for decades as a legitimate countermeasure to traffic analysis.

Poisson visits the same mainstream websites that billions of people visit daily. It does not hack anything, access anything restricted, or violate any terms of service that aren't already violated by every search engine crawler, link previewer, and browser prefetcher in existence.

**That said:** laws vary by jurisdiction, and this is not legal advice. If you live under an authoritarian regime that criminalizes privacy tools, use Poisson (and any privacy tool) with appropriate caution.

## Limitations

- **Does not defeat browser fingerprinting.** Poisson adds network-level noise but does not change your browser fingerprint. Use the [Tor Browser](https://www.torproject.org/) or [Mullvad Browser](https://mullvad.net/en/browser) for that.
- **Does not encrypt your traffic.** Your ISP can still see the domains Poisson visits (and distinguish them from your real traffic if they try hard enough). Combine with a trustworthy VPN for better protection.
- **Uses bandwidth and CPU.** Running at higher intensities will use noticeable bandwidth (estimated in the Status tab) and some CPU from the background tabs.
- **Some sites may not load well in background tabs.** Sites that require login, have aggressive bot detection, or use complex JavaScript may not fully render. Poisson handles this gracefully — it logs the timeout and moves on.
- **Not a complete privacy solution.** Poisson is one layer in a defense-in-depth approach. Combine it with a VPN, ad blocker (uBlock Origin), privacy-focused browser settings, and good operational security habits.

## License

MIT
