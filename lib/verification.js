const OFFICIAL_DOMAINS = [
  "iitb.ac.in", "iitd.ac.in", "iitm.ac.in", "iitk.ac.in", "iitkgp.ac.in", "iitr.ac.in", "iitg.ac.in",
  "iith.ac.in", "iitbhu.ac.in", "iiti.ac.in", "iitrpr.ac.in", "iitmandi.ac.in", "iitgn.ac.in",
  "iitj.ac.in", "iitp.ac.in", "iitbbs.ac.in", "iittp.ac.in", "iitpkd.ac.in", "iitdh.ac.in",
  "iitjammu.ac.in", "iitbhilai.ac.in", "iitgoa.ac.in", "iitism.ac.in",
  "drdo.gov.in", "isro.gov.in", "csir.res.in", "barc.gov.in", "tifr.res.in", "cdac.in",
  "nielit.gov.in", "icar.org.in", "icmr.gov.in", "meity.gov.in", "dst.gov.in", "dae.gov.in"
];

function isAuthoritativeDomain(urlStr) {
  if (!urlStr) return false;
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain));
  } catch {
    return false;
  }
}

function verifyOpportunity(opp, evidenceCount = 0) {
  const today = new Date().toISOString().split("T")[0];
  let appStatus = opp.application_status || "OPEN";
  let verStatus = opp.verification_status || "UNVERIFIED";
  const notes = [];

  // Check deadline date
  if (opp.deadline) {
    if (opp.deadline < today) {
      appStatus = "CLOSED";
      verStatus = "STALE";
      notes.push(`Deadline passed on ${opp.deadline}; marked as CLOSED and STALE.`);
    } else {
      appStatus = "OPEN";
      notes.push(`Active deadline valid until ${opp.deadline}.`);
    }
  }

  // Check official domain authority
  const isOfficial = isAuthoritativeDomain(opp.official_url) || isAuthoritativeDomain(opp.source_url);
  if (isOfficial) {
    if (appStatus !== "CLOSED") {
      if (evidenceCount >= 2 || (opp.description && opp.eligibility)) {
        verStatus = "VERIFIED";
        notes.push("Authoritative institutional domain with multiple supporting evidence fields.");
      } else {
        verStatus = "PARTIALLY_VERIFIED";
        notes.push("Authoritative institutional domain; detailed evidence extraction pending.");
      }
    }
  } else if (verStatus !== "STALE") {
    verStatus = "UNVERIFIED";
    notes.push("Source URL not yet confirmed against known institutional whitelist.");
  }

  return {
    application_status: appStatus,
    verification_status: verStatus,
    is_authoritative: isOfficial,
    notes
  };
}

module.exports = { isAuthoritativeDomain, verifyOpportunity, OFFICIAL_DOMAINS };
