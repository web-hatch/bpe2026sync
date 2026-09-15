import { loadDashboardSnapshot, loadLiveBreakdown } from "./supabase-dashboard.js";

// ===========================================================================
// Election Return Breakdown Controller - Executive Civic Edition
// ==========================================================================

const content = document.querySelector("#election-return-content");
const message = document.querySelector("#breakdown-message");
const provinceSelect = document.querySelector("#province-select");
const municipalitySelect = document.querySelector("#municipality-select");
const searchInput = document.querySelector("#er-search");
const refreshBtn = document.querySelector("#refresh-btn");
const copyBtn = document.querySelector("#copy-summary-btn");
const toastContainer = document.querySelector("#toast-container");

// KPI Elements
const kpiTerritoryVal = document.querySelector("#kpi-territory-val");
const kpiTerritorySub = document.querySelector("#kpi-territory-sub");
const kpiBarangayVal = document.querySelector("#kpi-barangay-val");
const kpiBarangaySub = document.querySelector("#kpi-barangay-sub");
const kpiPrecinctsVal = document.querySelector("#kpi-precincts-val");
const kpiPrecinctsSub = document.querySelector("#kpi-precincts-sub");
const kpiVotesVal = document.querySelector("#kpi-votes-val");
const kpiVotesSub = document.querySelector("#kpi-votes-sub");
const footerUpdatedTime = document.querySelector("#footer-updated-time");

// Modal Elements
const modalBtn = document.querySelector("#info-modal-btn");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalCloseBtn = document.querySelector("#modal-close-btn");
const modalCancelBtn = document.querySelector("#modal-cancel-btn");
const modalSaveBtn = document.querySelector("#modal-save-btn");
const modalSource = document.querySelector("#modal-source");
const modalFiles = document.querySelector("#modal-files");
const modalTimestamp = document.querySelector("#modal-timestamp");

let breakdown = [];
let breakdownFiles = {};
let fullSnapshot = null;
let searchQuery = "";
let usingSupabase = false;
let liveProvince = "";
let liveMunicipalities = [];
function applyLiveElectionReturnBreakdown(province, municipality, returns) {
  const toBarangay = ({ barangay, data }) => {
    const categoryRows = (categoryKey) =>
    (data.rows || [])
      .filter((row) => row.category_key === categoryKey)
      .map((row) => ({
        name: row.name,
        contest_name: row.contest_name,
        ballot_order: row.ballot_order,
        precinct_votes: row.votes,
        total: row.total,
      }));

    return {
      barangay,
      precincts: data.columns || [],
      party_list: categoryRows("party_list"),
      sectoral: categoryRows("sectoral"),
      district: categoryRows("district"),
    };
  };

  breakdown = [{
    province,
    municipalities: [{
      municipality,
      barangays: returns.map(toBarangay),
    }],
  }];
}

function firstLiveProvince(snapshot, provinces) {
  const breakdown = snapshot?.province_breakdown || {};
  return provinces.find((province) =>
    ["party_list", "district", "sectoral"].some((category) =>
      (breakdown[category] || []).some((row) => Number(row.province_votes?.[province]) > 0)
    )
  ) || provinces[0];
}

