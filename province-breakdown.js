import { loadDashboardSnapshot } from "./supabase-dashboard.js";

// ===========================================================================
// Province Vote Breakdown Controller - Executive Civic Edition
// ==========================================================================

const content = document.querySelector("#province-breakdown-content");
const message = document.querySelector("#breakdown-message");
const searchInput = document.querySelector("#province-search");
const refreshBtn = document.querySelector("#refresh-btn");
const copyBtn = document.querySelector("#copy-summary-btn");
const toastContainer = document.querySelector("#toast-container");

// KPI elements
const kpiProvincesVal = document.querySelector("#kpi-provinces-val");
const kpiVotesVal = document.querySelector("#kpi-votes-val");
const kpiReturnsVal = document.querySelector("#kpi-returns-val");
const kpiContestsVal = document.querySelector("#kpi-contests-val");
const footerUpdatedTime = document.querySelector("#footer-updated-time");

// Modal elements
const modalBtn = document.querySelector("#info-modal-btn");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalCloseBtn = document.querySelector("#modal-close-btn");
const modalCancelBtn = document.querySelector("#modal-cancel-btn");
const modalSaveBtn = document.querySelector("#modal-save-btn");
const modalSource = document.querySelector("#modal-source");
const modalFiles = document.querySelector("#modal-files");
const modalTimestamp = document.querySelector("#modal-timestamp");

let snapshotData = null;
let searchQuery = "";

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
  const sectors = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];
  const found = sectors.find((sector) => contestName.toUpperCase().includes(sector));
  if (found) {
    if (found === "ULAMA") return "Ulama";
    if (found === "WOMEN") return "Women";
    if (found === "YOUTH") return "Youth";
    if (found === "TRADITIONAL LEADERS") return "Traditional Leaders";
    if (found === "SETTLER COMMUNITIES") return "Settler Communities";
  }
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

function formatDistrictTitle(contestName) {
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
      return toProperCase(normalized).replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
    }
  }

  district = district
    .replace(/PARLIAMENTARY DISTRICT/i, "District")
    .replace(/FIRST/i, "1st").replace(/SECOND/i, "2nd").replace(/THIRD/i, "3rd")
    .replace(/FOURTH/i, "4th").replace(/FIFTH/i, "5th").replace(/SIXTH/i, "6th")
    .replace(/SEVENTH/i, "7th").replace(/EIGHTH/i, "8th").replace(/NINTH/i, "9th")
    .replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");

  let formatted = `${province} — ${district}`;
  return formatted.replace(/Tawi\s*—\s*TAWI/g, "Tawi — Tawi");
}

function formatContestTitleHtml(title, categoryKey) {
  if (categoryKey === "district") {
    return title.replace(/—\s*(\d+(?:st|nd|rd|th)\s+District)(.*)$/i, '— <span class="group-title-district">$1</span>$2');
  }
  return title;
}

