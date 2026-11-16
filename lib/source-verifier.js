const { URL } = require("url");
const { OFFICIAL_DOMAINS } = require("./verification");

// Authorized national mission & institutional initiative domains
const AFFILIATED_MISSION_DOMAINS = [
  { domain: "c3ihub.org", org: "IIT Kanpur", name: "C3i Hub Cybersecurity Mission", score: 92 },
  { domain: "fossee.in", org: "IIT Bombay", name: "FOSSEE Open Source Initiative", score: 92 },
  { domain: "nptel.ac.in", org: "IIT Madras", name: "NPTEL National Portal", score: 95 },
  { domain: "sparc.iitkgp.ac.in", org: "IIT Kharagpur", name: "SPARC Research Portal", score: 95 },
  { domain: "gian.iitkgp.ac.in", org: "IIT Kharagpur", name: "GIAN Academic Network", score: 95 }
];

// Mapping of organization names to their primary official domain root
const ORG_DOMAIN_MAP = {
  "IIT Bombay": "iitb.ac.in",
  "IIT Delhi": "iitd.ac.in",
  "IIT Madras": "iitm.ac.in",
  "IIT Kanpur": "iitk.ac.in",
  "IIT Kharagpur": "iitkgp.ac.in",
  "IIT Roorkee": "iitr.ac.in",
  "IIT Guwahati": "iitg.ac.in",
  "IIT Hyderabad": "iith.ac.in",
  "IIT (BHU) Varanasi": "iitbhu.ac.in",
  "IIT Indore": "iiti.ac.in",
  "IIT Ropar": "iitrpr.ac.in",
  "IIT Mandi": "iitmandi.ac.in",
  "IIT Gandhinagar": "iitgn.ac.in",
  "IIT Jodhpur": "iitj.ac.in",
  "IIT Patna": "iitp.ac.in",
  "IIT Bhubaneswar": "iitbbs.ac.in",
  "IIT Tirupati": "iittp.ac.in",
  "IIT Palakkad": "iitpkd.ac.in",
  "IIT Dharwad": "iitdh.ac.in",
  "IIT Jammu": "iitjammu.ac.in",
  "IIT Bhilai": "iitbhilai.ac.in",
  "IIT Goa": "iitgoa.ac.in",
  "IIT (ISM) Dhanbad": "iitism.ac.in",
  "DRDO": "drdo.gov.in",
  "ISRO": "isro.gov.in",
  "CSIR": "csir.res.in",
  "C-DAC": "cdac.in",
  "BARC": "barc.gov.in",
  "TIFR": "tifr.res.in",
  "NIELIT": "nielit.gov.in",
  "MeitY": "meity.gov.in",
  "DST": "dst.gov.in",
  "DAE": "dae.gov.in",
  "ICAR": "icar.org.in",
  "ICMR": "icmr.gov.in"
};

/**
 * Evaluates whether a source URL is an authentic official institutional page.
 * Uses Gemini API if GEMINI_API_KEY is available, otherwise uses institutional heuristic validator.
 */
async function evaluateSourceAuthenticity({ url, name, organization, organization_type }) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const aiResult = await evaluateSourceWithGemini({ url, name, organization, organization_type });
      if (aiResult && typeof aiResult.authenticity_score === "number") {
        return aiResult;
      }
    } catch (err) {
      console.warn("Gemini source authenticity evaluation error, using heuristic engine:", err.message);
    }
  }

  return evaluateSourceWithHeuristics({ url, name, organization, organization_type });
}

