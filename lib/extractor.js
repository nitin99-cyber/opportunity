const crypto = require("crypto");

/**
 * Extracts structured fields from raw page text or HTML.
 * Uses Gemini API if GEMINI_API_KEY is configured,
 * otherwise falls back to a comprehensive heuristic extractor.
 */
async function extractOpportunityFromContent({ text, url, organizationHint = "", titleHint = "" }) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const aiResult = await extractWithGemini({ text, url, organizationHint, titleHint });
      if (aiResult) return aiResult;
    } catch (err) {
      console.warn("Gemini extraction failed, falling back to rule-based extractor:", err.message);
    }
  }

  return extractWithHeuristics({ text, url, organizationHint, titleHint });
}

async function extractWithGemini({ text, url, organizationHint, titleHint }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert academic data extractor for Indian university and research laboratory internship notices.
Analyze the following text extracted from an official notice or webpage (${url}).
Extract structured opportunity details adhering strictly to fact:
- Never hallucinate or invent dates, stipend amounts, or eligibility requirements.
- If a field is not explicitly mentioned, use "" or "UNKNOWN".
- For deadline, format as YYYY-MM-DD if explicitly given, otherwise "".
- For funding, classify as one of: PAID, UNPAID, STIPEND_UNKNOWN, FUNDED, FUNDING_UNSPECIFIED.
- For category, choose from: SUMMER_INTERNSHIP, WINTER_INTERNSHIP, SEMESTER_INTERNSHIP, RESEARCH_INTERNSHIP, PROJECT_ASSISTANT, RESEARCH_ASSISTANT, FELLOWSHIP, UNDERGRAD_RESEARCH, GOV_INTERNSHIP, OTHER.
- Provide verbatim snippets from the text as evidence for key fields.

JSON output schema:
{
  "title": "string",
  "organization": "string",
  "department": "string",
  "laboratory": "string",
  "category": "string",
  "description": "string",
  "funding": "string",
  "stipend_amount": "string",
  "duration": "string",
  "start_date": "string",
  "deadline": "YYYY-MM-DD or empty",
  "eligibility": "string",
  "degree_requirements": "string",
  "branch_requirements": "string",
  "year_requirements": "string",
  "cgpa_requirements": "string",
  "skills_required": "string",
  "application_procedure": "string",
  "application_url": "string",
  "contact_info": "string",
  "evidence": [
    { "field_name": "deadline", "snippet": "..." },
    { "field_name": "stipend", "snippet": "..." },
    { "field_name": "eligibility", "snippet": "..." }
  ]
}

Content:
${text.slice(0, 12000)}
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
  const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) return null;

  const parsed = JSON.parse(rawJson);
  parsed.source_url = url;
  parsed.confidence_score = 0.95;
  return parsed;
}

