// Global State Variables
let allProjects = [];
let filteredProjects = [];
let favoriteIds = new Set(JSON.parse(localStorage.getItem('firofame_favs') || '[]'));
let buyerNotes = JSON.parse(localStorage.getItem('firofame_notes') || '{}');
let compareQueue = new Set();
let showingFavsOnly = false;

let localityChart = null;
let timelineChart = null;

// Regional Price Per Sq.Ft Benchmarks in Kerala (₹ / sq.ft)
const REGIONAL_RATES = {
  'Ernakulam': { min: 5500, max: 9500 },
  'Thiruvananthapuram': { min: 5000, max: 8800 },
  'Kozhikode': { min: 4800, max: 7800 },
  'Thrissur': { min: 4500, max: 7200 },
  'Kottayam': { min: 4200, max: 6800 },
  'Kollam': { min: 3800, max: 6000 },
  'Palakkad': { min: 3500, max: 5800 },
  'Kannur': { min: 4000, max: 6500 },
  'DEFAULT': { min: 3800, max: 6200 }
};

// DOM Element References
const searchInput = document.getElementById('search-input');
const filterDistrict = document.getElementById('filter-district');
const filterVillage = document.getElementById('filter-village');
const filterType = document.getElementById('filter-type');
const filterReadiness = document.getElementById('filter-readiness');
const sortBySelect = document.getElementById('sort-by');
const projectsGrid = document.getElementById('projects-grid');
const emptyState = document.getElementById('empty-state');

const statTotalProjects = document.getElementById('stat-total-projects');
const statTotalUnits = document.getElementById('stat-total-units');
const statTotalArea = document.getElementById('stat-total-area');
const statTotalVillages = document.getElementById('stat-total-villages');

const displayedCountEl = document.getElementById('displayed-count');
const totalCountEl = document.getElementById('total-count');
const favCountEl = document.getElementById('fav-count');
const navFavCountEl = document.getElementById('nav-fav-count');

const btnExportCsv = document.getElementById('btn-export-csv');
const btnExportJson = document.getElementById('btn-export-json');
const btnShowAll = document.getElementById('btn-show-all');
const btnShowFavs = document.getElementById('btn-show-favs');
const navBtnBookmarks = document.getElementById('nav-btn-bookmarks');

// Compare Dock Elements
const compareDock = document.getElementById('compare-dock');
const compareCountDock = document.getElementById('compare-count-dock');
const dockItems = document.getElementById('dock-items');
const btnLaunchCompare = document.getElementById('btn-launch-compare');
const btnClearCompare = document.getElementById('btn-clear-compare');

// Modals
const modalOverlay = document.getElementById('modal-overlay');
const modalClose = document.getElementById('modal-close');
const modalBody = document.getElementById('modal-body');

const calcModalOverlay = document.getElementById('calc-modal-overlay');
const calcModalClose = document.getElementById('calc-modal-close');
const navBtnCalc = document.getElementById('nav-btn-calc');
const toolBtnEmi = document.getElementById('tool-btn-emi');

const compareModalOverlay = document.getElementById('compare-modal-overlay');
const compareModalClose = document.getElementById('compare-modal-close');
const compareMatrixContainer = document.getElementById('compare-matrix-container');
const toolBtnCompare = document.getElementById('tool-btn-compare');

const checklistModalOverlay = document.getElementById('checklist-modal-overlay');
const checklistModalClose = document.getElementById('checklist-modal-close');
const navBtnChecklist = document.getElementById('nav-btn-checklist');
const toolBtnChecklist = document.getElementById('tool-btn-checklist');
const toolBtnShortlist = document.getElementById('tool-btn-shortlist');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    let rawData = [];
    try {
      const res = await fetch('kerala_projects.json');
      if (res.ok) rawData = await res.json();
    } catch (e) {
      const fallbackRes = await fetch('data/kerala_projects.json');
      rawData = await fallbackRes.json();
    }

    // Enrich projects with Home Buyer metrics
    allProjects = rawData.map((p, idx) => enrichProjectData(p, idx));

    initFiltersAndStats();
    applyFilters();
    initCharts();
    setupEventListeners();
    initEmiCalculator();
  } catch (err) {
    console.error("Critical: Could not initialize home buyer portal data.", err);
  }
});