function refreshLucideIcons() {
  if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// Global Centralized Toast
function showToast(msg, type = "info", duration = 3200) {
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

  toast.innerHTML = `${iconHtml}<span>${msg}</span>`;
  toastContainer.appendChild(toast);
  refreshLucideIcons();

  requestAnimationFrame(() => toast.classList.add("show"));
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
window.showGlobalToast = showToast;

function friendlySector(contestName) {
  if (!contestName) return "Sectoral";
  const upper = contestName.toUpperCase();
  if (upper.includes("SETTLER")) return "Settler Communities";
  if (upper.includes("WOMEN")) return "Women";
  if (upper.includes("YOUTH")) return "Youth";
  if (upper.includes("ULAMA")) return "Ulama";
  if (upper.includes("TRADITIONAL LEADERS")) return "Traditional Leaders";
  return contestName;
}

function districtOrder(contestName) {
  const words = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10 };
  const match = contestName.toUpperCase().match(/(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|\d+)\s+(?:PARLIAMENTARY\s+)?DISTRICT/);
  return match ? (words[match[1]] || Number(match[1])) : 999;
}

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

function formatDistrictTitle(contestName, suffix = "") {
  let normalized = contestName.replace(/TAWI\s*[-—]\s*TAWI/gi, "Tawi — Tawi");
  normalized = normalized.replace(/^.*?BARMM\s*-\s*/i, "");
  const parts = normalized.split(/\s+-\s+/);
  let province = "";
  let district = "";
  if (parts.length >= 2) {
    province = toProperCase(parts[0].trim());
    district = parts.slice(1).join(" — ").trim();
  } else {
    const match = normalized.match(/([^-]+)\s*-\s*([^\n]+)/);
    if (match) {
      province = toProperCase(match[1].trim());
      district = match[2].trim();
    } else {
      return (toProperCase(normalized) + (suffix ? ` ${suffix}` : "")).replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
    }
  }

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

  const end = suffix ? ` ${suffix}` : "";
  let formatted = `${province} — ${district}${end}`;
  return formatted.replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
}

function formatContestTitleHtml(title, categoryKey) {
  if (categoryKey === "district") {
    return title.replace(/—\s*(\d+(?:st|nd|rd|th)\s+District)(.*)$/i, '— <span class="group-title-district">$1</span>$2');
  }
  return title;
}

function parsePrecinctVotes(pv) {
  if (!pv) return {};
  if (typeof pv === "object") return pv;
  if (typeof pv === "string") {
    const clean = pv.replace(/^@\{|\}$/g, "").trim();
    if (!clean) return {};
    const result = {};
    clean.split(";").forEach((pair) => {
      const parts = pair.split("=");
      if (parts.length === 2) {
        result[parts[0].trim()] = Number(parts[1].trim()) || 0;
      }
    });
    return result;
  }
  return {};
}

function getActiveMunicipality() {
  const prov = breakdown.find((item) => item.province === provinceSelect.value);
  return prov?.municipalities?.find((m) => m.municipality === municipalitySelect.value);
}

// Builds standalone .group-card for each category/sector with ballot-number badges.
function makeTableCard(title, categoryKey, rows, barangays, sectorTagText) {
  const query = searchQuery.trim().toLowerCase();
  const filteredRows = query
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (r.contest_name && r.contest_name.toLowerCase().includes(query)) ||
          friendlySector(r.contest_name).toLowerCase().includes(query)
      )
    : rows;

  if (filteredRows.length === 0) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "group-card";
    emptyCard.innerHTML = `
      <header class="group-card-header">
        <h3 class="group-card-title">${title}</h3>
      </header>
      <div class="empty-row">No entries match "${searchQuery}".</div>
    `;
    return emptyCard;
  }

  const totalVotesInGroup = filteredRows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const cardCatClass = categoryKey === "party_list" ? "group-party" : categoryKey === "district" ? "group-district" : "group-sectoral";
  const avatarIcon = categoryKey === "party_list" ? '<i data-lucide="landmark"></i>' : categoryKey === "district" ? '<i data-lucide="map-pin"></i>' : '<i data-lucide="users"></i>';
  const tagText = categoryKey === "party_list" ? "POLITICAL PARTY" : categoryKey === "district" ? "DISTRICT REPRESENTATIVE" : (sectorTagText ? sectorTagText.toUpperCase() : "SECTORAL");
  const tagClass = categoryKey === "party_list" ? "party-tag" : categoryKey === "district" ? "district-tag" : "sector-tag";

  const card = document.createElement("article");
  card.className = `group-card ${cardCatClass}`;
  card.innerHTML = `
    <header class="group-card-header">
      <div class="group-header-info">
        <span class="group-avatar-badge">${avatarIcon}</span>
        <div class="group-title-stack">
          <div class="group-badge-line">
            <span class="group-tag ${tagClass}">${tagText}</span>
          </div>
          <h3 class="group-card-title">${formatContestTitleHtml(title, categoryKey)}</h3>
        </div>
      </div>
      <div class="group-header-stats">
        <span class="stat-pill"><i data-lucide="user-check"></i> <strong>${filteredRows.length}</strong> Candidates</span>
        <span class="stat-pill"><i data-lucide="vote"></i> <strong>${totalVotesInGroup.toLocaleString()}</strong> Votes</span>
      </div>
    </header>
  `;

  const wrap = document.createElement("div");
  wrap.className = "table-wrap province-table-wrap";
  const table = document.createElement("table");
  table.className = "results-table province-results-table";
  const thead = document.createElement("thead");

  const barangayHeader = document.createElement("tr");
  const precinctHeader = document.createElement("tr");

  // Candidate / Party sticky column spanning 2 header rows
  const entryHeader = document.createElement("th");
  entryHeader.scope = "col";
  entryHeader.className = "party-col sticky-col";
  entryHeader.textContent = "Candidate / Party";
  entryHeader.rowSpan = 2;
  barangayHeader.append(entryHeader);

  // Barangay column headers and sub-precinct headers
  barangays.forEach((barangay, bIdx) => {
    const isEven = bIdx % 2 === 0;
    const bGroupClass = isEven ? "er-group-even" : "er-group-odd";

    const bCell = document.createElement("th");
    bCell.scope = "col";
    bCell.className = `er-barangay-th ${bGroupClass}`;
    bCell.colSpan = barangay.precincts.length;
    bCell.innerHTML = `
      <div class="er-barangay-container">
        <div class="er-barangay-header-inner">
          <span class="er-barangay-name">${barangay.barangay}</span>
          ${barangay.precincts.length > 1 ? `<span class="er-precinct-count-pill">${barangay.precincts.length} precincts</span>` : ''}
        </div>
      </div>
    `;
    barangayHeader.append(bCell);

    barangay.precincts.forEach((precinct, pIdx) => {
      const pCell = document.createElement("th");
      pCell.scope = "col";
      const isFirst = pIdx === 0;
      const isLast = pIdx === barangay.precincts.length - 1;
      pCell.className = `er-precinct-th ${bGroupClass} ${isFirst ? "er-group-start" : ""} ${isLast ? "er-group-end" : ""}`;
      pCell.innerHTML = `<span class="er-precinct-code">${precinct}</span>`;
      precinctHeader.append(pCell);
    });
  });

  // Total Votes column spanning 2 header rows
  const totalHeader = document.createElement("th");
  totalHeader.scope = "col";
  totalHeader.className = "votes-column total-col-header";
  totalHeader.textContent = "Total Votes";
  totalHeader.rowSpan = 2;
  barangayHeader.append(totalHeader);

  thead.append(barangayHeader, precinctHeader);
  table.append(thead);

  const tbody = document.createElement("tbody");
  filteredRows.forEach((entry, idx) => {
    const row = document.createElement("tr");

    // Candidate Name cell with Rank Badge
    const nameCell = document.createElement("td");
    nameCell.className = "party-cell sticky-col";

    const rank = idx + 1;
    const ballotOrder = Number(entry.ballot_order);
    const ballotNumber = Number.isInteger(ballotOrder) && ballotOrder < 9999 ? ballotOrder : "-";
    let rankClass = "rank-4plus";
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";

    nameCell.innerHTML = `
      <div class="party-cell-flex">
        <span class="ballot-tag" title="COMELEC Ballot #${ballotNumber}">${ballotNumber}</span>
        <span class="rank-badge ${rankClass}" title="Rank ${rank}">${rank}</span>
        <span class="candidate-name">${entry.name}</span>
      </div>
    `;
    row.append(nameCell);

    // Precinct Vote cells
    barangays.forEach((barangay, bIdx) => {
      const isEven = bIdx % 2 === 0;
      const bGroupClass = isEven ? "er-group-even" : "er-group-odd";
      const parsedMap = entry.barangay_votes?.[barangay.barangay] || {};
      barangay.precincts.forEach((precinct, pIdx) => {
        const cell = document.createElement("td");
        const isFirst = pIdx === 0;
        const isLast = pIdx === barangay.precincts.length - 1;
        cell.className = `province-num-cell er-precinct-cell ${bGroupClass} ${isFirst ? "er-group-start" : ""} ${isLast ? "er-group-end" : ""}`;
        const count = Number(parsedMap[precinct] || 0);
        cell.textContent = count.toLocaleString();
        row.append(cell);
      });
    });

    // Total Votes cell
    const totalCell = document.createElement("td");
    totalCell.className = "votes-column vote-total highlight-total";
    totalCell.textContent = Number(entry.total || 0).toLocaleString();
    row.append(totalCell);

    tbody.append(row);
  });

  table.append(tbody);
  wrap.append(table);
  card.append(wrap);
  return card;
}

