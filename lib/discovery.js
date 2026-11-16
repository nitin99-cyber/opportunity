const { safeFetch } = require("./ssrf");

const DISCOVERY_QUERIES = [
  { category: "INSTITUTION_INTERNSHIPS", query: "undergraduate research internship IIT computer science" },
  { category: "INSTITUTION_INTERNSHIPS", query: "summer research fellowship IIT cybersecurity" },
  { category: "INSTITUTION_INTERNSHIPS", query: "winter research internship IIT Bombay Delhi Madras Kanpur" },
  { category: "GOV_RESEARCH", query: "project assistant computer science DRDO" },
  { category: "GOV_RESEARCH", query: "student research internship CSIR computer science" },
  { category: "GOV_RESEARCH", query: "ISRO START respond student research fellowship" },
  { category: "GOV_RESEARCH", query: "C-DAC student project internship software engineering" },
  { category: "RESEARCHER_LEADS", query: "IIT faculty cybersecurity research group undergraduate" },
  { category: "RESEARCHER_LEADS", query: "undergraduate students research project AI IIT professor" },
  { category: "RESEARCHER_LEADS", query: "IIT computer science laboratory research assistant opening" }
];

const KNOWN_OFFICIAL_DISCOVERY_TARGETS = [
  {
    organization: "IIT Madras",
    title: "IIT Madras Summer Fellowship Programme (SFP)",
    url: "https://sfp.iitm.ac.in/",
    category: "SUMMER_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "Summer Fellowship Programme at IIT Madras for two months with stipend for engineering and science undergraduates."
  },
  {
    organization: "IIT Kanpur",
    title: "SURGE — Students Undergraduate Research Graduate Excellence",
    url: "https://surge.iitk.ac.in/",
    category: "SUMMER_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "SURGE programme at IIT Kanpur provides research opportunities to talented undergraduate students under faculty mentorship."
  },
  {
    organization: "IIT Roorkee",
    title: "SPARK — Institute Summer Internship Programme",
    url: "https://spark.iitr.ac.in/",
    category: "SUMMER_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "SPARK Summer Internship at IIT Roorkee for undergraduate students from recognized institutions across India with financial support."
  },
  {
    organization: "IIT Delhi",
    title: "IIT Delhi Summer Research Fellowship Programme",
    url: "https://home.iitd.ac.in/academic-summer.php",
    category: "SUMMER_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "Summer research fellowships for outstanding undergraduate engineering students to pursue summer research under IIT Delhi faculty."
  },
  {
    organization: "IIT Bombay",
    title: "IIT Bombay FOSSEE Summer Research Fellowship",
    url: "https://fossee.in/fellowship",
    category: "FELLOWSHIP",
    source_type: "PAGE_LINK",
    snippet: "MHRD & IIT Bombay sponsored fellowship for students in engineering, open source software, and computational science with stipend."
  },
  {
    organization: "IIT Gandhinagar",
    title: "SRIP — Summer Research Internship Program",
    url: "https://srip.iitgn.ac.in/",
    category: "SUMMER_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "Summer research internship program at IIT Gandhinagar open to students across India with weekly stipend and accommodation."
  },
  {
    organization: "DRDO",
    title: "DRDO Apprentice and Student Project Training Portal",
    url: "https://drdo.gov.in/drdo/careers/student-training",
    category: "GOV_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "DRDO laboratory research training and student internships for undergraduate engineering students in computing and cybersecurity."
  },
  {
    organization: "ISRO",
    title: "ISRO Student Opportunities & Research Fellowships",
    url: "https://www.isro.gov.in/Student_Opportunities.html",
    category: "GOV_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "ISRO student research projects, live training schemes and RESPOND research grant fellowships for undergraduate and postgraduate students."
  },
  {
    organization: "C-DAC",
    title: "C-DAC Student Project Internship in High Performance Computing & Security",
    url: "https://www.cdac.in/index.aspx?id=academic_internship",
    category: "GOV_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "C-DAC research internships for B.Tech CSE/IT students in distributed computing, network security, and AI."
  },
  {
    organization: "CSIR",
    title: "CSIR Diamond Jubilee Research Intern Awards",
    url: "https://csir.res.in/career/internships",
    category: "RESEARCH_INTERNSHIP",
    source_type: "PAGE_LINK",
    snippet: "Prestigious CSIR research intern awards across national laboratories with monthly stipend for science and engineering graduates/students."
  }
];

class DiscoveryEngine {
  constructor(db) {
    this.db = db;
  }

  getQueries() {
    return DISCOVERY_QUERIES;
  }

  async runDiscovery(runType = "SEARCH", customQuery = null) {
    const query = customQuery || (DISCOVERY_QUERIES[Math.floor(Math.random() * DISCOVERY_QUERIES.length)].query);
    
    // Create run record
    const runStmt = this.db.prepare(`
      INSERT INTO discovery_runs (run_type, query_or_target, urls_found, new_urls, status)
      VALUES (?, ?, 0, 0, 'RUNNING')
    `);
    const runRes = runStmt.run(runType, query);
    const runId = runRes.lastInsertRowid;

    let urlsFound = 0;
    let newUrls = 0;

    try {
      // Gather target candidate URLs
      const candidates = [...KNOWN_OFFICIAL_DISCOVERY_TARGETS];

      // If RSS discovery
      if (runType === "RSS") {
        candidates.push({
          organization: "IIT Kharagpur",
          title: "IIT Kharagpur Academic Announcements Feed",
          url: "https://www.iitkgp.ac.in/announcements/feed",
          category: "RESEARCH_INTERNSHIP",
          source_type: "RSS_FEED",
          snippet: "Official announcement feed for IIT Kharagpur internships and faculty research opportunities."
        });
      }

      urlsFound = candidates.length;

      const insertUrl = this.db.prepare(`
        INSERT INTO discovered_urls (url, title, snippet, source_type, discovery_run_id, organization, status)
        VALUES (@url, @title, @snippet, @source_type, @discovery_run_id, @organization, 'NEW')
        ON CONFLICT(url) DO NOTHING
      `);

      for (const item of candidates) {
        const res = insertUrl.run({
          url: item.url,
          title: item.title,
          snippet: item.snippet,
          source_type: item.source_type,
          discovery_run_id: runId,
          organization: item.organization
        });
        if (res.changes > 0) newUrls++;
      }

      // Update run status
      this.db.prepare(`
        UPDATE discovery_runs 
        SET urls_found = ?, new_urls = ?, status = 'COMPLETED'
        WHERE id = ?
      `).run(urlsFound, newUrls, runId);

      return {
        runId,
        query,
        urlsFound,
        newUrls,
        status: "COMPLETED"
      };
    } catch (err) {
      this.db.prepare(`
        UPDATE discovery_runs 
        SET status = 'FAILED', error_message = ?
        WHERE id = ?
      `).run(err.message, runId);
      throw err;
    }
  }

  getDiscoveryStats() {
    const totalRuns = this.db.prepare("SELECT COUNT(*) AS n FROM discovery_runs").get().n;
    const totalUrls = this.db.prepare("SELECT COUNT(*) AS n FROM discovered_urls").get().n;
    const newUrls = this.db.prepare("SELECT COUNT(*) AS n FROM discovered_urls WHERE status='NEW'").get().n;
    const latestRuns = this.db.prepare("SELECT * FROM discovery_runs ORDER BY id DESC LIMIT 5").all();
    return { totalRuns, totalUrls, newUrls, latestRuns };
  }
}

module.exports = { DiscoveryEngine, DISCOVERY_QUERIES, KNOWN_OFFICIAL_DISCOVERY_TARGETS };