// Calculate Price Ranges, Unit Sq.Ft & Buyer Metrics
function enrichProjectData(p, index) {
  const units = parseInt(p.apartment_count || 0, 10) || 1;
  const areaSqm = parseFloat(p.total_floor_area_sqm || 0);
  const areaSqft = areaSqm * 10.7639;
  const avgSqftPerUnit = areaSqft > 0 ? Math.round(areaSqft / units) : 1100;
  
  const bldCount = parseInt(p.buildings_count || 0, 10);
  let propType = 'apartment';
  if (bldCount >= 4 && units / (bldCount || 1) <= 3) {
    propType = 'villa';
  } else if (bldCount === 0 || (areaSqm > 0 && areaSqm / units > 400)) {
    propType = 'plot';
  }

  const district = (p.district || 'Thiruvananthapuram').trim();
  const rates = REGIONAL_RATES[district] || REGIONAL_RATES['DEFAULT'];
  
  // Calculate price estimate range in Lakhs / Crores
  const estMinRupees = Math.max(2500000, avgSqftPerUnit * rates.min);
  const estMaxRupees = Math.max(3500000, avgSqftPerUnit * rates.max);

  // Completion readiness
  let compYear = 0;
  if (p.proposed_completion_date) {
    compYear = new Date(p.proposed_completion_date).getFullYear();
  }
  let readiness = 'under_construction';
  if (compYear > 1990 && compYear <= 2026) readiness = 'ready';
  else if (compYear === 2027) readiness = 'nearing';

  return {
    ...p,
    uid: p.id || `prj-${index}`,
    district: district,
    units: units,
    area_sqm: areaSqm,
    area_sqft: Math.round(areaSqft),
    avg_unit_sqft: avgSqftPerUnit,
    prop_type: propType,
    est_price_min: estMinRupees,
    est_price_max: estMaxRupees,
    est_price_str: formatPriceRange(estMinRupees, estMaxRupees),
    comp_year: compYear || 'N/A',
    readiness: readiness
  };
}

function formatPriceRange(min, max) {
  const minLakhs = (min / 100000).toFixed(1);
  const maxLakhs = (max / 100000).toFixed(1);

  if (min >= 10000000) {
    return `₹${(min / 10000000).toFixed(2)} Cr - ₹${(max / 10000000).toFixed(2)} Cr`;
  }
  return `₹${minLakhs} L - ₹${maxLakhs} L`;
}

// Populate Filters & Stats Ticker
function initFiltersAndStats() {
  const districtCounts = {};
  const villages = new Set();
  let totalUnits = 0;
  let totalArea = 0;

  allProjects.forEach(p => {
    districtCounts[p.district] = (districtCounts[p.district] || 0) + 1;
    if (p.village) villages.add(p.village.trim().toUpperCase());
    totalUnits += p.units;
    totalArea += p.area_sqm;
  });

  // Header stats
  statTotalProjects.textContent = allProjects.length.toLocaleString();
  statTotalUnits.textContent = totalUnits.toLocaleString();
  statTotalArea.textContent = `${Math.round(totalArea).toLocaleString()} m²`;
  statTotalVillages.textContent = villages.size.toLocaleString();
  
  favCountEl.textContent = favoriteIds.size;
  navFavCountEl.textContent = favoriteIds.size;

  // District Dropdown
  const sortedDistricts = Object.entries(districtCounts).sort((a, b) => b[1] - a[1]);
  filterDistrict.innerHTML = '<option value="">All Districts (14)</option>';
  sortedDistricts.forEach(([dist, count]) => {
    const opt = document.createElement('option');
    opt.value = dist;
    opt.textContent = `${dist} (${count})`;
    filterDistrict.appendChild(opt);
  });

  populateVillageDropdown();
}