function combinedRows(barangays, category) {
  const rows = new Map();
  barangays.forEach((barangay) => {
    (barangay[category] || []).forEach((entry) => {
      const key = `${entry.contest_name}|${entry.ballot_order}|${entry.name}`;
      if (!rows.has(key)) {
        rows.set(key, { ...entry, barangay_votes: {}, total: 0 });
      }
      const row = rows.get(key);
      row.barangay_votes[barangay.barangay] = parsePrecinctVotes(entry.precinct_votes);
      row.total += Number(entry.total || 0);
    });
  });
  return [...rows.values()].sort((a, b) => a.contest_name.localeCompare(b.contest_name) || (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
}

function render() {
  const activeMuni = getActiveMunicipality();
  if (!activeMuni || !content) return;

  const activeBarangays = activeMuni.barangays || [];
  const displayBarangayName = `All ${activeBarangays.length} Barangays`;

  const precinctCount = activeBarangays.reduce((sum, b) => sum + b.precincts.length, 0);

  // 1. Process Political Party rows
  const partyRows = combinedRows(activeBarangays, "party_list");

  // 2. Process Sectoral rows
  const sectoralRows = combinedRows(activeBarangays, "sectoral");
  const districtRows = combinedRows(activeBarangays, "district");

  const totalPartyVotes = partyRows.reduce((sum, r) => sum + r.total, 0);
  const totalSectoralVotes = sectoralRows.reduce((sum, r) => sum + r.total, 0);
  const totalDistrictVotes = districtRows.reduce((sum, r) => sum + r.total, 0);
  const totalVotes = totalPartyVotes + totalSectoralVotes + totalDistrictVotes;

  // Update KPI Cards
  const provUpper = provinceSelect.value.toUpperCase();
  if (kpiTerritoryVal) {
    kpiTerritoryVal.classList.remove("skeleton");
    kpiTerritoryVal.textContent = `${provUpper}, ${activeMuni.municipality}`;
  }
  if (kpiBarangayVal) {
    kpiBarangayVal.classList.remove("skeleton");
    kpiBarangayVal.textContent = displayBarangayName;
  }
  if (kpiPrecinctsVal) {
    kpiPrecinctsVal.classList.remove("skeleton");
    kpiPrecinctsVal.textContent = `${precinctCount.toLocaleString()} Precincts`;
  }
  if (kpiVotesVal) {
    kpiVotesVal.classList.remove("skeleton");
    kpiVotesVal.textContent = `${totalVotes.toLocaleString()} Votes`;
  }

  content.replaceChildren();

  // Standalone Political Party card
  const partyCard = makeTableCard("Political Party Vote Breakdown", "party_list", partyRows, activeBarangays);
  content.append(partyCard);

  // Standalone cards for each sector
  const sectorGroups = {};
  const sectorOrder = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];

  sectoralRows.forEach((row) => {
    const sectorTitle = friendlySector(row.contest_name);
    if (!sectorGroups[sectorTitle]) sectorGroups[sectorTitle] = [];
    sectorGroups[sectorTitle].push(row);
  });

  Object.keys(sectorGroups).forEach((name) => {
    sectorGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
  });

  const renderedSectors = new Set();
  sectorOrder.forEach((sectorKey) => {
    const friendlyName = friendlySector(sectorKey);
    if (sectorGroups[friendlyName]) {
      renderedSectors.add(friendlyName);
      const card = makeTableCard(`${friendlyName} Breakdown`, "sectoral", sectorGroups[friendlyName], activeBarangays, friendlyName);
      content.append(card);
    }
  });

  Object.keys(sectorGroups).forEach((name) => {
    if (!renderedSectors.has(name)) {
      const card = makeTableCard(`${name} Breakdown`, "sectoral", sectorGroups[name], activeBarangays, name);
      content.append(card);
    }
  });

  // District Representatives
  const districtGroups = {};
  districtRows.forEach((row) => { (districtGroups[row.contest_name] ||= []).push(row); });
  Object.keys(districtGroups).sort((a, b) => districtOrder(a) - districtOrder(b) || a.localeCompare(b)).forEach((name) => {
    const rows = districtGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
    content.append(makeTableCard(formatDistrictTitle(name, "Vote Breakdown"), "district", rows, activeBarangays, "District Representative"));
  });

  message.textContent = `${displayBarangayName} • ${precinctCount} clustered precinct election returns tabulated in ${activeMuni.municipality}, ${provUpper}.`;
  refreshLucideIcons();
}

function updateMunicipalities() {
  const prov = breakdown.find((item) => item.province === provinceSelect.value);
  const currentVal = municipalitySelect.value;
  municipalitySelect.replaceChildren();

  const municipalities = usingSupabase
    ? liveMunicipalities.map((municipality) => ({ municipality }))
    : prov?.municipalities || [];
  municipalities.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.municipality;
    opt.textContent = m.municipality;
    municipalitySelect.append(opt);
  });

  if (currentVal && Array.from(municipalitySelect.options).some((o) => o.value === currentVal)) {
    municipalitySelect.value = currentVal;
  }

  if (!usingSupabase) render();
}

