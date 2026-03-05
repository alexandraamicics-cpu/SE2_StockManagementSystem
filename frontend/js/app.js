const toast = document.getElementById('toast');
function showToast(msg, ok = true) {
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = ok ? '#e7f7eb' : '#fde0e0';
  toast.style.color = ok ? '#1a7a4e' : '#c45555';
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2400);
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

// state
let currentUser = null;
let itemsCache = [];
let filteredItemsCache = [];
let activityCache = [];
let inventoryCurrentPage = 1;

const INVENTORY_ROWS_PER_PAGE = 10;
const PAIRS_ROWS_PER_PAGE = 10;


function getTemplateClone(templateId) {
  const template = document.getElementById(templateId);
  if (!template || !(template instanceof HTMLTemplateElement)) return null;
  const root = template.content.firstElementChild;
  return root ? root.cloneNode(true) : null;
}

function parseNameParts(fullName = '') {
  const raw = (fullName || '').trim();
  if (!raw) return { lastName: '', firstName: '', middleName: '' };

  if (raw.includes(',')) {
    const [last, restRaw] = raw.split(',');
    const rest = (restRaw || '').trim().split(/\s+/).filter(Boolean);
    return {
      lastName: (last || '').trim(),
      firstName: rest[0] || '',
      middleName: rest.slice(1).join(' ')
    };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  return {
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : (parts.length === 2 ? '' : parts.slice(1).join(' '))
  };
}

function buildFullName(lastName, firstName, middleName, suffix = '') {
  const last = (lastName || '').trim();
  const first = (firstName || '').trim();
  const middle = (middleName || '').trim();
  const normalizedSuffix = (suffix || '').trim();
  const middleAndSuffix = [middle, normalizedSuffix].filter(Boolean).join(' ');
  return `${last}, ${first}${middleAndSuffix ? ' ' + middleAndSuffix : ''}`.trim();
}

function normalizePhoneNumber(raw = '') {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return digits;
  if (digits.length === 10 && digits.startsWith('9')) return digits.slice(1);
  if (digits.length === 11 && digits.startsWith('09')) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith('639')) return digits.slice(3);
  return digits.slice(0, 9);
}

function syncSelectPlaceholderState(select) {
  if (!select) return;
  select.classList.toggle('select-placeholder', !select.value);
}

function getUserNameParts(user = {}) {
  const lastName = (user.last_name || '').trim();
  const firstName = (user.first_name || '').trim();
  const middleName = (user.middle_name || '').trim();

  if (lastName || firstName || middleName) {
    return { lastName, firstName, middleName };
  }

  return parseNameParts(user.name || '');
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    currentUser = me.user;
    const nameParts = getUserNameParts(currentUser);

    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) {
      welcomeName.textContent = nameParts.firstName || currentUser.username;
    }

    const setUserId = document.getElementById('setUserId');
    if (setUserId) setUserId.value = currentUser.user_id;

    const setRole = document.getElementById('setRole');
    if (setRole) setRole.value = currentUser.role || 'Staff';

    const setLastName = document.getElementById('setLastName');
    if (setLastName) setLastName.value = nameParts.lastName;

    const setFirstName = document.getElementById('setFirstName');
    if (setFirstName) setFirstName.value = nameParts.firstName;

    const setMiddleName = document.getElementById('setMiddleName');
    if (setMiddleName) setMiddleName.value = nameParts.middleName;

    const setSuffix = document.getElementById('setSuffix');
    if (setSuffix) {
      setSuffix.value = currentUser.suffix || '';
      syncSelectPlaceholderState(setSuffix);
    }

    const setGender = document.getElementById('setGender');
    if (setGender) {
      setGender.value = currentUser.gender || '';
      syncSelectPlaceholderState(setGender);
    }

    const setPhone = document.getElementById('setPhone');
    if (setPhone) setPhone.value = normalizePhoneNumber(currentUser.phone_number || '');

    const setUsername = document.getElementById('setUsername');
    if (setUsername) setUsername.value = currentUser.username;

    const setEmail = document.getElementById('setEmail');
    if (setEmail) setEmail.value = currentUser.email;
  } catch (err) {
    window.location.href = '/index.html';
    return;
  }

  wireNav();
  await refreshCurrentPageData();
}

async function refreshCurrentPageData() {
  const tasks = [];
  if (document.getElementById('homeStats')) tasks.push(loadHome());
  if (document.getElementById('itemsTable')) tasks.push(loadInventory());
  if (document.getElementById('activityTable')) tasks.push(loadActivity());
  if (document.getElementById('analyticsTop')) tasks.push(loadAnalytics());
  await Promise.all(tasks);
}

let refreshInFlight = false;

async function refreshAfterPageReturn() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await refreshCurrentPageData();
  } catch (err) {
    console.error('Failed to refresh page data:', err);
  } finally {
    refreshInFlight = false;
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    refreshAfterPageReturn();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshAfterPageReturn();
  }
});

function wireNav() {
  const logout = document.getElementById('logoutBtn');
  if (logout) logout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  });
}