function makeTableCard(title, categoryKey, rows, provinces, sectorTagText = "") {
  const query = searchQuery.trim().toLowerCase();
  const orderedRows = [...(rows || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
  const filteredRows = query
    ? orderedRows.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.contest_name.toLowerCase().includes(query) ||
          friendlySector(r.contest_name).toLowerCase().includes(query)
      )
    : orderedRows;

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

  const totalVotesInGroup = filteredRows.reduce((sum, r) => sum + (r.total || 0), 0);
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
  const headerRow = document.createElement("tr");

  const entryTh = document.createElement("th");
  entryTh.scope = "col";
  entryTh.className = "party-col sticky-col";
  entryTh.textContent = "Candidate / Party";
  headerRow.append(entryTh);

  provinces.forEach((province) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.className = "province-header-col";
    th.textContent = province;
    headerRow.append(th);
  });

  const totalTh = document.createElement("th");
  totalTh.scope = "col";
  totalTh.className = "votes-column total-col-header";
  totalTh.textContent = "Total Votes";
  headerRow.append(totalTh);

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  filteredRows.forEach((entry, idx) => {
    const row = document.createElement("tr");
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

    provinces.forEach((province) => {
      const cell = document.createElement("td");
      cell.className = "province-num-cell";
      const count = Number(entry.province_votes?.[province] || 0);
      cell.textContent = count.toLocaleString();
      row.append(cell);
    });

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

function renderAllTables() {
  if (!snapshotData || !content) return;
  const breakdown = snapshotData.province_breakdown;
  if (!breakdown?.provinces) {
    message.textContent = "Provincial breakdown data unavailable.";
    return;
  }

  content.replaceChildren();

  // 1. Render Political Party as its own standalone card
  const partyRows = [...(breakdown.party_list || [])].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
  const partyCard = makeTableCard("Political Party Vote Breakdown", "party_list", partyRows, breakdown.provinces);
  content.append(partyCard);

  // 2. Separate Sectoral into standalone cards per sector
  const sectorGroups = {};
  const sectorOrder = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];

  (breakdown.sectoral || []).forEach((row) => {
    const sectorTitle = friendlySector(row.contest_name);
    if (!sectorGroups[sectorTitle]) sectorGroups[sectorTitle] = [];
    sectorGroups[sectorTitle].push(row);
  });

  Object.keys(sectorGroups).forEach((name) => {
    sectorGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
  });

  const renderedSectors = new Set();
  sectorOrder.forEach((sectorKey) => {
    const friendlyName = friendlySector(sectorKey);
    if (sectorGroups[friendlyName]) {
      renderedSectors.add(friendlyName);
      const card = makeTableCard(`${friendlyName} Breakdown`, "sectoral", sectorGroups[friendlyName], breakdown.provinces, friendlyName);
      content.append(card);
    }
  });

  Object.keys(sectorGroups).forEach((name) => {
    if (!renderedSectors.has(name)) {
      const card = makeTableCard(`${name} Breakdown`, "sectoral", sectorGroups[name], breakdown.provinces, name);
      content.append(card);
    }
  });

  // 3. District Representatives, ordered by district number.
  const districtGroups = {};
  (breakdown.district || []).forEach((row) => { (districtGroups[row.contest_name] ||= []).push(row); });
  Object.keys(districtGroups)
    .sort((a, b) => districtOrder(a) - districtOrder(b) || a.localeCompare(b))
    .forEach((name) => {
      const rows = districtGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
      content.append(makeTableCard(`${formatDistrictTitle(name)} Vote Breakdown`, "district", rows, breakdown.provinces, "District Representative"));
    });

  refreshLucideIcons();
}

function setSkeletonLoading(isLoading) {
  if (isLoading) {
    if (kpiProvincesVal) { kpiProvincesVal.classList.add("skeleton"); kpiProvincesVal.textContent = "..."; }
    if (kpiVotesVal) { kpiVotesVal.classList.add("skeleton"); kpiVotesVal.textContent = "..."; }
    if (kpiReturnsVal) { kpiReturnsVal.classList.add("skeleton"); kpiReturnsVal.textContent = "..."; }
    if (kpiContestsVal) { kpiContestsVal.classList.add("skeleton"); kpiContestsVal.textContent = "..."; }

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
            <table class="results-table province-results-table" aria-label="Loading provincial data">
              <thead>
                <tr>
                  <th scope="col" class="party-col sticky-col">Candidate / Party</th>
                  <th scope="col" class="province-header-col">Basilan</th>
                  <th scope="col" class="province-header-col">Lanao del Sur</th>
                  <th scope="col" class="province-header-col">Maguindanao N.</th>
                  <th scope="col" class="province-header-col">Maguindanao S.</th>
                  <th scope="col" class="province-header-col">SGA</th>
                  <th scope="col" class="province-header-col">Tawi-Tawi</th>
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
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 65px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 65px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 65px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 65px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
                <tr class="skeleton-row">
                  <td class="party-cell sticky-col">
                    <div class="party-cell-flex">
                      <span class="skeleton" style="width: 30px; height: 26px; border-radius: 8px; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;"></span>
                      <span class="skeleton" style="width: 130px; height: 16px; border-radius: 4px;"></span>
                    </div>
                  </td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="province-num-cell"><span class="skeleton" style="width: 48px; height: 16px; border-radius: 4px;"></span></td>
                  <td class="votes-column vote-total highlight-total"><span class="skeleton" style="width: 65px; height: 18px; border-radius: 4px;"></span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      `;
    }
  } else {
    if (kpiProvincesVal) kpiProvincesVal.classList.remove("skeleton");
    if (kpiVotesVal) kpiVotesVal.classList.remove("skeleton");
    if (kpiReturnsVal) kpiReturnsVal.classList.remove("skeleton");
    if (kpiContestsVal) kpiContestsVal.classList.remove("skeleton");
  }
}

async function loadData(isManual = false) {
  setSkeletonLoading(true);

  try {
    ({ snapshot: snapshotData } = await loadDashboardSnapshot());
    setSkeletonLoading(false);

    const breakdown = snapshotData.province_breakdown;
    const provinces = breakdown?.provinces || [];

    // Calculate total provincial votes
    let totalProvVotes = 0;
  (breakdown.party_list || []).forEach((r) => (totalProvVotes += r.total || 0));
  (breakdown.district || []).forEach((r) => (totalProvVotes += r.total || 0));
  (breakdown.sectoral || []).forEach((r) => (totalProvVotes += r.total || 0));

    // Populate KPI Cards
    if (kpiProvincesVal) {
      kpiProvincesVal.classList.remove("skeleton");
      kpiProvincesVal.textContent = `${provinces.length} Provinces`;
    }
    if (kpiVotesVal) {
      kpiVotesVal.classList.remove("skeleton");
      kpiVotesVal.textContent = totalProvVotes.toLocaleString();
    }
    if (kpiReturnsVal) {
      kpiReturnsVal.classList.remove("skeleton");
      kpiReturnsVal.textContent = `${(snapshotData.processed_files || 5061).toLocaleString()}`;
    }
    if (kpiContestsVal) {
      kpiContestsVal.classList.remove("skeleton");
      kpiContestsVal.textContent = "6 Categories";
    }

    const genDate = snapshotData.generated_at ? new Date(snapshotData.generated_at).toLocaleString() : "Recent";
    if (footerUpdatedTime) footerUpdatedTime.textContent = `Snapshot: ${genDate}`;
    if (modalSource) modalSource.textContent = snapshotData.source || "Downloaded COMELEC ER JSON";
    if (modalFiles) modalFiles.textContent = `${(snapshotData.processed_files || 0).toLocaleString()} returns`;
    if (modalTimestamp) modalTimestamp.textContent = genDate;

    message.textContent = `${(snapshotData.processed_files || 0).toLocaleString()} election returns tabulated across ${provinces.length} provinces.`;

    renderAllTables();

    if (isManual) {
      showToast("Provincial breakdown reloaded successfully!", "success");
    }
  } catch (error) {
    message.textContent = error.message || "Failed to load provincial data.";
    showToast(message.textContent, "error");
  }
}

// Search Filter Listener
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderAllTables();
  });
}

// Refresh Button Listener
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    refreshBtn.disabled = true;
    loadData(true).finally(() => (refreshBtn.disabled = false));
  });
}

// Copy Summary
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    if (!snapshotData) return;
    const breakdown = snapshotData.province_breakdown;
    let summary = `BARMM Election 2026 - Province Vote Summary\n\n`;
    summary += `Provinces: ${breakdown.provinces.join(", ")}\n\n`;

    summary += `[Top Political Parties]\n`;
    (breakdown.party_list || []).slice(0, 5).forEach((p, idx) => {
      summary += `  ${idx + 1}. ${p.name}: ${p.total.toLocaleString()} total votes\n`;
    });

    try {
      await navigator.clipboard.writeText(summary);
      showToast("Provincial summary copied to clipboard!", "success");
    } catch {
      showToast("Unable to copy to clipboard", "error");
    }
  });
}

// Modal Controls
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
    await loadData();
    closeModal();
    showToast("Snapshot reloaded successfully.", "success");
  });
}

// Initial Boot
loadData();
refreshLucideIcons();
