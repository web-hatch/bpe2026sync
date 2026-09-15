import { loadDashboardSnapshot } from "./supabase-dashboard.js";

// ===========================================================================
// BARMM Election Results 2026 - Grouped Sectors & Districts
// ==========================================================================

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const resultMessage = $("#result-message");
const resultsBody = $("#party-list-results");
const searchInput = $("#party-search");
const refreshBtn = $("#refresh-btn");
const copyBtn = $("#copy-summary-btn");
const groupToggle = $("#group-toggle");
const categoryTabs = $("#category-tabs");
const subfilterPills = $("#subfilter-pills");
const toastContainer = $("#toast-container");

// KPI elements
const kpiReturnsVal = $("#kpi-returns-val");
const kpiReturnsSub = $("#kpi-returns-sub");
const kpiVotesVal = $("#kpi-votes-val");
const kpiLeaderVal = $("#kpi-leader-val");
const kpiLeaderShare = $("#kpi-leader-share");
const kpiPartiesVal = $("#kpi-parties-val");
const resultTitle = $("#result-title");
const footerUpdatedTime = $("#footer-updated-time");

// Modal elements
const modalBtn = $("#info-modal-btn");
const modalBackdrop = $("#modal-backdrop");
const modalCloseBtn = $("#modal-close-btn");
const modalCancelBtn = $("#modal-cancel-btn");
const modalSaveBtn = $("#modal-save-btn");
const modalSource = $("#modal-source");
const modalFiles = $("#modal-files");
const modalTimestamp = $("#modal-timestamp");

// Application State
let snapshot = null;
let currentCategory = "all"; // Sequence: all, Political Party, district rep, sectoral
let currentSubfilter = "all";
let isGrouped = true;
let isProvinceBreakdown = false;

// ==========================================================================
// Helper functions for Contest Titles & Groups
// ==========================================================================
function toProperCase(str) {
  if (!str) return "";
  const map = {
    "BASILAN": "Basilan",
    "LANAO DEL SUR": "Lanao del Sur",
    "MAGUINDANAO DEL NORTE": "Maguindanao del Norte",
    "MAGUINDANAO DEL SUR": "Maguindanao del Sur",
    "SPECIAL GEOGRAPHIC AREA": "Special Geographic Area",
    "TAWI-TAWI": "Tawi — Tawi",
    "TAWI — TAWI": "Tawi — Tawi",
    "TAWI - TAWI": "Tawi — Tawi",
    "TAWI": "Tawi",
    "CITY OF COTABATO": "City of Cotabato",
    "COTABATO CITY": "Cotabato City",
    "SGA": "Special Geographic Area"
  };
  const upper = str.trim().toUpperCase();
  if (map[upper]) return map[upper];
  const res = str.toLowerCase().replace(/\b([a-z])/g, (m, ch, offset, full) => {
    const word = full.slice(offset).split(/[\s-]/)[0];
    if (offset > 0 && ["del", "de", "ng", "of", "and", "the", "in"].includes(word)) {
      return ch;
    }
    return ch.toUpperCase();
  });
  return res.replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
}

function getFriendlyContestName(contestName, categoryKey) {
  if (categoryKey === "party_list" || contestName.includes("REGIONAL PARLIAMENTARY POLITICAL PARTY")) {
    return "Regional Parliamentary Political Party";
  }

  // Sectoral mapping
  if (contestName.includes("ULAMA")) return "Ulama";
  if (contestName.includes("YOUTH")) return "Youth";
  if (contestName.includes("WOMEN")) return "Women";
  if (contestName.includes("TRADITIONAL LEADERS")) return "Traditional Leaders";
  if (contestName.includes("SETTLER COMMUNITIES")) return "Settler Communities";

  // District mapping
  let normalized = contestName.replace(/TAWI\s*[-—]\s*TAWI/gi, "Tawi — Tawi");
  normalized = normalized.replace(/^.*?BARMM\s*-\s*/i, "");
  const parts = normalized.split(/\s+-\s+/);
  let province = "";
  let district = "";
  if (parts.length >= 2) {
    province = toProperCase(parts[0].trim());
    district = parts.slice(1).join(" — ").trim();
  } else {
    const districtMatch = normalized.match(/([^-]+)\s*-\s*([^\n]+)/);
    if (districtMatch) {
      province = toProperCase(districtMatch[1].trim());
      district = districtMatch[2].trim();
    }
  }

  if (province && district) {
    district = district
      .replace(/PARLIAMENTARY DISTRICT/i, "District")
      .replace(/FIRST/i, "1st")
      .replace(/SECOND/i, "2nd")
      .replace(/THIRD/i, "3rd")
      .replace(/FOURTH/i, "4th")
      .replace(/FIFTH/i, "5th")
      .replace(/SIXTH/i, "6th")
      .replace(/SEVENTH/i, "7th")
      .replace(/EIGHTH/i, "8th")
      .replace(/NINTH/i, "9th")
      .replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
    let formatted = `${province} — ${district}`;
    return formatted.replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
  }

  return contestName.replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
}