async function loadHome() {
  const overview = await api('/api/overview');
  const summary = overview.summary || {};
  activityCache = overview.recent_activity || [];

  const totalItems = Number(summary.total_items || 0);
  const inStock = Number(summary.in_stock || 0);
  const waitingStock = Number(summary.waiting_stock || 0);
  const safeTotal = Math.max(1, totalItems);

  const cards = [
    {
      title: 'Total Items',
      value: totalItems,
      sub: 'All active items',
      icon: 'fa-box',
      cls: 'stat-orange',
      progress: 100
    },
    {
      title: 'In Stock',
      value: inStock,
      sub: 'Ready to sell',
      icon: 'fa-chart-line',
      cls: 'stat-green',
      progress: Math.round((inStock / safeTotal) * 100)
    },
    {
      title: 'Waiting Stock',
      value: waitingStock,
      sub: 'Needs attention',
      icon: 'fa-triangle-exclamation',
      cls: 'stat-yellow',
      progress: Math.round((waitingStock / safeTotal) * 100)
    }
  ];

  const homeStats = document.getElementById('homeStats');
  if (homeStats) {
    homeStats.innerHTML = cards.map((card) => `
      <div class="card stat-card ${card.cls}">
        <div class="stat-title">${card.title}</div>
        <div class="stat-value">${card.value}</div>
        <div class="stat-sub">${card.sub}</div>
        <div class="stat-icon"><i class="fa ${card.icon}"></i></div>
        <div class="stat-bar"><span style="width: ${card.progress}%"></span></div>
      </div>
    `).join('');
  }

  const recent = document.getElementById('recentActivity');
  if (recent) {
    if (!activityCache.length) {
      recent.innerHTML = '<p style="color:#8a7c73; margin:14px 0;">No recent activity</p>';
    } else {
      recent.innerHTML = activityCache.map((entry, index) => `
        <button class="recent-item-btn" type="button" data-activity-index="${index}">
          <div class="recent-item">
            <div class="recent-left">
              <span class="recent-dot"></span>
              <span>${entry.item_display || formatActionLabel(entry.action_type)}</span>
            </div>
            <div class="recent-meta">
              <span class="${recentPillClass(entry.action_type)}">${formatActionLabel(entry.action_type)}</span>
              <span>Qty: ${entry.quantity || 1}</span>
              <span>${new Date(entry.timestamp).toLocaleString()}</span>
            </div>
          </div>
        </button>
      `).join('');

      recent.querySelectorAll('[data-activity-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.activityIndex);
          openActivityDetail(activityCache[idx]);
        });
      });
    }
  }

  renderHomeCharts(overview.sales_overview || []);
  renderHomeStockStatusText(overview.stock_status_text || null, overview.stock_status_summary || []);
}

function getTotalPages(totalRows, rowsPerPage) {
  return Math.max(1, Math.ceil(totalRows / rowsPerPage));
}

function updateTablePager({ prevId, nextId, infoId, page, totalPages }) {
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);
  const info = document.getElementById(infoId);

  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
  if (info) info.textContent = `Page ${page} of ${totalPages}`;
}

function renderItemsTable(data, page = 1) {
  const tbody = document.getElementById('itemsTable');
  if (!tbody) return;

  const totalPages = getTotalPages(data.length, INVENTORY_ROWS_PER_PAGE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  inventoryCurrentPage = safePage;

  const start = (safePage - 1) * INVENTORY_ROWS_PER_PAGE;
  const pagedRows = data.slice(start, start + INVENTORY_ROWS_PER_PAGE);

  tbody.innerHTML = pagedRows.map(item => `
    <tr>
      <td><div style="font-weight:700;">${item.item_name}</div><div style="color:#8a7c73; font-size:13px;">SKU: ${item.sku}</div></td>
      <td style="font-weight:700;">${item.qty_available}</td>
      <td>${item.last_movement_type ? `${friendlyMove(item.last_movement_type)} &bull; ${item.last_movement_at ? item.last_movement_at.substring(0,10) : ''}` : '-'}</td>
      <td><span class="status-pill ${item.status === 'IN_STOCK' ? 'status-instock' : 'status-wait'}">${item.status === 'IN_STOCK' ? 'In Stock' : 'Waiting Stock'}</span></td>
      <td><button class="action-btn" data-details="${item.item_id}">Details</button></td>
    </tr>
  `).join('');

  updateTablePager({
    prevId: 'inventoryPrevPage',
    nextId: 'inventoryNextPage',
    infoId: 'inventoryPageInfo',
    page: safePage,
    totalPages
  });

  tbody.querySelectorAll('[data-details]').forEach((btn) => {
    btn.addEventListener('click', () => openDetails(btn.dataset.details));
  });
}

function friendlyMove(code) {
  switch (code) {
    case 'STOCK_IN': return 'Stock In';
    case 'SOLD': return 'Sold';
    case 'STOCK_OUT': return 'Stock Out';
    case 'EDITED': return 'Edited';
    case 'CREATED': return 'Created';
    default: return code || '';
  }
}

function isItemWaitingStock(item) {
  if (!item) return false;

  const available = Number(item.qty_available || 0);
  const targetQty = Number(item.target_qty || 1);
  const threshold = targetQty > 0 ? targetQty * 0.25 : 0;

  if (targetQty <= 0) return available <= 0;
  return available <= threshold;
}

async function loadInventory() {
  const resp = await api('/api/items');
  itemsCache = resp.items;
  filteredItemsCache = [...itemsCache];
  renderItemsTable(filteredItemsCache, 1);
}

async function loadActivity() {
  const resp = await api('/api/activity');
  const tbody = document.getElementById('activityTable');
  if (!tbody) return;
  const filtered = resp.activity.filter(a => !['LOGIN', 'LOGOUT', 'REGISTER'].includes(a.action_type));
  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td>${formatActivityDate(a.timestamp)}</td>
      <td>${a.item_display || ''}</td>
      <td><span class="status-pill ${actionPillClass(a.action_type)}">${formatActionLabel(a.action_type)}</span></td>
      <td>${a.quantity || ''}</td>
      <td>${a.sold_price ? formatPeso(a.sold_price) : ''}</td>
    </tr>
  `).join('');
}

function actionPillClass(action) {
  if (action === 'ADD_ITEM') return 'status-add';
  if (action === 'STOCK_IN') return 'status-stockin';
  if (action === 'MARK_SOLD' || action === 'SOLD') return 'status-sold';
  if (action === 'WAITING_STOCK') return 'status-waiting';
  return 'status-neutral';
}

function formatPeso(val) {
  const num = Number(val || 0);
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

function formatActivityDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatActionLabel(action) {
  return (action || '')
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function updatePairStatusSelectStyle(select) {
  if (!select) return;
  select.classList.remove('status-available', 'status-sold');
  if (select.value === 'SOLD') {
    select.classList.add('status-sold');
  } else {
    select.classList.add('status-available');
  }
}

function validatePasswordRules(password) {
  if ((password || '').length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character.';
  return '';
}

function recentPillClass(action) {
  if (action === 'MARK_SOLD' || action === 'SOLD') return 'pill-mark-sold';
  if (action === 'STOCK_IN') return 'pill-stockin';
  if (action === 'ADD_ITEM') return 'pill-add';
  if (action === 'WAITING_STOCK') return 'pill-waiting';
  return 'pill-neutral';
}

function applyInventoryFilter(term = '') {
  const lowerTerm = term.toLowerCase();
  filteredItemsCache = itemsCache.filter((item) =>
    [item.item_name, item.sku, item.colorway, item.brand_name].some((field) => (field || '').toLowerCase().includes(lowerTerm))
  );
  renderItemsTable(filteredItemsCache, 1);
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    applyInventoryFilter(e.target.value || '');
  });
}

const inventoryPrevPage = document.getElementById('inventoryPrevPage');
if (inventoryPrevPage) {
  inventoryPrevPage.addEventListener('click', () => {
    if (inventoryCurrentPage > 1) {
      renderItemsTable(filteredItemsCache, inventoryCurrentPage - 1);
    }
  });
}

const inventoryNextPage = document.getElementById('inventoryNextPage');
if (inventoryNextPage) {
  inventoryNextPage.addEventListener('click', () => {
    const totalPages = getTotalPages(filteredItemsCache.length, INVENTORY_ROWS_PER_PAGE);
    if (inventoryCurrentPage < totalPages) {
      renderItemsTable(filteredItemsCache, inventoryCurrentPage + 1);
    }
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const inv = document.getElementById('inventoryList');
    const log = document.getElementById('activityLog');
    if (!inv || !log) return;
    if (btn.dataset.tab === 'inventoryList') {
      inv.style.display = 'block';
      log.style.display = 'none';
    } else {
      inv.style.display = 'none';
      log.style.display = 'block';
    }
  });
});

// Add item modal
let editingItemId = null;
const addItemBtn = document.getElementById('addItemBtn');
if (addItemBtn) {
  addItemBtn.addEventListener('click', () => {
    openAddItemModal();
  });
}

function openAddItemModal(item = null) {
  editingItemId = item ? item.item_id : null;

  const modalContent = getTemplateClone('addItemModalTemplate');
  if (!modalContent) return;

  const isEdit = Boolean(item);
  const title = modalContent.querySelector('#addItemModalTitle');
  if (title) title.textContent = isEdit ? `Edit Item for ${item.item_name}` : 'Add New Item';

  const nameInput = modalContent.querySelector('#aiName');
  if (nameInput) nameInput.value = item ? item.item_name : '';

  const skuInput = modalContent.querySelector('#aiSku');
  if (skuInput) {
    skuInput.value = item ? item.sku : '';
    skuInput.disabled = isEdit;
  }

  const colorInput = modalContent.querySelector('#aiColor');
  if (colorInput) colorInput.value = item ? item.colorway : '';

  const brandSelect = modalContent.querySelector('#aiBrand');
  if (brandSelect) brandSelect.value = item ? String(item.brand_id || '') : '';

  const targetInput = modalContent.querySelector('#aiTargetQty');
  if (targetInput) targetInput.value = item ? Number(item.target_qty || 1) : 1;

  const saveBtnTemplate = modalContent.querySelector('#saveItemBtn');
  if (saveBtnTemplate) saveBtnTemplate.textContent = isEdit ? 'Save Changes' : 'Create Item';

  modalContent.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  openModal(modalContent);

  const saveBtn = document.getElementById('saveItemBtn');
  if (saveBtn) saveBtn.onclick = submitAddItem;
}


async function submitAddItem() {
  const item_name = document.getElementById('aiName').value.trim();
  const skuInput = document.getElementById('aiSku');
  const sku = skuInput ? skuInput.value.trim() : '';
  const colorway = document.getElementById('aiColor').value.trim();
  const brand_id = Number(document.getElementById('aiBrand').value || 0);
  const target_qty = Number(document.getElementById('aiTargetQty').value || 0);
  if (!item_name || !colorway || !brand_id || !Number.isFinite(target_qty) || target_qty < 1 || (!editingItemId && !sku)) {
    return showToast('Please complete all required fields', false);
  }

  try {
    if (editingItemId) {
      await api(`/api/items/${editingItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name, colorway, brand_id, target_qty: Math.floor(target_qty) })
      });
      showToast('Item updated successfully');
    } else {
      await api('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name, sku, colorway, brand_id, target_qty: Math.floor(target_qty) })
      });
      showToast('Item created');
    }
    closeModal();
    await loadInventory();
    await loadActivity();
  } catch (err) {
    showToast(err.message, false);
  }
}