async function evaluateSourceWithGemini({ url, name, organization, organization_type }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert academic and government cybersecurity auditor specializing in Indian higher education institutions (IITs, NITs, Central Universities) and scientific research laboratories (DRDO, ISRO, CSIR, C-DAC).
Evaluate the authenticity of the following registered source:
- URL: ${url}
- Source Name: ${name}
- Claimed Organization: ${organization}
- Organization Type: ${organization_type}

Determine:
1. Is this URL an authentic, official domain or authorized subdomain of ${organization}?
2. Calculate the probability of authenticity as an integer percentage from 0 to 100.
   - Official institutional domains (e.g. *.iitm.ac.in, *.iitk.ac.in, *.drdo.gov.in) should score 90-100.
   - Official government-funded national missions (e.g. c3ihub.org, fossee.in) should score 85-95.
   - Unverified blogs, aggregators (e.g. careers360, freshersworld, blogspot, medium, telegram) should score 0-40.
3. Provide a clear reasoning sentence.

Return JSON in this format:
{
  "authenticity_score": 95,
  "is_official": true,
  "trust_level": "OFFICIAL_CONFIRMED",
  "reasoning": "Reason here"
}
`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });

  if (!resp.ok) {
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return null;
  return JSON.parse(raw);
}

function evaluateSourceWithHeuristics({ url, name, organization, organization_type }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      authenticity_score: 0,
      is_official: false,
      trust_level: "INVALID_URL",
      reasoning: "Malformed or unparseable URL syntax."
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const expectedPrimary = ORG_DOMAIN_MAP[organization] ? ORG_DOMAIN_MAP[organization].toLowerCase() : null;

  // 1. Direct Primary Domain or Subdomain Match for Claimed Organization
  if (expectedPrimary && (hostname === expectedPrimary || hostname.endsWith("." + expectedPrimary))) {
    const isSpecificPortal = hostname !== expectedPrimary || parsed.pathname.length > 1;
    const score = isSpecificPortal ? 98 : 95;
    return {
      authenticity_score: score,
      is_official: true,
      trust_level: "OFFICIAL_CONFIRMED",
      reasoning: `Verified authoritative institutional domain (${hostname}) owned by ${organization}.`
    };
  }

  // 2. Official National Mission / Affiliated Domain Match
  const mission = AFFILIATED_MISSION_DOMAINS.find(m => hostname === m.domain || hostname.endsWith("." + m.domain));
  if (mission) {
    const orgMatches = !organization || organization === mission.org || organization.includes(mission.org);
    const score = orgMatches ? mission.score : mission.score - 10;
    return {
      authenticity_score: score,
      is_official: true,
      trust_level: "OFFICIAL_CONFIRMED",
      reasoning: `Authorized national initiative domain (${mission.domain}) affiliated with ${mission.org}.`
    };
  }

  // 3. Known Official Domain for another registered institution
  const isAnyOfficial = OFFICIAL_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d));
  if (isAnyOfficial) {
    return {
      authenticity_score: 80,
      is_official: true,
      trust_level: "SECONDARY_TRUSTED",
      reasoning: `Official government / academic domain (${hostname}), but does not directly match claimed organization (${organization || "Unspecified"}).`
    };
  }

  // 4. Academic or Government TLD (.ac.in, .gov.in, .res.in, .edu.in)
  if (hostname.endsWith(".ac.in") || hostname.endsWith(".gov.in") || hostname.endsWith(".res.in") || hostname.endsWith(".edu.in")) {
    return {
      authenticity_score: 75,
      is_official: true,
      trust_level: "OFFICIAL_DOMAIN_UNCONFIRMED",
      reasoning: `Recognized academic or government TLD (${hostname}), pending specific institutional affiliation verification.`
    };
  }

  // 5. Unofficial third-party, commercial, or public blogging domains
  const suspiciousHosts = ["blogspot", "wordpress", "medium", "telegram", "facebook", "linkedin", "careers360", "freshersworld", "shiksha", "internshala"];
  if (suspiciousHosts.some(s => hostname.includes(s))) {
    return {
      authenticity_score: 15,
      is_official: false,
      trust_level: "UNTRUSTED_THIRD_PARTY",
      reasoning: `Third-party commercial aggregator or social platform (${hostname}). Not an official institutional source.`
    };
  }

  // 6. Generic domains (.com, .org, .net, etc.)
  return {
    authenticity_score: 35,
    is_official: false,
    trust_level: "USER_ADDED_UNVERIFIED",
    reasoning: `Generic domain (${hostname}) with unconfirmed institutional ownership. Manual review required.`
  };
}

/**
 * Evaluates a source and automatically approves it if authenticity > 85%,
 * otherwise assigns it to PENDING_REVIEW.
 */
async function auditAndApplySourceApproval(source, db) {
  const evalResult = await evaluateSourceAuthenticity({
    url: source.url,
    name: source.name,
    organization: source.organization,
    organization_type: source.organization_type
  });

  const score = Math.round(evalResult.authenticity_score);
  const autoApproved = score >= 85;
  const newStatus = autoApproved ? "APPROVED" : "PENDING_REVIEW";
  const trustLevel = evalResult.trust_level || (autoApproved ? "OFFICIAL_CONFIRMED" : "OFFICIAL_DOMAIN_UNCONFIRMED");
  const note = `[AI Authenticity ${score}%]: ${evalResult.reasoning}`;

  db.prepare(`
    UPDATE sources SET
      status = @status,
      trust_level = @trust_level,
      review_note = @review_note
    WHERE id = @id
  `).run({
    id: source.id,
    status: newStatus,
    trust_level: trustLevel,
    review_note: note
  });

  return {
    source_id: source.id,
    name: source.name,
    organization: source.organization,
    authenticity_score: score,
    status: newStatus,
    trust_level: trustLevel,
    reasoning: evalResult.reasoning,
    auto_approved: autoApproved
  };
}

module.exports = {
  evaluateSourceAuthenticity,
  evaluateSourceWithHeuristics,
  auditAndApplySourceApproval,
  ORG_DOMAIN_MAP
};