function populateVillageDropdown(selectedDistrict = '') {
  filterVillage.innerHTML = '<option value="">All Localities</option>';
  const villages = new Set();

  allProjects.forEach(p => {
    if (!selectedDistrict || p.district.toLowerCase() === selectedDistrict.toLowerCase()) {
      if (p.village) villages.add(p.village.trim().toUpperCase());
    }
  });

  Array.from(villages).sort().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    filterVillage.appendChild(opt);
  });
}

// Main Filtering & Sorting Logic
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedDistrict = filterDistrict.value;
  const selectedVillage = filterVillage.value;
  const selectedType = filterType.value;
  const selectedReadiness = filterReadiness.value;
  const sortBy = sortBySelect.value;

  filteredProjects = allProjects.filter(p => {
    if (showingFavsOnly && !favoriteIds.has(p.uid)) return false;

    if (selectedDistrict && p.district.toLowerCase() !== selectedDistrict.toLowerCase()) return false;

    if (selectedVillage && (p.village || '').trim().toUpperCase() !== selectedVillage) return false;

    if (selectedType && p.prop_type !== selectedType) return false;

    if (selectedReadiness && p.readiness !== selectedReadiness) return false;

    if (query) {
      const matchName = (p.name || '').toLowerCase().includes(query);
      const matchReg = (p.registration_number || '').toLowerCase().includes(query);
      const matchPromoter = (p.promoter_name || '').toLowerCase().includes(query);
      const matchVillage = (p.village || '').toLowerCase().includes(query);
      const matchPincode = (p.pincode || '').toLowerCase().includes(query);
      const matchDistrict = (p.district || '').toLowerCase().includes(query);
      if (!matchName && !matchReg && !matchPromoter && !matchVillage && !matchPincode && !matchDistrict) return false;
    }

    return true;
  });

  // Sorting
  filteredProjects.sort((a, b) => {
    if (sortBy === 'units-desc') return b.units - a.units;
    if (sortBy === 'price-asc') return a.est_price_min - b.est_price_min;
    if (sortBy === 'price-desc') return b.est_price_min - a.est_price_min;
    if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'date-desc') return new Date(b.proposed_completion_date || 0) - new Date(a.proposed_completion_date || 0);
    if (sortBy === 'area-desc') return b.area_sqm - a.area_sqm;
    return 0;
  });

  renderProjects();
}

// Render Project Cards
function renderProjects() {
  displayedCountEl.textContent = filteredProjects.length.toLocaleString();
  totalCountEl.textContent = allProjects.length.toLocaleString();

  if (filteredProjects.length === 0) {
    projectsGrid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  projectsGrid.style.display = 'grid';
  projectsGrid.innerHTML = '';

  filteredProjects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';

    const isFav = favoriteIds.has(p.uid);
    const isCompared = compareQueue.has(p.uid);

    let typeTag = 'Apartment';
    if (p.prop_type === 'villa') typeTag = 'Gated Villa';
    else if (p.prop_type === 'plot') typeTag = 'Plot Layout';

    let readinessBadge = `<span class="rera-badge" style="background: rgba(16,185,129,0.15); color: #34d399;">Ready &le; ${p.comp_year}</span>`;
    if (p.readiness === 'nearing') {
      readinessBadge = `<span class="rera-badge" style="background: rgba(245,158,11,0.15); color: #fbbf24;">Target ${p.comp_year}</span>`;
    } else if (p.readiness === 'under_construction') {
      readinessBadge = `<span class="rera-badge" style="background: rgba(99,102,241,0.15); color: #818cf8;">UC Target ${p.comp_year}</span>`;
    }

    card.innerHTML = `
      <div>
        <div class="card-header-bar">
          <div class="project-title">${escapeHtml(p.name)}</div>
          <div class="badge-wrapper">
            <span class="type-badge">${typeTag}</span>
          </div>
        </div>

        <div class="promoter-info">
          <i class="fa-solid fa-user-tie" style="color: var(--primary-light);"></i> ${escapeHtml(p.promoter_name || 'Promoter / Developer')}
        </div>

        <div class="price-estimate-banner">
          <div>
            <div class="price-title"><i class="fa-solid fa-tags"></i> Est. Price Guide</div>
            <div class="price-val">${p.est_price_str}</div>
          </div>
          <button class="btn btn-secondary btn-quick-emi" data-price="${p.est_price_min}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
            <i class="fa-solid fa-calculator"></i> EMI
          </button>
        </div>

        <div class="card-details-grid">
          <div class="detail-item">
            <span class="label">Est. Unit Area</span>
            <span class="val">~${p.avg_unit_sqft.toLocaleString()} sq.ft</span>
          </div>
          <div class="detail-item">
            <span class="label">Total Units</span>
            <span class="val">${p.units.toLocaleString()} Units</span>
          </div>
          <div class="detail-item">
            <span class="label">RERA Status</span>
            <span class="val" style="color: var(--emerald);"><i class="fa-solid fa-shield-halved"></i> Verified</span>
          </div>
          <div class="detail-item">
            <span class="label">Completion Stage</span>
            <span class="val">${readinessBadge}</span>
          </div>
        </div>
      </div>

      <div class="card-footer">
        <div class="location-tag">
          <i class="fa-solid fa-location-dot" style="color: var(--rose);"></i> ${escapeHtml(p.village || 'Locality')}, ${escapeHtml(p.district)}
        </div>

        <div class="card-actions">
          <button class="action-icon-btn ${isFav ? 'active-fav' : ''} btn-bookmark" data-id="${p.uid}" title="Save Shortlist">
            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
          </button>
          
          <button class="action-icon-btn ${isCompared ? 'active-compare' : ''} btn-compare-toggle" data-id="${p.uid}" title="Add to Side-by-Side Compare">
            <i class="fa-solid fa-code-compare"></i>
          </button>

          <button class="btn btn-secondary btn-view-details" data-id="${p.uid}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
            Dossier <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
    `;

    projectsGrid.appendChild(card);
  });
}

