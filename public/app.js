const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

async function api(url, opt = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opt
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function showModal(html) {
  const container = $("#modal-container");
  container.innerHTML = html;
  container.classList.remove("hidden");
}

function closeModal() {
  const container = $("#modal-container");
  container.classList.add("hidden");
  container.innerHTML = "";
}

// Global quick actions in topbar
async function quickCheckSources() {
  try {
    toast("Running source verification...");
    const res = await api("/api/jobs/run", {
      method: "POST",
      body: JSON.stringify({ job_type: "VERIFICATION" })
    });
    toast(res.summary || "Verification complete");
    loadPage(currentPage);
  } catch (err) {
    toast(err.message);
  }
}

async function quickDiscoveryRun() {
  try {
    toast("Starting discovery run...");
    const res = await api("/api/discovery/run", {
      method: "POST",
      body: JSON.stringify({ run_type: "SEARCH" })
    });
    toast(`Discovery completed! Found ${res.urlsFound} targets (${res.newUrls} new)`);
    loadPage(currentPage);
  } catch (err) {
    toast(err.message);
  }
}

let currentPage = "dashboard";

function initNav() {
  $$(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      const pageName = btn.dataset.page;
      loadPage(pageName);
    };
  });
}

async function loadPage(name) {
  currentPage = name;
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === name));

  const headings = {
    dashboard: ["Overview", "INDIA · ALL 23 IITS & GOVERNMENT RESEARCH ORGS"],
    opportunities: ["Opportunities", "PERSONALIZED ACADEMIC & RESEARCH VACANCIES"],
    researchers: ["Researchers & Labs", "FACULTY PROFILES & RECRUITMENT LEADS"],
    institutions: ["Institutions Directory", "23 IITS & 12 CENTRAL GOVERNMENT RESEARCH CENTERS"],
    sources: ["Source Registry", "OFFICIAL INSTITUTIONAL PAGES & MONITORING WORKFLOW"],
    saved: ["Shortlist & Saved", "STARRED RESEARCH INTERNSHIPS"],
    applications: ["Applications Pipeline", "MANUAL APPLICATION TRACKING & DEADLINE STAGES"],
    deadlines: ["Deadlines & Reminders", "UPCOMING CRITICAL CLOSING DATES & ALERTS"],
    profile: ["Candidate Profile", "ACADEMIC BACKGROUND & MATCHING PREFERENCES"],
    discovery: ["Discovery & Automation", "SEARCH CRAWLER RUNS, RSS FEEDS & EXECUTION LOGS"]
  };

  if (headings[name]) {
    $("#heading").textContent = headings[name][0];
    $("#subheading").textContent = headings[name][1];
  }

  // Update sidebar profile snippet
  try {
    const prof = await api("/api/profile");
    if (prof) {
      $("#side-user-name").textContent = `${prof.degree} ${prof.branch.split(" ")[0]} '${String(prof.graduation_year).slice(-2)}`;
      $("#side-user-inst").textContent = `${prof.institution} · Year ${prof.current_year}`;
    }
  } catch {}

  const content = $("#content");

  if (name === "dashboard") renderDashboard(content);
  else if (name === "opportunities") renderOpportunities(content);
  else if (name === "researchers") renderResearchers(content);
  else if (name === "institutions") renderInstitutions(content);
  else if (name === "sources") renderSources(content);
  else if (name === "saved") renderSaved(content);
  else if (name === "applications") renderApplications(content);
  else if (name === "deadlines") renderDeadlines(content);
  else if (name === "profile") renderProfile(content);
  else if (name === "discovery") renderDiscovery(content);
}

