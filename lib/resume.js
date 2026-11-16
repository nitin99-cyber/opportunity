const { PDFParse } = require("pdf-parse");

/**
 * Extracts raw text from a PDF Buffer.
 */
async function parsePdfBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty PDF buffer provided");
  }

  try {
    const parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    await parser.destroy();
    if (res && res.text && res.text.trim().length > 0) {
      return res.text;
    }
  } catch (err) {
    console.warn("PDFParse text extraction encountered error, attempting fallback:", err.message);
  }

  // Fallback: extract plain ASCII text streams inside PDF
  try {
    const str = buffer.toString("binary");
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    let fallbackText = "";
    while ((match = streamRegex.exec(str)) !== null) {
      // Find readable text inside parentheses (Text) Tj or TJ
      const textMatches = match[1].match(/\(([^()]+)\)\s*Tj/g);
      if (textMatches) {
        fallbackText += textMatches.map(m => m.replace(/^\(|\)\s*Tj$/g, "")).join(" ") + "\n";
      }
    }
    if (fallbackText.trim().length > 20) {
      return fallbackText;
    }
  } catch (e) {
    console.warn("Fallback stream extractor failed:", e.message);
  }

  throw new Error("Unable to extract readable text from PDF. The file may be image-only (scanned) or password protected.");
}

/**
 * Extracts structured profile fields from resume text.
 * Uses Gemini API if GEMINI_API_KEY is available, otherwise uses comprehensive heuristic extractor.
 */
async function extractProfileFromResume(resumeText) {
  if (!resumeText || resumeText.trim().length < 20) {
    throw new Error("Resume text is too short or empty.");
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const aiResult = await extractResumeWithGemini(resumeText);
      if (aiResult) return aiResult;
    } catch (err) {
      console.warn("Gemini resume extraction failed, using heuristic parser:", err.message);
    }
  }

  return extractResumeWithHeuristics(resumeText);
}

async function extractResumeWithGemini(resumeText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert academic resume parser specializing in Indian university engineering students.
Analyze this resume text and extract candidate profile information.
Return JSON strictly adhering to the schema below:
- If a value cannot be found, use sensible defaults based on context or "".
- Do not fabricate false academic degrees or institutions.

JSON Schema:
{
  "name": "Candidate's full name",
  "degree": "e.g. B.Tech or M.Tech or Dual Degree",
  "branch": "e.g. Computer Science and Engineering",
  "institution": "e.g. MMMUT, Gorakhpur or IIT Bombay",
  "current_year": 2,
  "graduation_year": 2029,
  "cgpa": 8.5,
  "skills": "Comma separated tools, frameworks, databases, and technologies",
  "languages": "Comma separated programming languages e.g. Python, C++, C, JavaScript",
  "technical_interests": "Comma separated technical interests and course topics",
  "research_interests": "Comma separated specific research areas (e.g. Network Security, Applied Cryptography)",
  "preferred_locations": "Preferred internship locations e.g. India, Remote",
  "funding_preference": "PRIORITIZE_PAID",
  "preferred_duration": "2-3 Months (Summer/Winter)",
  "availability": "Summer / Winter internship availability",
  "preferences": "Summary of candidate career goals or preferences"
}

Resume Text:
${resumeText.slice(0, 12000)}
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
  return JSON.parse(rawJson);
}

