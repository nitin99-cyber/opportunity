try { process.loadEnvFile(); } catch {}

const express = require("express");
const path = require("path");
const fs = require("fs");
const { initDb } = require("./db");
const { setupSchema } = require("./lib/schema");
const { seedDatabase } = require("./lib/seed-data");
const { calculateMatchScore } = require("./lib/matcher");
const { verifyOpportunity } = require("./lib/verification");
const { DiscoveryEngine } = require("./lib/discovery");
const { SourceFetcher } = require("./lib/fetcher");
const { ReminderManager } = require("./lib/reminders");
const { JobScheduler } = require("./lib/scheduler");
const { parsePdfBuffer, extractProfileFromResume } = require("./lib/resume");
const { auditAndApplySourceApproval, evaluateSourceAuthenticity } = require("./lib/source-verifier");

const app = express();
app.disable("x-powered-by");

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const db = initDb();

// 1. Initialize Schema & Seeds
setupSchema(db);
seedDatabase(db);

const discovery = new DiscoveryEngine(db);
const fetcher = new SourceFetcher(db);
const reminders = new ReminderManager(db);
const scheduler = new JobScheduler(db);

// Sync initial reminders
reminders.generateReminders();

// Start periodic verification and reminder checks
scheduler.startPeriodicTasks(300000); // every 5 minutes

app.use(express.raw({ type: "application/pdf", limit: "15mb" }));
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

const all = sql => db.prepare(sql).all();
const one = sql => db.prepare(sql).get();

// Helper to attach match score to opportunities
function attachMatchScores(opps) {
  const profile = db.prepare("SELECT * FROM profile WHERE id=1").get() || {};
  return opps.map(opp => {
    const match = calculateMatchScore(profile, opp);
    const evidence = db.prepare("SELECT field_name, snippet, source_url FROM opportunity_evidence WHERE opportunity_id=?").all(opp.id);
    const appTrack = db.prepare("SELECT id, status, applied_date, follow_up_date, notes FROM applications WHERE opportunity_id=?").get(opp.id);
    return {
      ...opp,
      match_score: match.score,
      eligibility_status: match.eligibility.status,
      eligibility_reasons: match.eligibility.reasons,
      match_breakdown: match.breakdown,
      match_factors: match.factors,
      evidence,
      application: appTrack || null
    };
  });
}

// ==========================================
// API ROUTES
// ==========================================

// Health
app.get("/api/health", (_, res) => res.json({ ok: true, version: "1.0.0", mode: "local" }));

// 1. Dashboard Overview (PRD Section 10.1 & FR-09)
app.get("/api/dashboard", (_, res) => {
  const profile = db.prepare("SELECT * FROM profile WHERE id=1").get() || {};
  const rawOpps = all("SELECT * FROM opportunities ORDER BY id DESC");
  const scoredOpps = attachMatchScores(rawOpps);

  // Top matches sorted by score
  const topMatches = [...scoredOpps].sort((a, b) => b.match_score - a.match_score).slice(0, 6);

  // Upcoming deadlines (within next 30 days)
  const today = new Date().toISOString().split("T")[0];
  const upcomingDeadlines = scoredOpps
    .filter(o => o.deadline && o.deadline >= today && o.application_status !== "CLOSED")
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 5);

  // Top researcher leads
  const researcherLeads = all("SELECT * FROM researchers ORDER BY id DESC LIMIT 5");

  // Active reminders
  const activeReminders = reminders.getReminders().slice(0, 5);

  res.json({
    profile,
    stats: {
      opportunities: one("SELECT COUNT(*) n FROM opportunities").n,
      saved: one("SELECT COUNT(*) n FROM opportunities WHERE saved=1").n,
      researchers: one("SELECT COUNT(*) n FROM researchers").n,
      sources: one("SELECT COUNT(*) n FROM sources").n,
      sourcesPending: one("SELECT COUNT(*) n FROM sources WHERE status='PENDING_REVIEW'").n,
      sourcesApproved: one("SELECT COUNT(*) n FROM sources WHERE status='APPROVED'").n,
      applications: one("SELECT COUNT(*) n FROM applications").n,
      activeReminders: activeReminders.length
    },
    topMatches,
    upcomingDeadlines,
    researcherLeads,
    reminders: activeReminders
  });
});

