const fs = require("fs");
const path = require("path");

const ORGANIZATIONS_SEED = [
  // 23 IITs
  { name: "IIT Bombay", organization_type: "IIT", website: "https://www.iitb.ac.in/", location: "Mumbai, Maharashtra" },
  { name: "IIT Delhi", organization_type: "IIT", website: "https://home.iitd.ac.in/", location: "New Delhi, Delhi" },
  { name: "IIT Madras", organization_type: "IIT", website: "https://www.iitm.ac.in/", location: "Chennai, Tamil Nadu" },
  { name: "IIT Kanpur", organization_type: "IIT", website: "https://www.iitk.ac.in/", location: "Kanpur, Uttar Pradesh" },
  { name: "IIT Kharagpur", organization_type: "IIT", website: "https://www.iitkgp.ac.in/", location: "Kharagpur, West Bengal" },
  { name: "IIT Roorkee", organization_type: "IIT", website: "https://iitr.ac.in/", location: "Roorkee, Uttarakhand" },
  { name: "IIT Guwahati", organization_type: "IIT", website: "https://www.iitg.ac.in/", location: "Guwahati, Assam" },
  { name: "IIT Hyderabad", organization_type: "IIT", website: "https://www.iith.ac.in/", location: "Sangareddy, Telangana" },
  { name: "IIT (BHU) Varanasi", organization_type: "IIT", website: "https://www.iitbhu.ac.in/", location: "Varanasi, Uttar Pradesh" },
  { name: "IIT Indore", organization_type: "IIT", website: "https://www.iiti.ac.in/", location: "Indore, Madhya Pradesh" },
  { name: "IIT Ropar", organization_type: "IIT", website: "https://www.iitrpr.ac.in/", location: "Rupnagar, Punjab" },
  { name: "IIT Mandi", organization_type: "IIT", website: "https://www.iitmandi.ac.in/", location: "Mandi, Himachal Pradesh" },
  { name: "IIT Gandhinagar", organization_type: "IIT", website: "https://www.iitgn.ac.in/", location: "Gandhinagar, Gujarat" },
  { name: "IIT Jodhpur", organization_type: "IIT", website: "https://www.iitj.ac.in/", location: "Jodhpur, Rajasthan" },
  { name: "IIT Patna", organization_type: "IIT", website: "https://www.iitp.ac.in/", location: "Patna, Bihar" },
  { name: "IIT Bhubaneswar", organization_type: "IIT", website: "https://www.iitbbs.ac.in/", location: "Bhubaneswar, Odisha" },
  { name: "IIT Tirupati", organization_type: "IIT", website: "https://www.iittp.ac.in/", location: "Tirupati, Andhra Pradesh" },
  { name: "IIT Palakkad", organization_type: "IIT", website: "https://iitpkd.ac.in/", location: "Palakkad, Kerala" },
  { name: "IIT Dharwad", organization_type: "IIT", website: "https://www.iitdh.ac.in/", location: "Dharwad, Karnataka" },
  { name: "IIT Jammu", organization_type: "IIT", website: "https://www.iitjammu.ac.in/", location: "Jammu, Jammu & Kashmir" },
  { name: "IIT Bhilai", organization_type: "IIT", website: "https://www.iitbhilai.ac.in/", location: "Durg, Chhattisgarh" },
  { name: "IIT Goa", organization_type: "IIT", website: "https://www.iitgoa.ac.in/", location: "Ponda, Goa" },
  { name: "IIT (ISM) Dhanbad", organization_type: "IIT", website: "https://www.iitism.ac.in/", location: "Dhanbad, Jharkhand" },

  // Government Research Orgs
  { name: "DRDO", organization_type: "GOV_RESEARCH", website: "https://drdo.gov.in/", location: "New Delhi, Delhi" },
  { name: "ISRO", organization_type: "GOV_RESEARCH", website: "https://www.isro.gov.in/", location: "Bengaluru, Karnataka" },
  { name: "CSIR", organization_type: "GOV_RESEARCH", website: "https://csir.res.in/", location: "New Delhi, Delhi" },
  { name: "C-DAC", organization_type: "GOV_RESEARCH", website: "https://www.cdac.in/", location: "Pune, Maharashtra" },
  { name: "BARC", organization_type: "GOV_RESEARCH", website: "https://www.barc.gov.in/", location: "Mumbai, Maharashtra" },
  { name: "TIFR", organization_type: "GOV_RESEARCH", website: "https://www.tifr.res.in/", location: "Mumbai, Maharashtra" },
  { name: "NIELIT", organization_type: "GOV_RESEARCH", website: "https://www.nielit.gov.in/", location: "New Delhi, Delhi" },
  { name: "MeitY", organization_type: "GOV_RESEARCH", website: "https://www.meity.gov.in/", location: "New Delhi, Delhi" },
  { name: "DST", organization_type: "GOV_RESEARCH", website: "https://dst.gov.in/", location: "New Delhi, Delhi" },
  { name: "DAE", organization_type: "GOV_RESEARCH", website: "https://dae.gov.in/", location: "Mumbai, Maharashtra" },
  { name: "ICAR", organization_type: "GOV_RESEARCH", website: "https://icar.org.in/", location: "New Delhi, Delhi" },
  { name: "ICMR", organization_type: "GOV_RESEARCH", website: "https://icmr.gov.in/", location: "New Delhi, Delhi" }
];

