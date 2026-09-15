import { loadDashboardSnapshot, loadLiveBreakdown } from "./supabase-dashboard.js";

// ===========================================================================
// Barangay Vote Breakdown Controller - Executive Civic Edition
// Shared standard across BARMM 2026 Platform
// ==========================================================================

const content = document.querySelector("#barangay-breakdown-content");
const message = document.querySelector("#breakdown-message");
const provinceSelect = document.querySelector("#province-select");
const municipalitySelect = document.querySelector("#municipality-select");
const searchInput = document.querySelector("#barangay-search");
const refreshBtn = document.querySelector("#refresh-btn");
const copyBtn = document.querySelector("#copy-summary-btn");
const toastContainer = document.querySelector("#toast-container");
const footerUpdatedTime = document.querySelector("#footer-updated-time");

// Modal elements
const modalBtn = document.querySelector("#info-modal-btn");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalCloseBtn = document.querySelector("#modal-close-btn");
const modalCancelBtn = document.querySelector("#modal-cancel-btn");
const modalSource = document.querySelector("#modal-source");
const modalFiles = document.querySelector("#modal-files");
const modalTimestamp = document.querySelector("#modal-timestamp");

let breakdown = [];
let breakdownFiles = {};
let searchQuery = "";
let latestTimestamp = null;
let usingSupabase = false;
let liveProvince = "";
let liveMunicipalities = [];

