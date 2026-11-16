const { DiscoveryEngine } = require("./discovery");
const { SourceFetcher } = require("./fetcher");
const { ReminderManager } = require("./reminders");
const { verifyOpportunity } = require("./verification");

class JobScheduler {
  constructor(db) {
    this.db = db;
    this.discoveryEngine = new DiscoveryEngine(db);
    this.fetcher = new SourceFetcher(db);
    this.reminders = new ReminderManager(db);
    this.runningJobs = new Set();
    this.timer = null;
  }

  async runJob(jobType, taskFn) {
    if (this.runningJobs.has(jobType)) {
      return { skipped: true, reason: `Job ${jobType} is already running` };
    }

    this.runningJobs.add(jobType);
    const startRes = this.db.prepare(`
      INSERT INTO jobs (job_type, status, started_at)
      VALUES (?, 'RUNNING', CURRENT_TIMESTAMP)
    `).run(jobType);
    const jobId = startRes.lastInsertRowid;

    try {
      const summary = await taskFn();
      const summaryStr = typeof summary === "string" ? summary : JSON.stringify(summary);
      this.db.prepare(`
        UPDATE jobs 
        SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP, summary = ?
        WHERE id = ?
      `).run(summaryStr, jobId);
      return { jobId, status: "COMPLETED", summary };
    } catch (err) {
      this.db.prepare(`
        UPDATE jobs 
        SET status = 'FAILED', finished_at = CURRENT_TIMESTAMP, error_log = ?
        WHERE id = ?
      `).run(err.message, jobId);
      throw err;
    } finally {
      this.runningJobs.delete(jobType);
    }
  }

  async runDiscoveryJob() {
    return this.runJob("SEARCH_DISCOVERY", async () => {
      const res = await this.discoveryEngine.runDiscovery("SEARCH");
      return `Found ${res.urlsFound} targets, ${res.newUrls} new URLs added to queue.`;
    });
  }

  async runMonitoringJob() {
    return this.runJob("SOURCE_MONITOR", async () => {
      const results = await this.fetcher.checkAllApprovedSources();
      return `Checked ${results.length} approved sources.`;
    });
  }

  async runVerificationJob() {
    return this.runJob("VERIFICATION", async () => {
      const opps = this.db.prepare("SELECT * FROM opportunities").all();
      let updated = 0;
      for (const opp of opps) {
        const evidenceCount = this.db.prepare("SELECT COUNT(*) AS n FROM opportunity_evidence WHERE opportunity_id = ?").get(opp.id).n;
        const ver = verifyOpportunity(opp, evidenceCount);
        if (ver.application_status !== opp.application_status || ver.verification_status !== opp.verification_status) {
          this.db.prepare(`
            UPDATE opportunities 
            SET application_status = ?, verification_status = ?, last_verified_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(ver.application_status, ver.verification_status, opp.id);
          updated++;
        }
      }
      return `Re-verified ${opps.length} opportunities; ${updated} status changes applied.`;
    });
  }

  async runRemindersJob() {
    return this.runJob("REMINDERS_SYNC", async () => {
      const list = this.reminders.generateReminders();
      return `Active reminders synced: ${list.length} pending alerts.`;
    });
  }

  getJobHistory() {
    return this.db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 20").all();
  }

  startPeriodicTasks(intervalMs = 300000) { // default 5 minutes
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(async () => {
      try {
        await this.runVerificationJob();
        await this.runRemindersJob();
      } catch (e) {
        console.error("Scheduled task cycle error:", e.message);
      }
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = { JobScheduler };