// ==========================================
// 1. DASHBOARD VIEW
// ==========================================
async function renderDashboard(container) {
  container.innerHTML = `<div class="panel empty">Loading intelligence dashboard...</div>`;
  const d = await api("/api/dashboard");

  $("#nav-opps-badge").textContent = d.stats.opportunities;
  $("#nav-reminders-badge").textContent = d.stats.activeReminders;

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <span>Tracked Opportunities</span>
        <b>${d.stats.opportunities}</b>
        <small>Evidence-backed openings</small>
      </div>
      <div class="stat-box">
        <span>Saved / Shortlisted</span>
        <b>${d.stats.saved}</b>
        <small>Target positions</small>
      </div>
      <div class="stat-box">
        <span>Faculty & Scientists</span>
        <b>${d.stats.researchers}</b>
        <small>Research leads identified</small>
      </div>
      <div class="stat-box">
        <span>Active Applications</span>
        <b>${d.stats.applications}</b>
        <small>In tracking pipeline</small>
      </div>
      <div class="stat-box">
        <span>Monitored Sources</span>
        <b>${d.stats.sources}</b>
        <small>${d.stats.sourcesApproved} approved · ${d.stats.sourcesPending} pending</small>
      </div>
    </div>

    ${d.reminders && d.reminders.length > 0 ? `
      <div class="panel info" style="margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>⏰ Active Reminders & Deadline Alerts</strong>
          <button class="btn small" onclick="loadPage('deadlines')">View all (${d.reminders.length})</button>
        </div>
        <div style="margin-top: 10px; display:flex; flex-direction:column; gap:6px;">
          ${d.reminders.map(r => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#11151c; padding:8px 12px; border-radius:6px; font-size:12px;">
              <span><strong>${esc(r.title)}</strong> &middot; Due ${esc(r.due_date)}</span>
              <button class="btn small" onclick="dismissReminder(${r.id})">Dismiss</button>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}

    <div class="section-header">
      <h2>Top Recommended for Your Profile</h2>
      <button class="btn secondary" onclick="loadPage('opportunities')">View All Opportunities &rarr;</button>
    </div>
    <div class="card-list">
      ${d.topMatches.map(renderOpportunityCard).join("")}
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 28px;">
      <div>
        <div class="section-header">
          <h2>Upcoming Deadlines</h2>
          <button class="btn small" onclick="loadPage('deadlines')">Full Calendar</button>
        </div>
        <div class="card-list">
          ${d.upcomingDeadlines.length ? d.upcomingDeadlines.map(o => `
            <div class="card" style="padding:12px 14px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:13px; color:#fff;">${esc(o.title)}</strong>
                <span class="chip red">Due ${esc(o.deadline)}</span>
              </div>
              <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">${esc(o.organization)} &middot; ${esc(o.funding)}</p>
            </div>
          `).join("") : '<div class="panel empty" style="padding:24px;">No immediate closing deadlines.</div>'}
        </div>
      </div>

      <div>
        <div class="section-header">
          <h2>Key Researcher Signals</h2>
          <button class="btn small" onclick="loadPage('researchers')">Explore Researchers</button>
        </div>
        <div class="card-list">
          ${d.researcherLeads.map(r => `
            <div class="card" style="padding:12px 14px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:13px; color:#fff;">${esc(r.name)}</strong>
                <span class="chip ${r.signal_status === 'CONFIRMED_OPEN' ? 'green' : 'blue'}">${esc(r.signal_status)}</span>
              </div>
              <p style="font-size:12px; color:var(--text-secondary); margin:4px 0;">${esc(r.organization)} &middot; ${esc(r.department)}</p>
              <small style="color:var(--text-muted);">${esc(r.research_areas)}</small>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 2. OPPORTUNITIES VIEW
// ==========================================
async function renderOpportunities(container, filters = {}) {
  container.innerHTML = `<div class="panel empty">Loading opportunities...</div>`;
  const opps = await api("/api/opportunities?" + new URLSearchParams(filters));

  container.innerHTML = `
    <div class="toolbar">
      <input type="text" id="opp-search" class="search-input" placeholder="Search by title, organization, skill, or department..." value="${esc(filters.q || '')}">
      
      <select id="opp-category" class="filter-select">
        <option value="">All Categories</option>
        <option value="SUMMER_INTERNSHIP">Summer Internship</option>
        <option value="WINTER_INTERNSHIP">Winter Internship</option>
        <option value="FELLOWSHIP">Fellowship</option>
        <option value="PROJECT_ASSISTANT">Project Assistant</option>
        <option value="GOV_INTERNSHIP">Govt Internship</option>
      </select>

      <select id="opp-funding" class="filter-select">
        <option value="">All Funding</option>
        <option value="PAID">Paid / Stipendiary</option>
        <option value="FUNDED">Funded Grant</option>
        <option value="UNPAID">Unpaid</option>
      </select>

      <select id="opp-eligibility" class="filter-select">
        <option value="">All Eligibility</option>
        <option value="ELIGIBLE">Eligible (Full match)</option>
        <option value="POSSIBLY_ELIGIBLE">Possibly Eligible</option>
      </select>

      <select id="opp-sort" class="filter-select">
        <option value="score">Sort: Highest Match</option>
        <option value="deadline">Sort: Nearest Deadline</option>
        <option value="newest">Sort: Newest</option>
      </select>

      <button class="btn primary" onclick="openAddOpportunityModal()">+ Add Opportunity</button>
    </div>

    <div class="card-list" id="opps-list">
      ${opps.length ? opps.map(renderOpportunityCard).join("") : '<div class="panel empty">No opportunities matching your criteria.</div>'}
    </div>
  `;

  // Attach search and filter events
  const applyFilters = () => {
    const q = $("#opp-search").value.trim();
    const category = $("#opp-category").value;
    const funding = $("#opp-funding").value;
    const eligibility = $("#opp-eligibility").value;
    const sort = $("#opp-sort").value;
    renderOpportunities(container, { q, category, funding, eligibility, sort });
  };

  $("#opp-search").onkeydown = e => { if (e.key === "Enter") applyFilters(); };
  $("#opp-category").onchange = applyFilters;
  $("#opp-funding").onchange = applyFilters;
  $("#opp-eligibility").onchange = applyFilters;
  $("#opp-sort").onchange = applyFilters;
}

function renderOpportunityCard(o) {
  const matchClass = o.match_score >= 80 ? "match-high" : o.match_score >= 60 ? "match-med" : "match-low";
  const eligClass = o.eligibility_status === "ELIGIBLE" ? "green" : o.eligibility_status === "POSSIBLY_ELIGIBLE" ? "amber" : "blue";
  
  return `
    <article class="card">
      <div class="card-top">
        <div class="card-main">
          <div class="card-title-row">
            <h3 class="card-title">${esc(o.title)}</h3>
            <span class="match-pill ${matchClass}">★ ${o.match_score}% Match</span>
          </div>
          <div class="card-org">
            <strong>${esc(o.organization)}</strong> &middot; ${esc(o.department || "Computing & Engineering")} &middot; ${esc(o.location || "India")}
          </div>
          <p class="card-desc">${esc(o.description || "")}</p>
          
          <div class="chips-row">
            <span class="chip">${esc(o.category)}</span>
            <span class="chip ${o.funding === "PAID" ? "green" : "amber"}">${esc(o.funding)} ${o.stipend_amount ? `(${esc(o.stipend_amount)})` : ''}</span>
            <span class="chip ${eligClass}">Eligibility: ${esc(o.eligibility_status)}</span>
            <span class="chip ${o.verification_status === "VERIFIED" ? "green" : "blue"}">${esc(o.verification_status)}</span>
            ${o.deadline ? `<span class="chip red">Deadline: ${esc(o.deadline)}</span>` : '<span class="chip">Rolling / Ongoing</span>'}
            ${o.duration ? `<span class="chip">${esc(o.duration)}</span>` : ''}
          </div>
        </div>

        <div class="card-side-actions">
          <button class="btn small ${o.saved ? 'primary' : 'secondary'}" onclick="toggleSaveOpp(${o.id}, ${o.saved ? 0 : 1})">
            ${o.saved ? "★ Saved" : "☆ Save"}
          </button>
          
          <button class="btn small secondary" onclick="openTrackModal(${o.id})">
            ${o.application ? `📋 ${esc(o.application.status)}` : "📋 Track App"}
          </button>

          ${o.official_url ? `
            <a class="btn small" href="${esc(o.official_url)}" target="_blank" rel="noopener">Official ↗</a>
          ` : ''}
        </div>
      </div>

      <div class="card-foot">
        <div>
          <span class="evidence-tag" onclick="openEvidenceInspector(${o.id})">
            🔍 Inspect Supporting Evidence (${o.evidence ? o.evidence.length : 0} citations) & Score Breakdown
          </span>
        </div>
        <div>
          ${o.skills_required ? `<span>Skills: <strong>${esc(o.skills_required)}</strong></span>` : ''}
        </div>
      </div>
    </article>
  `;
}

// ==========================================
// 3. RESEARCHERS VIEW
// ==========================================
async function renderResearchers(container, filters = {}) {
  container.innerHTML = `<div class="panel empty">Loading faculty & researchers...</div>`;
  const researchers = await api("/api/researchers?" + new URLSearchParams(filters));

  container.innerHTML = `
    <div class="toolbar">
      <input type="text" id="res-search" class="search-input" placeholder="Search by professor name, lab, or research domain..." value="${esc(filters.q || '')}">
      
      <select id="res-signal" class="filter-select">
        <option value="">All Signal Statuses</option>
        <option value="CONFIRMED_OPEN">Confirmed Open</option>
        <option value="POTENTIAL_OPENING">Potential Opening</option>
        <option value="RESEARCH_LEAD">Research Lead</option>
      </select>

      <button class="btn primary" onclick="openAddResearcherModal()">+ Add Researcher</button>
    </div>

    <div class="card-list">
      ${researchers.length ? researchers.map(r => `
        <article class="card">
          <div class="card-top">
            <div class="card-main">
              <div class="card-title-row">
                <h3 class="card-title">${esc(r.name)}</h3>
                <span class="chip ${r.signal_status === 'CONFIRMED_OPEN' ? 'green' : r.signal_status === 'POTENTIAL_OPENING' ? 'amber' : 'blue'}">
                  ${esc(r.signal_status)}
                </span>
              </div>
              <div class="card-org">
                <strong>${esc(r.organization)}</strong> &middot; ${esc(r.designation || "Faculty")} &middot; ${esc(r.department || "Computer Science")}
              </div>
              
              <div style="margin: 8px 0;">
                <span style="font-size:12px; color:var(--text-secondary);">Research Domains:</span>
                <strong style="font-size:12px; color:#fff;"> ${esc(r.research_areas)}</strong>
              </div>

              ${r.recruitment_evidence ? `
                <div class="evidence-box" style="margin-top: 10px;">
                  <div class="evidence-label">Recruitment Evidence & Signals</div>
                  <div class="evidence-quote">"${esc(r.recruitment_evidence)}"</div>
                </div>
              ` : ''}

              ${r.notes ? `<p style="font-size:12px; color:var(--text-muted); margin-top:6px;">Notes: ${esc(r.notes)}</p>` : ''}
            </div>

            <div class="card-side-actions">
              ${r.profile_url ? `<a class="btn small" href="${esc(r.profile_url)}" target="_blank" rel="noopener">Faculty Profile ↗</a>` : ''}
              ${r.lab_url ? `<a class="btn small" href="${esc(r.lab_url)}" target="_blank" rel="noopener">Lab Website ↗</a>` : ''}
              ${r.email ? `<a class="btn small secondary" href="mailto:${esc(r.email)}">✉ Email</a>` : ''}
            </div>
          </div>
        </article>
      `).join("") : '<div class="panel empty">No researchers matching criteria.</div>'}
    </div>
  `;

  const applyResFilters = () => {
    const q = $("#res-search").value.trim();
    const signal = $("#res-signal").value;
    renderResearchers(container, { q, signal_status: signal });
  };
  $("#res-search").onkeydown = e => { if (e.key === "Enter") applyResFilters(); };
  $("#res-signal").onchange = applyResFilters;
}

// ==========================================
// 4. INSTITUTIONS VIEW
// ==========================================
async function renderInstitutions(container) {
  container.innerHTML = `<div class="panel empty">Loading institutions directory...</div>`;
  const orgs = await api("/api/organizations");

  container.innerHTML = `
    <div class="toolbar">
      <span style="font-weight:600;">Institutions Coverage (${orgs.length} total):</span>
      <span class="chip green">23 IITs</span>
      <span class="chip blue">12 Central Govt Labs & Scientific Agencies</span>
    </div>

    <div class="inst-grid">
      ${orgs.map(org => `
        <div class="inst-card">
          <div class="inst-name">
            <span>${esc(org.name)}</span>
            <span class="chip ${org.organization_type === 'IIT' ? 'green' : 'blue'}">${esc(org.organization_type)}</span>
          </div>
          <div class="inst-location">📍 ${esc(org.location || "India")}</div>
          
          <div class="inst-stats">
            <div class="inst-stat-item">
              <b>${org.stats.opportunities}</b>
              <small>Opportunities</small>
            </div>
            <div class="inst-stat-item">
              <b>${org.stats.researchers}</b>
              <small>Faculty</small>
            </div>
            <div class="inst-stat-item">
              <b>${org.stats.sources}</b>
              <small>Sources</small>
            </div>
          </div>

          <div style="margin-top: 14px; display:flex; justify-content:space-between; align-items:center;">
            ${org.website ? `<a class="btn small" href="${esc(org.website)}" target="_blank" rel="noopener">Website ↗</a>` : ''}
            <button class="btn small secondary" onclick="filterByOrg('${esc(org.name)}')">View Openings</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function filterByOrg(orgName) {
  loadPage("opportunities");
  setTimeout(() => {
    const container = $("#content");
    renderOpportunities(container, { organization: orgName });
  }, 100);
}

// ==========================================
// 5. SOURCE REGISTRY VIEW
// ==========================================
async function renderSources(container, statusFilter = "") {
  container.innerHTML = `<div class="panel empty">Loading source registry...</div>`;
  const sources = await api("/api/sources" + (statusFilter ? `?status=${statusFilter}` : ""));

  const counts = {
    PENDING_REVIEW: sources.filter(s => s.status === "PENDING_REVIEW").length,
    APPROVED: sources.filter(s => s.status === "APPROVED").length,
    PAUSED: sources.filter(s => s.status === "PAUSED").length,
    REJECTED: sources.filter(s => s.status === "REJECTED").length
  };

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <span>PENDING REVIEW</span>
        <b style="color:#e3b341;">${counts.PENDING_REVIEW}</b>
        <small>Seeded homepages needing review</small>
      </div>
      <div class="stat-box">
        <span>APPROVED</span>
        <b style="color:#3fb950;">${counts.APPROVED}</b>
        <small>Verified monitoring targets</small>
      </div>
      <div class="stat-box">
        <span>PAUSED</span>
        <b>${counts.PAUSED}</b>
        <small>Temporarily paused</small>
      </div>
      <div class="stat-box">
        <span>REJECTED</span>
        <b>${counts.REJECTED}</b>
        <small>Unsuitable or dead links</small>
      </div>
    </div>

    <div class="panel info" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
      <div>
        <strong>AI Source Verification & Auto-Approval:</strong> Evaluates official institutional ownership (.iit*.ac.in, .gov.in, .res.in, authorized mission portals). 
        Sources with <strong>authenticity &ge; 85%</strong> are automatically approved; uncertain or third-party domains remain in <code>PENDING_REVIEW</code>.
      </div>
      <button class="btn primary small" onclick="runAiSourceAudit()">
        🤖 Run AI Batch Audit (&ge;85% Auto-Approve)
      </button>
    </div>

    <div class="toolbar">
      <select id="source-status-sel" class="filter-select">
        <option value="">All Statuses</option>
        <option value="PENDING_REVIEW" ${statusFilter === 'PENDING_REVIEW' ? 'selected' : ''}>Pending Review</option>
        <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>Approved</option>
        <option value="PAUSED" ${statusFilter === 'PAUSED' ? 'selected' : ''}>Paused</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>Rejected</option>
      </select>

      <input type="text" id="source-search" class="search-input" placeholder="Search by institution or URL...">
      <button class="btn primary" onclick="openAddSourceModal()">+ Register Exact Source Page</button>
    </div>

    <div class="card-list" id="sources-list">
      ${sources.map(renderSourceCard).join("")}
    </div>
  `;

  $("#source-status-sel").onchange = e => renderSources(container, e.target.value);
  $("#source-search").oninput = e => {
    const q = e.target.value.toLowerCase();
    $$(".source-card").forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
}

function renderSourceCard(s) {
  const statusColor = s.status === "APPROVED" ? "green" : s.status === "PENDING_REVIEW" ? "amber" : "red";
  
  // Extract AI score from review note if present
  const aiScoreMatch = String(s.review_note || "").match(/(?:AI (?:Authenticity|Verified) )([0-9]{1,3})%/i);
  const aiScore = aiScoreMatch ? parseInt(aiScoreMatch[1], 10) : null;

  return `
    <article class="card source-card">
      <div class="card-top">
        <div class="card-main">
          <div class="card-title-row">
            <h3 class="card-title">${esc(s.name)}</h3>
            <span class="chip ${statusColor}">${esc(s.status)}</span>
            <span class="chip">${esc(s.source_type)}</span>
            <span class="chip">${esc(s.organization_type)}</span>
            ${aiScore !== null ? `
              <span class="chip ${aiScore >= 85 ? 'green' : 'amber'}">
                🤖 AI Authenticity: ${aiScore}%
              </span>
            ` : ''}
          </div>
          <div style="font-family:var(--font-mono); font-size:12px; color:var(--accent-cyan); margin:4px 0;">
            ${esc(s.url)}
          </div>
          <p style="font-size:12px; color:var(--text-muted);">${esc(s.review_note || "")}</p>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:6px;">
            Last check: <strong>${s.last_checked_at || "Never"}</strong> &middot; Failures: <strong>${s.consecutive_failures || 0}</strong> &middot; Frequency: <strong>${esc(s.frequency)}</strong>
          </div>
        </div>

        <div class="card-side-actions">
          <a class="btn small" href="${esc(s.url)}" target="_blank" rel="noopener">Open ↗</a>

          <button class="btn small" onclick="aiVerifySource(${s.id})" title="Check authenticity with AI and auto-approve if >= 85%">
            🤖 AI Verify
          </button>
          
          <button class="btn small secondary" onclick="checkSourceNow(${s.id})">
            🔄 Safe Check
          </button>

          ${s.status === "PENDING_REVIEW" ? `
            <button class="btn small primary" onclick="updateSourceStatus(${s.id}, 'APPROVED')">Approve</button>
            <button class="btn small danger" onclick="updateSourceStatus(${s.id}, 'REJECTED')">Reject</button>
          ` : ''}

          ${s.status === "APPROVED" ? `
            <button class="btn small secondary" onclick="updateSourceStatus(${s.id}, 'PAUSED')">Pause</button>
          ` : ''}

          ${s.status === "PAUSED" ? `
            <button class="btn small primary" onclick="updateSourceStatus(${s.id}, 'APPROVED')">Resume</button>
          ` : ''}
        </div>
      </div>
    </article>
  `;
}

async function runAiSourceAudit() {
  try {
    toast("Running AI source authenticity audit across pending sources...");
    const res = await api("/api/sources/ai-audit", { method: "POST" });
    toast(`Audit complete! Auto-approved: ${res.autoApprovedCount}, Remaining pending: ${res.pendingCount}`);
    renderSources($("#content"));
  } catch (err) {
    toast(`Audit failed: ${err.message}`);
  }
}

async function aiVerifySource(id) {
  try {
    toast("Evaluating source authenticity with AI...");
    const res = await api(`/api/sources/${id}/ai-verify`, { method: "POST" });
    const audit = res.ai_audit;
    if (audit.auto_approved) {
      toast(`Verified (${audit.authenticity_score}%) & Auto-Approved!`);
    } else {
      toast(`Score: ${audit.authenticity_score}% - Left in PENDING_REVIEW`);
    }
    renderSources($("#content"));
  } catch (err) {
    toast(`AI check failed: ${err.message}`);
  }
}

async function updateSourceStatus(id, status) {
  try {
    await api("/api/sources/" + id, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    toast(`Source status updated to ${status}`);
    renderSources($("#content"));
  } catch (err) {
    toast(err.message);
  }
}

async function checkSourceNow(id) {
  try {
    toast("Fetching and inspecting source...");
    const res = await api(`/api/sources/${id}/check`, { method: "POST" });
    toast(`Check ${res.status}! Links: ${res.newLinksFound}, Opportunities: ${res.opportunitiesFound}`);
    renderSources($("#content"));
  } catch (err) {
    toast(`Check failed: ${err.message}`);
  }
}

// ==========================================
// 6. SHORTLIST & SAVED VIEW
// ==========================================
async function renderSaved(container) {
  container.innerHTML = `<div class="panel empty">Loading saved opportunities...</div>`;
  const saved = await api("/api/opportunities?saved=1");

  container.innerHTML = `
    <div class="section-header">
      <h2>Your Shortlisted Opportunities (${saved.length})</h2>
    </div>
    <div class="card-list">
      ${saved.length ? saved.map(renderOpportunityCard).join("") : '<div class="panel empty">No opportunities saved yet. Click "☆ Save" on any opportunity to shortlist it.</div>'}
    </div>
  `;
}

async function toggleSaveOpp(id, saved) {
  try {
    await api("/api/opportunities/" + id, {
      method: "PATCH",
      body: JSON.stringify({ saved })
    });
    toast(saved ? "Added to shortlist ★" : "Removed from shortlist");
    loadPage(currentPage);
  } catch (err) {
    toast(err.message);
  }
}

// ==========================================
// 7. APPLICATIONS PIPELINE (KANBAN)
// ==========================================
async function renderApplications(container) {
  container.innerHTML = `<div class="panel empty">Loading application tracking pipeline...</div>`;
  const apps = await api("/api/applications");

  const stages = [
    { key: "INTERESTED", label: "Interested", color: "blue" },
    { key: "PREPARING", label: "Preparing Application", color: "amber" },
    { key: "APPLIED", label: "Applied", color: "purple" },
    { key: "INTERVIEW", label: "Interview", color: "green" },
    { key: "ACCEPTED", label: "Offer / Accepted", color: "green" },
    { key: "REJECTED", label: "Rejected / Withdrawn", color: "red" }
  ];

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Application Pipeline</h2>
        <small style="color:var(--text-secondary);">Track your submissions, professor correspondences and interview rounds.</small>
      </div>
      <button class="btn primary" onclick="loadPage('opportunities')">+ Add from Opportunities</button>
    </div>

    <div class="kanban-board">
      ${stages.map(st => {
        const stageApps = apps.filter(a => a.status === st.key);
        return `
          <div class="kanban-column">
            <div class="kanban-header">
              <span>${esc(st.label)}</span>
              <span class="count">${stageApps.length}</span>
            </div>
            <div class="kanban-items">
              ${stageApps.map(app => `
                <div class="kanban-card">
                  <h4>${esc(app.title)}</h4>
                  <p>${esc(app.organization)} &middot; ${app.deadline ? `Deadline: ${esc(app.deadline)}` : 'Ongoing'}</p>
                  ${app.follow_up_date ? `<div class="chip amber" style="margin-bottom:6px;">Follow-up: ${esc(app.follow_up_date)}</div>` : ''}
                  ${app.notes ? `<p style="font-style:italic; color:var(--text-muted);">${esc(app.notes)}</p>` : ''}
                  
                  <div style="display:flex; justify-content:space-between; margin-top:8px;">
                    <button class="btn small" onclick="openEditAppModal(${app.id})">Edit / Move</button>
                    ${app.official_url ? `<a class="btn small" href="${esc(app.official_url)}" target="_blank" rel="noopener">Portal ↗</a>` : ''}
                  </div>
                </div>
              `).join("")}
              ${stageApps.length === 0 ? `<div style="text-align:center; padding:24px 0; color:var(--text-muted); font-size:11px;">No applications</div>` : ''}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ==========================================
// 8. DEADLINES & REMINDERS VIEW
// ==========================================
async function renderDeadlines(container) {
  container.innerHTML = `<div class="panel empty">Loading deadlines & reminders...</div>`;
  const reminders = await api("/api/reminders");
  const opps = await api("/api/opportunities?sort=deadline");

  const today = new Date().toISOString().split("T")[0];
  const upcomingOpps = opps.filter(o => o.deadline && o.deadline >= today);

  container.innerHTML = `
    <div class="section-header">
      <h2>Active Reminders (${reminders.length})</h2>
      <button class="btn primary" onclick="openAddReminderModal()">+ Add Custom Reminder</button>
    </div>

    <div class="card-list" style="margin-bottom: 30px;">
      ${reminders.length ? reminders.map(r => `
        <div class="card" style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="chip red">${esc(r.reminder_type)}</span>
              <strong style="color:#fff; font-size:14px;">${esc(r.title)}</strong>
            </div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
              Due Date: <strong>${esc(r.due_date)}</strong> &middot; Alert Type: ${esc(r.reference_type)}
            </div>
          </div>
          <button class="btn small" onclick="dismissReminder(${r.id})">✓ Dismiss</button>
        </div>
      `).join("") : '<div class="panel empty">No pending reminders. You are all caught up!</div>'}
    </div>

    <div class="section-header">
      <h2>Chronological Application Deadlines</h2>
    </div>

    <div class="card-list">
      ${upcomingOpps.map(renderOpportunityCard).join("")}
    </div>
  `;
}

async function dismissReminder(id) {
  try {
    await api(`/api/reminders/${id}/dismiss`, { method: "PATCH" });
    toast("Reminder dismissed");
    loadPage(currentPage);
  } catch (err) {
    toast(err.message);
  }
}

// ==========================================
// 9. CANDIDATE PROFILE VIEW
// ==========================================
async function renderProfile(container) {
  container.innerHTML = `<div class="panel empty">Loading candidate profile...</div>`;
  const p = await api("/api/profile");

  container.innerHTML = `
    <!-- Resume Upload Card -->
    <div class="resume-upload-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <h3 style="color:#fff; font-size:15px; display:flex; align-items:center; gap:8px;">
            📄 Auto-Fill Profile from Resume (PDF)
          </h3>
          <small style="color:var(--text-secondary);">
            Upload your PDF resume to automatically extract education, skills, CGPA, and research interests.
          </small>
        </div>
        <button class="btn small secondary" onclick="togglePasteResume()">
          ✏️ Paste Raw Text
        </button>
      </div>

      <div class="resume-dropzone" id="resume-dropzone" onclick="$('#resume-file-input').click()">
        <span class="dropzone-icon">📥</span>
        <div class="dropzone-title">Click to upload or drag & drop your PDF resume here</div>
        <div class="dropzone-sub">Supports standard PDF or plain text resume (up to 10MB)</div>
        <input type="file" id="resume-file-input" accept=".pdf,application/pdf,.txt,text/plain" style="display:none">
      </div>

      <div id="paste-resume-box" style="display:none; margin-top:14px;">
        <textarea id="paste-resume-text" class="field textarea" style="width:100%; min-height:120px; background:var(--bg-input); color:#fff; border:1px solid var(--border); border-radius:6px; padding:10px;" placeholder="Paste the text content of your resume here..."></textarea>
        <div style="margin-top:8px; display:flex; justify-content:flex-end;">
          <button class="btn primary small" onclick="submitPastedResume()">Extract from Pasted Text</button>
        </div>
      </div>

      <div id="resume-status" style="display:none;"></div>
    </div>

    <!-- Main Profile Edit Form -->
    <div class="panel">
      <div class="section-header" style="margin-top:0;">
        <div>
          <h2>Candidate Academic Profile</h2>
          <small style="color:var(--text-secondary);">Used by the 6-factor weighted algorithm to score relevance (0-100) and evaluate eligibility.</small>
        </div>
      </div>

      <form id="profile-form">
        <div class="formgrid">
          <div class="field">
            <label>Full / Display Name</label>
            <input name="name" id="f-name" value="${esc(p.name)}">
          </div>
          <div class="field">
            <label>Institution</label>
            <input name="institution" id="f-institution" value="${esc(p.institution)}">
          </div>
          <div class="field">
            <label>Degree Programme</label>
            <input name="degree" id="f-degree" value="${esc(p.degree)}">
          </div>
          <div class="field">
            <label>Academic Branch / Department</label>
            <input name="branch" id="f-branch" value="${esc(p.branch)}">
          </div>
          <div class="field">
            <label>Current Year of Study</label>
            <input name="current_year" id="f-current-year" type="number" min="1" max="5" value="${p.current_year}">
          </div>
          <div class="field">
            <label>Expected Graduation Year</label>
            <input name="graduation_year" id="f-grad-year" type="number" value="${p.graduation_year}">
          </div>
          <div class="field">
            <label>Current CGPA / CPI</label>
            <input name="cgpa" id="f-cgpa" type="number" step="0.01" min="0" max="10" value="${p.cgpa}">
          </div>
          <div class="field">
            <label>Funding Preference</label>
            <select name="funding_preference" id="f-funding-pref">
              <option value="PRIORITIZE_PAID" ${p.funding_preference === 'PRIORITIZE_PAID' ? 'selected' : ''}>Prioritize Paid (include high-value unpaid)</option>
              <option value="PAID_ONLY" ${p.funding_preference === 'PAID_ONLY' ? 'selected' : ''}>Paid Opportunities Only</option>
              <option value="ALL" ${p.funding_preference === 'ALL' ? 'selected' : ''}>All Opportunities (Paid & Unpaid)</option>
            </select>
          </div>

          <div class="field wide">
            <label>Technical Skills & Tools (comma separated)</label>
            <input name="skills" id="f-skills" value="${esc(p.skills)}">
          </div>

          <div class="field wide">
            <label>Programming Languages (comma separated)</label>
            <input name="languages" id="f-languages" value="${esc(p.languages)}">
          </div>

          <div class="field wide">
            <label>Technical & Course Interests</label>
            <textarea name="technical_interests" id="f-tech-interests">${esc(p.technical_interests)}</textarea>
          </div>

          <div class="field wide">
            <label>Specific Academic Research Interests</label>
            <textarea name="research_interests" id="f-research-interests">${esc(p.research_interests)}</textarea>
          </div>

          <div class="field">
            <label>Preferred Locations</label>
            <input name="preferred_locations" id="f-locations" value="${esc(p.preferred_locations)}">
          </div>

          <div class="field">
            <label>Preferred Duration</label>
            <input name="preferred_duration" id="f-duration" value="${esc(p.preferred_duration)}">
          </div>

          <div class="field wide">
            <label>Availability Dates</label>
            <input name="availability" id="f-availability" value="${esc(p.availability)}">
          </div>

          <div class="field wide">
            <label>Preferences & Research Directives</label>
            <textarea name="preferences" id="f-preferences">${esc(p.preferences)}</textarea>
          </div>
        </div>

        <div style="margin-top: 20px; display:flex; justify-content:flex-end;">
          <button type="submit" class="btn primary">Save Profile & Recalculate Matches</button>
        </div>
      </form>
    </div>
  `;

  // Drag and Drop & File Upload Bindings
  const dropzone = $("#resume-dropzone");
  const fileInput = $("#resume-file-input");

  dropzone.ondragover = e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  };
  dropzone.ondragleave = () => dropzone.classList.remove("dragover");
  dropzone.ondrop = e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processResumeFile(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = e => {
    if (e.target.files && e.target.files[0]) {
      processResumeFile(e.target.files[0]);
    }
  };

  $("#profile-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify(data)
      });
      toast("Profile saved! Matches updated.");
      loadPage("profile");
    } catch (err) {
      toast(err.message);
    }
  };
}

function togglePasteResume() {
  const box = $("#paste-resume-box");
  box.style.display = box.style.display === "none" ? "block" : "none";
}

async function submitPastedResume() {
  const text = $("#paste-resume-text").value.trim();
  if (!text || text.length < 20) {
    return toast("Please paste at least 20 characters of resume text.");
  }
  await sendResumeData({ text });
}

function processResumeFile(file) {
  const statusBox = $("#resume-status");
  statusBox.style.display = "block";
  statusBox.innerHTML = `
    <div class="extraction-loading">
      <div class="spinner"></div>
      <span>Extracting and parsing <strong>${esc(file.name)}</strong>...</span>
    </div>
  `;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const base64 = reader.result;
      await sendResumeData({ filename: file.name, base64 });
    } catch (err) {
      statusBox.innerHTML = `<div class="chip red" style="margin-top:12px;">Extraction error: ${esc(err.message)}</div>`;
    }
  };
  reader.onerror = () => {
    statusBox.innerHTML = `<div class="chip red" style="margin-top:12px;">Failed to read local file.</div>`;
  };
  reader.readAsDataURL(file);
}

