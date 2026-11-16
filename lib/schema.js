function setupSchema(db) {
  db.exec(`
    -- Organizations Catalog (IITs, Government Labs, etc.)
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      organization_type TEXT NOT NULL DEFAULT 'OTHER', -- IIT, GOV_RESEARCH, CENTRAL_UNIV, OTHER
      website TEXT,
      location TEXT DEFAULT 'India',
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Institutional Sources & Monitored Pages
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      source_type TEXT DEFAULT 'OFFICIAL_PAGE', -- INSTITUTION_HOME, INTERNSHIP_PAGE, DEPARTMENT_PAGE, FACULTY_DIRECTORY, LAB_PAGE, PROJECT_PAGE, RSS_FEED
      url TEXT NOT NULL UNIQUE,
      frequency TEXT DEFAULT 'WEEKLY', -- DAILY, WEEKLY, MONTHLY, MANUAL
      status TEXT DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, APPROVED, PAUSED, REJECTED
      trust_level TEXT DEFAULT 'OFFICIAL_DOMAIN_UNCONFIRMED', -- OFFICIAL_CONFIRMED, OFFICIAL_DOMAIN_UNCONFIRMED, SECONDARY_TRUSTED, USER_ADDED_UNVERIFIED
      organization_type TEXT DEFAULT 'OTHER',
      allowed_domain TEXT,
      allowed_path_prefix TEXT,
      last_checked_at TEXT,
      last_success_at TEXT,
      next_check_at TEXT,
      consecutive_failures INTEGER DEFAULT 0,
      review_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Monitoring & Health Checks History
    CREATE TABLE IF NOT EXISTS source_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      status TEXT NOT NULL, -- SUCCESS, FAILED, TIMEOUT, BLOCKED
      http_status INTEGER,
      response_time_ms INTEGER,
      content_length INTEGER,
      new_links_found INTEGER DEFAULT 0,
      opportunities_found INTEGER DEFAULT 0,
      error_message TEXT DEFAULT '',
      checked_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Historical Page Snapshots for Change Detection
    CREATE TABLE IF NOT EXISTS source_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      content_preview TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Discovery Runs (Search Engine, RSS, Crawler Runs)
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL DEFAULT 'SEARCH', -- SEARCH, RSS, CRAWL, MANUAL
      query_or_target TEXT,
      urls_found INTEGER DEFAULT 0,
      new_urls INTEGER DEFAULT 0,
      status TEXT DEFAULT 'COMPLETED', -- RUNNING, COMPLETED, FAILED
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Discovered URLs Queue & Deduplication
    CREATE TABLE IF NOT EXISTS discovered_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT DEFAULT '',
      snippet TEXT DEFAULT '',
      source_type TEXT DEFAULT 'SEARCH_RESULT', -- SEARCH_RESULT, RSS_FEED, PAGE_LINK, PDF_LINK, MANUAL
      discovery_run_id INTEGER REFERENCES discovery_runs(id),
      organization TEXT DEFAULT '',
      status TEXT DEFAULT 'NEW', -- NEW, FETCHED, EXTRACTED, IGNORED
      discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Opportunities Catalog
    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      organization TEXT NOT NULL,
      department TEXT DEFAULT '',
      laboratory TEXT DEFAULT '',
      category TEXT DEFAULT 'RESEARCH_INTERNSHIP', -- SUMMER_INTERNSHIP, WINTER_INTERNSHIP, SEMESTER_INTERNSHIP, RESEARCH_INTERNSHIP, PROJECT_ASSISTANT, RESEARCH_ASSISTANT, FELLOWSHIP, UNDERGRAD_RESEARCH, GOV_INTERNSHIP, INFORMAL_LEAD, OTHER
      location TEXT DEFAULT 'India',
      funding TEXT DEFAULT 'UNKNOWN', -- PAID, UNPAID, STIPEND_UNKNOWN, FUNDED, FUNDING_UNSPECIFIED
      stipend_amount TEXT DEFAULT '',
      duration TEXT DEFAULT '',
      start_date TEXT,
      deadline TEXT,
      official_url TEXT,
      application_url TEXT,
      application_procedure TEXT DEFAULT '',
      contact_info TEXT DEFAULT '',
      description TEXT DEFAULT '',
      eligibility TEXT DEFAULT '',
      degree_requirements TEXT DEFAULT '',
      branch_requirements TEXT DEFAULT '',
      year_requirements TEXT DEFAULT '',
      cgpa_requirements TEXT DEFAULT '',
      skills_required TEXT DEFAULT '',
      application_status TEXT DEFAULT 'OPEN', -- UPCOMING, OPEN, CLOSED, PAUSED, CANCELLED, UNKNOWN
      verification_status TEXT DEFAULT 'UNVERIFIED', -- VERIFIED, PARTIALLY_VERIFIED, UNVERIFIED, STALE, CONFLICTED
      confidence_score REAL DEFAULT 0.0,
      source_url TEXT,
      publication_date TEXT,
      last_verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      saved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Field-Level Supporting Evidence for Opportunities
    CREATE TABLE IF NOT EXISTS opportunity_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL, -- deadline, stipend, eligibility, duration, procedure, etc.
      snippet TEXT NOT NULL,
      source_url TEXT NOT NULL,
      extracted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Researchers & Scientists Profiles
    CREATE TABLE IF NOT EXISTS researchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      department TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      research_areas TEXT DEFAULT '',
      profile_url TEXT,
      lab_url TEXT,
      email TEXT DEFAULT '',
      signal_status TEXT DEFAULT 'RESEARCH_LEAD', -- CONFIRMED_OPEN, POTENTIAL_OPENING, RESEARCH_LEAD, CLOSED, UNKNOWN
      recruitment_evidence TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      last_verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Candidate Profile (FR-01)
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id=1),
      name TEXT DEFAULT 'Student Researcher',
      degree TEXT DEFAULT 'B.Tech',
      branch TEXT DEFAULT 'Computer Science and Engineering',
      institution TEXT DEFAULT 'MMMUT',
      current_year INTEGER DEFAULT 2,
      graduation_year INTEGER DEFAULT 2029,
      cgpa REAL DEFAULT 8.5,
      skills TEXT DEFAULT 'C, C++, Python, JavaScript, Linux, Git, SQL, Docker, Machine Learning, Network Security',
      languages TEXT DEFAULT 'Python, C++, C, JavaScript, Bash',
      technical_interests TEXT DEFAULT 'Cybersecurity, Computer Science, Artificial Intelligence, Machine Learning, Digital Forensics, Computer Networks, Backend Engineering, Databases',
      research_interests TEXT DEFAULT 'Network Security, Applied Cryptography, Adversarial ML, Intrusion Detection Systems, High Performance Distributed Databases',
      preferred_locations TEXT DEFAULT 'India, Remote, Delhi NCR, Mumbai, Kanpur, Bangalore',
      funding_preference TEXT DEFAULT 'PRIORITIZE_PAID', -- ALL, PRIORITIZE_PAID, PAID_ONLY
      preferred_duration TEXT DEFAULT '2-3 Months (Summer/Winter)',
      availability TEXT DEFAULT 'Summer 2027 (May-July) and Winter 2026 (Dec-Jan)',
      preferences TEXT DEFAULT 'Prioritize paid opportunities; include academically valuable unpaid research.',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Application Tracking Pipeline (FR-10)
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'INTERESTED', -- INTERESTED, PREPARING, APPLIED, INTERVIEW, ACCEPTED, REJECTED, WITHDRAWN
      applied_date TEXT,
      follow_up_date TEXT,
      notes TEXT DEFAULT '',
      portal_login_info TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Deadline and Follow-up Reminders (FR-11)
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      reminder_type TEXT NOT NULL, -- DEADLINE, FOLLOW_UP, SOURCE_REVIEW, CUSTOM
      due_date TEXT NOT NULL,
      reference_id INTEGER,
      reference_type TEXT DEFAULT 'opportunity', -- opportunity, application, source
      is_dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Automated Jobs & Execution History (Phase 10)
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL, -- SOURCE_MONITOR, SEARCH_DISCOVERY, RSS_FETCH, VERIFICATION, AUTO_MATCHER
      status TEXT DEFAULT 'COMPLETED', -- RUNNING, COMPLETED, FAILED
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      summary TEXT DEFAULT '',
      error_log TEXT DEFAULT ''
    );
  `);

  // Ensure default candidate profile exists
  db.exec("INSERT OR IGNORE INTO profile(id) VALUES(1);");

  // Backward-compatibility check: ensure any missing columns on existing tables are added
  const tableColumns = (tableName) => db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);

  // Opportunities additions
  const oppCols = tableColumns("opportunities");
  const oppAdditions = {
    department: "TEXT DEFAULT ''",
    laboratory: "TEXT DEFAULT ''",
    stipend_amount: "TEXT DEFAULT ''",
    duration: "TEXT DEFAULT ''",
    start_date: "TEXT",
    application_url: "TEXT",
    application_procedure: "TEXT DEFAULT ''",
    contact_info: "TEXT DEFAULT ''",
    degree_requirements: "TEXT DEFAULT ''",
    branch_requirements: "TEXT DEFAULT ''",
    year_requirements: "TEXT DEFAULT ''",
    cgpa_requirements: "TEXT DEFAULT ''",
    skills_required: "TEXT DEFAULT ''",
    application_status: "TEXT DEFAULT 'OPEN'",
    verification_status: "TEXT DEFAULT 'UNVERIFIED'",
    confidence_score: "REAL DEFAULT 0.0",
    source_url: "TEXT",
    publication_date: "TEXT",
    last_verified_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
  };
  for (const [col, def] of Object.entries(oppAdditions)) {
    if (!oppCols.includes(col)) {
      try { db.exec(`ALTER TABLE opportunities ADD COLUMN ${col} ${def}`); } catch {}
    }
  }

  // Researchers additions
  const resCols = tableColumns("researchers");
  const resAdditions = {
    designation: "TEXT DEFAULT ''",
    lab_url: "TEXT",
    email: "TEXT DEFAULT ''",
    recruitment_evidence: "TEXT DEFAULT ''",
    last_verified_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
  };
  for (const [col, def] of Object.entries(resAdditions)) {
    if (!resCols.includes(col)) {
      try { db.exec(`ALTER TABLE researchers ADD COLUMN ${col} ${def}`); } catch {}
    }
  }

  // Profile additions
  const profCols = tableColumns("profile");
  const profAdditions = {
    name: "TEXT DEFAULT 'Student Researcher'",
    current_year: "INTEGER DEFAULT 2",
    cgpa: "REAL DEFAULT 8.5",
    skills: "TEXT DEFAULT 'C, C++, Python, JavaScript, Linux, Git, SQL, Docker, Machine Learning, Network Security'",
    languages: "TEXT DEFAULT 'Python, C++, C, JavaScript, Bash'",
    technical_interests: "TEXT DEFAULT 'Cybersecurity, Computer Science, Artificial Intelligence, Machine Learning, Digital Forensics, Computer Networks, Backend Engineering, Databases'",
    research_interests: "TEXT DEFAULT 'Network Security, Applied Cryptography, Adversarial ML, Intrusion Detection Systems, High Performance Distributed Databases'",
    preferred_locations: "TEXT DEFAULT 'India, Remote, Delhi NCR, Mumbai, Kanpur, Bangalore'",
    funding_preference: "TEXT DEFAULT 'PRIORITIZE_PAID'",
    preferred_duration: "TEXT DEFAULT '2-3 Months (Summer/Winter)'",
    availability: "TEXT DEFAULT 'Summer 2027 (May-July) and Winter 2026 (Dec-Jan)'",
    updated_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
  };
  for (const [col, def] of Object.entries(profAdditions)) {
    if (!profCols.includes(col)) {
      try { db.exec(`ALTER TABLE profile ADD COLUMN ${col} ${def}`); } catch {}
    }
  }

  // Create indexes for fast searches and filtering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);
    CREATE INDEX IF NOT EXISTS idx_opportunities_category ON opportunities(category);
    CREATE INDEX IF NOT EXISTS idx_opportunities_funding ON opportunities(funding);
    CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(organization);
    CREATE INDEX IF NOT EXISTS idx_researchers_org ON researchers(organization);
    CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
    CREATE INDEX IF NOT EXISTS idx_sources_org ON sources(organization);
    CREATE INDEX IF NOT EXISTS idx_discovered_urls_url ON discovered_urls(url);
    CREATE INDEX IF NOT EXISTS idx_applications_opp ON applications(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
  `);
}

module.exports = { setupSchema };
