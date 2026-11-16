function normalizeText(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function tokenizeList(str) {
  if (!str) return [];
  return String(str)
    .split(/[,;\n|/]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function evaluateEligibility(profile, opp) {
  let reasons = [];
  let isEligible = true;
  let isPossibly = false;
  let hasMissingInfo = false;

  const oppEligibility = (opp.eligibility || "").toLowerCase();
  const degreeReq = (opp.degree_requirements || "").toLowerCase();
  const branchReq = (opp.branch_requirements || "").toLowerCase();
  const yearReq = (opp.year_requirements || "").toLowerCase();
  const cgpaReq = opp.cgpa_requirements;

  // 1. Degree check
  const candidateDegree = (profile.degree || "B.Tech").toLowerCase();
  if (degreeReq) {
    if (degreeReq.includes("b.tech") || degreeReq.includes("b.e") || degreeReq.includes("undergraduate") || degreeReq.includes("ug") || degreeReq.includes("bachelor")) {
      reasons.push("Degree criteria satisfied (B.Tech / Undergraduate)");
    } else if (degreeReq.includes("m.tech") || degreeReq.includes("phd") || degreeReq.includes("master")) {
      isEligible = false;
      reasons.push(`Degree mismatch: requires ${opp.degree_requirements}`);
    } else {
      isPossibly = true;
      reasons.push("Degree requirement partially matches or needs verification");
    }
  }

  // 2. Branch check
  const candidateBranch = (profile.branch || "Computer Science").toLowerCase();
  if (branchReq) {
    const directMatches = ["computer", "cse", "it", "information technology", "software", "circuital", "all branches", "any discipline", "any branch"];
    const hasDirectMatch = directMatches.some(b => branchReq.includes(b));
    const nonCseBranches = ["mechanical", "civil", "chemical", "biotech", "metallurgy", "aerospace", "textile", "mining"];
    const hasNonCseBranch = nonCseBranches.some(b => branchReq.includes(b));

    if (hasDirectMatch) {
      reasons.push("Branch criteria satisfied (Computer Science / Allied)");
    } else if (hasNonCseBranch) {
      isEligible = false;
      reasons.push(`Branch mismatch: requires ${opp.branch_requirements}`);
    } else if (branchReq.includes("engineering")) {
      // General engineering without specific branch restriction
      reasons.push("General engineering disciplines eligible");
    } else {
      isPossibly = true;
      reasons.push("Specific branch restrictions require review");
    }
  }

  // 3. Year of study check
  const candidateYear = Number(profile.current_year) || 2;
  if (yearReq) {
    const yearMatches = (
      (yearReq.includes("2nd") || yearReq.includes("2") || yearReq.includes("second") || yearReq.includes("pre-final") || yearReq.includes("undergraduate")) &&
      !yearReq.includes("final year only") && !yearReq.includes("graduating only")
    );
    if (yearMatches) {
      reasons.push(`Academic year suitable (Year ${candidateYear})`);
    } else if (yearReq.includes("3rd year only") || yearReq.includes("final year only")) {
      isEligible = false;
      reasons.push(`Year mismatch: requires ${opp.year_requirements}`);
    } else {
      isPossibly = true;
      reasons.push("Year of study requirement requires review");
    }
  }

  // 4. CGPA check
  if (cgpaReq) {
    const minCgpaMatch = String(cgpaReq).match(/([0-9]+\.?[0-9]*)/);
    if (minCgpaMatch) {
      const minCgpa = parseFloat(minCgpaMatch[1]);
      const candCgpa = parseFloat(profile.cgpa) || 8.0;
      if (candCgpa >= minCgpa) {
        reasons.push(`CGPA requirement met (${candCgpa} >= ${minCgpa})`);
      } else {
        isEligible = false;
        reasons.push(`CGPA below required cutoff (${candCgpa} < ${minCgpa})`);
      }
    }
  }

  // General text checks if structured requirements are empty
  if (!degreeReq && !branchReq && !yearReq && !cgpaReq) {
    if (!oppEligibility || oppEligibility.includes("unknown") || oppEligibility.trim() === "") {
      return {
        status: "INSUFFICIENT_INFORMATION",
        reasons: ["Eligibility criteria not detailed in original announcement; official review advised."]
      };
    } else {
      // Heuristic parsing of eligibility text
      if (oppEligibility.includes("undergraduate") || oppEligibility.includes("b.tech") || oppEligibility.includes("engineering")) {
        reasons.push("Undergraduate engineering students generally eligible");
      } else {
        isPossibly = true;
        reasons.push("Requires verification against official guideline text");
      }
    }
  }

  let finalStatus;
  if (!isEligible) {
    finalStatus = "INELIGIBLE";
  } else if (isPossibly) {
    finalStatus = "POSSIBLY_ELIGIBLE";
  } else {
    finalStatus = "ELIGIBLE";
  }

  return {
    status: finalStatus,
    reasons
  };
}

function calculateMatchScore(profile, opp) {
  const breakdown = [];
  let totalScore = 0;

  // 1. Research-interest relevance (Weight: 30%)
  const profileInterests = tokenizeList(`${profile.technical_interests || ""} ${profile.research_interests || ""}`);
  const oppText = `${opp.title || ""} ${opp.description || ""} ${opp.department || ""} ${opp.laboratory || ""} ${opp.category || ""}`.toLowerCase();
  
  let interestMatches = 0;
  for (const item of profileInterests) {
    if (item.length > 2 && oppText.includes(item)) {
      interestMatches++;
    }
  }
  const interestRatio = profileInterests.length > 0 ? Math.min(interestMatches / 3, 1.0) : 0.5;
  const interestScore = Math.round(interestRatio * 30);
  totalScore += interestScore;
  if (interestScore >= 20) {
    breakdown.push(`High research alignment in ${interestMatches} topics (+${interestScore}/30)`);
  } else if (interestScore > 0) {
    breakdown.push(`Moderate research alignment (+${interestScore}/30)`);
  } else {
    breakdown.push(`General STEM / Computing scope (+0/30)`);
  }

  // 2. Skill alignment (Weight: 25%)
  const candidateSkills = tokenizeList(`${profile.skills || ""} ${profile.languages || ""}`);
  const requiredSkillsText = `${opp.skills_required || ""} ${opp.description || ""}`.toLowerCase();
  
  let skillMatches = 0;
  for (const skill of candidateSkills) {
    if (skill.length > 1 && requiredSkillsText.includes(skill)) {
      skillMatches++;
    }
  }
  const skillRatio = candidateSkills.length > 0 ? Math.min(skillMatches / 3, 1.0) : 0.4;
  const skillScore = Math.round(skillRatio * 25);
  totalScore += skillScore;
  if (skillScore >= 18) {
    breakdown.push(`Direct matching skills detected (+${skillScore}/25)`);
  } else if (skillScore > 0) {
    breakdown.push(`Basic prerequisite skills matched (+${skillScore}/25)`);
  } else {
    breakdown.push(`General technical requirements (+0/25)`);
  }

  // 3. Academic suitability (Weight: 15%)
  const eligibility = evaluateEligibility(profile, opp);
  let academicScore = 0;
  if (eligibility.status === "ELIGIBLE") {
    academicScore = 15;
    breakdown.push(`Full academic suitability: Year, Degree & Branch fit (+15/15)`);
  } else if (eligibility.status === "POSSIBLY_ELIGIBLE") {
    academicScore = 10;
    breakdown.push(`Likely academic suitability; verify specific branch rules (+10/15)`);
  } else if (eligibility.status === "INSUFFICIENT_INFORMATION") {
    academicScore = 8;
    breakdown.push(`Academic criteria unstated; review required (+8/15)`);
  } else {
    academicScore = 0;
    breakdown.push(`Academic criteria mismatch (0/15)`);
  }
  totalScore += academicScore;

  // 4. Opportunity quality and evidence (Weight: 10%)
  let qualityScore = 0;
  const isOfficialOrg = (opp.organization || "").includes("IIT") || ["ISRO", "DRDO", "CSIR", "BARC", "C-DAC", "TIFR"].some(k => (opp.organization || "").includes(k));
  if (isOfficialOrg) qualityScore += 5;
  if (opp.verification_status === "VERIFIED") qualityScore += 3;
  else if (opp.verification_status === "PARTIALLY_VERIFIED") qualityScore += 2;
  if (opp.official_url) qualityScore += 2;
  qualityScore = Math.min(qualityScore, 10);
  totalScore += qualityScore;
  breakdown.push(`Authoritative institutional source & evidence verified (+${qualityScore}/10)`);

  // 5. Funding preference (Weight: 10%)
  let fundingScore = 0;
  const fundingUpper = String(opp.funding || "").toUpperCase();
  if (fundingUpper === "PAID" || fundingUpper === "FUNDED") {
    fundingScore = 10;
    breakdown.push(`Funded / Stipendiary opportunity (+10/10)`);
  } else if (fundingUpper === "UNPAID") {
    fundingScore = profile.funding_preference === "PAID_ONLY" ? 2 : 6;
    breakdown.push(`Unpaid academic research position (+${fundingScore}/10)`);
  } else {
    fundingScore = 5;
    breakdown.push(`Funding not specified in notice (+5/10)`);
  }
  totalScore += fundingScore;

  // 6. Recency and deadline validity (Weight: 10%)
  let recencyScore = 6;
  if (opp.deadline) {
    const today = new Date().toISOString().split("T")[0];
    if (opp.deadline >= today) {
      recencyScore = 10;
      breakdown.push(`Active opening with upcoming deadline (+10/10)`);
    } else {
      recencyScore = 0;
      breakdown.push(`Announcement deadline expired (+0/10)`);
    }
  } else {
    recencyScore = 7;
    breakdown.push(`Rolling or unannounced deadline (+7/10)`);
  }
  totalScore += recencyScore;

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    eligibility,
    breakdown,
    factors: {
      research_interest: interestScore,
      skills: skillScore,
      academic: academicScore,
      quality: qualityScore,
      funding: fundingScore,
      recency: recencyScore
    }
  };
}

module.exports = { calculateMatchScore, evaluateEligibility };
