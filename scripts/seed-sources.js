const fs = require("fs");
const path = require("path");
const { initDb } = require("../db");

const db = initDb();

// Ensure sources table exists before seeding
db.exec(`
CREATE TABLE IF NOT EXISTS sources (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, organization TEXT NOT NULL,
 source_type TEXT DEFAULT 'OFFICIAL_PAGE', url TEXT NOT NULL UNIQUE,
 frequency TEXT DEFAULT 'WEEKLY', status TEXT DEFAULT 'PENDING_REVIEW',
 trust_level TEXT DEFAULT 'OFFICIAL_DOMAIN_UNCONFIRMED',
 organization_type TEXT DEFAULT 'OTHER',
 allowed_domain TEXT, allowed_path_prefix TEXT,
 last_checked_at TEXT, last_success_at TEXT, next_check_at TEXT,
 consecutive_failures INTEGER DEFAULT 0, review_note TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "source-catalog.json"), "utf8"));

const insert = db.prepare(`
 INSERT INTO sources
 (name, organization, source_type, url, frequency, status, trust_level, organization_type, review_note)
 VALUES (@name, @organization, 'INSTITUTION_HOME', @url, 'WEEKLY', 'PENDING_REVIEW',
         'OFFICIAL_DOMAIN_UNCONFIRMED', @organization_type,
         'Institution homepage seed only. Review and add the specific internship, department, lab or faculty page before monitoring.')
 ON CONFLICT(url) DO NOTHING
`);
const run = db.transaction(rows => rows.forEach(row => insert.run(row)));
run(catalog);
const total = db.prepare("SELECT COUNT(*) AS n FROM sources").get().n;
const pending = db.prepare("SELECT COUNT(*) AS n FROM sources WHERE status='PENDING_REVIEW'").get().n;
console.log(`Source catalog processed: ${catalog.length}`);
console.log(`Sources currently in database: ${total}`);
console.log(`Pending review: ${pending}`);
db.close();