async function sendResumeData(payload) {
  const statusBox = $("#resume-status");
  statusBox.style.display = "block";
  statusBox.innerHTML = `
    <div class="extraction-loading">
      <div class="spinner"></div>
      <span>Parsing education, skills & research areas...</span>
    </div>
  `;

  try {
    const res = await api("/api/profile/upload-resume", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const prof = res.profile;
    statusBox.innerHTML = `
      <div class="extracted-pill-banner">
        <span>
          ✓ Successfully extracted profile for <strong>${esc(prof.name)}</strong> (${esc(prof.degree)} ${esc(prof.branch)}, ${esc(prof.institution)}).
        </span>
        <button class="btn small" onclick="loadPage('opportunities')">View Updated Matches &rarr;</button>
      </div>
    `;

    // Populate form fields dynamically
    $("#f-name").value = prof.name;
    $("#f-degree").value = prof.degree;
    $("#f-branch").value = prof.branch;
    $("#f-institution").value = prof.institution;
    $("#f-current-year").value = prof.current_year;
    $("#f-grad-year").value = prof.graduation_year;
    $("#f-cgpa").value = prof.cgpa;
    $("#f-skills").value = prof.skills;
    $("#f-languages").value = prof.languages;
    $("#f-tech-interests").value = prof.technical_interests;
    $("#f-research-interests").value = prof.research_interests;
    $("#f-locations").value = prof.preferred_locations;
    $("#f-duration").value = prof.preferred_duration;
    $("#f-availability").value = prof.availability;
    $("#f-preferences").value = prof.preferences;

    toast("Resume extracted & profile updated!");
  } catch (err) {
    statusBox.innerHTML = `<div class="chip red" style="margin-top:12px;">Error: ${esc(err.message)}</div>`;
    toast(`Failed to extract resume: ${err.message}`);
  }
}

// ==========================================
// 10. DISCOVERY & AUTOMATION VIEW
// ==========================================
async function renderDiscovery(container) {
  container.innerHTML = `<div class="panel empty">Loading discovery engine...</div>`;
  const stats = await api("/api/discovery/stats");
  const queries = await api("/api/discovery/queries");
  const urls = await api("/api/discovery/urls");
  const jobs = await api("/api/jobs");
  const config = await api("/api/config");

  container.innerHTML = `
    <!-- AI Configuration Card -->
    <div class="panel" style="margin-bottom: 20px; background: linear-gradient(135deg, rgba(31, 41, 55, 0.7), rgba(17, 21, 28, 0.9)); border: 1px solid #388bfd44;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 style="color:#fff; font-size:15px; display:flex; align-items:center; gap:8px;">
            🤖 AI Extraction Engine (Google Gemini)
          </h3>
          <small style="color:var(--text-secondary);">
            Used for structured vacancy extraction from public pages and automated PDF resume parsing.
          </small>
        </div>
        <div>
          ${config.hasGeminiKey 
            ? `<span class="chip green">● gemini-3.5-flash-lite (${esc(config.maskedKey)})</span>` 
            : `<span class="chip amber">○ Offline Heuristic Mode Active</span>`
          }
        </div>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <input type="password" id="gemini-key-input" class="search-input" style="flex:1; min-width:260px;" placeholder="${config.hasGeminiKey ? 'Enter new key to update...' : 'Enter Gemini API Key (e.g. AIzaSy...)'}">
        <button class="btn primary" onclick="saveGeminiKey()">Save Key</button>
        <a class="btn secondary" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Get Free Key from Google AI Studio ↗</a>
      </div>
      <small style="color:var(--text-muted); display:block; margin-top:8px;">
        The key is saved locally in your project's <code>.env</code> file. When no key is set, the engine runs completely offline with its built-in rule-based NLP extractor.
      </small>
    </div>

    <div class="stats-grid">
      <div class="stat-box">
        <span>Discovery Runs</span>
        <b>${stats.totalRuns}</b>
        <small>Crawler & search sweeps</small>
      </div>
      <div class="stat-box">
        <span>Discovered Targets</span>
        <b>${stats.totalUrls}</b>
        <small>Official URLs indexed</small>
      </div>
      <div class="stat-box">
        <span>New URLs in Queue</span>
        <b>${stats.newUrls}</b>
        <small>Pending ingestion</small>
      </div>
    </div>

    <div class="toolbar">
      <button class="btn primary" onclick="triggerDiscovery('SEARCH')">⚡ Run Search Discovery</button>
      <button class="btn secondary" onclick="triggerDiscovery('RSS')">📡 Scan RSS Feeds</button>
      <button class="btn secondary" onclick="triggerJob('SOURCE_MONITOR')">🔄 Monitor Approved Sources</button>
      <button class="btn secondary" onclick="triggerJob('VERIFICATION')">🛡️ Verify Deadlines & Freshness</button>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
      <div>
        <div class="section-header">
          <h2>Discovered URLs Queue</h2>
        </div>
        <div class="card-list" style="max-height: 400px; overflow-y: auto;">
          ${urls.length ? urls.map(u => `
            <div class="card" style="padding:10px 14px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:12px; color:#fff;">${esc(u.title || u.url)}</strong>
                <span class="chip ${u.status === 'NEW' ? 'amber' : 'green'}">${esc(u.status)}</span>
              </div>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--accent-cyan); margin:4px 0;">${esc(u.url)}</div>
              <small style="color:var(--text-muted);">${esc(u.snippet || '')}</small>
            </div>
          `).join("") : '<div class="panel empty">No URLs discovered yet. Run discovery above!</div>'}
        </div>
      </div>

      <div>
        <div class="section-header">
          <h2>Background Jobs Execution Log</h2>
        </div>
        <div class="card-list" style="max-height: 400px; overflow-y: auto;">
          ${jobs.length ? jobs.map(j => `
            <div class="card" style="padding:10px 14px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:12px; color:#fff;">${esc(j.job_type)}</strong>
                <span class="chip ${j.status === 'COMPLETED' ? 'green' : 'amber'}">${esc(j.status)}</span>
              </div>
              <p style="font-size:12px; color:var(--text-secondary); margin:4px 0;">${esc(j.summary || j.error_log || 'In progress...')}</p>
              <small style="color:var(--text-muted); font-size:10px;">${esc(j.started_at)}</small>
            </div>
          `).join("") : '<div class="panel empty">No jobs logged yet.</div>'}
        </div>
      </div>
    </div>
  `;
}

