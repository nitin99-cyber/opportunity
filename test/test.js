const assert = require("assert");
const path = require("path");
const { initDb } = require("../db");
const { setupSchema } = require("../lib/schema");
const { seedDatabase } = require("../lib/seed-data");
const { isPrivateIP, validateUrl } = require("../lib/ssrf");
const { calculateMatchScore, evaluateEligibility } = require("../lib/matcher");
const { verifyOpportunity, isAuthoritativeDomain } = require("../lib/verification");
const { extractWithHeuristics } = require("../lib/extractor");
const { DiscoveryEngine } = require("../lib/discovery");
const { ReminderManager } = require("../lib/reminders");
const { parsePdfBuffer, extractProfileFromResume, extractResumeWithHeuristics } = require("../lib/resume");
const { evaluateSourceWithHeuristics, auditAndApplySourceApproval } = require("../lib/source-verifier");

async function runTests() {
  console.log("==========================================");
  console.log("OPPORTUNITY RADAR — TEST SUITE");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. SSRF & Security Tests
  console.log("[1] SSRF Protection Tests:");
  test("Blocks loopback IPv4 (127.0.0.1)", () => {
    assert.strictEqual(isPrivateIP("127.0.0.1"), true);
  });
  test("Blocks RFC1918 Private IPs (10.x, 172.16.x, 192.168.x)", () => {
    assert.strictEqual(isPrivateIP("10.0.0.1"), true);
    assert.strictEqual(isPrivateIP("172.20.10.2"), true);
    assert.strictEqual(isPrivateIP("192.168.1.1"), true);
  });
  test("Blocks Cloud Metadata IP (169.254.169.254)", () => {
    assert.strictEqual(isPrivateIP("169.254.169.254"), true);
  });
  test("Allows public IP addresses", () => {
    assert.strictEqual(isPrivateIP("8.8.8.8"), false);
    assert.strictEqual(isPrivateIP("142.250.190.46"), false);
  });
  await asyncTest("URL validator blocks localhost & internal hosts", async () => {
    const res = await validateUrl("http://localhost:8080/secret");
    assert.strictEqual(res.valid, false);
    assert.match(res.error, /prohibited/i);
  });

  // 2. Database & Schema
  console.log("\n[2] Database & Schema Tests:");
  const testDb = initDb(path.join(__dirname, "test-radar.db"));
  test("Setup schema runs cleanly", () => {
    setupSchema(testDb);
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert.ok(tables.includes("opportunities"));
    assert.ok(tables.includes("researchers"));
    assert.ok(tables.includes("sources"));
    assert.ok(tables.includes("profile"));
    assert.ok(tables.includes("opportunity_evidence"));
    assert.ok(tables.includes("applications"));
    assert.ok(tables.includes("reminders"));
    assert.ok(tables.includes("discovery_runs"));
    assert.ok(tables.includes("discovered_urls"));
  });

  test("Seed database populates initial authentic data", () => {
    seedDatabase(testDb);
    const oppCount = testDb.prepare("SELECT COUNT(*) AS n FROM opportunities").get().n;
    const resCount = testDb.prepare("SELECT COUNT(*) AS n FROM researchers").get().n;
    const orgCount = testDb.prepare("SELECT COUNT(*) AS n FROM organizations").get().n;
    assert.ok(oppCount >= 7);
    assert.ok(resCount >= 6);
    assert.ok(orgCount >= 35);
  });

  // 3. Matching & Eligibility Engine
  console.log("\n[3] Eligibility & Matching Engine Tests:");
  const testProfile = {
    degree: "B.Tech",
    branch: "Computer Science and Engineering",
    institution: "MMMUT",
    current_year: 2,
    graduation_year: 2029,
    cgpa: 8.5,
    skills: "Python, C++, Linux, Git, SQL, Network Security, Machine Learning",
    technical_interests: "Cybersecurity, AI/ML, Computer Networks, Systems",
    research_interests: "Network Security, Cryptography, Intrusion Detection",
    funding_preference: "PRIORITIZE_PAID"
  };

  test("Evaluates undergraduate CSE 2nd year candidate as ELIGIBLE for matched opp", () => {
    const opp = {
      title: "IIT Kanpur SURGE",
      degree_requirements: "B.Tech / B.E.",
      branch_requirements: "Computer Science, IT",
      year_requirements: "2nd or 3rd year",
      cgpa_requirements: "7.5",
      eligibility: "B.Tech CSE students in 2nd/3rd year with CGPA >= 7.5"
    };
    const elig = evaluateEligibility(testProfile, opp);
    assert.strictEqual(elig.status, "ELIGIBLE");
  });

  test("Flags INELIGIBLE when academic branch is incompatible", () => {
    const opp = {
      title: "Civil Materials Project",
      degree_requirements: "B.Tech",
      branch_requirements: "Civil Engineering only",
      year_requirements: "2nd year",
      cgpa_requirements: "6.0"
    };
    const elig = evaluateEligibility(testProfile, opp);
    assert.strictEqual(elig.status, "INELIGIBLE");
  });

  test("Calculates 0-100 relevance match score with explainable factors", () => {
    const opp = {
      title: "IIT Bombay Cybersecurity & Open Source Fellowship",
      organization: "IIT Bombay",
      department: "Computer Science and Engineering",
      category: "FELLOWSHIP",
      funding: "PAID",
      deadline: "2027-03-15",
      official_url: "https://fossee.in/fellowship",
      description: "Research fellowship in network security, applied cryptography and Linux systems.",
      skills_required: "Linux, Python, C++, Network Security",
      verification_status: "VERIFIED",
      degree_requirements: "B.Tech",
      branch_requirements: "Computer Science"
    };
    const match = calculateMatchScore(testProfile, opp);
    assert.ok(match.score >= 70, `Expected score >= 70, got ${match.score}`);
    assert.ok(match.breakdown.length >= 4);
    assert.ok(match.factors.research_interest > 0);
    assert.ok(match.factors.skills > 0);
  });

  // 4. Verification Engine
  console.log("\n[4] Verification Engine Tests:");
  test("Authoritative domain check recognizes IIT and Gov domains", () => {
    assert.strictEqual(isAuthoritativeDomain("https://sfp.iitm.ac.in/apply"), true);
    assert.strictEqual(isAuthoritativeDomain("https://drdo.gov.in/careers"), true);
    assert.strictEqual(isAuthoritativeDomain("https://random-blog.com/internship"), false);
  });

  test("Marks past deadline opportunity as CLOSED and STALE", () => {
    const oldOpp = {
      deadline: "2025-01-01",
      official_url: "https://surge.iitk.ac.in/",
      application_status: "OPEN",
      verification_status: "VERIFIED"
    };
    const res = verifyOpportunity(oldOpp, 2);
    assert.strictEqual(res.application_status, "CLOSED");
    assert.strictEqual(res.verification_status, "STALE");
  });

  // 5. Extractor & Evidence Generation
  console.log("\n[5] Extractor & Evidence Generation Tests:");
  test("Heuristic extraction extracts deadline, stipend and evidence snippets without fabricating", () => {
    const rawText = `
      IIT Roorkee SPARK Summer Internship Programme 2027.
      Applications are invited from undergraduate students.
      Eligibility: Students currently enrolled in 2nd year B.Tech in Computer Science with CGPA 7.5.
      Stipend: Rs. 2,500 per week for 8 weeks.
      Last date: 2027-03-31. Apply online at official portal.
    `;
    const extracted = extractWithHeuristics({
      text: rawText,
      url: "https://spark.iitr.ac.in/",
      organizationHint: "IIT Roorkee",
      titleHint: "SPARK Summer Internship"
    });

    assert.strictEqual(extracted.organization, "IIT Roorkee");
    assert.strictEqual(extracted.funding, "PAID");
    assert.strictEqual(extracted.deadline, "2027-03-31");
    assert.ok(extracted.evidence.length >= 2);
  });

  // 6. Discovery Engine & Deduplication
  console.log("\n[6] Discovery Engine & Deduplication Tests:");
  const discovery = new DiscoveryEngine(testDb);
  await asyncTest("Discovery run inserts discovered URLs without duplicates", async () => {
    const res1 = await discovery.runDiscovery("SEARCH");
    assert.ok(res1.urlsFound > 0);
    const initialNew = res1.newUrls;

    // Run again with same candidates
    const res2 = await discovery.runDiscovery("SEARCH");
    // Should insert 0 new URLs because of ON CONFLICT(url) DO NOTHING
    assert.strictEqual(res2.newUrls, 0, "Duplicate URLs should be rejected");
  });

  // 7. Reminders Engine
  console.log("\n[7] Reminder Manager Tests:");
  const reminders = new ReminderManager(testDb);
  test("Generates deadline reminders without duplicate inserts", () => {
    const list1 = reminders.generateReminders();
    assert.ok(Array.isArray(list1));
    const list2 = reminders.generateReminders();
    assert.strictEqual(list1.length, list2.length);
  });

  // 8. Resume PDF & Profile Extraction
  console.log("\n[8] PDF Resume Parsing & Profile Extraction Tests:");
  await asyncTest("parsePdfBuffer extracts text from a binary PDF stream", async () => {
    const pdfData = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 100>>stream\nBT /F1 12 Tf 72 712 Td (Aarav Sharma B.Tech Computer Science MMMUT CGPA 8.92 Python C++ Docker Linux) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n365\n%%EOF'
    );
    const text = await parsePdfBuffer(pdfData);
    assert.ok(text.includes("Aarav Sharma") || text.includes("Computer Science"));
  });

  test("extractResumeWithHeuristics extracts full candidate profile from resume text", () => {
    const resumeText = `
      AARAV SHARMA
      Email: aarav@example.com | Phone: +91 9123456789 | Location: Gorakhpur
      
      EDUCATION
      Madan Mohan Malaviya University of Technology (MMMUT), Gorakhpur
      Bachelor of Technology (B.Tech) in Computer Science and Engineering
      Year of Study: 2nd Year | Expected Graduation: 2029
      CGPA: 8.92 / 10.0
      
      TECHNICAL SKILLS
      Languages: Python, C++, C, JavaScript, SQL, Bash
      Developer Tools: Git, Linux, Docker, Wireshark, SQLite
      Libraries: PyTorch, TensorFlow, OpenCV
      
      AREAS OF INTEREST
      Cybersecurity, Network Security, Cryptography, Artificial Intelligence, Digital Forensics
    `;

    const profile = extractResumeWithHeuristics(resumeText);
    assert.strictEqual(profile.degree, "B.Tech");
    assert.strictEqual(profile.branch, "Computer Science and Engineering");
    assert.strictEqual(profile.institution, "Madan Mohan Malaviya University of Technology");
    assert.strictEqual(profile.current_year, 2);
    assert.strictEqual(profile.graduation_year, 2029);
    assert.strictEqual(profile.cgpa, 8.92);
    assert.ok(profile.skills.includes("Linux"));
    assert.ok(profile.skills.includes("Docker"));
    assert.ok(profile.languages.includes("Python"));
    assert.ok(profile.languages.includes("C++"));
    assert.ok(profile.technical_interests.includes("Cybersecurity"));
    assert.ok(profile.research_interests.includes("Cryptography") || profile.research_interests.includes("Security"));
  });

  // 9. AI Source Authenticity & Auto-Approval Tests
  console.log("\n[9] AI Source Authenticity & Auto-Approval Tests:");
  test("Calculates authenticity score > 85% for official IIT portal", () => {
    const res = evaluateSourceWithHeuristics({
      name: "IIT Madras Summer Fellowship Portal",
      organization: "IIT Madras",
      url: "https://sfp.iitm.ac.in/",
      organization_type: "IIT"
    });
    assert.ok(res.authenticity_score >= 85, `Expected score >= 85, got ${res.authenticity_score}`);
    assert.strictEqual(res.is_official, true);
    assert.strictEqual(res.trust_level, "OFFICIAL_CONFIRMED");
  });

  test("Calculates authenticity score < 85% for third-party aggregator", () => {
    const res = evaluateSourceWithHeuristics({
      name: "Third-party Internship Blog",
      organization: "IIT Bombay",
      url: "https://careers360.com/iit-summer-internship",
      organization_type: "OTHER"
    });
    assert.ok(res.authenticity_score < 85, `Expected score < 85, got ${res.authenticity_score}`);
    assert.strictEqual(res.is_official, false);
  });

  await asyncTest("auditAndApplySourceApproval auto-approves sources with score >= 85%", async () => {
    const officialSrc = testDb.prepare(`
      INSERT INTO sources (name, organization, source_type, url, frequency, status, trust_level)
      VALUES ('IIT Kanpur SURGE Portal', 'IIT Kanpur', 'INTERNSHIP_PAGE', 'https://surge.iitk.ac.in/', 'WEEKLY', 'PENDING_REVIEW', 'OFFICIAL_DOMAIN_UNCONFIRMED')
    `).run();
    const srcRow = testDb.prepare("SELECT * FROM sources WHERE id = ?").get(officialSrc.lastInsertRowid);
    const auditRes = await auditAndApplySourceApproval(srcRow, testDb);
    assert.strictEqual(auditRes.auto_approved, true);
    assert.strictEqual(auditRes.status, "APPROVED");
    const updated = testDb.prepare("SELECT * FROM sources WHERE id = ?").get(srcRow.id);
    assert.strictEqual(updated.status, "APPROVED");
    assert.strictEqual(updated.trust_level, "OFFICIAL_CONFIRMED");
  });

  await asyncTest("auditAndApplySourceApproval leaves sources with score < 85% in PENDING_REVIEW", async () => {
    const untrustedSrc = testDb.prepare(`
      INSERT INTO sources (name, organization, source_type, url, frequency, status, trust_level)
      VALUES ('Random Blog Portal', 'DRDO', 'INTERNSHIP_PAGE', 'https://unverified-blog.com/drdo-internships', 'WEEKLY', 'PENDING_REVIEW', 'USER_ADDED_UNVERIFIED')
    `).run();
    const srcRow = testDb.prepare("SELECT * FROM sources WHERE id = ?").get(untrustedSrc.lastInsertRowid);
    const auditRes = await auditAndApplySourceApproval(srcRow, testDb);
    assert.strictEqual(auditRes.auto_approved, false);
    assert.strictEqual(auditRes.status, "PENDING_REVIEW");
    const updated = testDb.prepare("SELECT * FROM sources WHERE id = ?").get(srcRow.id);
    assert.strictEqual(updated.status, "PENDING_REVIEW");
  });

  console.log("\n==========================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================");

  // Clean up test db
  testDb.close();
  const fs = require("fs");
  try {
    fs.unlinkSync(path.join(__dirname, "test-radar.db"));
    fs.unlinkSync(path.join(__dirname, "test-radar.db-wal"));
    fs.unlinkSync(path.join(__dirname, "test-radar.db-shm"));
  } catch {}

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error("FATAL ERROR IN TESTS:", e);
  process.exit(1);
});