function extractResumeWithHeuristics(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const cleanText = text.replace(/\s+/g, " ");

  // 1. Name Extraction (Examine first 5 non-empty lines)
  let name = "";
  const ignoredWords = ["resume", "curriculum", "vitae", "cv", "page", "email", "phone", "contact", "http", "github", "linkedin", "education", "experience", "skills", "projects"];
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const rawLine = lines[i];
    const firstSegment = rawLine.split(/[|,\-–—]/)[0].trim();
    const candidate = (firstSegment.length >= 3 && firstSegment.length <= 40 && !/[@0-9+\/\\]/.test(firstSegment)) ? firstSegment : rawLine;
    const lower = candidate.toLowerCase();
    if (!ignoredWords.some(w => lower.includes(w)) && candidate.length >= 3 && candidate.length <= 40 && !/[@0-9+\/\\|]/.test(candidate)) {
      name = candidate.replace(/[^a-zA-Z\s.]/g, "").trim();
      if (name.split(/\s+/).length <= 4 && name.length >= 3) break;
    }
  }
  if (!name) name = "Student Researcher";

  // 2. Degree Extraction
  let degree = "B.Tech";
  if (/\b(?:b\.?tech|b\.?e\.?|bachelor of technology|bachelor of engineering)\b/i.test(cleanText)) {
    degree = "B.Tech";
  } else if (/\b(?:m\.?tech|m\.?e\.?|master of technology)\b/i.test(cleanText)) {
    degree = "M.Tech";
  } else if (/\b(?:dual degree|integrated m\.?tech)\b/i.test(cleanText)) {
    degree = "Dual Degree (B.Tech + M.Tech)";
  } else if (/\b(?:b\.?sc|bachelor of science)\b/i.test(cleanText)) {
    degree = "B.Sc";
  }

  // 3. Branch Extraction
  let branch = "Computer Science and Engineering";
  if (/\b(?:computer science(?: and engineering)?|cse|cs)\b/i.test(cleanText)) {
    branch = "Computer Science and Engineering";
  } else if (/\b(?:information technology|it)\b/i.test(cleanText)) {
    branch = "Information Technology";
  } else if (/\b(?:electronics and communication|ece)\b/i.test(cleanText)) {
    branch = "Electronics and Communication Engineering";
  } else if (/\b(?:electrical engineering|ee)\b/i.test(cleanText)) {
    branch = "Electrical Engineering";
  } else if (/\b(?:mechanical engineering|me)\b/i.test(cleanText)) {
    branch = "Mechanical Engineering";
  } else if (/\b(?:data science|artificial intelligence|ai\/ml)\b/i.test(cleanText)) {
    branch = "Computer Science (AI & Data Science)";
  }

  // 4. Institution Extraction
  let institution = "MMMUT";
  if (/\b(?:Madan Mohan Malaviya University of Technology|MMMUT)\b/i.test(cleanText)) {
    institution = "Madan Mohan Malaviya University of Technology";
  } else {
    const knownInstMatch = cleanText.match(/\b(Indian Institute of Technology\s+[A-Za-z]+|IIT\s+[A-Za-z]+|National Institute of Technology\s+[A-Za-z]+|NIT\s+[A-Za-z]+|IIIT\s+[A-Za-z]+|Delhi Technological University|DTU|BITS Pilani)\b/i);
    if (knownInstMatch) {
      institution = knownInstMatch[1].trim();
    } else {
      const genericMatch = cleanText.match(/\b([A-Z][a-zA-Z]{2,20}(?:\s+[A-Z][a-zA-Z]{2,20}){0,3}\s+(?:University|Institute of Technology|College of Engineering))\b/);
      if (genericMatch) {
        institution = genericMatch[1].trim();
      }
    }
  }

  // 5. Current Year & Graduation Year
  let currentYear = 2;
  if (/\b(?:1st year|first year|freshman)\b/i.test(cleanText)) currentYear = 1;
  else if (/\b(?:2nd year|second year|sophomore)\b/i.test(cleanText)) currentYear = 2;
  else if (/\b(?:3rd year|third year|junior|pre-final)\b/i.test(cleanText)) currentYear = 3;
  else if (/\b(?:4th year|fourth year|senior|final year)\b/i.test(cleanText)) currentYear = 4;

  let graduationYear = 2029;
  const gradMatch = cleanText.match(/(?:expected|graduation|passing|batch|class of|to|-)\s*(?:in\s*)?(202[4-9]|203[0-2])/i);
  if (gradMatch) {
    graduationYear = parseInt(gradMatch[1], 10);
  }

  // 6. CGPA / Percentage
  let cgpa = 8.5;
  const cgpaMatch = cleanText.match(/(?:cgpa|cpi|gpa)[:\s]+(?:of\s+)?([0-9]+\.?[0-9]*)/i) ||
                    cleanText.match(/([0-9]\.[0-9]{1,2})\s*(?:\/|\s*out of\s*)10/i);
  if (cgpaMatch) {
    const val = parseFloat(cgpaMatch[1]);
    if (!isNaN(val) && val > 0 && val <= 10) cgpa = val;
  }

  // 7. Programming Languages Taxonomy
  const languagesList = [
    "Python", "C++", "C", "Java", "JavaScript", "TypeScript", "Go", "Golang",
    "Rust", "Bash", "Shell", "SQL", "HTML", "CSS", "Kotlin", "Swift", "PHP", "R", "Scala"
  ];
  const detectedLanguages = [];
  for (const lang of languagesList) {
    const re = new RegExp(`(?:^|[^a-zA-Z0-9+#])${lang.replace("+", "\\+")}(?:$|[^a-zA-Z0-9+#])`, "i");
    if (re.test(cleanText)) {
      detectedLanguages.push(lang === "Golang" ? "Go" : lang);
    }
  }

  // 8. Technical Skills & Tools Taxonomy
  const skillsList = [
    "Linux", "Ubuntu", "Git", "GitHub", "Docker", "Kubernetes", "Node.js", "Express",
    "React", "FastAPI", "Django", "Flask", "PostgreSQL", "MySQL", "MongoDB", "Redis",
    "SQLite", "PyTorch", "TensorFlow", "Scikit-Learn", "Pandas", "NumPy", "OpenCV",
    "Wireshark", "Metasploit", "Nmap", "Burp Suite", "GDB", "Radare2", "Ghidra",
    "Snort", "Suricata", "REST API", "GraphQL", "WebSockets", "Microservices",
    "Machine Learning", "Deep Learning", "Digital Forensics", "Network Security",
    "Cryptography", "Reverse Engineering", "Penetration Testing"
  ];
  const detectedSkills = [];
  for (const skill of skillsList) {
    const re = new RegExp(`(?:^|[^a-zA-Z0-9+#])${skill.replace("+", "\\+")}(?:$|[^a-zA-Z0-9+#])`, "i");
    if (re.test(cleanText)) {
      detectedSkills.push(skill);
    }
  }

  // 9. Technical & Research Interests
  const interestsList = [
    "Cybersecurity", "Computer Networks", "Network Security", "Cryptography", "Applied Cryptography",
    "Digital Forensics", "Artificial Intelligence", "Machine Learning", "Deep Learning",
    "Computer Vision", "Natural Language Processing", "Backend Engineering", "Distributed Systems",
    "Operating Systems", "Cloud Computing", "Databases", "Information Security", "Intrusion Detection"
  ];
  const detectedInterests = [];
  for (const interest of interestsList) {
    if (new RegExp(`\\b${interest}\\b`, "i").test(cleanText)) {
      detectedInterests.push(interest);
    }
  }

  // Fallback defaults if list is small
  const finalLanguages = detectedLanguages.length ? [...new Set(detectedLanguages)].join(", ") : "Python, C++, C, JavaScript, Bash";
  const finalSkills = detectedSkills.length ? [...new Set(detectedSkills)].join(", ") : "Linux, Git, Docker, SQLite, Network Security, Machine Learning";
  const finalTechInterests = detectedInterests.length ? [...new Set(detectedInterests)].join(", ") : "Cybersecurity, Computer Science, AI/ML, Networks, Backend Engineering";
  const finalResearchInterests = detectedInterests.filter(i => ["Cybersecurity", "Network Security", "Cryptography", "Applied Cryptography", "Digital Forensics", "Intrusion Detection", "Distributed Systems", "Machine Learning"].includes(i)).join(", ") || "Network Security, Applied Cryptography, Intrusion Detection, Distributed Systems";

  return {
    name,
    degree,
    branch,
    institution,
    current_year: currentYear,
    graduation_year: graduationYear,
    cgpa,
    skills: finalSkills,
    languages: finalLanguages,
    technical_interests: finalTechInterests,
    research_interests: finalResearchInterests,
    preferred_locations: "India, Remote, Delhi NCR, Mumbai, Kanpur, Bangalore",
    funding_preference: "PRIORITIZE_PAID",
    preferred_duration: "2-3 Months (Summer/Winter)",
    availability: `Summer ${graduationYear - 2} (May - July) and Winter ${graduationYear - 3} (Dec - Jan)`,
    preferences: `Extracted from resume. Motivated undergraduate candidate in ${branch} at ${institution} seeking research and technical internships in ${finalResearchInterests}.`
  };
}

module.exports = { parsePdfBuffer, extractProfileFromResume, extractResumeWithHeuristics };