function getContestTag(contestName, categoryKey) {
  if (categoryKey === "party_list") return { text: "Political Party", className: "party-tag" };
  if (categoryKey === "sectoral") return { text: "Sectoral", className: "sector-tag" };
  return { text: "District Representative", className: "district-tag" };
}

function formatContestTitleHtml(title, categoryKey) {
  if (categoryKey === "district") {
    return title.replace(/—\s*(\d+(?:st|nd|rd|th)\s+District)(.*)$/i, '— <span class="group-title-district">$1</span>$2');
  }
  return title;
}

// ==========================================================================
// Lucide Icons Helper
// ==========================================================================
function refreshLucideIcons() {
  if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// ==========================================================================
// Global Centralized Floating Toast Notification
// ==========================================================================
function showToast(message, type = "info", duration = 3200) {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");

  let iconHtml = "";
  if (type === "success") {
    iconHtml = `<i data-lucide="check-circle-2" class="toast-icon"></i>`;
  } else if (type === "error") {
    iconHtml = `<i data-lucide="alert-circle" class="toast-icon"></i>`;
  } else {
    iconHtml = `<i data-lucide="info" class="toast-icon"></i>`;
  }

  toast.innerHTML = `${iconHtml}<span>${message}</span>`;
  toastContainer.appendChild(toast);
  refreshLucideIcons();

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  const dismissTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, duration);

  toast.addEventListener("click", () => {
    clearTimeout(dismissTimer);
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  });
}

// ==========================================================================
const groupsContainer = $("#groups-container");

// ==========================================================================
// Skeleton Loading State
// ==========================================================================
function setSkeletonLoading(isLoading) {
  if (isLoading) {
    [kpiReturnsVal, kpiVotesVal, kpiLeaderVal, kpiPartiesVal].forEach((el) => {
      if (el) {
        el.className = "kpi-value skeleton skeleton-text";
        el.textContent = "...";
      }
    });

    if (groupsContainer) {
      const rowSkeleton = `
        <tr class="skeleton-row">
          <td class="ballot-col">
            <span class="skeleton" style="width: 32px; height: 28px; border-radius: 8px;"></span>
          </td>
          <td class="rank-col">
            <span class="skeleton" style="width: 28px; height: 28px; border-radius: 50%;"></span>
          </td>
          <td class="party-cell">
            <span class="skeleton" style="width: 150px; height: 16px; border-radius: 4px; margin-bottom: 5px;"></span>
            <span class="skeleton" style="width: 90px; height: 12px; border-radius: 4px;"></span>
          </td>
          <td class="share-col">
            <div class="share-cell">
              <span class="skeleton" style="width: 45px; height: 14px; border-radius: 4px; margin-bottom: 5px;"></span>
              <div class="skeleton" style="width: 120px; height: 8px; border-radius: 999px;"></div>
            </div>
          </td>
          <td class="votes-column vote-total">
            <span class="skeleton" style="width: 85px; height: 18px; border-radius: 4px; margin-left: auto; margin-bottom: 5px;"></span>
            <span class="skeleton" style="width: 105px; height: 12px; border-radius: 4px; margin-left: auto;"></span>
          </td>
        </tr>
      `;

      groupsContainer.innerHTML = `
        <article class="group-card group-party">
          <header class="group-card-header">
            <div class="group-header-info">
              <span class="group-avatar-badge skeleton" style="width:40px;height:40px;"></span>
              <div class="group-title-stack" style="width:240px;">
                <span class="skeleton" style="width:90px;height:16px;border-radius:999px;"></span>
                <span class="skeleton" style="width:210px;height:22px;margin-top:5px;border-radius:4px;"></span>
              </div>
            </div>
            <div class="group-header-stats">
              <span class="skeleton stat-pill" style="width:95px;height:28px;"></span>
              <span class="skeleton stat-pill" style="width:120px;height:28px;"></span>
            </div>
          </header>
          <div class="table-wrap">
            <table class="results-table" aria-label="Loading election results">
              <thead>
                <tr>
                  <th scope="col" class="ballot-col">NO.</th>
                  <th scope="col" class="rank-col">RANK</th>
                  <th scope="col" class="party-col">CANDIDATE</th>
                  <th scope="col" class="share-col">VOTE SHARE</th>
                  <th scope="col" class="votes-column">TOTAL VOTES</th>
                </tr>
              </thead>
              <tbody>
                ${rowSkeleton}
                ${rowSkeleton}
                ${rowSkeleton}
                ${rowSkeleton}
                ${rowSkeleton}
              </tbody>
            </table>
          </div>
        </article>
      `;
    }
    let catLabel = "All Contests";
    if (currentCategory === "party_list") catLabel = "Political Party";
    else if (currentCategory === "district") catLabel = "District Representatives";
    else if (currentCategory === "sectoral") catLabel = "Sectoral Representatives";
    if (resultTitle) {
      resultTitle.textContent = `${catLabel} Vote Totals`;
    }
    resultMessage.textContent = "Loading official returns snapshot...";
  } else {
    [kpiReturnsVal, kpiVotesVal, kpiLeaderVal, kpiPartiesVal].forEach((el) => {
      if (el) el.classList.remove("skeleton", "skeleton-text");
    });
  }
}