const INITIAL_OPPORTUNITIES = [
  {
    title: "IIT Madras Summer Fellowship Programme (SFP)",
    organization: "IIT Madras",
    department: "Computer Science and Engineering",
    category: "SUMMER_INTERNSHIP",
    location: "Chennai, Tamil Nadu",
    funding: "PAID",
    stipend_amount: "Rs. 6,000 / month",
    duration: "2 Months (May - July)",
    deadline: "2027-02-28",
    official_url: "https://sfp.iitm.ac.in/",
    application_url: "https://sfp.iitm.ac.in/",
    application_procedure: "Submit online application with academic transcripts, recommendation letter and statement of purpose.",
    description: "Two-month research internship program designed to encourage motivated undergraduate students to pursue research under faculty supervision at IIT Madras.",
    eligibility: "Candidates currently pursuing 2nd or 3rd year of B.Tech / B.E. with good academic record.",
    degree_requirements: "B.Tech / B.E.",
    branch_requirements: "Computer Science, Electrical, Mechanical, and Allied Engineering",
    year_requirements: "2nd or 3rd year undergraduate",
    cgpa_requirements: "7.5",
    skills_required: "Algorithms, Data Structures, Python, C++, Analytical Thinking",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.98,
    source_url: "https://sfp.iitm.ac.in/",
    evidence: [
      { field_name: "deadline", snippet: "Last date for online submission of application: 28th February." },
      { field_name: "stipend", snippet: "Fellowship of Rs. 6,000/- per month for a maximum period of 2 months with subsidized accommodation." },
      { field_name: "eligibility", snippet: "Students registered for a B.E./B.Tech/B.Sc. (Engg)/Integrated M.E./M.Tech programme with outstanding academic record." }
    ]
  },
  {
    title: "IIT Kanpur SURGE — Students Undergraduate Research Graduate Excellence",
    organization: "IIT Kanpur",
    department: "Computer Science & Engineering / C3i Center",
    category: "SUMMER_INTERNSHIP",
    location: "Kanpur, Uttar Pradesh",
    funding: "PAID",
    stipend_amount: "Rs. 12,500 total award + campus stay",
    duration: "8 Weeks (May - July)",
    deadline: "2027-02-15",
    official_url: "https://surge.iitk.ac.in/",
    application_url: "https://surge.iitk.ac.in/",
    application_procedure: "Online portal submission including project selection, SOP, transcript, and faculty nomination.",
    description: "Undergraduate research programme providing opportunities to work on cutting-edge research projects with IIT Kanpur faculty members in systems, cybersecurity, AI, and theoretical computer science.",
    eligibility: "Undergraduate students studying in recognized institutions across India who have completed at least 2 years of B.Tech.",
    degree_requirements: "B.Tech / B.E.",
    branch_requirements: "Computer Science, Information Technology, Electronics",
    year_requirements: "2nd / 3rd year completed",
    cgpa_requirements: "7.5",
    skills_required: "C/C++, Linux, Network Security, Python, Git",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.98,
    source_url: "https://surge.iitk.ac.in/",
    evidence: [
      { field_name: "deadline", snippet: "The online application portal will close on 15 February." },
      { field_name: "stipend", snippet: "Selected non-IITK SURGE participants will receive an award of Rs. 12,500 for the duration." },
      { field_name: "eligibility", snippet: "B.Tech/BE 2nd and 3rd year students with CPI/CGPA >= 7.5 or top 10% in class." }
    ]
  },
  {
    title: "IIT Roorkee SPARK Summer Internship Programme",
    organization: "IIT Roorkee",
    department: "Computer Science and Engineering",
    category: "SUMMER_INTERNSHIP",
    location: "Roorkee, Uttarakhand",
    funding: "PAID",
    stipend_amount: "Rs. 2,500 / week",
    duration: "6 - 8 Weeks",
    deadline: "2027-03-31",
    official_url: "https://spark.iitr.ac.in/",
    application_url: "https://spark.iitr.ac.in/",
    application_procedure: "Register and apply through IIT Roorkee SPARK online portal.",
    description: "Institute summer internship programme to attract meritorious undergraduate students from all over India to carry out research projects under the mentorship of IIT Roorkee faculty.",
    eligibility: "Students currently enrolled in 2nd or 3rd year B.Tech/B.E. program with minimum CGPA of 7.5.",
    degree_requirements: "B.Tech / B.E.",
    branch_requirements: "Computer Science, Electrical, Mathematics and Computing",
    year_requirements: "2nd or 3rd year",
    cgpa_requirements: "7.5",
    skills_required: "Python, Java, Machine Learning, Computer Networks, SQL",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.96,
    source_url: "https://spark.iitr.ac.in/",
    evidence: [
      { field_name: "deadline", snippet: "Application deadline: March 31 annually." },
      { field_name: "stipend", snippet: "Fellowship of Rs. 2,500/- per week provided to selected interns for up to 8 weeks." },
      { field_name: "eligibility", snippet: "Undergraduate students having completed 2nd or 3rd year of study with CGPA >= 7.50." }
    ]
  },
  {
    title: "IIT Bombay FOSSEE Research Fellowship in Open Source Computing & Security",
    organization: "IIT Bombay",
    department: "Computer Science and Engineering",
    category: "FELLOWSHIP",
    location: "Mumbai, Maharashtra",
    funding: "PAID",
    stipend_amount: "Rs. 15,000 / month",
    duration: "2 Months",
    deadline: "2027-03-15",
    official_url: "https://fossee.in/fellowship",
    application_url: "https://fossee.in/fellowship",
    application_procedure: "Complete practical screening task on official FOSSEE portal and submit project report.",
    description: "National mission project fellowship at IIT Bombay focusing on open source software systems, digital forensics, secure computational tools, and embedded platforms.",
    eligibility: "Open to passionate undergraduate engineering students with proven technical implementation and coding skills.",
    degree_requirements: "B.Tech / B.E. / Dual Degree",
    branch_requirements: "Computer Science, IT, Electronics, Electrical",
    year_requirements: "2nd, 3rd, or 4th year",
    cgpa_requirements: "7.0",
    skills_required: "Linux, Python, C++, Git, System Administration, Bash",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.97,
    source_url: "https://fossee.in/fellowship",
    evidence: [
      { field_name: "deadline", snippet: "Screening task and final application closes on March 15." },
      { field_name: "stipend", snippet: "Fellows receive a monthly stipend of Rs. 15,000 along with certificate of commendation from IIT Bombay." },
      { field_name: "eligibility", snippet: "Students pursuing undergraduate engineering or science programs demonstrating proficiency in screening task." }
    ]
  },
  {
    title: "DRDO INMAS / SAG Student Research Training Scheme",
    organization: "DRDO",
    department: "Scientific Analysis Group (SAG) / Cyber Security Division",
    category: "GOV_INTERNSHIP",
    location: "Delhi NCR",
    funding: "PAID",
    stipend_amount: "Rs. 10,000 / month",
    duration: "8 Weeks to 6 Months",
    deadline: "2027-01-30",
    official_url: "https://drdo.gov.in/drdo/careers/student-training",
    application_url: "https://drdo.gov.in/drdo/careers/student-training",
    application_procedure: "Offline and portal submission with institutional NOC signed by Head of Institution.",
    description: "Defence Research and Development Organisation student project training in network defense, applied cryptography, digital forensics, and secure software development.",
    eligibility: "Indian nationals pursuing regular B.Tech in CSE/IT from recognized government institutes (NIT/IIT/State Universities).",
    degree_requirements: "B.Tech",
    branch_requirements: "Computer Science & Engineering, Information Technology, Cyber Security",
    year_requirements: "2nd or 3rd year with institutional NOC",
    cgpa_requirements: "7.5",
    skills_required: "Network Security, C, Python, Cryptography, Linux Kernel basics",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.95,
    source_url: "https://drdo.gov.in/drdo/careers/student-training",
    evidence: [
      { field_name: "deadline", snippet: "Applications for summer batch accepted till 30th January with Head of Institution endorsement." },
      { field_name: "stipend", snippet: "Stipendiary apprentice/project trainee allowance of Rs. 10,000 per month." },
      { field_name: "eligibility", snippet: "Bonafide regular students of recognized Indian Engineering Colleges pursuing B.Tech in Computer Science." }
    ]
  },
  {
    title: "ISRO START & RESPOND Space Informatics and Machine Learning Internship",
    organization: "ISRO",
    department: "National Remote Sensing Centre / SAC",
    category: "GOV_INTERNSHIP",
    location: "Bengaluru / Hyderabad",
    funding: "FUNDED",
    stipend_amount: "Funded project grant / accommodation support",
    duration: "2 - 3 Months",
    deadline: "2027-04-15",
    official_url: "https://www.isro.gov.in/Student_Opportunities.html",
    application_url: "https://www.isro.gov.in/Student_Opportunities.html",
    application_procedure: "Apply via ISRO central student portal with bona fide certificate from university.",
    description: "Research internships in satellite telemetry analysis, deep learning for remote sensing, high-performance data processing pipelines, and autonomous navigation algorithms.",
    eligibility: "B.Tech students in 2nd and 3rd year with interest in computer vision, machine learning, and high performance data processing.",
    degree_requirements: "B.Tech / B.E.",
    branch_requirements: "Computer Science, Data Science, AI, Electronics",
    year_requirements: "2nd or 3rd year",
    cgpa_requirements: "8.0",
    skills_required: "Python, PyTorch, Computer Vision, Data Structures, Geospatial analysis",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.94,
    source_url: "https://www.isro.gov.in/Student_Opportunities.html",
    evidence: [
      { field_name: "deadline", snippet: "Annual student opportunity call closes mid-April." },
      { field_name: "stipend", snippet: "Selected students receive project logistical support and research grant stipend." }
    ]
  },
  {
    title: "C-DAC High Performance Computing and Security Research Internship",
    organization: "C-DAC",
    department: "High Performance Computing and Cyber Security Wing",
    category: "PROJECT_ASSISTANT",
    location: "Pune, Maharashtra",
    funding: "PAID",
    stipend_amount: "Rs. 8,000 / month",
    duration: "3 - 6 Months",
    deadline: "2027-02-20",
    official_url: "https://www.cdac.in/index.aspx?id=academic_internship",
    application_url: "https://www.cdac.in/index.aspx?id=academic_internship",
    application_procedure: "Online submission of resume and academic verification on C-DAC recruitment portal.",
    description: "Hands-on research on PARAM supercomputing clusters, distributed storage architectures, malware reverse engineering, and zero-trust authentication protocols.",
    eligibility: "Undergraduate engineering students in 2nd/3rd year with strong command of systems programming and networks.",
    degree_requirements: "B.Tech",
    branch_requirements: "Computer Science, Information Technology, Cyber Security",
    year_requirements: "2nd or 3rd year",
    cgpa_requirements: "7.0",
    skills_required: "C, Linux, Distributed Systems, Networks, Reverse Engineering",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.96,
    source_url: "https://www.cdac.in/index.aspx?id=academic_internship",
    evidence: [
      { field_name: "deadline", snippet: "Application closing date: 20 February." },
      { field_name: "stipend", snippet: "Monthly stipend of Rs. 8,000/- for full-time project assistants/interns." }
    ]
  },
  {
    title: "IIT Gandhinagar SRIP — Summer Research Internship Program",
    organization: "IIT Gandhinagar",
    department: "Computer Science and Engineering",
    category: "SUMMER_INTERNSHIP",
    location: "Gandhinagar, Gujarat",
    funding: "PAID",
    stipend_amount: "Rs. 2,000 / week + hostel",
    duration: "8 Weeks (May - July)",
    deadline: "2027-03-05",
    official_url: "https://srip.iitgn.ac.in/",
    application_url: "https://srip.iitgn.ac.in/",
    application_procedure: "Online registration through IIT Gandhinagar SRIP portal with project preferences.",
    description: "Summer research opportunity open to engineering students across India to collaborate with faculty mentors on innovative scientific and technical research projects.",
    eligibility: "Undergraduate students who have completed at least 1 year of study from any recognized institution.",
    degree_requirements: "B.Tech / B.E. / B.Sc.",
    branch_requirements: "Any Engineering branch, Computer Science prioritized",
    year_requirements: "2nd or 3rd year",
    cgpa_requirements: "7.0",
    skills_required: "Programming in Python or C++, Problem Solving, Scientific Writing",
    application_status: "OPEN",
    verification_status: "VERIFIED",
    confidence_score: 0.95,
    source_url: "https://srip.iitgn.ac.in/",
    evidence: [
      { field_name: "deadline", snippet: "Last date to apply for SRIP: March 5." },
      { field_name: "stipend", snippet: "Weekly stipend of Rs. 2,000 and free accommodation on campus." }
    ]
  }
];