// 2. Opportunities (PRD Section 6 FR-05, FR-06, FR-07, FR-08)
app.get("/api/opportunities", (req, res) => {
  let opps = all("SELECT * FROM opportunities ORDER BY id DESC");
  opps = attachMatchScores(opps);

  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  const funding = String(req.query.funding || "").trim();
  const eligibility = String(req.query.eligibility || "").trim();
  const verification = String(req.query.verification || "").trim();
  const organization = String(req.query.organization || "").trim();
  const savedOnly = req.query.saved === "1";
  const minScore = Number(req.query.min_score) || 0;
  const sort = String(req.query.sort || "score");

  if (q) {
    opps = opps.filter(o => 
      [o.title, o.organization, o.department, o.description, o.skills_required, o.eligibility]
        .join(" ").toLowerCase().includes(q)
    );
  }
  if (category) opps = opps.filter(o => o.category === category);
  if (funding) opps = opps.filter(o => o.funding === funding);
  if (eligibility) opps = opps.filter(o => o.eligibility_status === eligibility);
  if (verification) opps = opps.filter(o => o.verification_status === verification);
  if (organization) opps = opps.filter(o => o.organization.toLowerCase() === organization.toLowerCase());
  if (savedOnly) opps = opps.filter(o => o.saved === 1);
  if (minScore > 0) opps = opps.filter(o => o.match_score >= minScore);

  // Sorting
  if (sort === "score") {
    opps.sort((a, b) => b.match_score - a.match_score);
  } else if (sort === "deadline") {
    opps.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  } else if (sort === "newest") {
    opps.sort((a, b) => b.id - a.id);
  }

  res.json(opps);
});

app.get("/api/opportunities/:id", (req, res) => {
  const opp = db.prepare("SELECT * FROM opportunities WHERE id=?").get(Number(req.params.id));
  if (!opp) return res.status(404).json({ error: "Opportunity not found" });
  const [scored] = attachMatchScores([opp]);
  res.json(scored);
});

app.post("/api/opportunities", (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.organization) {
    return res.status(400).json({ error: "Title and organization are required" });
  }

  const ver = verifyOpportunity(b, 0);

  const r = db.prepare(`
    INSERT INTO opportunities (
      title, organization, department, laboratory, category, location, funding,
      stipend_amount, duration, deadline, official_url, application_url, application_procedure,
      description, eligibility, degree_requirements, branch_requirements, year_requirements,
      cgpa_requirements, skills_required, application_status, verification_status,
      confidence_score, source_url
    ) VALUES (
      @title, @organization, @department, @laboratory, @category, @location, @funding,
      @stipend_amount, @duration, @deadline, @official_url, @application_url, @application_procedure,
      @description, @eligibility, @degree_requirements, @branch_requirements, @year_requirements,
      @cgpa_requirements, @skills_required, @application_status, @verification_status,
      @confidence_score, @source_url
    )
  `).run({
    title: b.title,
    organization: b.organization,
    department: b.department || "",
    laboratory: b.laboratory || "",
    category: b.category || "RESEARCH_INTERNSHIP",
    location: b.location || "India",
    funding: b.funding || "UNKNOWN",
    stipend_amount: b.stipend_amount || "",
    duration: b.duration || "",
    deadline: b.deadline || null,
    official_url: b.official_url || null,
    application_url: b.application_url || null,
    application_procedure: b.application_procedure || "",
    description: b.description || "",
    eligibility: b.eligibility || "",
    degree_requirements: b.degree_requirements || "",
    branch_requirements: b.branch_requirements || "",
    year_requirements: b.year_requirements || "",
    cgpa_requirements: b.cgpa_requirements || "",
    skills_required: b.skills_required || "",
    application_status: ver.application_status,
    verification_status: ver.verification_status,
    confidence_score: 1.0,
    source_url: b.official_url || null
  });

  const inserted = db.prepare("SELECT * FROM opportunities WHERE id=?").get(r.lastInsertRowid);
  res.status(201).json(inserted);
});

