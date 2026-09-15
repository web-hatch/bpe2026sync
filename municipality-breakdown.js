import { loadDashboardSnapshot, loadLiveBreakdown } from "./supabase-dashboard.js";

// ===========================================================================
// City & Municipality Vote Breakdown Controller - Executive Civic Edition
// ==========================================================================

const content = document.querySelector("#municipality-breakdown-content");
const message = document.querySelector("#breakdown-message");
const provinceSelect = document.querySelector("#province-select");
const searchInput = document.querySelector("#municipality-search");
const refreshBtn = document.querySelector("#refresh-btn");
const copyBtn = document.querySelector("#copy-summary-btn");
const toastContainer = document.querySelector("#toast-container");

// KPI elements
const kpiProvinceVal = document.querySelector("#kpi-province-val");
const kpiMunisVal = document.querySelector("#kpi-munis-val");
const kpiVotesVal = document.querySelector("#kpi-votes-val");
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

let breakdownData = null;
let breakdownFiles = {};
let searchQuery = "";
let usingSupabase = false;

function applyLiveMunicipalityBreakdown(province, data) {
  const toCategory = (categoryKey) => ({
    province,
    municipalities: data.columns || [],
    entries: (data.rows || [])
      .filter((row) => row.category_key === categoryKey)
      .map((row) => ({
        name: row.name,
        contest_name: row.contest_name,
        ballot_order: row.ballot_order,
        municipality_votes: row.votes,
        total: row.total,
      })),
  });
  breakdownData = {
    party_list: [toCategory("party_list")],
    sectoral: [toCategory("sectoral")],
    district: [toCategory("district")],
  };
}

function refreshLucideIcons() {
  if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function firstLiveProvince(snapshot, provinces) {
  const breakdown = snapshot?.province_breakdown || {};
  return provinces.find((province) =>
    ["party_list", "district", "sectoral"].some((category) =>
      (breakdown[category] || []).some((row) => Number(row.province_votes?.[province]) > 0)
    )
  ) || provinces[0];
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

function makeTableCard(title, categoryKey, rows, municipalities, sectorTagText) {
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
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");

  const entryTh = document.createElement("th");
  entryTh.scope = "col";
  entryTh.className = "party-col sticky-col";
  entryTh.textContent = "Candidate / Party";
  headRow.append(entryTh);

  municipalities.forEach((muni) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.className = "province-header-col";
    th.textContent = muni;
    headRow.append(th);
  });

  const totalTh = document.createElement("th");
  totalTh.scope = "col";
  totalTh.className = "votes-column total-col-header";
  totalTh.textContent = "Total Votes";
  headRow.append(totalTh);

  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
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

    municipalities.forEach((municipality) => {
      const cell = document.createElement("td");
      cell.className = "province-num-cell";
      const count = Number(entry.municipality_votes?.[municipality] || 0);
      cell.textContent = count.toLocaleString();
      row.append(cell);
    });

    const totalCell = document.createElement("td");
    totalCell.className = "votes-column vote-total highlight-total";
    totalCell.textContent = Number(entry.total || 0).toLocaleString();
    row.append(totalCell);

    body.append(row);
  });

  table.append(body);
  wrap.append(table);
  card.append(wrap);
  return card;
}

function renderActiveProvince() {
  if (!breakdownData || !content) return;
  const province = provinceSelect.value;
  const party = (breakdownData.party_list || []).find((item) => item.province === province);
  const sectoral = (breakdownData.sectoral || []).find((item) => item.province === province);
  const district = (breakdownData.district || []).find((item) => item.province === province);

  const munis = party?.municipalities || sectoral?.municipalities || district?.municipalities || [];
  const muniCount = munis.length;

  // Calculate total votes in this province
  let provTotalVotes = 0;
  (party?.entries || []).forEach((e) => (provTotalVotes += e.total || 0));
  (sectoral?.entries || []).forEach((e) => (provTotalVotes += e.total || 0));
  (district?.entries || []).forEach((e) => (provTotalVotes += e.total || 0));

  // Update KPI Cards
  const provUpper = province.toUpperCase();
  if (kpiProvinceVal) {
    kpiProvinceVal.classList.remove("skeleton");
    kpiProvinceVal.textContent = provUpper;
  }
  if (kpiMunisVal) {
    kpiMunisVal.classList.remove("skeleton");
    kpiMunisVal.textContent = `${muniCount} LGUs`;
  }
  if (kpiVotesVal) {
    kpiVotesVal.classList.remove("skeleton");
    kpiVotesVal.textContent = provTotalVotes.toLocaleString();
  }
  if (kpiContestsVal) {
    kpiContestsVal.classList.remove("skeleton");
    kpiContestsVal.textContent = "6 Categories";
  }

  content.replaceChildren();

  // 1. Political Party as its own standalone card
  const partyRows = [...(party?.entries || [])].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
  const partyCard = makeTableCard("Political Party Vote Breakdown", "party_list", partyRows, munis);
  content.append(partyCard);

  // 2. Separate Sectoral into standalone cards per sector
  const sectorGroups = {};
  const sectorOrder = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];

  (sectoral?.entries || []).forEach((row) => {
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
      const card = makeTableCard(`${friendlyName} Breakdown`, "sectoral", sectorGroups[friendlyName], munis, friendlyName);
      content.append(card);
    }
  });

  Object.keys(sectorGroups).forEach((name) => {
    if (!renderedSectors.has(name)) {
      const card = makeTableCard(`${name} Breakdown`, "sectoral", sectorGroups[name], munis, name);
      content.append(card);
    }
  });

  // 3. District Representatives, ordered by district number.
  const districtGroups = {};
  (district?.entries || []).forEach((row) => { (districtGroups[row.contest_name] ||= []).push(row); });
  Object.keys(districtGroups).sort((a, b) => districtOrder(a) - districtOrder(b) || a.localeCompare(b)).forEach((name) => {
    const rows = districtGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
    content.append(makeTableCard(formatDistrictTitle(name, "Vote Breakdown"), "district", rows, munis, "District Representative"));
  });

  message.textContent = `${muniCount} cities and municipalities tabulated in ${provUpper}.`;
  refreshLucideIcons();
}

