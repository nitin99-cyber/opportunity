class ReminderManager {
  constructor(db) {
    this.db = db;
  }

  generateReminders() {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const insertReminder = this.db.prepare(`
      INSERT INTO reminders (title, reminder_type, due_date, reference_id, reference_type)
      SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM reminders 
        WHERE reference_id = ? AND reference_type = ? AND reminder_type = ? AND is_dismissed = 0
      )
    `);

    // 1. Deadline reminders for saved or open opportunities within next 14 days
    const upcomingOpps = this.db.prepare(`
      SELECT id, title, organization, deadline 
      FROM opportunities 
      WHERE deadline IS NOT NULL AND deadline >= ? AND application_status != 'CLOSED'
    `).all(todayStr);

    for (const opp of upcomingOpps) {
      const oppDate = new Date(opp.deadline);
      const diffDays = Math.ceil((oppDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        let title = `Deadline approaching: ${opp.title} (${opp.organization}) in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
        if (diffDays <= 0) title = `Deadline TODAY: ${opp.title} (${opp.organization})`;
        insertReminder.run(title, "DEADLINE", opp.deadline, opp.id, "opportunity", opp.id, "opportunity", "DEADLINE");
      }
    }

    // 2. Application follow-up reminders
    const followUps = this.db.prepare(`
      SELECT a.id, a.follow_up_date, o.title, o.organization
      FROM applications a
      JOIN opportunities o ON a.opportunity_id = o.id
      WHERE a.follow_up_date IS NOT NULL AND a.status IN ('APPLIED', 'INTERVIEW', 'PREPARING')
    `).all();

    for (const app of followUps) {
      const title = `Application Follow-up: ${app.title} (${app.organization})`;
      insertReminder.run(title, "FOLLOW_UP", app.follow_up_date, app.id, "application", app.id, "application", "FOLLOW_UP");
    }

    // 3. Source health alerts (sources with >= 3 consecutive failures)
    const failingSources = this.db.prepare(`
      SELECT id, name, organization, consecutive_failures
      FROM sources
      WHERE consecutive_failures >= 3
    `).all();

    for (const src of failingSources) {
      const title = `Source attention required: ${src.name} (${src.organization}) failed ${src.consecutive_failures} times`;
      insertReminder.run(title, "SOURCE_REVIEW", todayStr, src.id, "source", src.id, "source", "SOURCE_REVIEW");
    }

    return this.getReminders();
  }

  getReminders() {
    return this.db.prepare(`
      SELECT * FROM reminders 
      WHERE is_dismissed = 0 
      ORDER BY due_date ASC, id DESC
    `).all();
  }

  dismiss(id) {
    return this.db.prepare("UPDATE reminders SET is_dismissed = 1 WHERE id = ?").run(id);
  }
}

module.exports = { ReminderManager };