function setSkeletonLoading(isLoading) {
  if (isLoading) {
    if (kpiTerritoryVal) { kpiTerritoryVal.classList.add("skeleton"); kpiTerritoryVal.textContent = "..."; }
    if (kpiBarangayVal) { kpiBarangayVal.classList.add("skeleton"); kpiBarangayVal.textContent = "..."; }
    if (kpiPrecinctsVal) { kpiPrecinctsVal.classList.add("skeleton"); kpiPrecinctsVal.textContent = "..."; }
    if (kpiVotesVal) { kpiVotesVal.classList.add("skeleton"); kpiVotesVal.textContent = "..."; }

    if (content) {
      content.innerHTML = `
        <article class="group-card group-party">
          <header class="group-card-header">
            <div class="group-header-info">
              <span class="group-avatar-badge skeleton"></span>
              <div class="group-title-stack" style="width: 220px;">
                <div class="skeleton skeleton-text" style="width: 80px; height: 16px; border-radius: 999px;"></div>
                <div class="skeleton skeleton-text" style="width: 200px; height: 22px; margin-top: 4px; border-radius: 4px;"></div>
              </div>
            </div>
            <div class="group-header-stats">
              <span class="stat-pill skeleton" style="width: 100px; height: 28px;"></span>
              <span class="stat-pill skeleton" style="width: 115px; height: 28px;"></span>
            </div>
          </header>
          <div class="table-wrap province-table-wrap">
            <table class="results-table province-results-table" aria-label="Loading election return data">
              <thead>
                <tr>
                  <th scope="col" class="party-col sticky-col">Candidate / Party</th>
                  <th scope="col" class="province-header-col">Barangay 1</th>
                  <th scope="col" class="province-header-col">Barangay 2</th>
                  <th scope="col" class="province-header-col">Barangay 3</th>
                  <th scope="col" class="votes-column total-col-header">Total Votes</th>
                </tr>
              </thead>
              <tbody>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 70px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 70px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 70px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 70px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 50px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 70px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      `;
    }
  } else {
    if (kpiTerritoryVal) kpiTerritoryVal.classList.remove("skeleton");
    if (kpiBarangayVal) kpiBarangayVal.classList.remove("skeleton");
    if (kpiPrecinctsVal) kpiPrecinctsVal.classList.remove("skeleton");
    if (kpiVotesVal) kpiVotesVal.classList.remove("skeleton");
  }
}

