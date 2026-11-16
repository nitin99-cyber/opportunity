# Opportunity Radar — Personal Research & Internship Intelligence Engine

> **Personalized academic & research opportunity discovery engine for Indian Institutes of Technology (IITs), central government research laboratories, and scientists.**
> Built with Node.js, Express, SQLite, HTML5, CSS3, and browser JavaScript.

---

## Features & Implemented Roadmap

### 1. Discovery Infrastructure (PRD Phase 2 & FR-03)
- **Multi-Source Discovery Engine:** Query catalog targeting official IIT and Government laboratory pages, project assistant calls, and RSS feeds.
- **URL Deduplication:** Automatic duplicate rejection (`ON CONFLICT(url) DO NOTHING`).
- **Discovery Runs Tracking:** Audit trail recording queries, found URLs, and new URLs in `discovery_runs`.

### 2. Website Monitoring & Content Extraction (PRD Phase 3 & FR-02)
- **Safe Fetch & SSRF Protection:** Blocks private IP ranges (RFC1918, 127.0.0.1, AWS metadata `169.254.169.254`, IPv6 loopbacks), DNS validation, request timeouts, and max byte limits.
- **Change Detection:** SHA-256 content hashing in `source_snapshots`.
- **HTML & RSS Parsing:** Extracts notices, links, and publication dates.
- **Source Health Monitoring:** Records response times, HTTP statuses, and failure counters in `source_checks`.

### 3. Structured Extraction & Evidence Citations (PRD Phase 4 & FR-05)
- **Evidence-Backed Records:** Never guesses or fabricates deadlines or stipends.
- **Verbatim Snippets:** Field-level citations stored in `opportunity_evidence` for deadline, stipend, eligibility, and duration.
- **AI & Rule-Based Extractors:** Supports Gemini API (via `GEMINI_API_KEY`) with robust rule-based heuristic fallback.

### 4. Verification Engine (PRD Phase 5 & FR-06)
- **Two-Tier Independence:**
  - *Application status:* `OPEN`, `UPCOMING`, `CLOSED`, `PAUSED`.
  - *Verification status:* `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `STALE`, `CONFLICTED`.
- **Authoritative Whitelist:** Automatic domain verification against all 23 IITs (`.ac.in`) and Government research bodies (`drdo.gov.in`, `isro.gov.in`, `csir.res.in`, `cdac.in`, etc.).
- **Stale Detection:** Automatically flags passed deadlines as `CLOSED` and `STALE`.

### 5. Researcher & Laboratory Discovery (PRD Phase 6 & FR-04)
- **Faculty Profiles:** Tracks professors, associate professors, scientists, and principal investigators.
- **Recruitment Signal Classification:** `CONFIRMED_OPEN`, `POTENTIAL_OPENING`, `RESEARCH_LEAD`, `CLOSED`.
- **Evidence Storage:** Preserves verbatim recruitment announcements and laboratory links.

### 6. Personalized Eligibility & Scoring Engine (PRD Phase 7 & FR-07, FR-08)
- **Candidate Profile:** Configured for undergraduate research (Default: B.Tech CSE MMMUT 2029).
- **Eligibility Engine:** Evaluates degree, branch, year of study, and CGPA cutoffs (`ELIGIBLE`, `POSSIBLY_ELIGIBLE`, `INELIGIBLE`, `INSUFFICIENT_INFORMATION`).
- **Relevance Score (0–100):** Weighted 6-factor algorithm:
  - Research-interest relevance: 30%
  - Skill alignment: 25%
  - Academic suitability: 15%
  - Institutional authority & evidence: 10%
  - Funding preference: 10%
  - Recency & active deadline: 10%
- **Explainable Breakdown:** Detailed breakdown for every scored opportunity.

### 7. User Experience (PRD Section 10 — 10 Primary Sections)
1. **Overview (Dashboard):** Summary metrics, personalized top recommendations, urgent deadlines, researcher signals.
2. **Opportunities:** Filter by category, funding, eligibility, verification, and sort by match score. Includes evidence inspector modal.
3. **Researcher Discovery:** Search by faculty name, lab, or research domain; filter by recruitment signal.
4. **Institutions Directory:** Directory of all 23 IITs and 12 Central Government Research Centers with stats.
5. **Source Registry:** Manage institutional sources, view health metrics, approve/reject/pause, and trigger safe checks on demand.
6. **Shortlist & Saved:** Quick access to saved target opportunities.
7. **Applications Pipeline:** Interactive Kanban pipeline (`Interested`, `Preparing`, `Applied`, `Interview`, `Accepted`, `Rejected`).
8. **Deadlines & Reminders:** Chronological closing dates and configurable alerts.
9. **My Profile:** Full candidate profile editor; updates immediately recalculate match scores.
10. **Discovery & Automation Hub:** Manual trigger controls, discovered URLs queue, and background job logs.

---

## Quickstart

### Prerequisites
- Node.js 20+ (supports Node 20, 22, 24, and 26).
- No external C++ compiler or native build tools required (seamlessly adapts between `node:sqlite` and `better-sqlite3`).

### Installation
```powershell
npm install
npm test
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

Development mode with auto-reload:
```powershell
npm run dev
```

---

## REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health & version check |
| `/api/dashboard` | GET | Stats, top matches, upcoming deadlines, researcher leads |
| `/api/opportunities` | GET, POST | Query, filter, sort, and add opportunities |
| `/api/opportunities/:id` | GET, PATCH, DELETE | View details, update saved/status, or delete |
| `/api/researchers` | GET, POST, PATCH | Search faculty, add researchers, update signals |
| `/api/organizations` | GET | Institutions directory with opportunities & researcher counts |
| `/api/sources` | GET, POST, PATCH | Source registry CRUD and approval workflow |
| `/api/sources/:id/check` | POST | Trigger safe fetch, content snapshot, and link discovery |
| `/api/discovery/stats` | GET | Discovery engine metrics |
| `/api/discovery/run` | POST | Execute search or RSS discovery sweep |
| `/api/applications` | GET, POST, PATCH, DELETE | Manage application pipeline stages, notes, and dates |
| `/api/reminders` | GET, POST | Active deadline alerts & custom reminders |
| `/api/reminders/:id/dismiss` | PATCH | Dismiss active reminder |
| `/api/profile` | GET, PUT | Candidate academic profile & matching preferences |
| `/api/jobs` | GET | Background automation execution logs |
| `/api/jobs/run` | POST | Trigger background job (`SOURCE_MONITOR`, `VERIFICATION`, etc.) |

---

## Testing & Security

Run the comprehensive test suite (15 unit & integration tests covering SSRF protection, database migrations, matching engine, verification rules, evidence extraction, and deduplication):

```powershell
npm test
```
