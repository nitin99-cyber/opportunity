const crypto = require("crypto");
const { safeFetch } = require("./ssrf");
const { extractOpportunityFromContent } = require("./extractor");
const { verifyOpportunity } = require("./verification");

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], baseUrl).toString();
      if (resolved.startsWith("http:") || resolved.startsWith("https:")) {
        links.push(resolved);
      }
    } catch {}
  }
  return [...new Set(links)];
}

function parseRss(xml, feedUrl) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = itemContent.match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = itemContent.match(/<description\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const dateMatch = itemContent.match(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i);

    if (titleMatch && linkMatch) {
      items.push({
        title: stripHtml(titleMatch[1]),
        link: linkMatch[1].trim(),
        description: stripHtml(descMatch ? descMatch[1] : ""),
        pubDate: dateMatch ? dateMatch[1].trim() : null
      });
    }
  }
  return items;
}

class SourceFetcher {
  constructor(db) {
    this.db = db;
  }

  async checkSource(sourceId) {
    const source = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(sourceId);
    if (!source) throw new Error("Source not found");

    const startTime = Date.now();
    let checkStatus = "FAILED";
    let httpStatus = 0;
    let contentLength = 0;
    let newLinksFound = 0;
    let oppsFound = 0;
    let errorMessage = "";

    try {
      const response = await safeFetch(source.url, {
        timeoutMs: 8000,
        allowedDomains: source.allowed_domain ? [source.allowed_domain] : null
      });

      httpStatus = response.status;
      const responseTime = Date.now() - startTime;
      const body = response.text;
      contentLength = body.length;

      const hash = crypto.createHash("sha256").update(body).digest("hex");

      // Check snapshot
      const lastSnapshot = this.db.prepare("SELECT content_hash FROM source_snapshots WHERE source_id = ? ORDER BY id DESC LIMIT 1").get(source.id);
      if (!lastSnapshot || lastSnapshot.content_hash !== hash) {
        this.db.prepare(`
          INSERT INTO source_snapshots (source_id, content_hash, content_preview)
          VALUES (?, ?, ?)
        `).run(source.id, hash, stripHtml(body).slice(0, 500));
      }

      // Check if it's an RSS feed or HTML page
      if (source.source_type === "RSS_FEED" || response.contentType.includes("xml")) {
        const items = parseRss(body, source.url);
        newLinksFound = items.length;
        for (const item of items) {
          const insertUrl = this.db.prepare(`
            INSERT INTO discovered_urls (url, title, snippet, source_type, organization, status)
            VALUES (?, ?, ?, 'RSS_FEED', ?, 'NEW')
            ON CONFLICT(url) DO NOTHING
          `);
          insertUrl.run(item.link, item.title, item.description.slice(0, 300), source.organization);
        }
      } else {
        // HTML page
        const links = extractLinks(body, source.url);
        newLinksFound = links.length;

        // Extract opportunities if this is an approved exact opportunity or department page
        if (source.status === "APPROVED") {
          const extracted = await extractOpportunityFromContent({
            text: stripHtml(body),
            url: source.url,
            organizationHint: source.organization,
            titleHint: source.name
          });

          if (extracted && extracted.title) {
            const ver = verifyOpportunity(extracted, (extracted.evidence || []).length);
            const insertOpp = this.db.prepare(`
              INSERT INTO opportunities (
                title, organization, department, category, location, funding, stipend_amount,
                duration, deadline, official_url, application_url, application_procedure,
                description, eligibility, degree_requirements, branch_requirements, year_requirements,
                cgpa_requirements, skills_required, application_status, verification_status,
                confidence_score, source_url
              ) VALUES (
                @title, @organization, @department, @category, @location, @funding, @stipend_amount,
                @duration, @deadline, @official_url, @application_url, @application_procedure,
                @description, @eligibility, @degree_requirements, @branch_requirements, @year_requirements,
                @cgpa_requirements, @skills_required, @application_status, @verification_status,
                @confidence_score, @source_url
              )
            `);

            const oppRes = insertOpp.run({
              title: extracted.title,
              organization: extracted.organization || source.organization,
              department: extracted.department || "",
              category: extracted.category || "RESEARCH_INTERNSHIP",
              location: extracted.location || "India",
              funding: extracted.funding || "UNKNOWN",
              stipend_amount: extracted.stipend_amount || "",
              duration: extracted.duration || "",
              deadline: extracted.deadline || null,
              official_url: extracted.official_url || source.url,
              application_url: extracted.application_url || source.url,
              application_procedure: extracted.application_procedure || "",
              description: extracted.description || "",
              eligibility: extracted.eligibility || "",
              degree_requirements: extracted.degree_requirements || "",
              branch_requirements: extracted.branch_requirements || "",
              year_requirements: extracted.year_requirements || "",
              cgpa_requirements: extracted.cgpa_requirements || "",
              skills_required: extracted.skills_required || "",
              application_status: ver.application_status,
              verification_status: ver.verification_status,
              confidence_score: extracted.confidence_score || 0.8,
              source_url: source.url
            });

            const oppId = oppRes.lastInsertRowid;
            oppsFound++;

            // Store evidence snippets
            if (extracted.evidence && Array.isArray(extracted.evidence)) {
              const insertEvidence = this.db.prepare(`
                INSERT INTO opportunity_evidence (opportunity_id, field_name, snippet, source_url)
                VALUES (?, ?, ?, ?)
              `);
              for (const ev of extracted.evidence) {
                insertEvidence.run(oppId, ev.field_name, ev.snippet, source.url);
              }
            }
          }
        }
      }

      checkStatus = "SUCCESS";
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE sources
        SET last_checked_at = ?, last_success_at = ?, consecutive_failures = 0
        WHERE id = ?
      `).run(now, now, source.id);

    } catch (err) {
      checkStatus = "FAILED";
      errorMessage = err.message;
      this.db.prepare(`
        UPDATE sources
        SET last_checked_at = ?, consecutive_failures = consecutive_failures + 1
        WHERE id = ?
      `).run(new Date().toISOString(), source.id);
    }

    const checkRes = this.db.prepare(`
      INSERT INTO source_checks (
        source_id, status, http_status, response_time_ms, content_length,
        new_links_found, opportunities_found, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source.id, checkStatus, httpStatus, Date.now() - startTime,
      contentLength, newLinksFound, oppsFound, errorMessage
    );

    return {
      sourceId: source.id,
      status: checkStatus,
      httpStatus,
      newLinksFound,
      opportunitiesFound: oppsFound,
      error: errorMessage || null
    };
  }

  async checkAllApprovedSources() {
    const approved = this.db.prepare("SELECT id FROM sources WHERE status = 'APPROVED'").all();
    const results = [];
    for (const row of approved) {
      try {
        const res = await this.checkSource(row.id);
        results.push(res);
      } catch (e) {
        results.push({ sourceId: row.id, status: "ERROR", error: e.message });
      }
    }
    return results;
  }
}

module.exports = { SourceFetcher, stripHtml, extractLinks, parseRss };