async function saveGeminiKey() {
  const input = $("#gemini-key-input");
  const key = input ? input.value.trim() : "";
  if (!key) {
    return toast("Please enter a valid Gemini API key.");
  }
  try {
    toast("Saving Gemini API key...");
    const res = await api("/api/config", {
      method: "POST",
      body: JSON.stringify({ gemini_api_key: key })
    });
    toast(res.hasGeminiKey ? "Gemini API key saved & active!" : "Key removed");
    loadPage("discovery");
  } catch (err) {
    toast(`Failed to save key: ${err.message}`);
  }
}

async function triggerDiscovery(type) {
  try {
    toast(`Running ${type} discovery...`);
    const res = await api("/api/discovery/run", {
      method: "POST",
      body: JSON.stringify({ run_type: type })
    });
    toast(`Discovery done: ${res.newUrls} new URLs found!`);
    loadPage("discovery");
  } catch (err) {
    toast(err.message);
  }
}

async function triggerJob(jobType) {
  try {
    toast(`Starting ${jobType}...`);
    const res = await api("/api/jobs/run", {
      method: "POST",
      body: JSON.stringify({ job_type: jobType })
    });
    toast(res.summary || `${jobType} completed`);
    loadPage("discovery");
  } catch (err) {
    toast(err.message);
  }
}