function applyLiveBarangayBreakdown(province, municipality, data) {
  const categoryRows = (categoryKey) =>
    (data.rows || [])
      .filter((row) => row.category_key === categoryKey)
      .map((row) => ({
        name: row.name,
        contest_name: row.contest_name,
        ballot_order: row.ballot_order,
        barangay_votes: row.votes,
        total: row.total,
      }));

  breakdown = [{
    province,
    municipalities: [{
      municipality,
      barangays: data.columns || [],
      party_list: categoryRows("party_list"),
      sectoral: categoryRows("sectoral"),
      district: categoryRows("district"),
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

// Global Centralized Toast Notifications
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

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => toast.classList.add("show"));
  } else {
    toast.classList.add("show");
  }
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

function friendlySector(name) {
  const sectors = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];
  const found = sectors.find((sector) => name.toUpperCase().includes(sector));
  if (found) {
    if (found === "ULAMA") return "Ulama";
    if (found === "WOMEN") return "Women";
    if (found === "YOUTH") return "Youth";
    if (found === "TRADITIONAL LEADERS") return "Traditional Leaders";
    if (found === "SETTLER COMMUNITIES") return "Settler Communities";
  }
  return name;
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

function currentMunicipality() {
  const prov = breakdown.find((item) => item.province === provinceSelect.value);
  return prov?.municipalities.find((item) => item.municipality === municipalitySelect.value);
}

function renderSkeleton() {
  if (!content) return;
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
        <table class="results-table province-results-table" aria-label="Loading barangay data">
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

function makeTableCard(title, categoryKey, rows, barangays, sectorTagText) {
  const query = searchQuery.trim().toLowerCase();
  const orderedRows = [...(rows || [])].sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));

  const filteredRows = query
    ? orderedRows.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (r.contest_name && r.contest_name.toLowerCase().includes(query)) ||
          (r.contest_name && friendlySector(r.contest_name).toLowerCase().includes(query))
      )
    : orderedRows;

  if (filteredRows.length === 0) {
    if (query) {
      return null; // Don't render empty cards when searching if no matches
    }
    const emptyCard = document.createElement("article");
    emptyCard.className = "group-card";
    emptyCard.innerHTML = `
      <header class="group-card-header">
        <div class="group-header-info">
          <span class="group-avatar-badge">${categoryKey === "party_list" ? '<i data-lucide="landmark"></i>' : '<i data-lucide="users"></i>'}</span>
          <div class="group-title-stack">
            <div class="group-badge-line">
              <span class="group-tag ${categoryKey === "party_list" ? "party-tag" : "sector-tag"}">${categoryKey === "party_list" ? "POLITICAL PARTY" : (sectorTagText ? sectorTagText.toUpperCase() : "SECTORAL")}</span>
            </div>
            <h3 class="group-card-title">${title}</h3>
          </div>
        </div>
      </header>
      <div class="empty-row" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">No entries found.</div>
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

  // Thead
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");

  const entryTh = document.createElement("th");
  entryTh.scope = "col";
  entryTh.className = "party-col sticky-col";
  entryTh.textContent = "Candidate / Party";
  headRow.append(entryTh);

  (barangays || []).forEach((b) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.className = "province-header-col";
    th.textContent = b.toUpperCase();
    headRow.append(th);
  });

  const totalTh = document.createElement("th");
  totalTh.scope = "col";
  totalTh.className = "votes-column total-col-header";
  totalTh.textContent = "Total Votes";
  headRow.append(totalTh);

  head.append(headRow);
  table.append(head);

  // Tbody
  const body = document.createElement("tbody");

  filteredRows.forEach((entry, idx) => {
    const row = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.className = "party-cell sticky-col";

    const rank = idx + 1;
    const ballotOrder = Number(entry.ballot_order);
    const ballotNumber = Number.isInteger(ballotOrder) && ballotOrder < 9999 ? ballotOrder : "-";
    let rankClass = "rank-4plus";
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";

    nameTd.innerHTML = `
      <div class="party-cell-flex">
        <span class="ballot-tag" title="COMELEC Ballot #${ballotNumber}">${ballotNumber}</span>
        <span class="rank-badge ${rankClass}" title="Rank ${rank}">${rank}</span>
        <span class="candidate-name">${entry.name}</span>
      </div>
    `;
    row.append(nameTd);

    (barangays || []).forEach((b) => {
      const td = document.createElement("td");
      const v = Number(entry.barangay_votes?.[b] || 0);
      td.textContent = v > 0 ? v.toLocaleString() : "0";
      if (v === 0) td.style.color = "var(--text-muted)";
      row.append(td);
    });

    const totalTd = document.createElement("td");
    totalTd.className = "vote-total";
    totalTd.textContent = Number(entry.total || 0).toLocaleString();
    row.append(totalTd);

    body.append(row);
  });

  table.append(body);
  wrap.append(table);
  card.append(wrap);
  return card;
}

function renderMunicipalityOptions() {
  const province = breakdown.find((item) => item.province === provinceSelect.value);
  const currentValue = municipalitySelect.value;
  municipalitySelect.replaceChildren();

  const munis = usingSupabase
    ? liveMunicipalities.map((municipality) => ({ municipality }))
    : province?.municipalities || [];
  munis.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.municipality;
    option.textContent = item.municipality;
    municipalitySelect.append(option);
  });

  if (currentValue && [...municipalitySelect.options].some((option) => option.value === currentValue)) {
    municipalitySelect.value = currentValue;
  }
}

function render() {
  const municipality = currentMunicipality();
  if (!municipality) {
    if (message) message.textContent = "No municipality data available.";
    return;
  }

  content.replaceChildren();

  // 1. Political Party as standalone card
  const partyRows = [...(municipality.party_list || [])].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999));
  const partyCard = makeTableCard("Political Party Vote Breakdown", "party_list", partyRows, municipality.barangays);
  if (partyCard) content.append(partyCard);

  // 2. Separate Sectoral into standalone cards per sector
  const sectorGroups = {};
  const sectorOrder = ["SETTLER COMMUNITIES", "WOMEN", "YOUTH", "ULAMA", "TRADITIONAL LEADERS"];

  (municipality.sectoral || []).forEach((row) => {
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
      const card = makeTableCard(`${friendlyName} Breakdown`, "sectoral", sectorGroups[friendlyName], municipality.barangays, friendlyName);
      if (card) content.append(card);
    }
  });

  Object.keys(sectorGroups).forEach((name) => {
    if (!renderedSectors.has(name)) {
      const card = makeTableCard(`${name} Breakdown`, "sectoral", sectorGroups[name], municipality.barangays, name);
      if (card) content.append(card);
    }
  });

  // 3. District Representatives, ordered by district number.
  const districtGroups = {};
  (municipality.district || []).forEach((row) => { (districtGroups[row.contest_name] ||= []).push(row); });
  Object.keys(districtGroups).sort((a, b) => districtOrder(a) - districtOrder(b) || a.localeCompare(b)).forEach((name) => {
    const rows = districtGroups[name].sort((a, b) => (a.ballot_order || 9999) - (b.ballot_order || 9999) || a.name.localeCompare(b.name));
    const card = makeTableCard(formatDistrictTitle(name, "Vote Breakdown"), "district", rows, municipality.barangays, "District Representative");
    if (card) content.append(card);
  });

  if (content.children.length === 0 && searchQuery) {
    const noMatch = document.createElement("div");
    noMatch.className = "group-card";
    noMatch.innerHTML = `<div style="padding: 36px; text-align: center; color: var(--text-muted); font-size: 0.95rem; font-weight: 600;">No candidates or parties match "${searchQuery}".</div>`;
    content.append(noMatch);
  }

  const bCount = (municipality.barangays || []).length;
  const pName = (provinceSelect.value || "").toUpperCase();
  const mName = municipality.municipality;

  if (message) {
    message.textContent = `${bCount} barangays in ${mName}, ${pName}.`;
  }

  refreshLucideIcons();
}

async function loadProvinceBreakdown(isInitial = false) {
  const fileKey = provinceSelect.value;
  if (usingSupabase) {
    renderSkeleton();
    try {
      if (liveProvince !== fileKey) {
        const index = await loadLiveBreakdown({ level: "municipality", province: fileKey });
        liveProvince = fileKey;
        liveMunicipalities = index.columns || [];
        renderMunicipalityOptions();
      }

      const municipality = municipalitySelect.value;
      if (!municipality) throw new Error("No municipality data is available for this province.");
      const data = await loadLiveBreakdown({ level: "barangay", province: fileKey, municipality });
      applyLiveBarangayBreakdown(fileKey, municipality, data);
      latestTimestamp = data.generated_at || new Date().toISOString();
      if (footerUpdatedTime) footerUpdatedTime.textContent = `Snapshot updated: ${new Date(latestTimestamp).toLocaleString()}`;
      if (modalTimestamp) modalTimestamp.textContent = new Date(latestTimestamp).toLocaleString();
      render();
      if (!isInitial) showToast(`Loaded ${fileKey.toUpperCase()} barangay returns`, "success");
      return;
    } catch (error) {
      if (message) message.textContent = error.message || "Failed to load data.";
      showToast("Error loading barangay breakdown", "error");
      return;
    }
  }

  const filePath = breakdownFiles[fileKey];
  if (!filePath) return;

  renderSkeleton();

  try {
    const response = await fetch(`./${filePath}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the selected province breakdown.");
    const data = await response.json();
    breakdown = data.barangay_breakdown || [];
    latestTimestamp = data.timestamp || new Date().toISOString();

    if (footerUpdatedTime) {
      footerUpdatedTime.textContent = `Snapshot updated: ${new Date(latestTimestamp).toLocaleString()}`;
    }
    if (modalTimestamp) {
      modalTimestamp.textContent = new Date(latestTimestamp).toLocaleString();
    }

    renderMunicipalityOptions();
    if (!isInitial) {
      showToast(`Loaded ${fileKey.toUpperCase()} barangay returns`, "success");
    }
  } catch (error) {
    if (message) message.textContent = error.message || "Failed to load data.";
    showToast("Error loading barangay breakdown", "error");
  }
}

// Initial Data Boot
async function init() {
  renderSkeleton();

  try {
    const loaded = await loadDashboardSnapshot();
    const indexData = loaded.snapshot;
    usingSupabase = loaded.source === "supabase";
    breakdownFiles = indexData.breakdown_files || {};
    const provinces = usingSupabase ? indexData.province_breakdown?.provinces || [] : Object.keys(breakdownFiles);

    provinceSelect.replaceChildren();
    provinces.forEach((province) => {
      const option = document.createElement("option");
      option.value = province;
      option.textContent = province.toUpperCase();
      provinceSelect.append(option);
    });

    if (usingSupabase) provinceSelect.value = firstLiveProvince(indexData, provinces);

    provinceSelect.dispatchEvent(new Event("change", { bubbles: true }));

    provinceSelect.addEventListener("change", () => {
      loadProvinceBreakdown(false);
    });

    municipalitySelect.addEventListener("change", () => {
      if (usingSupabase) loadProvinceBreakdown(false);
      else render();
    });

    await loadProvinceBreakdown(true);
  } catch (error) {
    if (message) message.textContent = error.message || "Unable to load the barangay breakdown.";
    showToast("Failed to load initial election data", "error");
  }
}

// Search Input Listener
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });
}