// ==========================================================================
// Data Parsing & Normalization
// ==========================================================================
function getAllContests() {
  if (!snapshot?.categories) return [];
  const list = [];
  Object.entries(snapshot.categories).forEach(([catKey, category]) => {
    if (Array.isArray(category.contests)) {
      category.contests.forEach((contest) => {
        list.push({
          categoryKey: catKey,
          categoryLabel: category.label,
          contest_name: contest.contest_name,
          friendly_name: getFriendlyContestName(contest.contest_name, catKey),
          candidates: Array.isArray(contest.candidates)
            ? [...contest.candidates]
                .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || (a.ballot_order || 9999) - (b.ballot_order || 9999))
                .map((cand, idx) => ({ ...cand, rank: idx + 1 }))
            : []
        });
      });
    }
  });
  return list;
}

const SECTOR_ORDER = [
  "SETTLER COMMUNITIES",
  "WOMEN",
  "YOUTH",
  "ULAMA",
  "TRADITIONAL LEADERS"
];

const CATEGORY_ORDER = ["party_list", "sectoral", "district"];
const PARTY_REPRESENTATIVE_SEATS = 40;
const PARTY_QUALIFYING_PERCENT = 2.5;

function getSeatAllocation(contest) {
  const candidates = contest.candidates || [];
  const seats = new Map(candidates.map((candidate) => [candidate.name, 0]));

  if (contest.categoryKey === "party_list") {
    const totalValidVotes = candidates.reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);
    const qualified = candidates.filter((candidate) => totalValidVotes > 0
      && (Number(candidate.votes || 0) / totalValidVotes) * 100 >= PARTY_QUALIFYING_PERCENT);
    const qualifiedVotes = qualified.reduce((sum, candidate) => sum + Number(candidate.votes || 0), 0);
    let allocated = 0;

    qualified.forEach((candidate) => {
      const seatCount = Math.floor((Number(candidate.votes || 0) / qualifiedVotes) * PARTY_REPRESENTATIVE_SEATS);
      seats.set(candidate.name, seatCount);
      allocated += seatCount;
    });

    for (let index = 0; allocated < PARTY_REPRESENTATIVE_SEATS && qualified.length; index += 1, allocated += 1) {
      const candidate = qualified[index % qualified.length];
      seats.set(candidate.name, (seats.get(candidate.name) || 0) + 1);
    }
    return seats;
  }

  const sectorSeats = contest.categoryKey === "sectoral" && contest.contest_name.toUpperCase().includes("SETTLER COMMUNITIES") ? 2 : 1;
  candidates.slice(0, sectorSeats).forEach((candidate) => seats.set(candidate.name, 1));
  return seats;
}

function getSectorOrderIndex(contestName) {
  const upper = contestName.toUpperCase();
  for (let i = 0; i < SECTOR_ORDER.length; i++) {
    if (upper.includes(SECTOR_ORDER[i])) return i;
  }
  return 99;
}