app.patch("/api/opportunities/:id", (req, res) => {
  const b = req.body || {};
  const allowed = [
    "saved", "application_status", "verification_status", "deadline", "funding",
    "stipend_amount", "title", "department", "description", "eligibility"
  ];
  const keys = allowed.filter(k => b[k] !== undefined);
  if (!keys.length) return res.status(400).json({ error: "No supported fields supplied" });

  const sets = keys.map(k => `${k}=@${k}`).join(", ");
  const result = db.prepare(`UPDATE opportunities SET ${sets} WHERE id=@id`).run({ ...b, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Opportunity not found" });

  const updated = db.prepare("SELECT * FROM opportunities WHERE id=?").get(Number(req.params.id));
  const [scored] = attachMatchScores([updated]);
  res.json(scored);
});

app.delete("/api/opportunities/:id", (req, res) => {
  const r = db.prepare("DELETE FROM opportunities WHERE id=?").run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, deleted: req.params.id });
});

// 3. Researchers & Labs (PRD Section 6 FR-04 & Section 10.3)
app.get("/api/researchers", (req, res) => {
  let rows = all("SELECT * FROM researchers ORDER BY id DESC");
  const q = String(req.query.q || "").trim().toLowerCase();
  const org = String(req.query.organization || "").trim().toLowerCase();
  const signal = String(req.query.signal_status || "").trim();

  if (q) {
    rows = rows.filter(r => 
      [r.name, r.organization, r.department, r.research_areas, r.notes].join(" ").toLowerCase().includes(q)
    );
  }
  if (org) rows = rows.filter(r => r.organization.toLowerCase() === org);
  if (signal) rows = rows.filter(r => r.signal_status === signal);

  res.json(rows);
});

app.post("/api/researchers", (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.organization) return res.status(400).json({ error: "Name and organization required" });

  const r = db.prepare(`
    INSERT INTO researchers (
      name, organization, department, designation, research_areas,
      profile_url, lab_url, email, signal_status, recruitment_evidence, notes
    ) VALUES (
      @name, @organization, @department, @designation, @research_areas,
      @profile_url, @lab_url, @email, @signal_status, @recruitment_evidence, @notes
    )
  `).run({
    name: b.name,
    organization: b.organization,
    department: b.department || "",
    designation: b.designation || "",
    research_areas: b.research_areas || "",
    profile_url: b.profile_url || null,
    lab_url: b.lab_url || null,
    email: b.email || "",
    signal_status: b.signal_status || "RESEARCH_LEAD",
    recruitment_evidence: b.recruitment_evidence || "",
    notes: b.notes || ""
  });

  res.status(201).json(db.prepare("SELECT * FROM researchers WHERE id=?").get(r.lastInsertRowid));
});