// Visual Analytics (Chart.js)
function initCharts() {
  const localityCounts = {};
  allProjects.forEach(p => {
    const loc = `${(p.village || 'Other').trim().toUpperCase()} (${p.district})`;
    localityCounts[loc] = (localityCounts[loc] || 0) + 1;
  });

  const sortedLocalities = Object.entries(localityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const locLabels = sortedLocalities.map(item => item[0]);
  const locValues = sortedLocalities.map(item => item[1]);

  const ctxLocality = document.getElementById('localityChart').getContext('2d');
  localityChart = new Chart(ctxLocality, {
    type: 'bar',
    data: {
      labels: locLabels,
      datasets: [{
        label: 'Projects',
        data: locValues,
        backgroundColor: 'rgba(99, 102, 241, 0.75)',
        borderColor: '#818cf8',
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#9ca3af', stepSize: 5 }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  let countReady = 0, countNearing = 0, countUC = 0;
  allProjects.forEach(p => {
    if (p.readiness === 'ready') countReady++;
    else if (p.readiness === 'nearing') countNearing++;
    else countUC++;
  });

  const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
  timelineChart = new Chart(ctxTimeline, {
    type: 'doughnut',
    data: {
      labels: ['Ready to Move (≤2026)', 'Nearing Completion (2027)', 'Under Construction (2028+)'],
      datasets: [{
        data: [countReady, countNearing, countUC],
        backgroundColor: ['#10b981', '#f59e0b', '#6366f1'],
        borderWidth: 2,
        borderColor: '#111827'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 } } }
      }
    }
  });
}

// Detailed Project Dossier Modal View
function showProjectDetails(uid) {
  const p = allProjects.find(item => item.uid === uid);
  if (!p) return;

  const isFav = favoriteIds.has(p.uid);
  const noteText = buyerNotes[p.uid] || '';

  // Formatted pre-filled WhatsApp message
  const waMsg = encodeURIComponent(
    `Hello ${p.promoter_name || 'Developer'}, I found your RERA registered project "${p.name}" (Reg No: ${p.registration_number}) on Firofame Home Buyer Portal. I would like to inquire about unit availability and pricing.`
  );

  modalBody.innerHTML = `
    <div style="margin-bottom: 1.25rem;">
      <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
        <span class="rera-badge"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(p.registration_number || 'K-RERA Registered')}</span>
        <span class="type-badge">${p.prop_type.toUpperCase()}</span>
      </div>
      <h2 class="modal-header-title">${escapeHtml(p.name)}</h2>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        <i class="fa-solid fa-location-dot" style="color: var(--rose);"></i> ${escapeHtml(p.village || 'Locality')}, ${escapeHtml(p.street || '')}, ${escapeHtml(p.district)} District (PIN: ${p.pincode || 'N/A'})
      </p>
    </div>

    <!-- Est Price & Buyer Summary Banner -->
    <div class="price-estimate-banner" style="padding: 1rem;">
      <div>
        <div class="price-title">Est. Price Bracket</div>
        <div class="price-val" style="font-size: 1.5rem;">${p.est_price_str}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted);">Avg. Unit Size: ~${p.avg_unit_sqft.toLocaleString()} sq.ft</div>
      </div>
      <button class="btn btn-emerald" onclick="openEmiCalculatorWithPrice(${p.est_price_min})">
        <i class="fa-solid fa-calculator"></i> Calculate EMI
      </button>
    </div>

    <!-- Promoter & Contact Dossier -->
    <div class="modal-section">
      <div class="modal-section-title"><i class="fa-solid fa-user-shield"></i> Promoter & Developer Dossier</div>
      <div class="card-details-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="detail-item">
          <span class="label">Developer / Promoter</span>
          <span class="val">${escapeHtml(p.promoter_name || 'N/A')}</span>
        </div>
        <div class="detail-item">
          <span class="label">Contact Person</span>
          <span class="val">${escapeHtml(p.promoter_contact_person || 'N/A')}</span>
        </div>
        <div class="detail-item">
          <span class="label">Phone / Mobile</span>
          <span class="val">${p.promoter_mobile ? `<a href="tel:${p.promoter_mobile}" style="color: var(--emerald);">${escapeHtml(p.promoter_mobile)}</a>` : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Official Email</span>
          <span class="val">${p.promoter_email ? `<a href="mailto:${p.promoter_email}" style="color: var(--primary-light);">${escapeHtml(p.promoter_email)}</a>` : 'N/A'}</span>
        </div>
      </div>

      <!-- Quick Action Buyer Contact Launcher -->
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem;">
        ${p.promoter_mobile ? `
          <a href="https://wa.me/91${p.promoter_mobile.replace(/\D/g,'')}?text=${waMsg}" target="_blank" class="btn btn-emerald" style="padding: 0.45rem 0.9rem; font-size: 0.85rem;">
            <i class="fa-brands fa-whatsapp"></i> Inquire on WhatsApp
          </a>
          <a href="tel:${p.promoter_mobile}" class="btn btn-secondary" style="padding: 0.45rem 0.9rem; font-size: 0.85rem;">
            <i class="fa-solid fa-phone"></i> Call Developer
          </a>
        ` : ''}
        ${p.promoter_email ? `
          <a href="mailto:${p.promoter_email}?subject=Inquiry%20regarding%20${encodeURIComponent(p.name)}&body=${waMsg}" class="btn btn-secondary" style="padding: 0.45rem 0.9rem; font-size: 0.85rem;">
            <i class="fa-solid fa-envelope"></i> Send Email
          </a>
        ` : ''}
      </div>
    </div>

    <!-- Specs Dossier -->
    <div class="modal-section">
      <div class="modal-section-title"><i class="fa-solid fa-layer-group"></i> Project Development Specs</div>
      <div class="card-details-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        <div class="detail-item">
          <span class="label">Proposed Completion</span>
          <span class="val">${p.proposed_completion_date ? p.proposed_completion_date.split(' ')[0] : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Project Start Date</span>
          <span class="val">${p.project_start_date ? p.project_start_date.split(' ')[0] : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Total Approved Units</span>
          <span class="val">${p.units.toLocaleString()} Units</span>
        </div>
        <div class="detail-item">
          <span class="label">Total Floor Area</span>
          <span class="val">${p.area_sqm ? `${Math.round(p.area_sqm).toLocaleString()} m²` : 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="label">Buildings Count</span>
          <span class="val">${p.buildings_count || 'N/A'}</span>
        </div>
      </div>
    </div>

    <!-- Personal Buyer Notes -->
    <div class="modal-section">
      <div class="modal-section-title"><i class="fa-solid fa-pen-to-square"></i> My Buyer Notes & Inspection Log</div>
      <textarea id="modal-note-input" class="calc-input" style="height: 75px; font-size: 0.88rem;" placeholder="Add private notes (e.g., 'Visited on Sunday', 'Spoke with agent, 3BHK pricing quoted at ₹65L')...">${escapeHtml(noteText)}</textarea>
      <button class="btn btn-secondary" onclick="saveBuyerNote('${p.uid}')" style="margin-top: 0.5rem; padding: 0.35rem 0.75rem; font-size: 0.8rem;">
        <i class="fa-solid fa-floppy-disk"></i> Save Personal Note
      </button>
    </div>

    <!-- Bottom Actions -->
    <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <button class="btn btn-secondary modal-fav-toggle" data-id="${p.uid}">
        <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart" style="color: var(--rose);"></i> ${isFav ? 'Remove Shortlist' : 'Add to Shortlist'}
      </button>
      <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${p.registration_number}'); alert('Copied RERA Reg No to Clipboard!');">
        <i class="fa-regular fa-copy"></i> Copy Reg No
      </button>
    </div>
  `;

  modalOverlay.classList.add('active');
}

function saveBuyerNote(uid) {
  const noteInput = document.getElementById('modal-note-input');
  if (noteInput) {
    buyerNotes[uid] = noteInput.value.trim();
    localStorage.setItem('firofame_notes', JSON.stringify(buyerNotes));
    alert('Buyer note saved successfully!');
  }
}

// Side-by-Side Property Comparison Dock Engine
function toggleCompare(uid) {
  if (compareQueue.has(uid)) {
    compareQueue.delete(uid);
  } else {
    if (compareQueue.size >= 3) {
      alert('You can compare a maximum of 3 properties simultaneously.');
      return;
    }
    compareQueue.add(uid);
  }
  updateCompareDock();
  applyFilters();
}

function updateCompareDock() {
  compareCountDock.textContent = compareQueue.size;

  if (compareQueue.size > 0) {
    compareDock.classList.add('visible');
    dockItems.innerHTML = '';

    compareQueue.forEach(uid => {
      const p = allProjects.find(item => item.uid === uid);
      if (!p) return;

      const chip = document.createElement('div');
      chip.className = 'dock-item-chip';
      chip.innerHTML = `
        <span>${escapeHtml(p.name.substring(0, 18))}...</span>
        <button onclick="toggleCompare('${p.uid}')"><i class="fa-solid fa-xmark"></i></button>
      `;
      dockItems.appendChild(chip);
    });
  } else {
    compareDock.classList.remove('visible');
  }
}

function renderComparisonMatrix() {
  if (compareQueue.size === 0) return;

  const items = Array.from(compareQueue).map(uid => allProjects.find(p => p.uid === uid)).filter(Boolean);

  let html = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>Metric / Feature</th>
          ${items.map(p => `<th>${escapeHtml(p.name)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Locality & District</strong></td>
          ${items.map(p => `<td>${escapeHtml(p.village || 'Locality')}, ${escapeHtml(p.district)}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>Est. Price Guide</strong></td>
          ${items.map(p => `<td style="color: var(--amber); font-weight: 700;">${p.est_price_str}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>Avg. Unit Size</strong></td>
          ${items.map(p => `<td>~${p.avg_unit_sqft.toLocaleString()} sq.ft</td>`).join('')}
        </tr>
        <tr>
          <td><strong>Total Units</strong></td>
          ${items.map(p => `<td>${p.units.toLocaleString()} Units</td>`).join('')}
        </tr>
        <tr>
          <td><strong>Completion Target</strong></td>
          ${items.map(p => `<td>${p.comp_year}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>Promoter / Developer</strong></td>
          ${items.map(p => `<td>${escapeHtml(p.promoter_name || 'N/A')}</td>`).join('')}
        </tr>
        <tr>
          <td><strong>RERA Registration</strong></td>
          ${items.map(p => `<td><span class="rera-badge">${p.registration_number || 'Verified'}</span></td>`).join('')}
        </tr>
        <tr>
          <td><strong>Action</strong></td>
          ${items.map(p => `
            <td>
              <button class="btn btn-emerald" onclick="openEmiCalculatorWithPrice(${p.est_price_min})" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;">
                <i class="fa-solid fa-calculator"></i> EMI
              </button>
            </td>
          `).join('')}
        </tr>
      </tbody>
    </table>
  `;

  compareMatrixContainer.innerHTML = html;
  compareModalOverlay.classList.add('active');
}

// Loan EMI Calculator Logic
function initEmiCalculator() {
  const priceInput = document.getElementById('calc-price');
  const downpayInput = document.getElementById('calc-downpay-pct');
  const rateInput = document.getElementById('calc-rate');
  const tenureInput = document.getElementById('calc-tenure');

  const updateEmi = () => {
    const price = parseFloat(priceInput.value) || 0;
    const downPct = parseFloat(downpayInput.value) || 0;
    const annualRate = parseFloat(rateInput.value) || 0;
    const years = parseFloat(tenureInput.value) || 1;

    const loanAmt = price * (1 - downPct / 100);
    const monthlyRate = (annualRate / 12) / 100;
    const totalMonths = years * 12;

    let emi = 0;
    if (monthlyRate > 0) {
      emi = loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
    } else {
      emi = loanAmt / totalMonths;
    }

    const totalPayable = emi * totalMonths;
    const totalInterest = Math.max(0, totalPayable - loanAmt);

    document.getElementById('calc-emi-display').textContent = `₹${Math.round(emi).toLocaleString()} / mo`;
    document.getElementById('calc-loan-amt').textContent = `₹${Math.round(loanAmt).toLocaleString()}`;
    document.getElementById('calc-total-interest').textContent = `₹${Math.round(totalInterest).toLocaleString()}`;
  };

  [priceInput, downpayInput, rateInput, tenureInput].forEach(inp => {
    if (inp) inp.addEventListener('input', updateEmi);
  });

  updateEmi();
}

function openEmiCalculatorWithPrice(price) {
  const priceInput = document.getElementById('calc-price');
  if (priceInput && price) {
    priceInput.value = Math.round(price);
    initEmiCalculator();
  }
  if (modalOverlay) modalOverlay.classList.remove('active');
  if (compareModalOverlay) compareModalOverlay.classList.remove('active');
  calcModalOverlay.classList.add('active');
}

// Event Listeners setup
function setupEventListeners() {
  searchInput.addEventListener('input', applyFilters);

  filterDistrict.addEventListener('change', (e) => {
    populateVillageDropdown(e.target.value);
    applyFilters();
  });

  filterVillage.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);
  filterReadiness.addEventListener('change', applyFilters);
  sortBySelect.addEventListener('change', applyFilters);

  // Quick Filter Tag Pills
  document.querySelectorAll('.quick-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.quick-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const pillKey = pill.dataset.pill;
      filterDistrict.value = '';
      filterType.value = '';
      filterReadiness.value = '';
      searchInput.value = '';

      if (pillKey === 'tvm') filterDistrict.value = 'Thiruvananthapuram';
      else if (pillKey === 'kochi') filterDistrict.value = 'Ernakulam';
      else if (pillKey === 'thrissur') filterDistrict.value = 'Thrissur';
      else if (pillKey === 'kozhikode') filterDistrict.value = 'Kozhikode';
      else if (pillKey === 'ready') filterReadiness.value = 'ready';
      else if (pillKey === 'villas') filterType.value = 'villa';

      populateVillageDropdown(filterDistrict.value);
      applyFilters();
    });
  });

  btnShowAll.addEventListener('click', () => {
    showingFavsOnly = false;
    btnShowAll.classList.remove('btn-secondary');
    btnShowFavs.classList.add('btn-secondary');
    applyFilters();
  });

  btnShowFavs.addEventListener('click', () => {
    showingFavsOnly = true;
    btnShowFavs.classList.remove('btn-secondary');
    btnShowAll.classList.add('btn-secondary');
    applyFilters();
  });

  navBtnBookmarks.addEventListener('click', () => {
    showingFavsOnly = true;
    btnShowFavs.classList.remove('btn-secondary');
    btnShowAll.classList.add('btn-secondary');
    applyFilters();
  });

  toolBtnShortlist.addEventListener('click', () => {
    showingFavsOnly = true;
    btnShowFavs.classList.remove('btn-secondary');
    btnShowAll.classList.add('btn-secondary');
    applyFilters();
  });

  // Card click Delegation
  projectsGrid.addEventListener('click', e => {
    const detailsBtn = e.target.closest('.btn-view-details');
    if (detailsBtn) {
      showProjectDetails(detailsBtn.dataset.id);
      return;
    }

    const bookmarkBtn = e.target.closest('.btn-bookmark');
    if (bookmarkBtn) {
      toggleFavorite(bookmarkBtn.dataset.id);
      return;
    }

    const compareBtn = e.target.closest('.btn-compare-toggle');
    if (compareBtn) {
      toggleCompare(compareBtn.dataset.id);
      return;
    }

    const emiBtn = e.target.closest('.btn-quick-emi');
    if (emiBtn) {
      openEmiCalculatorWithPrice(parseFloat(emiBtn.dataset.price));
      return;
    }
  });

  // Compare Dock Actions
  btnLaunchCompare.addEventListener('click', renderComparisonMatrix);
  btnClearCompare.addEventListener('click', () => {
    compareQueue.clear();
    updateCompareDock();
    applyFilters();
  });
  toolBtnCompare.addEventListener('click', () => {
    if (compareQueue.size === 0) {
      alert('Please select at least 1 or 2 properties using the comparison icon (⇄) on project cards first.');
      return;
    }
    renderComparisonMatrix();
  });

  // Tool / Nav Modals
  navBtnCalc.addEventListener('click', () => calcModalOverlay.classList.add('active'));
  toolBtnEmi.addEventListener('click', () => calcModalOverlay.classList.add('active'));
  calcModalClose.addEventListener('click', () => calcModalOverlay.classList.remove('active'));

  navBtnChecklist.addEventListener('click', () => checklistModalOverlay.classList.add('active'));
  toolBtnChecklist.addEventListener('click', () => checklistModalOverlay.classList.add('active'));
  checklistModalClose.addEventListener('click', () => checklistModalOverlay.classList.remove('active'));

  compareModalClose.addEventListener('click', () => compareModalOverlay.classList.remove('active'));

  // Detail Modal interactions
  modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) modalOverlay.classList.remove('active');
  });

  document.addEventListener('click', e => {
    const favToggle = e.target.closest('.modal-fav-toggle');
    if (favToggle) {
      const pid = favToggle.dataset.id;
      toggleFavorite(pid);
      showProjectDetails(pid);
    }
  });

  // CSV Export
  btnExportCsv.addEventListener('click', () => {
    if (filteredProjects.length === 0) return alert("No projects to export.");
    const fields = ['name', 'district', 'village', 'registration_number', 'promoter_name', 'units', 'est_price_str', 'comp_year', 'promoter_mobile', 'promoter_email'];
    const escapeCsv = val => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      fields.join(','),
      ...filteredProjects.map(r => fields.map(h => escapeCsv(r[h])).join(','))
    ];
    downloadFile(rows.join('\n'), 'kerala_rera_home_buyer_shortlist.csv', 'text/csv');
  });

  // JSON Export
  btnExportJson.addEventListener('click', () => {
    if (filteredProjects.length === 0) return alert("No projects to export.");
    downloadFile(JSON.stringify(filteredProjects, null, 2), 'kerala_rera_home_buyer_shortlist.json', 'application/json');
  });
}

function toggleFavorite(id) {
  if (favoriteIds.has(id)) {
    favoriteIds.delete(id);
  } else {
    favoriteIds.add(id);
  }
  localStorage.setItem('firofame_favs', JSON.stringify(Array.from(favoriteIds)));
  favCountEl.textContent = favoriteIds.size;
  navFavCountEl.textContent = favoriteIds.size;
  applyFilters();
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