function getDistrictOrderIndex(contestName) {
  const ordinal = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10 };
  const match = contestName.toUpperCase().match(/(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|\d+)\s+(?:PARLIAMENTARY\s+)?DISTRICT/);
  return match ? (ordinal[match[1]] || Number(match[1])) : 999;
}

const DISTRICT_PROVINCE_ORDER = [
  "BASILAN",
  "LANAO DEL SUR",
  "MAGUINDANAO DEL NORTE",
  "MAGUINDANAO DEL SUR",
  "SPECIAL GEOGRAPHIC AREA",
  "TAWI-TAWI",
  "CITY OF COTABATO"
];

function getDistrictProvince(contestName) {
  const match = contestName.toUpperCase().match(/BARMM\s*-\s*(.*?)\s*-\s*(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|\d+)/);
  return match ? match[1].trim() : "";
}

function getDistrictProvinceOrder(contestName) {
  const index = DISTRICT_PROVINCE_ORDER.indexOf(getDistrictProvince(contestName));
  return index === -1 ? 999 : index;
}

function getContestsForActiveCategory() {
  const all = getAllContests();
  let filtered = currentCategory === "all" ? all : all.filter((c) => c.categoryKey === currentCategory);

  // Apply requested sequence for Sectoral contests: Settler, Women, Youth, Ulama, Traditional Leaders
  filtered.sort((a, b) => {
    const categoryDifference = CATEGORY_ORDER.indexOf(a.categoryKey) - CATEGORY_ORDER.indexOf(b.categoryKey);
    if (categoryDifference) return categoryDifference;
    if (a.categoryKey === "sectoral" && b.categoryKey === "sectoral") {
      return getSectorOrderIndex(a.contest_name) - getSectorOrderIndex(b.contest_name);
    }
    if (a.categoryKey === "district" && b.categoryKey === "district") {
      return getDistrictProvinceOrder(a.contest_name) - getDistrictProvinceOrder(b.contest_name)
        || getDistrictProvince(a.contest_name).localeCompare(getDistrictProvince(b.contest_name))
        || getDistrictOrderIndex(a.contest_name) - getDistrictOrderIndex(b.contest_name)
        || a.contest_name.localeCompare(b.contest_name);
    }
    return 0;
  });

  return filtered;
}

// ==========================================================================
// Subfilter Pills (All, Political Party, Sectoral, District Rep...)
// ==========================================================================
function renderSubfilterPills() {
  if (!subfilterPills) return;
  subfilterPills.replaceChildren();

  const contests = getContestsForActiveCategory();

  // Determine pill options based on active category
  let pillOptions = [{ id: "all", label: "All Groups" }];

  if (currentCategory === "all") {
    pillOptions = [
      { id: "all", label: "All Contests" },
      { id: "party_list", label: "Political Party" },
      { id: "sectoral", label: "Sectoral" },
      { id: "district", label: "District Representative" }
    ];
  } else if (currentCategory === "party_list") {
    pillOptions = [
      { id: "all", label: "All Political Parties" }
    ];
  } else if (currentCategory === "sectoral") {
    // Requested sequence: Settler, Women, Youth, Ulama, Traditional Leaders
    pillOptions = [
      { id: "all", label: "All Sectors" },
      { id: "SETTLER COMMUNITIES", label: "Settler Communities" },
      { id: "WOMEN", label: "Women" },
      { id: "YOUTH", label: "Youth" },
      { id: "ULAMA", label: "Ulama" },
      { id: "TRADITIONAL LEADERS", label: "Traditional Leaders" }
    ];
  } else if (currentCategory === "district") {
    const provinces = new Map();
    contests.forEach((c) => {
      const provName = getDistrictProvince(c.contest_name);
      if (provName) {
        provinces.set(provName, toProperCase(provName));
      }
    });
    pillOptions = [{ id: "all", label: "All Districts" }];
    Array.from(provinces.entries()).sort((a, b) => a[1].localeCompare(b[1])).forEach(([provId, provLabel]) => {
      pillOptions.push({ id: provId, label: provLabel });
    });
  }

  pillOptions.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `subfilter-pill ${currentSubfilter === opt.id ? "active" : ""}`;
    btn.textContent = opt.label;
    btn.onclick = () => {
      currentSubfilter = opt.id;
      $$(".subfilter-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderCurrentView();
    };
    subfilterPills.append(btn);
  });
}