const INITIAL_RESEARCHERS = [
  {
    name: "Prof. Sandeep Shukla",
    organization: "IIT Kanpur",
    department: "Computer Science and Engineering",
    designation: "Professor & C3i Hub Director",
    research_areas: "Cyber Security, Blockchain, Cyber-Physical Systems Security, Formal Methods",
    profile_url: "https://www.cse.iitk.ac.in/users/sandeeps/",
    lab_url: "https://c3ihub.org/",
    email: "sandeeps@cse.iitk.ac.in",
    signal_status: "CONFIRMED_OPEN",
    recruitment_evidence: "C3i Hub active call for undergraduate student interns in hardware security and intrusion detection.",
    notes: "Pioneer in Indian cybersecurity research. Regularly mentors motivated undergraduate researchers."
  },
  {
    name: "Prof. Chester Rebeiro",
    organization: "IIT Madras",
    department: "Computer Science and Engineering",
    designation: "Associate Professor",
    research_areas: "Hardware Security, Microarchitectural Attacks, Cryptography, Operating Systems Security",
    profile_url: "https://www.cse.iitm.ac.in/~chester/",
    lab_url: "https://casl.cse.iitm.ac.in/",
    email: "chester@cse.iitm.ac.in",
    signal_status: "POTENTIAL_OPENING",
    recruitment_evidence: "CASL research lab invites students with C/C++ and RISC-V systems experience for summer/winter projects.",
    notes: "Runs Computer Architecture and Systems Lab (CASL). Focus on side-channel analysis and secure processor design."
  },
  {
    name: "Prof. Manoj Prabhakaran",
    organization: "IIT Bombay",
    department: "Computer Science and Engineering",
    designation: "Professor",
    research_areas: "Theoretical Cryptography, Secure Multi-Party Computation, Pseudorandomness",
    profile_url: "https://www.cse.iitb.ac.in/~mp/",
    lab_url: "https://crypto.cse.iitb.ac.in/",
    email: "mp@cse.iitb.ac.in",
    signal_status: "RESEARCH_LEAD",
    recruitment_evidence: "Research group works on mathematical cryptography. Welcomes students with strong discrete math foundation.",
    notes: "Leading researcher in theoretical foundations of cryptography and zero-knowledge protocols."
  },
  {
    name: "Prof. Huzur Saran",
    organization: "IIT Delhi",
    department: "Computer Science and Engineering",
    designation: "Professor",
    research_areas: "Computer Networks, Network Security, Wireless Networks, Internet Measurement",
    profile_url: "https://www.cse.iitd.ac.in/~saran/",
    lab_url: "https://cse.iitd.ac.in/research/networks",
    email: "saran@cse.iitd.ac.in",
    signal_status: "POTENTIAL_OPENING",
    recruitment_evidence: "Announced ongoing research projects in 5G packet core security and software defined networks.",
    notes: "Former Head of CSE Department at IIT Delhi. Active in high-speed network protocols and defense."
  },
  {
    name: "Prof. Debdeep Mukhopadhyay",
    organization: "IIT Kharagpur",
    department: "Computer Science and Engineering",
    designation: "Professor",
    research_areas: "Hardware Security, Side Channel Analysis, Embedded Cryptography, VLSI Security",
    profile_url: "https://www.cse.iitkgp.ac.in/~debdeep/",
    lab_url: "https://www.cse.iitkgp.ac.in/~debdeep/seal/",
    email: "debdeep@cse.iitkgp.ac.in",
    signal_status: "CONFIRMED_OPEN",
    recruitment_evidence: "SEAL lab has sponsored research positions for undergraduate project trainees in cryptographic hardware.",
    notes: "Directs Secured Embedded Architecture Laboratory (SEAL). Shanti Swarup Bhatnagar prize recipient."
  },
  {
    name: "Prof. Sukumar Nandi",
    organization: "IIT Guwahati",
    department: "Computer Science and Engineering",
    designation: "Senior Professor",
    research_areas: "Computer Networks, Cyber Security, Fault-tolerant Systems, Cloud Computing",
    profile_url: "https://www.iitg.ac.in/sukumar/",
    lab_url: "https://www.iitg.ac.in/sukumar/research.html",
    email: "sukumar@iitg.ac.in",
    signal_status: "RESEARCH_LEAD",
    recruitment_evidence: "Supervises sponsored DST/MeitY cybersecurity projects with recurring openings for student research associates.",
    notes: "Focuses on intrusion detection in wireless sensor networks and software-defined network defenses."
  },
  {
    name: "Dr. P. K. Saxena",
    organization: "DRDO",
    department: "Scientific Analysis Group (SAG)",
    designation: "Chief Scientist & Cryptologist",
    research_areas: "Cryptanalysis, Cyber Warfare Defense, Secure Communication Architectures",
    profile_url: "https://drdo.gov.in/drdo/labs-and-establishments/scientific-analysis-group-sag",
    lab_url: "https://drdo.gov.in/sag",
    email: "director.sag@gov.in",
    signal_status: "POTENTIAL_OPENING",
    recruitment_evidence: "SAG periodically inducts university project interns with clearances in algorithmic mathematics and security.",
    notes: "DRDO premier cryptology laboratory working on defense communications and cryptographic security evaluation."
  }
];