app.patch("/api/researchers/:id", (req, res) => {
  const b = req.body || {};
  const allowed = ["name", "organization", "department", "designation", "research_areas", "profile_url", "lab_url", "email", "signal_status", "recruitment_evidence", "notes"];
  const keys = allowed.filter(k => b[k] !== undefined);
  if (!keys.length) return res.status(400).json({ error: "No supported fields" });

  const sets = keys.map(k => `${k}=@${k}`).join(", ");
  const result = db.prepare(`UPDATE researchers SET ${sets} WHERE id=@id`).run({ ...b, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Researcher not found" });

  res.json(db.prepare("SELECT * FROM researchers WHERE id=?").get(Number(req.params.id)));
});

// 4. Institutions Directory (PRD Section 3.2 & Section 10.4)
app.get("/api/organizations", (_, res) => {
  const orgs = all("SELECT * FROM organizations ORDER BY organization_type, name");
  const enriched = orgs.map(org => {
    const oppsCount = db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE organization=?").get(org.name).n;
    const resCount = db.prepare("SELECT COUNT(*) AS n FROM researchers WHERE organization=?").get(org.name).n;
    const sourcesCount = db.prepare("SELECT COUNT(*) AS n FROM sources WHERE organization=?").get(org.name).n;
    const approvedSourcesCount = db.prepare("SELECT COUNT(*) AS n FROM sources WHERE organization=? AND status='APPROVED'").get(org.name).n;
    return {
      ...org,
      stats: {
        opportunities: oppsCount,
        researchers: resCount,
        sources: sourcesCount,
        approvedSources: approvedSourcesCount
      }
    };
  });
  res.json(enriched);
});

// 5. Source Registry (PRD Section 6 FR-02 & Section 10.5)
app.get("/api/sources", (req, res) => {
  const where = req.query.status ? "WHERE status=?" : "";
  const rows = req.query.status 
    ? db.prepare(`SELECT * FROM sources ${where} ORDER BY organization, name`).all(String(req.query.status)) 
    : all("SELECT * FROM sources ORDER BY organization, name");
  res.json(rows);
});

app.post("/api/sources", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.organization || !b.url) return res.status(400).json({ error: "Name, organization and URL required" });
  let parsed;
  try { parsed = new URL(b.url); } catch { return res.status(400).json({ error: "Enter a valid absolute URL" }); }
  if (!["https:", "http:"].includes(parsed.protocol)) return res.status(400).json({ error: "Only HTTP(S) source URLs are allowed" });

  try {
    const r = db.prepare(`
      INSERT INTO sources (
        name, organization, source_type, url, frequency, status, trust_level,
        organization_type, allowed_domain, review_note
      ) VALUES (
        @name, @organization, @source_type, @url, @frequency, 'PENDING_REVIEW',
        'USER_ADDED_UNVERIFIED', @organization_type, @allowed_domain, @review_note
      )
    `).run({
      name: b.name,
      organization: b.organization,
      source_type: b.source_type || "OFFICIAL_PAGE",
      url: parsed.toString(),
      frequency: b.frequency || "WEEKLY",
      organization_type: b.organization_type || "OTHER",
      allowed_domain: parsed.hostname,
      review_note: "Evaluating source authenticity with AI..."
    });

    const newSource = db.prepare("SELECT * FROM sources WHERE id=?").get(r.lastInsertRowid);
    
    // Evaluate authenticity with AI (Auto-approve if > 85%, otherwise PENDING_REVIEW)
    const auditRes = await auditAndApplySourceApproval(newSource, db);
    const finalized = db.prepare("SELECT * FROM sources WHERE id=?").get(r.lastInsertRowid);

    res.status(201).json({
      ...finalized,
      ai_audit: auditRes
    });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "This URL is already registered" });
    throw e;
  }
});