// ==========================================================================
// Main Render Pipeline
// ==========================================================================
function renderCurrentView() {
  let contests = getContestsForActiveCategory();

  // Apply subfilter if not "all"
  if (currentSubfilter !== "all") {
    if (currentCategory === "all" && ["party_list", "sectoral", "district"].includes(currentSubfilter)) {
      contests = contests.filter((c) => c.categoryKey === currentSubfilter);
    } else {
      contests = contests.filter((c) => {
        return c.contest_name.toUpperCase().includes(currentSubfilter.toUpperCase()) ||
               c.friendly_name.toUpperCase().includes(currentSubfilter.toUpperCase());
      });
    }
  }

  // Seat projections always use the full active contest, never a search subset.
  const seatAllocations = new Map(contests.map((contest) => [
    `${contest.categoryKey}|${contest.contest_name}`,
    getSeatAllocation(contest)
  ]));

  // Apply search query across candidate name, party acronym, or contest title
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (query) {
    contests = contests.map((c) => {
      const filteredCandidates = c.candidates.filter((cand) => {
        return cand.name.toLowerCase().includes(query) ||
               c.contest_name.toLowerCase().includes(query) ||
               c.friendly_name.toLowerCase().includes(query);
      });
      return { ...c, candidates: filteredCandidates };
    }).filter((c) => c.candidates.length > 0);
  }

  // Compute Metrics across visible/filtered data
  let totalVotes = 0;
  let allCandidatesFlat = [];

  contests.forEach((c) => {
    c.candidates.forEach((cand) => {
      totalVotes += cand.votes;
      allCandidatesFlat.push({
        ...cand,
        contest_name: c.contest_name,
        friendly_name: c.friendly_name,
        categoryKey: c.categoryKey
      });
    });
  });

  allCandidatesFlat.sort((a, b) => ((b.votes ?? 0) - (a.votes ?? 0)) || ((a.ballot_order || 9999) - (b.ballot_order || 9999)));

  // Update KPI cards
  const processedFiles = snapshot?.processed_files || 0;
  const totalEr = snapshot?.total_er || processedFiles;
  const castVotes = snapshot?.total_cast_votes || 0;
  const registeredVoters = snapshot?.total_registered_voters || 0;
  kpiReturnsVal.textContent = registeredVoters.toLocaleString();
  kpiReturnsSub.textContent = "Across published ERs";
  kpiVotesVal.textContent = castVotes.toLocaleString();
  const turnout = registeredVoters ? ((castVotes / registeredVoters) * 100).toFixed(1) : "0.0";
  const publishedPercent = totalEr ? ((processedFiles / totalEr) * 100).toFixed(1) : "0.0";
  const votesSub = $("#kpi-votes-sub");
  if (votesSub) {
    const txt = `${turnout}% of ${registeredVoters.toLocaleString()} registered voters`;
    votesSub.textContent = txt;
    votesSub.title = txt;
  }
  kpiPartiesVal.textContent = allCandidatesFlat.length.toLocaleString();
  kpiLeaderVal.textContent = `${processedFiles.toLocaleString()} / ${totalEr.toLocaleString()}`;
  kpiLeaderShare.textContent = `${publishedPercent}% of total ERs`;

  // Update Titles according to sequence
  let catLabel = "All Contests";
  if (currentCategory === "party_list") catLabel = "Political Party";
  else if (currentCategory === "sectoral") catLabel = "Sectoral Representatives";
  else if (currentCategory === "district") catLabel = "District Representatives";
  else if (currentCategory === "all") {
    if (currentSubfilter === "party_list") catLabel = "Political Party";
    else if (currentSubfilter === "sectoral") catLabel = "Sectoral Representatives";
    else if (currentSubfilter === "district") catLabel = "District Representatives";
    else catLabel = "All Contests";
  }

  resultTitle.textContent = `${catLabel} Vote Totals`;
  resultMessage.textContent = `${processedFiles.toLocaleString()} returns • Showing ${contests.length} contest${contests.length !== 1 ? "s" : ""} (${allCandidatesFlat.length} candidates)`;

  // Render Separate Standalone Cards or Overall Card
  if (!groupsContainer) return;
  groupsContainer.replaceChildren();

  if (allCandidatesFlat.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "group-card";
    emptyCard.innerHTML = `<div class="empty-row">${query ? "No candidates match your search filter." : "No candidates available for this selection."}</div>`;
    groupsContainer.append(emptyCard);
    return;
  }

  if (isGrouped) {
    // =======================================================================
    // GROUPED MODE: Separate standalone cards with attractive headers
    // (Rule: not connected, separated, attractive group header)
    // =======================================================================
    contests.forEach((contestGroup) => {
      const contestTotal = contestGroup.candidates.reduce((sum, cand) => sum + cand.votes, 0);
      const seatAllocation = seatAllocations.get(`${contestGroup.categoryKey}|${contestGroup.contest_name}`);
      const tagInfo = getContestTag(contestGroup.contest_name, contestGroup.categoryKey);

      let cardCatClass = "group-sectoral";
      let avatarIcon = '<i data-lucide="users"></i>';
      if (contestGroup.categoryKey === "district") {
        cardCatClass = "group-district";
        avatarIcon = '<i data-lucide="map-pin"></i>';
      } else if (contestGroup.categoryKey === "party_list") {
        cardCatClass = "group-party";
        avatarIcon = '<i data-lucide="landmark"></i>';
      }

      const card = document.createElement("article");
      card.className = `group-card ${cardCatClass}`;

      // Attractive Standalone Header Banner
      const header = document.createElement("header");
      header.className = "group-card-header";
      header.innerHTML = `
        <div class="group-header-info">
          <span class="group-avatar-badge">${avatarIcon}</span>
          <div class="group-title-stack">
            <div class="group-badge-line">
              <span class="group-tag ${tagInfo.className}">${tagInfo.text}</span>
            </div>
            <h3 class="group-card-title">${formatContestTitleHtml(contestGroup.friendly_name, contestGroup.categoryKey)}</h3>
          </div>
        </div>
        <div class="group-header-stats">
          <span class="stat-pill"><i data-lucide="user-check"></i> <strong>${contestGroup.candidates.length}</strong> Candidates</span>
          <span class="stat-pill"><i data-lucide="vote"></i> <strong>${contestTotal.toLocaleString()}</strong> Votes</span>
        </div>
      `;

      // Standalone Table
      const tableWrap = document.createElement("div");
      tableWrap.className = "table-wrap";
      const table = document.createElement("table");
      table.className = "results-table";
      table.setAttribute("aria-label", contestGroup.friendly_name);
      table.innerHTML = `
        <thead>
          <tr>
            <th scope="col" class="ballot-col">No.</th>
            <th scope="col" class="rank-col">Rank</th>
            <th scope="col" class="party-col">Candidate</th>
            <th scope="col" class="share-col">Vote Share</th>
            <th scope="col" class="votes-column">Total Votes</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector("tbody");
      contestGroup.candidates.forEach((cand, idx) => {
        const rank = cand.rank || (idx + 1);
        const share = contestTotal > 0 ? ((cand.votes / contestTotal) * 100).toFixed(1) : "0.0";
        const row = createCandidateRow(cand, rank, share, seatAllocation?.get(cand.name) || 0);
        tbody.append(row);
      });

      tableWrap.append(table);
      card.append(header, tableWrap);
      groupsContainer.append(card);
    });
  } else {
    // =======================================================================
    // OVERALL MODE: Single unified card ranked by overall votes
    // =======================================================================
    const card = document.createElement("article");
    card.className = "group-card";

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "results-table";
    table.setAttribute("aria-label", "Overall Results");
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col" class="ballot-col">No.</th>
          <th scope="col" class="rank-col">Rank</th>
          <th scope="col" class="party-col">Candidate</th>
          <th scope="col" class="share-col">Vote Share</th>
          <th scope="col" class="votes-column">Total Votes</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");
    allCandidatesFlat.forEach((cand, idx) => {
      const rank = idx + 1;
      const share = totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : "0.0";
      const seatAllocation = seatAllocations.get(`${cand.categoryKey}|${cand.contest_name}`);
      const row = createCandidateRow(cand, rank, share, seatAllocation?.get(cand.name) || 0);
      tbody.append(row);
    });

    tableWrap.append(table);
    card.append(tableWrap);
    groupsContainer.append(card);
  }

  // Animate progress bars & initialize Lucide icons
  requestAnimationFrame(() => {
    $$(".share-bar-fill").forEach((bar) => {
      bar.style.width = bar.getAttribute("data-width");
    });
    refreshLucideIcons();
  });
}

function appendProvinceCell(row, value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = Number(value || 0).toLocaleString();
  row.append(cell);
}

function renderProvinceMatrix(title, rows, provinces, grouped) {
  const card = document.createElement("article");
  card.className = "group-card group-province";
  const header = document.createElement("header");
  header.className = "group-card-header";
  const heading = document.createElement("h3");
  heading.className = "group-card-title";
  heading.textContent = title;
  header.append(heading);
  card.append(header);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap province-table-wrap";
  const table = document.createElement("table");
  table.className = "results-table province-results-table";
  const thead = document.createElement("thead");
  const headingRow = document.createElement("tr");
  ["Entry", ...provinces, "Total"].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headingRow.append(cell);
  });
  thead.append(headingRow);
  table.append(thead);

  const body = document.createElement("tbody");
  let currentContest = "";
  rows.forEach((entry) => {
    if (grouped && entry.contest_name !== currentContest) {
      currentContest = entry.contest_name;
      const groupRow = document.createElement("tr");
      groupRow.className = "province-group-row";
      const groupCell = document.createElement("td");
      groupCell.colSpan = provinces.length + 2;
      groupCell.textContent = getFriendlyContestName(currentContest, "sectoral");
      groupRow.append(groupCell);
      body.append(groupRow);
    }
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.className = "party-cell";
    name.textContent = entry.name;
    row.append(name);
    provinces.forEach((province) => appendProvinceCell(row, entry.province_votes?.[province]));
    appendProvinceCell(row, entry.total, "vote-total");
    body.append(row);
  });
  table.append(body);
  wrap.append(table);
  card.append(wrap);
  groupsContainer.append(card);
}

function renderProvinceBreakdown() {
  const data = snapshot?.province_breakdown;
  if (!data || !groupsContainer) return;
  const query = searchInput?.value.trim().toLowerCase() || "";
  const matchesQuery = (entry) => entry.name.toLowerCase().includes(query) || entry.contest_name.toLowerCase().includes(query);
  const partyRows = [...(data.party_list || [])].filter(matchesQuery).sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
  const districtRows = [...(data.district || [])].filter(matchesQuery).sort((a, b) => a.contest_name.localeCompare(b.contest_name) || (a.ballot_order || 9999) - (b.ballot_order || 9999));
  const sectoralRows = [...(data.sectoral || [])].filter(matchesQuery).sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
  const provinces = data.provinces || [];

  resultTitle.textContent = "Province Vote Breakdown";
  resultMessage.textContent = "Party-list and sectoral votes by province from published election returns.";
  groupsContainer.replaceChildren();
  renderProvinceMatrix("Political Party", partyRows, provinces, false);
  renderProvinceMatrix("District Representatives", districtRows, provinces, true);
  renderProvinceMatrix("Sectoral Representatives", sectoralRows, provinces, true);
  refreshLucideIcons();
}

function createCandidateRow(cand, rank, share, projectedSeats) {
  const row = document.createElement("tr");
  const ballotOrder = Number(cand.ballot_order);
  const ballotNumber = Number.isInteger(ballotOrder) && ballotOrder < 9999 ? ballotOrder : "-";
  const castVotes = Number(snapshot?.total_cast_votes || 0);
  const registeredVoters = Number(snapshot?.total_registered_voters || 0);
  const turnout = registeredVoters > 0 ? ((castVotes / registeredVoters) * 100).toFixed(1) : "0.0";
  const erContext = `Turnout ${turnout}%`;

  // Only candidates with projected seats receive a winner-colored rank badge.
  let rankClass = "rank-4plus";
  if (projectedSeats > 0) {
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";
    else rankClass = "rank-winner";
  }
  const seatLabel = projectedSeats === 1 ? "1 Projected Seat" : `${projectedSeats} Projected Seats`;

  row.innerHTML = `
    <td class="ballot-col">
      <span class="ballot-tag" title="COMELEC Ballot #${ballotNumber}">${ballotNumber}</span>
    </td>
    <td class="rank-col">
      <span class="rank-badge ${rankClass}" title="Rank ${rank}">${rank}</span>
    </td>
    <td class="party-cell">
      <span class="candidate-name">${cand.name}</span>
      <span class="candidate-subtitle">${erContext}</span>
    </td>
    <td class="share-col">
      <div class="share-cell">
        <div class="share-meta">
          <span>${share}%</span>
        </div>
        <div class="share-bar-track">
          <div class="share-bar-fill" style="width: 0%" data-width="${share}%"></div>
        </div>
      </div>
    </td>
    <td class="votes-column vote-total">
      <strong class="vote-count">${cand.votes.toLocaleString()}</strong>
      <span class="seat-count ${projectedSeats > 0 ? "seat-count-winner" : ""}">${seatLabel}</span>
    </td>
  `;
  return row;
}

// ==========================================================================
// Snapshot Loader
// ==========================================================================
async function loadSnapshot(isManual = false) {
  setSkeletonLoading(true);
  try {
    ({ snapshot } = await loadDashboardSnapshot());

    setSkeletonLoading(false);

    // Modal & Footer metadata
    const generatedAt = snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleString() : "Recent";
    if (footerUpdatedTime) footerUpdatedTime.textContent = `Snapshot: ${generatedAt}`;
    if (modalSource) modalSource.textContent = snapshot.source || "Downloaded COMELEC ER JSON";
    if (modalFiles) modalFiles.textContent = `${(snapshot.processed_files || 0).toLocaleString()} returns`;
    if (modalTimestamp) modalTimestamp.textContent = generatedAt;

    if (isProvinceBreakdown) {
      renderProvinceBreakdown();
    } else {
      renderSubfilterPills();
      renderCurrentView();
    }

    if (isManual) {
      showToast("Election returns updated successfully!", "success");
    }
  } catch (error) {
    setSkeletonLoading(false);
    const msg = error instanceof Error ? error.message : "Unable to retrieve election results.";
    resultMessage.textContent = msg;
    resultsBody.innerHTML = `<tr><td colspan="4" class="empty-row">${msg}</td></tr>`;
    showToast(msg, "error");
  }
}

// ==========================================================================
// Event Listeners
// ==========================================================================

// Category Tabs Click
if (categoryTabs) {
  categoryTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    isProvinceBreakdown = false;
    $("#subfilter-toolbar").hidden = false;
    currentCategory = btn.getAttribute("data-cat");
    currentSubfilter = "all";
    renderSubfilterPills();
    renderCurrentView();
  });
}

// Group Toggle Switch
if (groupToggle) {
  groupToggle.addEventListener("change", (e) => {
    isGrouped = e.target.checked;
    renderCurrentView();
    showToast(isGrouped ? "Grouped by Sector / District with line dividers" : "Showing overall rank across category", "info", 2400);
  });
}

// Search Input (Instant filtering)
if (searchInput) {
  searchInput.addEventListener("input", () => {
    if (isProvinceBreakdown) renderProvinceBreakdown();
    else renderCurrentView();
  });
}

// Refresh Button
if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    await loadSnapshot(true);
    refreshBtn.disabled = false;
  });
}

// Copy Summary Button
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const contests = getContestsForActiveCategory();
    let textSummary = `BARMM Parliamentary Elections 2026 - ${currentCategory.toUpperCase()}\n\n`;

    contests.slice(0, 5).forEach((c) => {
      textSummary += `[${c.friendly_name}]\n`;
      c.candidates.slice(0, 3).forEach((cand, idx) => {
        textSummary += `  ${idx + 1}. ${cand.name}: ${cand.votes.toLocaleString()} votes\n`;
      });
      textSummary += `\n`;
    });

    try {
      await navigator.clipboard.writeText(textSummary);
      showToast("Results summary copied to clipboard!", "success");
    } catch {
      showToast("Unable to copy to clipboard", "error");
    }
  });
}

// Modal dialog controls
function openModal() {
  if (modalBackdrop) {
    modalBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }
}

function closeModal() {
  if (modalBackdrop) {
    modalBackdrop.hidden = true;
    document.body.style.overflow = "";
  }
}

if (modalBtn) modalBtn.addEventListener("click", openModal);
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
}

if (modalSaveBtn) {
  modalSaveBtn.addEventListener("click", async () => {
    await loadSnapshot();
    closeModal();
    showToast(`Snapshot reloaded: ${(snapshot?.processed_files || 0).toLocaleString()} published returns.`, "success");
  });
}

window.showGlobalToast = showToast;

// Initial boot
loadSnapshot();
refreshLucideIcons();
document.addEventListener("DOMContentLoaded", refreshLucideIcons);