async function loadSelectedProvince() {
  setSkeletonLoading(true);
  try {
    if (usingSupabase) {
      const province = provinceSelect.value;
      if (liveProvince !== province) {
        const data = await loadLiveBreakdown({ level: "municipality", province });
        liveProvince = province;
        liveMunicipalities = data.columns || [];
        updateMunicipalities();
      }
      await loadLiveMunicipality();
      return;
    }
    const response = await fetch(`./${breakdownFiles[provinceSelect.value]}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the selected province breakdown.");
    breakdown = (await response.json()).election_return_breakdown || [];
    updateMunicipalities();
  } catch (err) {
    setSkeletonLoading(false);
    throw err;
  }
}

async function loadLiveMunicipality() {
  const province = provinceSelect.value;
  const municipality = municipalitySelect.value;
  if (!municipality) return;
  const data = await loadLiveBreakdown({ level: "barangay", province, municipality });
  const returns = await Promise.all(
    (data.columns || []).map(async (barangay) => ({
      barangay,
      data: await loadLiveBreakdown({ level: "precinct", province, municipality, barangay }),
    })),
  );
  applyLiveElectionReturnBreakdown(province, municipality, returns);
  render();
}

async function loadData(isManual = false) {
  if (refreshBtn) refreshBtn.disabled = true;
  setSkeletonLoading(true);

  try {
    const loaded = await loadDashboardSnapshot();
    fullSnapshot = loaded.snapshot;
    usingSupabase = loaded.source === "supabase";
    breakdownFiles = fullSnapshot.breakdown_files || {};
    const provinces = usingSupabase ? fullSnapshot.province_breakdown?.provinces || [] : Object.keys(breakdownFiles);
    if (!provinces.length) throw new Error("Election return breakdown files not generated.");

    // Populate province options in UPPERCASE
    const currentProv = provinceSelect.value;
    provinceSelect.replaceChildren();
    provinces.forEach((province) => {
      const opt = document.createElement("option");
      opt.value = province;
      opt.textContent = province.toUpperCase();
      provinceSelect.append(opt);
    });

    if (currentProv && Array.from(provinceSelect.options).some((o) => o.value === currentProv)) {
      provinceSelect.value = currentProv;
    } else if (usingSupabase) {
      provinceSelect.value = firstLiveProvince(fullSnapshot, provinces);
    }

    // Modal data
    if (modalTimestamp && fullSnapshot.generated_at) {
      const dateStr = new Date(fullSnapshot.generated_at).toLocaleString();
      modalTimestamp.textContent = dateStr;
      if (footerUpdatedTime) footerUpdatedTime.textContent = `Snapshot: ${dateStr}`;
    }
    if (modalFiles) {
      modalFiles.textContent = `${Number(fullSnapshot.processed_files || 0).toLocaleString()} returns`;
    }

    await loadSelectedProvince();

    if (isManual) {
      showToast("Election returns snapshot reloaded successfully.", "success");
    }
  } catch (error) {
    setSkeletonLoading(false);
    message.textContent = error.message || "Unable to load election returns.";
    showToast(error.message || "Failed to load snapshot.", "error");
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// Event Listeners
provinceSelect?.addEventListener("change", () => {
  loadSelectedProvince().catch((error) => { message.textContent = error.message; });
  showToast(`Province set to ${provinceSelect.value.toUpperCase()}.`, "info");
});

municipalitySelect?.addEventListener("change", () => {
  if (usingSupabase) loadLiveMunicipality().catch((error) => { message.textContent = error.message; });
  else render();
  showToast(`Municipality set to ${municipalitySelect.value}.`, "info");
});

searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});

refreshBtn?.addEventListener("click", () => {
  loadData(true);
});

copyBtn?.addEventListener("click", () => {
  const activeMuni = getActiveMunicipality();
  const prov = provinceSelect.value.toUpperCase();
  const muni = activeMuni?.municipality || "";
  const barangayCount = activeMuni?.barangays?.length || 0;

  const summary = `BARMM 2026 Election Returns Breakdown\nProvince: ${prov}\nMunicipality: ${muni}\nBarangays: All ${barangayCount}\nGenerated from official COMELEC JSON returns snapshot.`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(summary).then(() => {
      showToast("Election return summary copied to clipboard!", "success");
    });
  } else {
    showToast("Summary copied to clipboard!", "success");
  }
});

// Modal Setup
function openModal() {
  if (modalBackdrop) modalBackdrop.hidden = false;
}
function closeModal() {
  if (modalBackdrop) modalBackdrop.hidden = true;
}

modalBtn?.addEventListener("click", openModal);
modalCloseBtn?.addEventListener("click", closeModal);
modalCancelBtn?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

modalSaveBtn?.addEventListener("click", async () => {
  await loadData();
  closeModal();
  showToast("Snapshot reloaded successfully.", "success");
});

// Initialize on page load
loadData();