// AI Source Authenticity Verification & Auto-Approval (Batch Audit)
app.post("/api/sources/ai-audit", async (req, res) => {
  try {
    const sourcesToAudit = all("SELECT * FROM sources WHERE status = 'PENDING_REVIEW' OR status IS NULL");
    let autoApprovedCount = 0;
    let pendingCount = 0;
    const results = [];

    for (const source of sourcesToAudit) {
      const outcome = await auditAndApplySourceApproval(source, db);
      if (outcome.auto_approved) {
        autoApprovedCount++;
      } else {
        pendingCount++;
      }
      results.push(outcome);
    }

    res.json({
      ok: true,
      totalAudited: sourcesToAudit.length,
      autoApprovedCount,
      pendingCount,
      threshold: "85%",
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Source AI Authenticity Check & Auto-Approval
app.post("/api/sources/:id/ai-verify", async (req, res) => {
  const source = db.prepare("SELECT * FROM sources WHERE id=?").get(Number(req.params.id));
  if (!source) return res.status(404).json({ error: "Source not found" });

  try {
    const auditResult = await auditAndApplySourceApproval(source, db);
    const updated = db.prepare("SELECT * FROM sources WHERE id=?").get(Number(req.params.id));
    res.json({
      ok: true,
      source: updated,
      ai_audit: auditResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/sources/:id", (req, res) => {
  const b = req.body || {};
  const allowed = ["status", "frequency", "source_type", "name", "organization", "allowed_path_prefix", "review_note"];
  const keys = allowed.filter(k => b[k] !== undefined);
  if (!keys.length) return res.status(400).json({ error: "No supported source fields supplied" });

  if (b.status && !["PENDING_REVIEW", "APPROVED", "PAUSED", "REJECTED"].includes(b.status)) {
    return res.status(400).json({ error: "Invalid source status" });
  }
  if (b.frequency && !["DAILY", "WEEKLY", "MONTHLY", "MANUAL"].includes(b.frequency)) {
    return res.status(400).json({ error: "Invalid check frequency" });
  }

  const sets = keys.map(k => `${k}=@${k}`).join(", ");
  const result = db.prepare(`UPDATE sources SET ${sets} WHERE id=@id`).run({ ...b, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Source not found" });

  res.json(db.prepare("SELECT * FROM sources WHERE id=?").get(Number(req.params.id)));
});

// Check a single source on-demand (Safe Fetch & Parse)
app.post("/api/sources/:id/check", async (req, res) => {
  try {
    const result = await fetcher.checkSource(Number(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get check history for a source
app.get("/api/sources/:id/checks", (req, res) => {
  const checks = db.prepare("SELECT * FROM source_checks WHERE source_id=? ORDER BY id DESC LIMIT 20").all(Number(req.params.id));
  res.json(checks);
});

// 6. Discovery Engine (PRD Phase 2 & FR-03)
app.get("/api/discovery/stats", (_, res) => {
  res.json(discovery.getDiscoveryStats());
});

app.get("/api/discovery/queries", (_, res) => {
  res.json(discovery.getQueries());
});

app.get("/api/discovery/urls", (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = status
    ? db.prepare("SELECT * FROM discovered_urls WHERE status=? ORDER BY id DESC LIMIT 50").all(status)
    : all("SELECT * FROM discovered_urls ORDER BY id DESC LIMIT 50");
  res.json(rows);
});

app.post("/api/discovery/run", async (req, res) => {
  const { run_type, query } = req.body || {};
  try {
    const runResult = await discovery.runDiscovery(run_type || "SEARCH", query);
    res.json(runResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Applications Tracking Pipeline (PRD FR-10 & Section 10.7)
app.get("/api/applications", (_, res) => {
  const rows = all(`
    SELECT a.*, o.title, o.organization, o.category, o.deadline, o.official_url, o.funding
    FROM applications a
    JOIN opportunities o ON a.opportunity_id = o.id
    ORDER BY a.updated_at DESC
  `);
  res.json(rows);
});

app.post("/api/applications", (req, res) => {
  const b = req.body || {};
  if (!b.opportunity_id) return res.status(400).json({ error: "Opportunity ID required" });

  const existing = db.prepare("SELECT * FROM applications WHERE opportunity_id=?").get(Number(b.opportunity_id));
  if (existing) {
    return res.status(409).json({ error: "Opportunity is already being tracked in your applications" });
  }

  const r = db.prepare(`
    INSERT INTO applications (opportunity_id, status, applied_date, follow_up_date, notes, portal_login_info)
    VALUES (@opportunity_id, @status, @applied_date, @follow_up_date, @notes, @portal_login_info)
  `).run({
    opportunity_id: Number(b.opportunity_id),
    status: b.status || "INTERESTED",
    applied_date: b.applied_date || null,
    follow_up_date: b.follow_up_date || null,
    notes: b.notes || "",
    portal_login_info: b.portal_login_info || ""
  });

  // Re-sync reminders if follow up was set
  if (b.follow_up_date) reminders.generateReminders();

  const inserted = db.prepare(`
    SELECT a.*, o.title, o.organization, o.category, o.deadline, o.official_url, o.funding
    FROM applications a
    JOIN opportunities o ON a.opportunity_id = o.id
    WHERE a.id=?
  `).get(r.lastInsertRowid);

  res.status(201).json(inserted);
});

app.patch("/api/applications/:id", (req, res) => {
  const b = req.body || {};
  const allowed = ["status", "applied_date", "follow_up_date", "notes", "portal_login_info"];
  const keys = allowed.filter(k => b[k] !== undefined);
  if (!keys.length) return res.status(400).json({ error: "No supported fields" });

  const sets = keys.map(k => `${k}=@${k}`).join(", ") + ", updated_at=CURRENT_TIMESTAMP";
  const result = db.prepare(`UPDATE applications SET ${sets} WHERE id=@id`).run({ ...b, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Application not found" });

  if (b.follow_up_date) reminders.generateReminders();

  const updated = db.prepare(`
    SELECT a.*, o.title, o.organization, o.category, o.deadline, o.official_url, o.funding
    FROM applications a
    JOIN opportunities o ON a.opportunity_id = o.id
    WHERE a.id=?
  `).get(Number(req.params.id));

  res.json(updated);
});

app.delete("/api/applications/:id", (req, res) => {
  const r = db.prepare("DELETE FROM applications WHERE id=?").run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, deleted: req.params.id });
});

// 8. Deadlines & Reminders (PRD FR-11 & Section 10.8)
app.get("/api/reminders", (_, res) => {
  reminders.generateReminders();
  res.json(reminders.getReminders());
});

app.post("/api/reminders", (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.due_date) return res.status(400).json({ error: "Title and due date required" });

  const r = db.prepare(`
    INSERT INTO reminders (title, reminder_type, due_date, reference_id, reference_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(b.title, b.reminder_type || "CUSTOM", b.due_date, b.reference_id || null, b.reference_type || "custom");

  res.status(201).json(db.prepare("SELECT * FROM reminders WHERE id=?").get(r.lastInsertRowid));
});

app.patch("/api/reminders/:id/dismiss", (req, res) => {
  reminders.dismiss(Number(req.params.id));
  res.json({ ok: true, dismissed: req.params.id });
});

// 9. Candidate Profile (PRD FR-01 & Section 10.9)
app.get("/api/profile", (_, res) => {
  res.json(db.prepare("SELECT * FROM profile WHERE id=1").get());
});

app.put("/api/profile", (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE profile SET
      name = @name,
      degree = @degree,
      branch = @branch,
      institution = @institution,
      current_year = @current_year,
      graduation_year = @graduation_year,
      cgpa = @cgpa,
      skills = @skills,
      languages = @languages,
      technical_interests = @technical_interests,
      research_interests = @research_interests,
      preferred_locations = @preferred_locations,
      funding_preference = @funding_preference,
      preferred_duration = @preferred_duration,
      availability = @availability,
      preferences = @preferences,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run({
    name: b.name || "Student Researcher",
    degree: b.degree || "B.Tech",
    branch: b.branch || "Computer Science and Engineering",
    institution: b.institution || "MMMUT",
    current_year: Number(b.current_year) || 2,
    graduation_year: Number(b.graduation_year) || 2029,
    cgpa: parseFloat(b.cgpa) || 8.5,
    skills: b.skills || "",
    languages: b.languages || "",
    technical_interests: b.technical_interests || "",
    research_interests: b.research_interests || "",
    preferred_locations: b.preferred_locations || "",
    funding_preference: b.funding_preference || "PRIORITIZE_PAID",
    preferred_duration: b.preferred_duration || "",
    availability: b.availability || "",
    preferences: b.preferences || ""
  });

  res.json(db.prepare("SELECT * FROM profile WHERE id=1").get());
});

// Upload and Parse PDF / Text Resume
app.post("/api/profile/upload-resume", async (req, res) => {
  try {
    let resumeText = "";

    if (Buffer.isBuffer(req.body)) {
      // Raw binary PDF buffer
      resumeText = await parsePdfBuffer(req.body);
    } else if (req.body && req.body.base64) {
      // Base64 encoded PDF
      const cleanBase64 = String(req.body.base64).replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      resumeText = await parsePdfBuffer(buffer);
    } else if (req.body && req.body.text) {
      // Plain text resume
      resumeText = String(req.body.text);
    } else {
      return res.status(400).json({ error: "Please provide a PDF file (base64 or binary) or resume text." });
    }

    if (!resumeText || resumeText.trim().length < 20) {
      return res.status(400).json({ error: "Could not extract sufficient text from the provided resume." });
    }

    // Extract structured profile details
    const extracted = await extractProfileFromResume(resumeText);

    // Persist to profile table
    db.prepare(`
      UPDATE profile SET
        name = @name,
        degree = @degree,
        branch = @branch,
        institution = @institution,
        current_year = @current_year,
        graduation_year = @graduation_year,
        cgpa = @cgpa,
        skills = @skills,
        languages = @languages,
        technical_interests = @technical_interests,
        research_interests = @research_interests,
        preferred_locations = @preferred_locations,
        funding_preference = @funding_preference,
        preferred_duration = @preferred_duration,
        availability = @availability,
        preferences = @preferences,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run({
      name: extracted.name || "Student Researcher",
      degree: extracted.degree || "B.Tech",
      branch: extracted.branch || "Computer Science and Engineering",
      institution: extracted.institution || "MMMUT",
      current_year: Number(extracted.current_year) || 2,
      graduation_year: Number(extracted.graduation_year) || 2029,
      cgpa: parseFloat(extracted.cgpa) || 8.5,
      skills: extracted.skills || "",
      languages: extracted.languages || "",
      technical_interests: extracted.technical_interests || "",
      research_interests: extracted.research_interests || "",
      preferred_locations: extracted.preferred_locations || "India, Remote",
      funding_preference: extracted.funding_preference || "PRIORITIZE_PAID",
      preferred_duration: extracted.preferred_duration || "2-3 Months",
      availability: extracted.availability || "",
      preferences: extracted.preferences || ""
    });

    const updated = db.prepare("SELECT * FROM profile WHERE id=1").get();

    // Sync reminders with new candidate status
    reminders.generateReminders();

    res.json({
      ok: true,
      profile: updated,
      extracted_preview: resumeText.slice(0, 400).trim() + "..."
    });
  } catch (err) {
    console.error("Resume processing error:", err);
    res.status(500).json({ error: err.message || "Failed to parse resume." });
  }
});

// 10. Automation & Scheduled Jobs (PRD Phase 10 & Section 10.10)
app.get("/api/jobs", (_, res) => {
  res.json(scheduler.getJobHistory());
});

app.post("/api/jobs/run", async (req, res) => {
  const { job_type } = req.body || {};
  try {
    let result;
    if (job_type === "SOURCE_MONITOR") {
      result = await scheduler.runMonitoringJob();
    } else if (job_type === "SEARCH_DISCOVERY") {
      result = await scheduler.runDiscoveryJob();
    } else if (job_type === "VERIFICATION") {
      result = await scheduler.runVerificationJob();
    } else if (job_type === "REMINDERS_SYNC") {
      result = await scheduler.runRemindersJob();
    } else {
      return res.status(400).json({ error: "Unknown job_type" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Configuration & API Keys
app.get("/api/config", (_, res) => {
  const key = process.env.GEMINI_API_KEY || "";
  const maskedKey = key.length > 8 ? key.slice(0, 6) + "..." + key.slice(-4) : "";
  res.json({
    hasGeminiKey: !!key,
    maskedKey,
    port: process.env.PORT || 3000
  });
});

app.post("/api/config", (req, res) => {
  const { gemini_api_key } = req.body || {};
  if (typeof gemini_api_key === "string") {
    process.env.GEMINI_API_KEY = gemini_api_key.trim();

    // Persist to .env file
    const envPath = path.join(__dirname, ".env");
    let envContent = "";
    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }
    } catch {}

    if (/^GEMINI_API_KEY=.*$/m.test(envContent)) {
      envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
    } else {
      envContent += `\nGEMINI_API_KEY=${process.env.GEMINI_API_KEY}\n`;
    }

    try {
      fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");
    } catch (err) {
      console.warn("Could not write to .env file:", err.message);
    }
  }

  const key = process.env.GEMINI_API_KEY || "";
  res.json({
    ok: true,
    hasGeminiKey: !!key,
    maskedKey: key.length > 8 ? key.slice(0, 6) + "..." + key.slice(-4) : ""
  });
});

// Serve frontend SPA fallback
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Opportunity Radar running on: http://localhost:${port}`));