// ==========================================
// MODALS & INSPECTOR
// ==========================================

// Evidence & Match Score Inspector Modal
async function openEvidenceInspector(id) {
  const o = await api("/api/opportunities/" + id);
  const factors = o.match_factors || {};

  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>🔍 Evidence & Relevance Inspector</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <div class="modal-body">
        <h4 style="color:#fff; font-size:16px; margin-bottom:4px;">${esc(o.title)}</h4>
        <p style="color:var(--text-secondary); margin-bottom:14px;">${esc(o.organization)} &middot; ${esc(o.category)}</p>

        <div style="background:#11151c; padding:12px 14px; border-radius:8px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:14px;">Relevance Score: ${o.match_score}/100</strong>
            <span class="chip ${o.eligibility_status === 'ELIGIBLE' ? 'green' : 'amber'}">
              Eligibility: ${esc(o.eligibility_status)}
            </span>
          </div>

          <div class="factors-list">
            <div class="factor-item">
              <span>Research Interest Relevance (30%)</span>
              <strong>+${factors.research_interest ?? 0}/30</strong>
            </div>
            <div class="factor-item">
              <span>Skill Alignment (25%)</span>
              <strong>+${factors.skills ?? 0}/25</strong>
            </div>
            <div class="factor-item">
              <span>Academic Suitability & Year (15%)</span>
              <strong>+${factors.academic ?? 0}/15</strong>
            </div>
            <div class="factor-item">
              <span>Institutional Authority & Quality (10%)</span>
              <strong>+${factors.quality ?? 0}/10</strong>
            </div>
            <div class="factor-item">
              <span>Funding Preference Match (10%)</span>
              <strong>+${factors.funding ?? 0}/10</strong>
            </div>
            <div class="factor-item">
              <span>Recency & Active Deadline (10%)</span>
              <strong>+${factors.recency ?? 0}/10</strong>
            </div>
          </div>
        </div>

        <h4 style="color:#fff; font-size:14px; margin-bottom:8px;">Supporting Verbatim Evidence Citations:</h4>
        ${o.evidence && o.evidence.length > 0 ? o.evidence.map(ev => `
          <div class="evidence-box">
            <div class="evidence-label">${esc(ev.field_name)} Citation</div>
            <div class="evidence-quote">"${esc(ev.snippet)}"</div>
            <span class="evidence-src">Source: ${esc(ev.source_url)}</span>
          </div>
        `).join("") : `
          <div class="panel empty" style="padding:16px;">No verbatim snippets attached yet. Extraction confidence: ${o.confidence_score * 100}%</div>
        `}

        <h4 style="color:#fff; font-size:14px; margin:14px 0 6px;">Eligibility Details:</h4>
        <p style="font-size:13px; color:#c9d1d9;">${esc(o.eligibility || 'Not stated')}</p>
        ${o.degree_requirements ? `<p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Degree: ${esc(o.degree_requirements)}</p>` : ''}
        ${o.branch_requirements ? `<p style="font-size:12px; color:var(--text-secondary);">Branch: ${esc(o.branch_requirements)}</p>` : ''}
        ${o.cgpa_requirements ? `<p style="font-size:12px; color:var(--text-secondary);">Min CGPA: ${esc(o.cgpa_requirements)}</p>` : ''}
      </div>

      <div class="modal-footer">
        ${o.official_url ? `<a class="btn primary" href="${esc(o.official_url)}" target="_blank" rel="noopener">Open Official Notice ↗</a>` : ''}
        <button class="btn secondary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `);
}