function openModal(content) {
  const modal = document.getElementById('genericModal');
  if (!modal) return;

  modal.innerHTML = '';
  if (typeof content === 'string') {
    modal.innerHTML = content;
  } else if (content instanceof Node) {
    modal.appendChild(content);
  }

  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.style.display = 'flex';
}
function closeModal() {
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) backdrop.style.display = 'none';
  const modal = document.getElementById('genericModal');
  if (modal) modal.innerHTML = '';
  editingItemId = null;
}
window.closeModal = closeModal;
window.openAddItemModal = openAddItemModal;

async function openDetails(itemId) {
  const item = itemsCache.find(i => i.item_id == itemId);
  const pairsResp = await api(`/api/pairs/item/${itemId}`);
  const pairs = pairsResp.pairs;
  const availableCount = pairs.filter((p) => p.status === 'AVAILABLE').length;
  const soldCount = pairs.filter((p) => p.status === 'SOLD').length;
  const targetQty = Number(item.target_qty || 1);
  const waitingThreshold = targetQty > 0 ? targetQty * 0.25 : 0;
  const isWaitingStock = targetQty <= 0 ? availableCount <= 0 : availableCount <= waitingThreshold;
  const isOutOfStock = availableCount <= 0;
  const itemStatusLabel = isWaitingStock ? 'Waiting Stock' : 'In Stock';
  const itemStatusClass = isWaitingStock ? 'status-wait' : 'status-instock';

  const modalContent = getTemplateClone('itemDetailsModalTemplate');
  if (!modalContent) return;

  const setText = (selector, value) => {
    const el = modalContent.querySelector(selector);
    if (el) el.textContent = value;
  };

  setText('#detailItemName', item.item_name);
  setText('#detailColorway', item.colorway);
  setText('#detailCondition', item.item_condition || 'Brand New');
  setText('#detailQty', String(availableCount));
  setText('#detailTargetQty', String(targetQty));
  setText('#detailSku', item.sku);
  setText('#detailBrand', item.brand_name);
  setText('#detailTotalSold', String(soldCount));
  setText('#detailPairsSku', item.sku);

  const statusPill = modalContent.querySelector('#detailStatus');
  if (statusPill) {
    statusPill.textContent = itemStatusLabel;
    statusPill.className = `status-pill ${itemStatusClass}`;
  }

  const waitingAlert = modalContent.querySelector('#detailWaitingAlert');
  if (waitingAlert) {
    if (isWaitingStock) {
      waitingAlert.style.display = 'block';
      waitingAlert.textContent = isOutOfStock
        ? 'Item is waiting for restock.'
        : `Waiting Stock is active (Available: ${availableCount}, threshold: <= ${waitingThreshold.toFixed(2)} from target ${targetQty}).`;
    } else {
      waitingAlert.style.display = 'none';
      waitingAlert.textContent = '';
    }
  }

  const pairsBody = modalContent.querySelector('#detailPairsTableBody');
  const pairsPrevBtn = modalContent.querySelector('#pairsPrevPage');
  const pairsNextBtn = modalContent.querySelector('#pairsNextPage');
  const pairsPageInfo = modalContent.querySelector('#pairsPageInfo');

  let pairsCurrentPage = 1;

  const updatePairsPager = () => {
    const totalPages = getTotalPages(pairs.length, PAIRS_ROWS_PER_PAGE);
    if (pairsPrevBtn) pairsPrevBtn.disabled = pairsCurrentPage <= 1;
    if (pairsNextBtn) pairsNextBtn.disabled = pairsCurrentPage >= totalPages;
    if (pairsPageInfo) pairsPageInfo.textContent = `Page ${pairsCurrentPage} of ${totalPages}`;
  };

  const bindPairStatusListeners = () => {
    if (!pairsBody) return;

    pairsBody.querySelectorAll('[data-status-pair]').forEach((select) => {
      updatePairStatusSelectStyle(select);
      select.addEventListener('change', async (event) => {
        const nextStatus = event.target.value;
        if (nextStatus === 'AVAILABLE') {
          event.target.value = event.target.dataset.originalStatus || 'AVAILABLE';
          updatePairStatusSelectStyle(event.target);
          return;
        }

        const sold = await markSold(event.target.dataset.statusPair, itemId, isWaitingStock);
        if (!sold) {
          event.target.value = event.target.dataset.originalStatus || 'AVAILABLE';
        }
        updatePairStatusSelectStyle(event.target);
      });
    });
  };

  const renderPairsTablePage = () => {
    if (!pairsBody) return;

    const totalPages = getTotalPages(pairs.length, PAIRS_ROWS_PER_PAGE);
    pairsCurrentPage = Math.min(Math.max(1, pairsCurrentPage), totalPages);

    const start = (pairsCurrentPage - 1) * PAIRS_ROWS_PER_PAGE;
    const pagedPairs = pairs.slice(start, start + PAIRS_ROWS_PER_PAGE);

    if (!pagedPairs.length) {
      pairsBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#8a7c73;">No pairs found</td></tr>';
      updatePairsPager();
      return;
    }

    pairsBody.innerHTML = pagedPairs.map((p) => {
      const soldDateText = p.sold_at ? `Sold on ${p.sold_at.substring(0, 10)}` : '-';
      const statusDisabled = p.status === 'SOLD';
      const editBtnHtml = p.status === 'AVAILABLE'
        ? `<button class="edit-pair-btn" type="button" data-edit-pair="${p.pair_id}" aria-label="Edit ${p.pair_code}" title="Edit Pair"><i class="fa fa-pen"></i></button>`
        : '';

      return `
        <tr>
          <td class="pair-id-cell">${p.pair_code}</td>
          <td>${p.us_size}</td>
          <td>${p.gender || ''}</td>
          <td>${p.pair_condition}</td>
          <td>${formatPeso(p.cost_price)}</td>
          <td>${formatPeso(p.selling_price)}</td>
          <td>
            <select class="pair-status-select ${p.status === 'AVAILABLE' ? 'status-available' : 'status-sold'}" data-status-pair="${p.pair_id}" data-original-status="${p.status}" ${statusDisabled ? 'disabled' : ''}>
              <option value="AVAILABLE" ${p.status === 'AVAILABLE' ? 'selected' : ''} style="color:#1f7a4e;">Available</option>
              <option value="SOLD" ${p.status === 'SOLD' ? 'selected' : ''} style="color:#c45555;">Sold</option>
            </select>
          </td>
          <td>
            <div class="sold-date-cell">
              <span class="sold-date">${soldDateText}</span>
              ${editBtnHtml}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    updatePairsPager();
    bindPairStatusListeners();

    pairsBody.querySelectorAll('[data-edit-pair]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pairToEdit = pairs.find((entry) => String(entry.pair_id) === String(btn.dataset.editPair));
        if (pairToEdit) renderStockInForm(item, pairToEdit);
      });
    });
  };
  if (pairsPrevBtn) {
    pairsPrevBtn.addEventListener('click', () => {
      if (pairsCurrentPage > 1) {
        pairsCurrentPage -= 1;
        renderPairsTablePage();
      }
    });
  }

  if (pairsNextBtn) {
    pairsNextBtn.addEventListener('click', () => {
      const totalPages = getTotalPages(pairs.length, PAIRS_ROWS_PER_PAGE);
      if (pairsCurrentPage < totalPages) {
        pairsCurrentPage += 1;
        renderPairsTablePage();
      }
    });
  }

  renderPairsTablePage();

  modalContent.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  const stockInBtn = modalContent.querySelector('#stockInBtn');
  if (stockInBtn) stockInBtn.addEventListener('click', () => renderStockInForm(item));

  const editItemBtn = modalContent.querySelector('#editItemFromDetailsBtn');
  if (editItemBtn) {
    editItemBtn.addEventListener('click', () => openAddItemModal(item));
  }

  openModal(modalContent);
}

function renderStockInForm(item, pair = null) {
  const isEdit = Boolean(pair);
  const itemId = item.item_id;
  const itemName = item.item_name || 'Item';

  const modalContent = getTemplateClone('stockInModalTemplate');
  if (!modalContent) return;

  const title = modalContent.querySelector('#stockInModalTitle');
  if (title) title.textContent = isEdit ? `Edit Pair Details for ${itemName}` : `Stock In New Pair for ${itemName}`;

  const pairIdGroup = modalContent.querySelector('#stockInPairIdGroup');
  if (pairIdGroup) pairIdGroup.style.display = isEdit ? '' : 'none';

  const pairCodeInput = modalContent.querySelector('#siPairCode');
  if (pairCodeInput && isEdit) pairCodeInput.value = pair.pair_code;

  const sizeInput = modalContent.querySelector('#siSize');
  if (sizeInput) sizeInput.value = pair ? pair.us_size : '';

  const genderSelect = modalContent.querySelector('#siGender');
  if (genderSelect) genderSelect.value = pair ? String(pair.gender || '') : '';

  const conditionSelect = modalContent.querySelector('#siCondition');
  if (conditionSelect) conditionSelect.value = pair ? pair.pair_condition : 'New';

  const costInput = modalContent.querySelector('#siCost');
  if (costInput) costInput.value = pair ? Number(pair.cost_price) : '';

  const sellInput = modalContent.querySelector('#siSell');
  if (sellInput) sellInput.value = pair ? Number(pair.selling_price) : '';

  modalContent.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  openModal(modalContent);

  const savePairBtn = document.getElementById('savePairBtn');
  if (!savePairBtn) return;

  savePairBtn.onclick = async () => {
    const payload = {
      us_size: document.getElementById('siSize').value.trim(),
      gender: document.getElementById('siGender').value,
      pair_condition: document.getElementById('siCondition').value,
      cost_price: Number(document.getElementById('siCost').value),
      selling_price: Number(document.getElementById('siSell').value)
    };

    if (!payload.us_size || !payload.gender || !payload.pair_condition || !payload.cost_price || !payload.selling_price) {
      return showToast('Please complete all pair fields', false);
    }

    try {
      if (isEdit) {
        await api(`/api/pairs/${pair.pair_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Pair updated');
      } else {
        await api(`/api/pairs/item/${itemId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Pair added');
      }
      closeModal();
      await loadInventory();
      await loadActivity();
    } catch (err) {
      showToast(err.message, false);
    }
  };
}


async function markSold(pairId, itemId, isWaitingStock = false) {
  if (isWaitingStock) {
    alert('This item is in Waiting Stock and cannot be sold yet until restocked.');
    return false;
  }

  if (!confirm('Mark this pair as sold?')) return false;

  try {
    await api(`/api/pairs/${pairId}/mark-sold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    showToast('Pair marked as sold');
    closeModal();
    await loadInventory();
    await loadActivity();
    return true;
  } catch (err) {
    if ((err.message || '').includes('cannot be sold')) {
      alert('This item is in Waiting Stock and cannot be sold yet until restocked.');
    }
    showToast(err.message, false);
    return false;
  }
}

const downloadCsv = document.getElementById('downloadCsv');
if (downloadCsv) {
  downloadCsv.addEventListener('click', () => {
    const rows = [['Item Name','SKU','Brand','Colorway','Qty','Status','Last Movement']];
    itemsCache.forEach(i => rows.push([
      i.item_name, i.sku, i.brand_name, i.colorway, i.qty_available,
      i.status, friendlyMove(i.last_movement_type)+' '+(i.last_movement_at || '')
    ]));
    const csv = rows.map(r => r.map(val => `"${val}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory.csv'; a.click();
    URL.revokeObjectURL(url);
  });
}

// Settings
const setSuffixSelect = document.getElementById('setSuffix');
if (setSuffixSelect) {
  syncSelectPlaceholderState(setSuffixSelect);
  setSuffixSelect.addEventListener('change', () => syncSelectPlaceholderState(setSuffixSelect));
}

const setGenderSelect = document.getElementById('setGender');
if (setGenderSelect) {
  syncSelectPlaceholderState(setGenderSelect);
}

const setPhoneInput = document.getElementById('setPhone');
if (setPhoneInput) {
  setPhoneInput.addEventListener('input', (event) => {
    event.target.value = normalizePhoneNumber(event.target.value);
  });
}

const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    try {
      const last_name = document.getElementById('setLastName').value.trim();
      const first_name = document.getElementById('setFirstName').value.trim();
      const middle_name = document.getElementById('setMiddleName').value.trim();
      const suffix = (document.getElementById('setSuffix').value || '').trim();
      const phone_number = normalizePhoneNumber(document.getElementById('setPhone').value.trim());
      const username = document.getElementById('setUsername').value.trim();
      const email = document.getElementById('setEmail').value.trim();

      if (!last_name || !first_name || !middle_name || !phone_number || !username || !email) {
        return showToast('Last name, first name, middle name, phone number, username, and email are required.', false);
      }

      if (!/^\d{9}$/.test(phone_number)) {
        return showToast('Phone number must be 9 digits after +639 (example: +639123456789).', false);
      }

      await api('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_name, first_name, middle_name, suffix: suffix || null, phone_number, username, email })
      });

      currentUser.last_name = last_name;
      currentUser.first_name = first_name;
      currentUser.middle_name = middle_name;
      currentUser.suffix = suffix || null;
      currentUser.phone_number = phone_number;
      currentUser.name = buildFullName(last_name, first_name, middle_name, suffix);
      currentUser.username = username;
      currentUser.email = email;

      const welcomeName = document.getElementById('welcomeName');
      if (welcomeName) {
        welcomeName.textContent = first_name || username;
      }

      showToast('Profile updated successfully');
    } catch (err) { showToast(err.message, false); }
  });
}
const savePassBtn = document.getElementById('savePassBtn');
if (savePassBtn) {
  savePassBtn.addEventListener('click', async () => {
    const currentPassword = document.getElementById('curPass').value;
    const newPassword = document.getElementById('newPass').value;
    const newPassword2 = document.getElementById('newPass2').value;
    if (newPassword !== newPassword2) return showToast('Passwords do not match', false);
    if (!newPassword) return showToast('Enter new password', false);
    const policyMessage = validatePasswordRules(newPassword);
    if (policyMessage) return showToast(policyMessage, false);
    try {
      await api('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      showToast('Password updated successfully');
    } catch (err) { showToast(err.message, false); }
  });
}


function openActivityDetail(entry) {
  if (!entry) return;

  const modalContent = getTemplateClone('activityDetailModalTemplate');
  if (!modalContent) return;

  const setValue = (selector, value) => {
    const el = modalContent.querySelector(selector);
    if (el) el.value = value;
  };

  setValue('#adAction', formatActionLabel(entry.action_type));
  setValue('#adDateTime', formatActivityDate(entry.timestamp));
  setValue('#adItem', entry.item_display || '-');
  setValue('#adQty', entry.quantity || 1);
  setValue('#adSoldPrice', entry.sold_price ? formatPeso(entry.sold_price) : '-');
  setValue('#adDescription', entry.description || '-');

  modalContent.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  openModal(modalContent);
}

const homeCharts = {};

function destroyChart(chartMap, key) {
  if (chartMap[key]) {
    chartMap[key].destroy();
    delete chartMap[key];
  }
}

function renderHomeCharts(salesOverview) {
  if (!window.Chart) return;

  registerAnalyticsPlugins();

  const salesCanvas = document.getElementById('homeSalesOverview');
  if (!salesCanvas) return;

  destroyChart(homeCharts, 'homeSalesOverview');

  const rows = Array.isArray(salesOverview) ? salesOverview : [];
  const safeRows = rows.length
    ? rows
    : [{ date: new Date().toISOString().slice(0, 10), sales_amount: 0, items_sold: 0 }];

  homeCharts.homeSalesOverview = new Chart(salesCanvas, {
    type: 'line',
    data: {
      labels: safeRows.map((row) => getAnalyticsDateLabel(row.date)),
      datasets: [
        {
          label: 'Sales (PHP)',
          data: safeRows.map((row) => Number(row.sales_amount || 0)),
          borderColor: '#c95f3a',
          backgroundColor: 'rgba(201,95,58,0.12)',
          borderWidth: 3,
          fill: false,
          tension: 0,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBackgroundColor: '#c95f3a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => `Sales: ${formatPeso(item.raw || 0)}`
        })
      },
      scales: {
        x: {
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: {
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12 },
            callback: (v) => (Number(v) >= 1000 ? `PHP ${(Number(v) / 1000).toFixed(1)}K` : `PHP ${v}`)
          }
        }
      }
    }
  });
}

function renderHomeStockStatusText(stockStatusText, stockSummary) {
  const container = document.getElementById('homeStockStatusText');
  if (!container) return;

  const fallbackInStock = Number((stockSummary.find((row) => row.status_label === 'In Stock') || {}).count || 0);
  const fallbackWaiting = Number((stockSummary.find((row) => row.status_label === 'Waiting Stock') || {}).count || 0);

  const inStockItems = Number(stockStatusText?.in_stock_items ?? fallbackInStock);
  const waitingStockItems = Number(stockStatusText?.waiting_stock_items ?? fallbackWaiting);
  const inStockPairs = Number(stockStatusText?.in_stock_pairs ?? inStockItems);

  const summaryText = stockStatusText?.summary_text
    || `In Stock: ${inStockPairs} pair${inStockPairs === 1 ? '' : 's'} | Waiting Stock: ${waitingStockItems} item${waitingStockItems === 1 ? '' : 's'}`;

  const inStockText = stockStatusText?.in_stock_text
    || `In Stock: ${inStockPairs} pair${inStockPairs === 1 ? '' : 's'}`;

  const waitingStockText = stockStatusText?.waiting_stock_text
    || `Waiting Stock: ${waitingStockItems} item${waitingStockItems === 1 ? '' : 's'} (Stock below 25%)`;

  container.innerHTML = `
    <p class="stock-summary-head">${summaryText}</p>
    <div class="stock-text-line in-stock">
      <strong>${inStockText}</strong>
    </div>
    <div class="stock-text-line waiting">
      <strong>${waitingStockText}</strong>
    </div>
  `;
}


// Analytics
const analyticsCharts = {};

function formatPesoCompact(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) return `₱${(num / 1000).toFixed(1)}K`;
  return `₱${num.toFixed(2)}`;
}

function getAnalyticsDateLabel(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue || '');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sortSizeLabel(a, b) {
  const parse = (label) => {
    const raw = String(label || '').trim();
    const match = raw.match(/^(\d+(?:\.\d+)?)(?:\s+(.*))?$/);
    if (!match) return { number: Number.MAX_SAFE_INTEGER, suffix: raw.toUpperCase() };
    return { number: Number(match[1]), suffix: String(match[2] || '').trim().toUpperCase() };
  };
  const aa = parse(a);
  const bb = parse(b);
  if (aa.number !== bb.number) return aa.number - bb.number;
  return aa.suffix.localeCompare(bb.suffix);
}


function getSharedGridColor() {
  return '#e9e0da';
}

function getSharedTickColor() {
  return '#6e645f';
}

function buildTooltipStyle(callbacks = {}) {
  return {
    backgroundColor: '#ffffff',
    titleColor: '#1f2937',
    bodyColor: '#1f2937',
    borderColor: '#e2d9d2',
    borderWidth: 1,
    cornerRadius: 14,
    padding: 12,
    displayColors: false,
    titleFont: { family: 'Poppins', size: 14, weight: '600' },
    bodyFont: { family: 'Poppins', size: 12, weight: '500' },
    callbacks
  };
}

function registerAnalyticsPlugins() {
  if (!window.Chart || window.__analyticsPluginsRegistered) return;

  const hoverBandPlugin = {
    id: 'hoverBandPlugin',
    beforeDatasetsDraw(chart) {
      if (!chart || !chart.tooltip || !chart.chartArea) return;
      if (!['line', 'bar'].includes(chart.config.type)) return;

      const active = chart.tooltip.getActiveElements();
      if (!active || !active.length) return;

      const xScale = chart.scales.x;
      if (!xScale) return;

      const idx = active[0].index;
      const center = xScale.getPixelForValue(idx);
      if (!Number.isFinite(center)) return;

      const prev = xScale.getPixelForValue(Math.max(0, idx - 1));
      const next = xScale.getPixelForValue(Math.min(xScale.ticks.length - 1, idx + 1));
      let width = Math.abs(next - prev);
      if (!Number.isFinite(width) || width <= 0) width = 60;
      width = Math.max(42, Math.min(130, width));

      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.fillStyle = 'rgba(112, 103, 96, 0.20)';
      ctx.fillRect(center - (width / 2), chartArea.top, width, chartArea.bottom - chartArea.top);
      ctx.restore();
    }
  };

  const pieOutLabelPlugin = {
    id: 'pieOutLabelPlugin',
    afterDatasetsDraw(chart) {
      if (!chart || chart.config.type !== 'pie') return;
      const pluginOptions = chart.options?.plugins?.pieOutLabelPlugin;
      if (pluginOptions && pluginOptions.enabled === false) return;

      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data.length) return;

      const total = chart.data.datasets[0].data.reduce((sum, value) => sum + Number(value || 0), 0);
      if (!total) return;

      const { ctx } = chart;
      ctx.save();
      ctx.font = '500 12px Poppins';
      ctx.textBaseline = 'middle';

      meta.data.forEach((arc, index) => {
        const value = Number(chart.data.datasets[0].data[index] || 0);
        if (!value) return;

        const label = chart.data.labels[index];
        const pct = Math.round((value / total) * 100);
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const x0 = arc.x + Math.cos(angle) * arc.outerRadius;
        const y0 = arc.y + Math.sin(angle) * arc.outerRadius;
        const x1 = arc.x + Math.cos(angle) * (arc.outerRadius + 16);
        const y1 = arc.y + Math.sin(angle) * (arc.outerRadius + 16);
        const rightSide = Math.cos(angle) >= 0;
        const x2 = x1 + (rightSide ? 16 : -16);

        ctx.strokeStyle = chart.data.datasets[0].backgroundColor[index] || '#7b6f68';
        ctx.fillStyle = chart.data.datasets[0].backgroundColor[index] || '#7b6f68';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.stroke();

        ctx.textAlign = rightSide ? 'left' : 'right';
        ctx.fillText(`${label}: ${pct}%`, x2 + (rightSide ? 4 : -4), y1);
      });

      ctx.restore();
    }
  };

  Chart.register(hoverBandPlugin, pieOutLabelPlugin);
  window.__analyticsPluginsRegistered = true;
}

function destroyChartMap(chartMap) {
  Object.keys(chartMap).forEach((key) => {
    if (chartMap[key]) {
      chartMap[key].destroy();
      delete chartMap[key];
    }
  });
}

function renderAnalyticsSummary(summary, monthlyProfit = []) {
  const top = document.getElementById('analyticsTop');
  if (!top) return;

  const soldPairs = Number(summary.sold_pairs || 0);
  const availablePairs = Number(summary.available_pairs || 0);
  const marginPct = Number(summary.total_sales || 0) === 0
    ? 0
    : (Number(summary.total_profit || 0) / Number(summary.total_sales || 1)) * 100;

  top.innerHTML = `
    <article class="card analytics-kpi-card analytics-kpi-sales">
      <div class="analytics-kpi-top">
        <div>
          <p class="analytics-kpi-label">Total Sales</p>
          <p class="analytics-kpi-value">${formatPesoCompact(summary.total_sales)}</p>
          <p class="analytics-kpi-sub">${soldPairs} items sold</p>
        </div>
        <span class="analytics-kpi-icon"><i class="fa-solid fa-peso-sign"></i></span>
      </div>
      <div class="analytics-kpi-bar"><span style="width:100%"></span></div>
    </article>

    <article class="card analytics-kpi-card analytics-kpi-profit profit-click-card" id="openProfitByMonth" role="button" tabindex="0">
      <div class="analytics-kpi-top">
        <div>
          <p class="analytics-kpi-label">Total Profit</p>
          <p class="analytics-kpi-value">${formatPesoCompact(summary.total_profit)}</p>
          <p class="analytics-kpi-sub">${marginPct.toFixed(1)}% margin</p>
        </div>
        <span class="analytics-kpi-icon"><i class="fa-solid fa-arrow-trend-up"></i></span>
      </div>
      <div class="analytics-kpi-bar"><span style="width:100%"></span></div>
    </article>

    <article class="card analytics-kpi-card analytics-kpi-inventory">
      <div class="analytics-kpi-top">
        <div>
          <p class="analytics-kpi-label">Current Stock Cost</p>
          <p class="analytics-kpi-value">${formatPesoCompact(summary.inventory_value)}</p>
          <p class="analytics-kpi-sub">${availablePairs} pairs available</p>
        </div>
        <span class="analytics-kpi-icon"><i class="fa-solid fa-bag-shopping"></i></span>
      </div>
      <div class="analytics-kpi-bar"><span style="width:100%"></span></div>
    </article>

    <article class="card analytics-kpi-card analytics-kpi-rate">
      <div class="analytics-kpi-top">
        <div>
          <p class="analytics-kpi-label">Sell-through Rate</p>
          <p class="analytics-kpi-value">${Number(summary.sell_through_rate || 0).toFixed(1)}%</p>
          <p class="analytics-kpi-sub">Conversion metric</p>
        </div>
        <span class="analytics-kpi-icon"><i class="fa-solid fa-percent"></i></span>
      </div>
      <div class="analytics-kpi-bar"><span style="width:100%"></span></div>
    </article>
  `;

  const sortedByMonth = [...monthlyProfit].sort((a, b) => (b.month_key || '').localeCompare(a.month_key || ''));

  const profitCard = document.getElementById('openProfitByMonth');
  if (profitCard) {
    const openProfitHandler = () => openProfitPerMonthModal(sortedByMonth);
    profitCard.addEventListener('click', openProfitHandler);
    profitCard.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProfitHandler();
      }
    });
  }
}

function openProfitPerMonthModal(monthlyProfit = []) {
  const modalContent = getTemplateClone('profitByMonthModalTemplate');
  if (!modalContent) return;

  const sortedRows = [...monthlyProfit].sort((a, b) => (b.month_key || '').localeCompare(a.month_key || ''));
  const tbody = modalContent.querySelector('#profitByMonthTableBody');
  if (tbody) {
    if (!sortedRows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#8a7c73;">No monthly profit data yet</td></tr>';
    } else {
      tbody.innerHTML = sortedRows.map((row) => `
        <tr>
          <td>${row.month_label}</td>
          <td>${row.sold_pairs}</td>
          <td>${formatPeso(row.total_sales)}</td>
          <td>${formatPeso(row.total_cost)}</td>
          <td>${formatPeso(row.total_profit)}</td>
        </tr>
      `).join('');
    }
  }

  modalContent.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  openModal(modalContent);
}

async function loadAnalytics() {
  const top = document.getElementById('analyticsTop');
  if (!top) return;

  try {
    registerAnalyticsPlugins();
    destroyChartMap(analyticsCharts);

    const analytics = await api('/api/analytics');
    const summary = analytics.summary || {};

    renderAnalyticsSummary(summary, analytics.profit_per_month || []);
    renderSalesTrendChart('chartSalesTrend', analytics.sales_trend || []);
    renderStockMovementChart('chartMovementTrend', analytics.stock_movement_trend || []);
    renderStockStatusDistributionChart('chartStockStatusDistribution', analytics.stock_status_distribution || []);
    renderBrandDistributionChart('chartBrandDistribution', analytics.brand_distribution || []);
    renderSizeDistributionChart('chartSizeDistribution', analytics.size_distribution || []);
  } catch (err) {
    showToast(err.message || 'Failed to load analytics data', false);
  }
}

function renderSalesTrendChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rows = data.length ? data : [{ date: new Date().toISOString().slice(0, 10), sales_amount: 0, items_sold: 0 }];
  const labels = rows.map((row) => getAnalyticsDateLabel(row.date));
  const sales = rows.map((row) => Number(row.sales_amount || 0));
  const soldQty = rows.map((row) => Number(row.items_sold || 0));

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sales (PHP)',
          data: sales,
          borderColor: '#c95f3a',
          backgroundColor: 'rgba(201,95,58,0.12)',
          borderWidth: 3,
          fill: false,
          tension: 0,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointBackgroundColor: '#c95f3a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Items Sold',
          data: soldQty,
          borderColor: '#7f4a3a',
          backgroundColor: '#7f4a3a',
          borderWidth: 2,
          tension: 0,
          pointRadius: 3,
          pointHoverRadius: 4,
          pointBackgroundColor: '#7f4a3a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          borderDash: [5, 5],
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12, weight: '500' }
          }
        },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => item.dataset.label === 'Sales (PHP)'
            ? `Sales: ${formatPeso(item.raw || 0)}`
            : `Items Sold: ${item.formattedValue}`
        })
      },
      scales: {
        x: {
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        },
        y: {
          beginAtZero: true,
          position: 'left',
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: {
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12 },
            callback: (v) => (Number(v) >= 1000 ? `₱${(Number(v) / 1000).toFixed(1)}K` : `₱${v}`)
          }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        }
      }
    }
  });
}

function renderStockMovementChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rows = data.length ? data : [{ date: new Date().toISOString().slice(0, 10), sold: 0, stock_in: 0 }];
  const labels = rows.map((row) => getAnalyticsDateLabel(row.date));

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sold',
          data: rows.map((row) => Number(row.sold || 0)),
          borderColor: '#c95f3a',
          backgroundColor: '#c95f3a',
          borderWidth: 3,
          borderDash: [5, 5],
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#c95f3a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        },
        {
          label: 'Stock In',
          data: rows.map((row) => Number(row.stock_in || 0)),
          borderColor: '#14b37a',
          backgroundColor: '#14b37a',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 6,
          pointBackgroundColor: '#14b37a',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12, weight: '500' }
          }
        },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => `${item.dataset.label}: ${item.formattedValue}`
        })
      },
      scales: {
        x: {
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        }
      }
    }
  });
}

function renderStockStatusDistributionChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rows = data.length
    ? data
    : [{ status_label: 'In Stock', count: 0 }, { status_label: 'Waiting Stock', count: 0 }];

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: rows.map((row) => row.status_label),
      datasets: [{
        data: rows.map((row) => Number(row.count || 0)),
        backgroundColor: ['#1fb27a', '#f0a21b'],
        borderColor: '#ffffff',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        pieOutLabelPlugin: { enabled: false },
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12, weight: '500' }
          }
        },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => `Items: ${item.formattedValue}`
        })
      }
    }
  });
}

function renderBrandDistributionChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const rows = data.length
    ? data
    : [
      { brand_name: 'Nike', count: 0 },
      { brand_name: 'Adidas', count: 0 },
      { brand_name: 'Puma', count: 0 },
      { brand_name: 'New Balance', count: 0 },
      { brand_name: 'Others', count: 0 }
    ];

  const actualValues = rows.map((row) => Number(row.count || 0));
  const hasRealData = actualValues.some((value) => value > 0);
  const chartValues = hasRealData
    ? actualValues.map((value) => (value > 0 ? value : 0.001))
    : actualValues.map(() => 1);

  const colors = ['#c95f3a', '#2fa39d', '#f0b560', '#7f4a3a', '#d58456'];

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: rows.map((row) => row.brand_name),
      datasets: [{
        data: chartValues,
        backgroundColor: rows.map((_, idx) => colors[idx % colors.length]),
        borderColor: '#ffffff',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        pieOutLabelPlugin: { enabled: false },
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            color: getSharedTickColor(),
            font: { family: 'Poppins', size: 12, weight: '500' }
          }
        },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => `Pairs: ${actualValues[item.dataIndex] ?? 0}`
        })
      }
    }
  });
}

function renderSizeDistributionChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sorted = [...data].sort((a, b) => {
    const aLabel = a.size_gender_label || [a.us_size, a.gender].filter(Boolean).join(' ');
    const bLabel = b.size_gender_label || [b.us_size, b.gender].filter(Boolean).join(' ');
    return sortSizeLabel(aLabel, bLabel);
  });

  const labels = sorted.length
    ? sorted.map((row) => row.size_gender_label || [row.us_size, row.gender].filter(Boolean).join(' '))
    : ['-'];
  const values = sorted.length ? sorted.map((row) => Number(row.count || 0)) : [0];

  const palette = ['#1e3a8a', '#16a34a', '#fde68a', '#ef4444', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#84cc16', '#f97316'];
  const paletteHover = ['#1b347a', '#128b3f', '#f3d970', '#dc2626', '#0f9a90', '#d68a05', '#7a4bd2', '#0284c7', '#65a30d', '#ea580c'];

  const backgroundColor = labels.map((_, idx) => palette[idx % palette.length]);
  const hoverBackgroundColor = labels.map((_, idx) => paletteHover[idx % paletteHover.length]);

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor,
        hoverBackgroundColor,
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: buildTooltipStyle({
          title: (items) => (items.length ? items[0].label : ''),
          label: (item) => `Pairs Available: ${item.formattedValue}`
        })
      },
      scales: {
        x: {
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: getSharedGridColor(), borderDash: [4, 4], drawBorder: false },
          ticks: { color: getSharedTickColor(), font: { family: 'Poppins', size: 12 } }
        }
      }
    }
  });
}


// modal backdrop click to close
const modalBackdrop = document.getElementById('modalBackdrop');
if (modalBackdrop) {
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}

init();