function seedDatabase(db) {
  // 1. Seed Organizations
  const insertOrg = db.prepare(`
    INSERT INTO organizations (name, organization_type, website, location, description)
    VALUES (@name, @organization_type, @website, @location, @description)
    ON CONFLICT(name) DO UPDATE SET
      website = excluded.website,
      location = excluded.location,
      organization_type = excluded.organization_type
  `);
  for (const org of ORGANIZATIONS_SEED) {
    insertOrg.run({
      name: org.name,
      organization_type: org.organization_type,
      website: org.website,
      location: org.location,
      description: `${org.name} — Premier academic / research institution in India.`
    });
  }

  // 2. Seed Initial Opportunities
  const oppCount = db.prepare("SELECT COUNT(*) AS n FROM opportunities").get().n;
  if (oppCount === 0) {
    const insertOpp = db.prepare(`
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

    const insertEvidence = db.prepare(`
      INSERT INTO opportunity_evidence (opportunity_id, field_name, snippet, source_url)
      VALUES (?, ?, ?, ?)
    `);

    for (const opp of INITIAL_OPPORTUNITIES) {
      const res = insertOpp.run(opp);
      const oppId = res.lastInsertRowid;
      if (opp.evidence && Array.isArray(opp.evidence)) {
        for (const ev of opp.evidence) {
          insertEvidence.run(oppId, ev.field_name, ev.snippet, opp.source_url);
        }
      }
    }
  }

  // 3. Seed Initial Researchers
  const resCount = db.prepare("SELECT COUNT(*) AS n FROM researchers").get().n;
  if (resCount === 0) {
    const insertResearcher = db.prepare(`
      INSERT INTO researchers (
        name, organization, department, designation, research_areas,
        profile_url, lab_url, email, signal_status, recruitment_evidence, notes
      ) VALUES (
        @name, @organization, @department, @designation, @research_areas,
        @profile_url, @lab_url, @email, @signal_status, @recruitment_evidence, @notes
      )
    `);
    for (const r of INITIAL_RESEARCHERS) {
      insertResearcher.run(r);
    }
  }
}

module.exports = { seedDatabase, ORGANIZATIONS_SEED, INITIAL_OPPORTUNITIES, INITIAL_RESEARCHERS };