function extractWithHeuristics({ text, url, organizationHint, titleHint }) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const cleanText = text.replace(/\s+/g, " ");

  // 1. Organization & Title
  let organization = organizationHint;
  if (!organization) {
    const orgMatch = cleanText.match(/\b(IIT [A-Za-z]+|Indian Institute of Technology [A-Za-z]+|DRDO|ISRO|CSIR[- ][A-Za-z]+|BARC|TIFR|C-DAC)\b/i);
    organization = orgMatch ? orgMatch[1] : "Indian Research Institution";
  }

  let title = titleHint;
  if (!title) {
    const titleMatch = cleanText.match(/\b([A-Za-z0-9\s-]{4,60} (?:Internship|Fellowship|Research Programme|Project Assistant|Summer Research|Winter Research))\b/i);
    title = titleMatch ? titleMatch[1].trim() : `${organization} Research Internship`;
  }

  // 2. Category
  let category = "RESEARCH_INTERNSHIP";
  const lower = cleanText.toLowerCase();
  if (lower.includes("summer")) category = "SUMMER_INTERNSHIP";
  else if (lower.includes("winter")) category = "WINTER_INTERNSHIP";
  else if (lower.includes("fellowship")) category = "FELLOWSHIP";
  else if (lower.includes("project assistant")) category = "PROJECT_ASSISTANT";
  else if (lower.includes("research assistant")) category = "RESEARCH_ASSISTANT";

  // 3. Deadline extraction
  let deadline = null;
  let deadlineEvidence = "";
  const deadlineRegexes = [
    /(?:last date|deadline|application closes|due date|closing date)[:\s]+([0-9]{1,2}(?:st|nd|rd|th)?[\s\/\-.](?:[A-Za-z]+|[0-9]{1,2})[\s\/\-.][0-9]{2,4})/i,
    /(?:by|before)[:\s]+([A-Za-z]+ [0-9]{1,2},? [0-9]{4})/i,
    /([0-9]{4}-[0-9]{2}-[0-9]{2})/
  ];
  for (const re of deadlineRegexes) {
    const match = cleanText.match(re);
    if (match) {
      deadlineEvidence = match[0];
      const parsedDate = parseDateString(match[1]);
      if (parsedDate) {
        deadline = parsedDate;
        break;
      }
    }
  }

  // 4. Funding & Stipend
  let funding = "STIPEND_UNKNOWN";
  let stipendAmount = "";
  let stipendEvidence = "";
  const stipendMatch = cleanText.match(/(?:stipend|fellowship|remuneration|honorarium)[:\s]+(?:rs\.?|inr)?\s*([0-9,]+(?:\s*(?:per month|\/month|pm|total))?)/i);
  if (stipendMatch) {
    funding = "PAID";
    stipendAmount = stipendMatch[1].trim();
    stipendEvidence = stipendMatch[0];
  } else if (lower.includes("fully funded") || lower.includes("financial support")) {
    funding = "FUNDED";
    stipendEvidence = "Mentions financial support / funded research";
  } else if (lower.includes("unpaid") || lower.includes("no stipend")) {
    funding = "UNPAID";
    stipendEvidence = "Notice specifies no stipend";
  }

  // 5. Eligibility & Academic criteria
  let eligibility = "";
  let degreeReq = "";
  let branchReq = "";
  let yearReq = "";
  let cgpaReq = "";
  let eligibilityEvidence = "";

  const eligMatch = cleanText.match(/(?:eligibility|who can apply|qualifications?)[:\s]+([^.]{20,250}\.)/i);
  if (eligMatch) {
    eligibility = eligMatch[1].trim();
    eligibilityEvidence = eligMatch[0];
  }

  if (lower.includes("b.tech") || lower.includes("undergraduate") || lower.includes("b.e.")) {
    degreeReq = "B.Tech / B.E. / Undergraduate";
  }
  if (lower.includes("computer science") || lower.includes("cse") || lower.includes("it") || lower.includes("engineering")) {
    branchReq = "Computer Science / Engineering";
  }
  if (lower.includes("2nd year") || lower.includes("second year") || lower.includes("pre-final")) {
    yearReq = "2nd / 3rd year undergraduate";
  }
  const cgpaMatch = cleanText.match(/(?:cgpa|gpa|marks)[:\s]+(?:of\s+)?([0-9]+\.?[0-9]*)/i);
  if (cgpaMatch) {
    cgpaReq = cgpaMatch[1];
  }

  // 6. Evidence collection
  const evidence = [];
  if (deadlineEvidence) {
    evidence.push({ field_name: "deadline", snippet: deadlineEvidence, source_url: url });
  }
  if (stipendEvidence) {
    evidence.push({ field_name: "stipend", snippet: stipendEvidence, source_url: url });
  }
  if (eligibilityEvidence) {
    evidence.push({ field_name: "eligibility", snippet: eligibilityEvidence, source_url: url });
  }

  // 7. Duration
  let duration = "";
  const durationMatch = cleanText.match(/([0-9]{1,2}\s*(?:weeks|months))\s*(?:duration|internship|project)?/i);
  if (durationMatch) {
    duration = durationMatch[1];
  }

  // Description
  const description = lines.slice(0, 5).join(" ").slice(0, 300) || `${title} at ${organization}.`;

  return {
    title,
    organization,
    department: "Computer Science and Allied Fields",
    laboratory: "",
    category,
    location: "India",
    funding,
    stipend_amount: stipendAmount,
    duration: duration || "6-8 Weeks",
    start_date: null,
    deadline,
    official_url: url,
    application_url: url,
    application_procedure: "Apply via official institution portal as stated in notice.",
    contact_info: "",
    description,
    eligibility: eligibility || "Undergraduate students in engineering/science.",
    degree_requirements: degreeReq,
    branch_requirements: branchReq,
    year_requirements: yearReq,
    cgpa_requirements: cgpaReq,
    skills_required: "Programming, Analytical Reasoning, Problem Solving",
    confidence_score: 0.85,
    source_url: url,
    evidence
  };
}

function parseDateString(str) {
  if (!str) return null;
  // If already YYYY-MM-DD
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str)) return str;

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

module.exports = { extractOpportunityFromContent, extractWithHeuristics };