// Copy Summary Action
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const municipality = currentMunicipality();
    if (!municipality) {
      showToast("No data to copy", "error");
      return;
    }

    const prov = (provinceSelect.value || "").toUpperCase();
    const muni = municipality.municipality;
    const bCount = (municipality.barangays || []).length;
    const topParty = municipality.party_list?.[0];

    const lines = [
      "BARMM Parliamentary Election 2026 - Barangay Vote Breakdown",
      `Province: ${prov}`,
      `City/Municipality: ${muni}`,
      `Total Barangays: ${bCount}`,
      topParty ? `Top Party: ${topParty.name} (${Number(topParty.total || 0).toLocaleString()} votes)` : "",
      `Generated: ${new Date().toLocaleString()}`,
      "Source: Official COMELEC Election Returns"
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Barangay summary copied to clipboard!", "success");
    } catch {
      showToast("Unable to copy to clipboard", "error");
    }
  });
}

// Refresh Data Button with Spinner Feedback
if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    const icon = refreshBtn.querySelector(".btn-icon");
    if (icon) icon.style.animation = "spin 0.8s linear infinite";
    refreshBtn.disabled = true;

    try {
      await loadProvinceBreakdown(false);
      showToast("Barangay data refreshed successfully!", "success");
    } catch {
      showToast("Failed to refresh data", "error");
    } finally {
      if (icon) icon.style.animation = "";
      refreshBtn.disabled = false;
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

// Initial Boot
init();
refreshLucideIcons();