function setSkeletonLoading(isLoading) {
  if (isLoading) {
    if (kpiProvinceVal) { kpiProvinceVal.classList.add("skeleton"); kpiProvinceVal.textContent = "..."; }
    if (kpiMunisVal) { kpiMunisVal.classList.add("skeleton"); kpiMunisVal.textContent = "..."; }
    if (kpiVotesVal) { kpiVotesVal.classList.add("skeleton"); kpiVotesVal.textContent = "..."; }
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
            <table class="results-table province-results-table" aria-label="Loading municipal data">
              <thead>
                <tr>
                  <th scope="col" class="party-col sticky-col">Candidate / Party</th>
                  <th scope="col" class="province-header-col">Municipality 1</th>
                  <th scope="col" class="province-header-col">Municipality 2</th>
                  <th scope="col" class="province-header-col">Municipality 3</th>
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
    if (kpiProvinceVal) kpiProvinceVal.classList.remove("skeleton");
    if (kpiMunisVal) kpiMunisVal.classList.remove("skeleton");
    if (kpiVotesVal) kpiVotesVal.classList.remove("skeleton");
    if (kpiContestsVal) kpiContestsVal.classList.remove("skeleton");
  }
}

async function loadData(isManual = false) {
  setSkeletonLoading(true);

  try {
    const loaded = await loadDashboardSnapshot();
    const fullSnapshot = loaded.snapshot;
    usingSupabase = loaded.source === "supabase";
    breakdownFiles = fullSnapshot.breakdown_files || {};
    const provinces = usingSupabase ? fullSnapshot.province_breakdown?.provinces || [] : Object.keys(breakdownFiles);
    if (!provinces.length) throw new Error("Municipality breakdown files not generated.");

    // Populate province options
    const currentVal = provinceSelect.value;
    provinceSelect.innerHTML = "";
    provinces.forEach((province) => {
      const option = document.createElement("option");
      option.value = province;
      option.textContent = province.toUpperCase();
      provinceSelect.append(option);
    });

    if (currentVal && [...provinceSelect.options].some((o) => o.value === currentVal)) {
      provinceSelect.value = currentVal;
    } else if (usingSupabase) {
      provinceSelect.value = firstLiveProvince(fullSnapshot, provinces);
    }

    const genDate = fullSnapshot.generated_at ? new Date(fullSnapshot.generated_at).toLocaleString() : "Recent";
    if (footerUpdatedTime) footerUpdatedTime.textContent = `Snapshot: ${genDate}`;
    if (modalSource) modalSource.textContent = fullSnapshot.source || "Downloaded COMELEC ER JSON";
    if (modalFiles) modalFiles.textContent = `${(fullSnapshot.processed_files || 0).toLocaleString()} returns`;
    if (modalTimestamp) modalTimestamp.textContent = genDate;

    await loadSelectedProvince();

    if (isManual) {
      showToast("City & municipality breakdown reloaded successfully!", "success");
    }
  } catch (error) {
    setSkeletonLoading(false);
    message.textContent = error.message || "Failed to load municipal data.";
    showToast(message.textContent, "error");
  }
}

async function loadSelectedProvince() {
  setSkeletonLoading(true);
  try {
    if (usingSupabase) {
      const province = provinceSelect.value;
      applyLiveMunicipalityBreakdown(province, await loadLiveBreakdown({ level: "municipality", province }));
      setSkeletonLoading(false);
      renderActiveProvince();
      return;
    }
    const response = await fetch(`./${breakdownFiles[provinceSelect.value]}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the selected province breakdown.");
    breakdownData = (await response.json()).municipality_breakdown;
    setSkeletonLoading(false);
    renderActiveProvince();
  } catch (err) {
    setSkeletonLoading(false);
    throw err;
  }
}

// Province Switcher Listener
if (provinceSelect) {
  provinceSelect.addEventListener("change", async () => {
    await loadSelectedProvince();
    showToast(`Switched to ${provinceSelect.value}`, "info");
  });
}

// Search Filter Listener
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderActiveProvince();
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
    if (!breakdownData) return;
    const province = provinceSelect.value;
    const party = (breakdownData.party_list || []).find((item) => item.province === province);

    let summary = `BARMM Election 2026 - ${province} Municipal Vote Summary\n\n`;
    summary += `Municipalities: ${(party?.municipalities || []).join(", ")}\n\n`;
    summary += `[Top Political Parties]\n`;
    (party?.entries || []).slice(0, 5).forEach((p, idx) => {
      summary += `  ${idx + 1}. ${p.name}: ${p.total.toLocaleString()} votes\n`;
    });

    try {
      await navigator.clipboard.writeText(summary);
      showToast("Municipal summary copied to clipboard!", "success");
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