// Track in Applications Pipeline Modal
async function openTrackModal(oppId) {
  const o = await api("/api/opportunities/" + oppId);
  const app = o.application;

  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>📋 Track Application Stage</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <form id="track-form">
        <div class="modal-body">
          <p style="margin-bottom:14px; color:#fff;"><strong>${esc(o.title)}</strong> &middot; ${esc(o.organization)}</p>

          <div class="field" style="margin-bottom:12px;">
            <label>Application Status / Pipeline Stage</label>
            <select name="status">
              <option value="INTERESTED" ${app?.status === 'INTERESTED' ? 'selected' : ''}>Interested</option>
              <option value="PREPARING" ${app?.status === 'PREPARING' ? 'selected' : ''}>Preparing Application</option>
              <option value="APPLIED" ${app?.status === 'APPLIED' ? 'selected' : ''}>Applied</option>
              <option value="INTERVIEW" ${app?.status === 'INTERVIEW' ? 'selected' : ''}>Interview Scheduled</option>
              <option value="ACCEPTED" ${app?.status === 'ACCEPTED' ? 'selected' : ''}>Offer Accepted</option>
              <option value="REJECTED" ${app?.status === 'REJECTED' ? 'selected' : ''}>Rejected / Withdrawn</option>
            </select>
          </div>

          <div class="field" style="margin-bottom:12px;">
            <label>Submission / Applied Date</label>
            <input type="date" name="applied_date" value="${esc(app?.applied_date || '')}">
          </div>

          <div class="field" style="margin-bottom:12px;">
            <label>Follow-Up Reminder Date</label>
            <input type="date" name="follow_up_date" value="${esc(app?.follow_up_date || '')}">
          </div>

          <div class="field">
            <label>Notes & Professor Correspondence</label>
            <textarea name="notes" placeholder="Notes on SOP draft, professor reply, portal credentials...">${esc(app?.notes || '')}</textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Save Application Stage</button>
        </div>
      </form>
    </div>
  `);

  $("#track-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.opportunity_id = oppId;
    try {
      if (app) {
        await api("/api/applications/" + app.id, {
          method: "PATCH",
          body: JSON.stringify(data)
        });
      } else {
        await api("/api/applications", {
          method: "POST",
          body: JSON.stringify(data)
        });
      }
      toast("Application stage saved!");
      closeModal();
      loadPage(currentPage);
    } catch (err) {
      toast(err.message);
    }
  };
}

// Add Opportunity Modal
function openAddOpportunityModal() {
  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>+ Add New Opportunity</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <form id="add-opp-form">
        <div class="modal-body">
          <div class="formgrid">
            <div class="field wide">
              <label>Opportunity Title *</label>
              <input name="title" required placeholder="e.g. Summer Research Fellowship in AI">
            </div>

            <div class="field">
              <label>Institution / Organization *</label>
              <input name="organization" required placeholder="e.g. IIT Bombay">
            </div>

            <div class="field">
              <label>Department / Laboratory</label>
              <input name="department" placeholder="e.g. Computer Science & Engineering">
            </div>

            <div class="field">
              <label>Category</label>
              <select name="category">
                <option value="SUMMER_INTERNSHIP">Summer Internship</option>
                <option value="WINTER_INTERNSHIP">Winter Internship</option>
                <option value="FELLOWSHIP">Fellowship</option>
                <option value="PROJECT_ASSISTANT">Project Assistant</option>
                <option value="RESEARCH_INTERNSHIP">Research Internship</option>
                <option value="GOV_INTERNSHIP">Government Internship</option>
              </select>
            </div>

            <div class="field">
              <label>Funding Type</label>
              <select name="funding">
                <option value="PAID">PAID</option>
                <option value="FUNDED">FUNDED</option>
                <option value="UNPAID">UNPAID</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </div>

            <div class="field">
              <label>Stipend Amount</label>
              <input name="stipend_amount" placeholder="e.g. Rs. 10,000 / month">
            </div>

            <div class="field">
              <label>Application Deadline</label>
              <input type="date" name="deadline">
            </div>

            <div class="field wide">
              <label>Official Notice URL</label>
              <input type="url" name="official_url" placeholder="https://...">
            </div>

            <div class="field wide">
              <label>Opportunity Description</label>
              <textarea name="description" placeholder="Brief overview of research project and responsibilities..."></textarea>
            </div>

            <div class="field wide">
              <label>Eligibility Criteria</label>
              <textarea name="eligibility" placeholder="Degree, year of study, required CGPA cutoff..."></textarea>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Save Opportunity</button>
        </div>
      </form>
    </div>
  `);

  $("#add-opp-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/opportunities", {
        method: "POST",
        body: JSON.stringify(data)
      });
      toast("Opportunity added successfully!");
      closeModal();
      loadPage("opportunities");
    } catch (err) {
      toast(err.message);
    }
  };
}

// Add Researcher Modal
function openAddResearcherModal() {
  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>+ Add Researcher Profile</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <form id="add-res-form">
        <div class="modal-body">
          <div class="formgrid">
            <div class="field">
              <label>Researcher Name *</label>
              <input name="name" required placeholder="Prof. Jane Doe">
            </div>

            <div class="field">
              <label>Institution *</label>
              <input name="organization" required placeholder="e.g. IIT Kanpur">
            </div>

            <div class="field">
              <label>Department</label>
              <input name="department" placeholder="Computer Science and Engineering">
            </div>

            <div class="field">
              <label>Designation</label>
              <input name="designation" placeholder="Associate Professor">
            </div>

            <div class="field wide">
              <label>Research Areas & Keywords</label>
              <input name="research_areas" placeholder="Cybersecurity, Cryptography, Distributed Systems">
            </div>

            <div class="field">
              <label>Recruitment Signal Status</label>
              <select name="signal_status">
                <option value="RESEARCH_LEAD">Research Lead</option>
                <option value="POTENTIAL_OPENING">Potential Opening</option>
                <option value="CONFIRMED_OPEN">Confirmed Open</option>
              </select>
            </div>

            <div class="field">
              <label>Email Address</label>
              <input type="email" name="email" placeholder="faculty@iit.ac.in">
            </div>

            <div class="field wide">
              <label>Official Profile URL</label>
              <input type="url" name="profile_url" placeholder="https://www.cse.iitk.ac.in/users/...">
            </div>

            <div class="field wide">
              <label>Recruitment Evidence / Call for Interns Quote</label>
              <textarea name="recruitment_evidence" placeholder="Snippet from laboratory site or public call..."></textarea>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Save Researcher</button>
        </div>
      </form>
    </div>
  `);

  $("#add-res-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/researchers", {
        method: "POST",
        body: JSON.stringify(data)
      });
      toast("Researcher registered!");
      closeModal();
      loadPage("researchers");
    } catch (err) {
      toast(err.message);
    }
  };
}

// Add Source Modal
function openAddSourceModal() {
  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>+ Register Exact Source Page</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <form id="add-src-form">
        <div class="modal-body">
          <div class="formgrid">
            <div class="field wide">
              <label>Page / Notice Title *</label>
              <input name="name" required placeholder="e.g. IIT Delhi CSE Student Research Notices">
            </div>

            <div class="field">
              <label>Institution / Organization *</label>
              <input name="organization" required placeholder="e.g. IIT Delhi">
            </div>

            <div class="field">
              <label>Source Type</label>
              <select name="source_type">
                <option value="INTERNSHIP_PAGE">Internship Notice Page</option>
                <option value="DEPARTMENT_PAGE">Department Notice Board</option>
                <option value="FACULTY_DIRECTORY">Faculty Directory</option>
                <option value="LAB_PAGE">Laboratory Website</option>
                <option value="PROJECT_PAGE">Funded Project Page</option>
                <option value="RSS_FEED">RSS / Atom Feed</option>
              </select>
            </div>

            <div class="field wide">
              <label>Exact Official URL *</label>
              <input type="url" name="url" required placeholder="https://home.iitd.ac.in/...">
            </div>

            <div class="field">
              <label>Monitoring Frequency</label>
              <select name="frequency">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY" selected>Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="MANUAL">Manual Only</option>
              </select>
            </div>

            <div class="field">
              <label>Organization Type</label>
              <select name="organization_type">
                <option value="IIT">IIT</option>
                <option value="GOV_RESEARCH">Govt Research Lab</option>
                <option value="OTHER">Other Academic</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Register Source</button>
        </div>
      </form>
    </div>
  `);

  $("#add-src-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/sources", {
        method: "POST",
        body: JSON.stringify(data)
      });
      toast("Source registered for review!");
      closeModal();
      loadPage("sources");
    } catch (err) {
      toast(err.message);
    }
  };
}

// Add Custom Reminder Modal
function openAddReminderModal() {
  showModal(`
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>+ Add Custom Reminder</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <form id="add-rem-form">
        <div class="modal-body">
          <div class="field" style="margin-bottom:12px;">
            <label>Reminder Title *</label>
            <input name="title" required placeholder="e.g. Email Prof. Shukla regarding project recommendation">
          </div>

          <div class="field" style="margin-bottom:12px;">
            <label>Due Date *</label>
            <input type="date" name="due_date" required>
          </div>

          <div class="field">
            <label>Reminder Category</label>
            <select name="reminder_type">
              <option value="DEADLINE">Application Deadline</option>
              <option value="FOLLOW_UP">Follow-Up Email</option>
              <option value="CUSTOM">Custom Reminder</option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn primary">Add Reminder</button>
        </div>
      </form>
    </div>
  `);

  $("#add-rem-form").onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify(data)
      });
      toast("Reminder added!");
      closeModal();
      loadPage("deadlines");
    } catch (err) {
      toast(err.message);
    }
  };
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  initNav();
  loadPage("dashboard");
});
