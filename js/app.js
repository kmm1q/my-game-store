let allGames = [];
const CART_KEY = 'game_cart';

function loadCart() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { raw = []; }
  if (!Array.isArray(raw)) raw = []; // 畸形 JSON（如 "{}"、"null"）兜底
  return raw.map(it => {
    // 旧格式：纯字符串商品 id → 视为合集
    if (typeof it === 'string') return { gid: it, mode: 'bundle' };
    // 畸形条目（null/数字等）跳过
    if (typeof it !== 'object' || it === null) return null;
    return { gid: it.gid, mode: it.mode === 'sub' ? 'sub' : 'bundle', subId: it.subId || null };
  }).filter(it => it && it.gid);
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cartItems)); }

let cartItems = loadCart();

function entryKey(e) {
  return (e.gid || '') + '|' + (e.mode === 'sub' ? 'sub' : 'bundle') + '|' + (e.subId || '');
}

function toggleCart(entry) {
  const key = entryKey(entry);
  const i = cartItems.findIndex(it => entryKey(it) === key);
  if (i >= 0) cartItems.splice(i, 1);
  else cartItems.push(entry);
  saveCart();
  renderCartBadge();
  renderCart();
  syncAllCartButtons();
  // 检测是否掉出已弹档位：若当前件数已不满足已弹档，清除记录，下次达到该档可再弹
  const items = getValidCartItems();
  const dismissedTier = promoDismissedTier();
  if (dismissedTier > 0 && getDiscountTier(items.length).tier < dismissedTier) {
    resetPromoDismissed();
  }
}

// 选版弹窗确认：确保加入购物车（已在购物车则保持不变，不触发移除）
function addToCart(entry) {
  const key = entryKey(entry);
  if (cartItems.some(it => entryKey(it) === key)) return;
  toggleCart(entry);
}

// 统一同步所有"加入购物车"按钮状态：按 cartItems 重算，保证删除后打勾状态还原
function syncAllCartButtons() {
  document.querySelectorAll('.card-add').forEach(btn => {
    const id = btn.dataset.id;
    const inCart = cartItems.some(it => it.gid === id);
    btn.classList.toggle('added', inCart);
    btn.textContent = inCart ? '✓' : '+';
  });
  const detailBtn = document.getElementById('detail-add-btn');
  if (detailBtn) {
    const id = detailBtn.dataset.gid;
    const inCart = id && cartItems.some(it => it.gid === id);
    detailBtn.classList.toggle('added', inCart);
    detailBtn.textContent = inCart ? '已在购物车 ✓' : '加入购物车';
  }
}

function renderCartBadge() {
  const badge = document.getElementById('cart-badge');
  const prev = badge.hidden ? 0 : parseInt(badge.textContent, 10) || 0;
  badge.hidden = cartItems.length === 0;
  badge.textContent = cartItems.length;
  // 数量变化时弹跳
  if (cartItems.length !== prev) {
    badge.classList.remove('bounce');
    void badge.offsetWidth; // 重启动画
    badge.classList.add('bounce');
  }
}

// 返回购物车行的展示信息；子项已被删除则返回 null（渲染时跳过该行）
function getCartItemInfo(entry) {
  const g = allGames.find(x => x.id === entry.gid);
  if (!g) return null;
  if (entry.mode === 'sub' && entry.subId) {
    const sub = (g.subs || []).find(s => s.id === entry.subId);
    if (!sub) return null;
    return {
      name: g.name + '·' + (sub.name || ''),
      price: sub.price,
      cover: sub.cover,
      game: g
    };
  }
  return { name: g.name, price: g.price, cover: g.cover, game: g };
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const empty = document.getElementById('cart-empty');
  const totalEl = document.getElementById('cart-total');
  list.innerHTML = '';
  let total = 0;
  cartItems.forEach(entry => {
    const info = getCartItemInfo(entry);
    if (!info) return; // 商品或子项已删除，跳过
    total += priceNumber(info.price);
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      ${info.cover && isSafeImageUrl(info.cover)
        ? `<img src="${info.cover}" alt="">`
        : '<span class="ci-placeholder">图</span>'}
      <span class="ci-name">${escapeHtml(info.name)}</span>
      <span class="ci-price">${priceHtml(info.price)}</span>
      <button class="ci-del" data-id="${escapeHtml(entryKey(entry))}" aria-label="移除">&times;</button>`;
    li.querySelector('.ci-del').addEventListener('click', () => {
      cartItems = cartItems.filter(it => entryKey(it) !== entryKey(entry));
      saveCart();
      renderCartBadge();
      renderCart();
      syncAllCartButtons();
    });
    list.appendChild(li);
  });
  const validItems = getValidCartItems();
  empty.hidden = validItems.length !== 0;
  const discounted = getDiscountTier(validItems.length);
  const finalTotal = Math.round(total * discounted.discount * 100) / 100;
  if (discounted.tier > 0) {
    totalEl.innerHTML = `<span class="total-strike">¥${priceDigits(total)}</span>` +
      `<span class="total-final">¥${priceDigits(finalTotal)}</span>` +
      `<span class="total-tag">${discounted.tier === 2 ? (getPromo().tier2Discount + '折') : (getPromo().tier1Discount + '折')}</span>`;
  } else {
    totalEl.textContent = '¥' + priceDigits(total);
  }
  const hasItems = validItems.length > 0;
  document.getElementById('btn-clear-cart').disabled = !hasItems;
  document.getElementById('btn-checkout').disabled = !hasItems;
}

function renderCartContact() {
  const contact = (window._siteData && window._siteData.contact) || {};
  const el = document.getElementById('cart-contact');
  if (contact.wechat || contact.qq) {
    el.innerHTML = `想买这些？加我<strong>微信：${escapeHtml(contact.wechat || '—')}</strong> / <strong>QQ：${escapeHtml(contact.qq || '—')}</strong>`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function openCart() {
  renderCart();
  renderCartContact();
  document.getElementById('cart-drawer').hidden = false;
  maybeShowDiscount();
}
function closeCart() {
  document.getElementById('cart-drawer').hidden = true;
}

const PROMO_DISMISS_KEY = 'promo_dismissed';

function getPromo() {
  const p = (window._siteData && window._siteData.promo) || {};
  return {
    title: p.title || '恭喜触发优惠！',
    btnText: p.btnText || '开心收下',
    tier1Count: p.tier1Count || 3,
    tier1Discount: p.tier1Discount || 9,
    tier1Text: p.tier1Text || '购买三件及以上商品，立享 9 折优惠！',
    tier2Count: p.tier2Count || 5,
    tier2Discount: p.tier2Discount || 8,
    tier2Text: p.tier2Text || '购买五件及以上商品，立享 8 折优惠！',
    guideText: p.guideText || '买三件还差两件就能享受八折啦，快再挑挑吧！'
  };
}

// 返回 { tier: 0=无优惠|1=9折|2=8折, discount: 折扣(如0.9), isTop: 是否最高档 }
function getDiscountTier(count) {
  const p = getPromo();
  if (count >= p.tier2Count) return { tier: 2, discount: p.tier2Discount / 10, isTop: true };
  if (count >= p.tier1Count) return { tier: 1, discount: p.tier1Discount / 10, isTop: false };
  return { tier: 0, discount: 1, isTop: false };
}

function getValidCartItems() {
  return cartItems.map(entry => {
    const info = getCartItemInfo(entry);
    return info ? { ...entry, info } : null;
  }).filter(Boolean);
}

// 已弹过的档位：1=9折档已弹，2=8折档已弹，0=未弹过
function promoDismissedTier() {
  return parseInt(localStorage.getItem(PROMO_DISMISS_KEY), 10) || 0;
}
function resetPromoDismissed() {
  localStorage.removeItem(PROMO_DISMISS_KEY);
}

function maybeShowDiscount() {
  const items = getValidCartItems();
  const t = getDiscountTier(items.length);
  if (t.tier === 0) return; // 不满足优惠，不弹
  // 只有升到更高的档位才弹；同档内弹过一次后不再重复弹
  if (t.tier <= promoDismissedTier()) return;
  applyPromoToModal(t);
  document.getElementById('discount-modal').hidden = false;
  localStorage.setItem(PROMO_DISMISS_KEY, String(t.tier));
}

function applyPromoToModal(t) {
  const p = getPromo();
  document.getElementById('discount-title').textContent = p.title;
  // 8折档：小狗动画；9折档：隐藏小狗，显示引导短句
  const track = document.getElementById('discount-track');
  const guide = document.getElementById('discount-guide');
  const msg = document.getElementById('discount-msg');
  // 用 textContent + CSS white-space:pre-line 支持换行，天然防 XSS
  if (t.tier === 2) {
    track.hidden = false;
    msg.textContent = p.tier2Text;
    guide.hidden = true;
  } else {
    track.hidden = true;
    msg.textContent = p.tier1Text;
    guide.textContent = p.guideText;
    guide.hidden = false;
  }
  document.getElementById('discount-ok').textContent = p.btnText;
}

function closeDiscount() {
  document.getElementById('discount-modal').hidden = true;
}
document.getElementById('discount-ok').addEventListener('click', closeDiscount);
document.getElementById('discount-backdrop').addEventListener('click', closeDiscount);

// 通用页面内弹窗
let dialogOkHandler = null;
function showDialog(title, msgHtml, { okText = '确定', cancelText = null, onOk = null, link = null } = {}) {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-msg').innerHTML = msgHtml;
  const okBtn = document.getElementById('dialog-ok');
  const cancelBtn = document.getElementById('dialog-cancel');
  const linkBtn = document.getElementById('dialog-link');
  okBtn.textContent = okText;
  okBtn.style.display = '';
  cancelBtn.style.display = cancelText ? '' : 'none';
  if (cancelText) cancelBtn.textContent = cancelText;
  // 联系卖家按钮：传入 link 则显示并跳转，否则隐藏
  linkBtn.style.display = link ? '' : 'none';
  if (link) linkBtn.textContent = link.text || '联系卖家';
  dialogLinkUrl = link ? link.url : null;
  // 保存 onOk 到临时属性（每次弹窗覆盖）
  dialogOkHandler = onOk;
  document.getElementById('app-dialog').hidden = false;
}
let dialogLinkUrl = null;
function closeDialog() {
  document.getElementById('app-dialog').hidden = true;
  dialogOkHandler = null;
  dialogLinkUrl = null;
}
document.getElementById('dialog-ok').addEventListener('click', () => {
  if (dialogOkHandler) dialogOkHandler();
  closeDialog();
});
document.getElementById('dialog-cancel').addEventListener('click', closeDialog);
document.getElementById('dialog-link').addEventListener('click', () => {
  // 联系卖家：不直接跳转，先弹交易提示，确认后再去店铺
  if (!dialogLinkUrl) return;
  sellerTargetUrl = dialogLinkUrl;
  document.getElementById('seller-modal').hidden = false;
});
document.getElementById('dialog-backdrop').addEventListener('click', closeDialog);

// 联系卖家提示弹窗
let sellerTargetUrl = null;
function closeSellerModal() {
  document.getElementById('seller-modal').hidden = true;
  sellerTargetUrl = null;
}
document.getElementById('seller-go').addEventListener('click', () => {
  if (sellerTargetUrl) window.open(sellerTargetUrl, '_blank', 'noopener');
  closeSellerModal();
});
document.getElementById('seller-cancel').addEventListener('click', closeSellerModal);
document.getElementById('seller-backdrop').addEventListener('click', closeSellerModal);

function clearCart() {
  showDialog('清空购物车', '确定要清空购物车里的所有商品吗？', {
    okText: '清空', cancelText: '取消',
    onOk: () => {
      cartItems = [];
      saveCart();
      renderCartBadge();
      renderCart();
      syncAllCartButtons();
    }
  });
}

function placeOrder() {
  const items = getValidCartItems();
  const total = items.reduce((s, it) => s + priceNumber(it.info.price), 0);
  const t = getDiscountTier(items.length);
  const finalTotal = Math.round(total * t.discount * 100) / 100;
  const totalHtml = t.tier > 0
    ? `<span style="text-decoration:line-through;color:#9ca3af">¥${priceDigits(total)}</span> → <strong>¥${priceDigits(finalTotal)}</strong>（已含${t.tier === 2 ? getPromo().tier2Discount : getPromo().tier1Discount}折）`
    : `<strong>¥${priceDigits(total)}</strong>`;
  showDialog('确认下单',
    `已选 <strong>${escapeHtml(String(items.length))}</strong> 件商品，合计 ${totalHtml}。` +
    `<span class="dialog-screenshot">请截屏购物车内的内容，方便与卖家核对订单</span>`,
    { okText: '确定', link: { text: '联系卖家', url: 'https://m.tb.cn/h.8q7Ny5H?tk=qjseThyz1zA' } });
}

document.getElementById('btn-clear-cart').addEventListener('click', clearCart);
document.getElementById('btn-checkout').addEventListener('click', placeOrder);

// 悬浮购物车按钮：点击 + 拖拽吸附
const cartFab = document.getElementById('cart-fab');
const FAB_POS_KEY = 'cart_fab_pos';
let fabDragging = false, fabMoved = false, fabStartX = 0, fabStartY = 0, fabOriginLeft = 0, fabOriginTop = 0;

function applyFabPos(left, top) {
  cartFab.style.left = left + 'px';
  cartFab.style.top = top + 'px';
  cartFab.style.right = 'auto';
  cartFab.style.bottom = 'auto';
}
function snapFab() {
  const w = window.innerWidth, fabW = cartFab.offsetWidth;
  const left = cartFab.getBoundingClientRect().left;
  const top = cartFab.getBoundingClientRect().top;
  const snapped = left < w / 2 ? 16 : w - fabW - 16;
  const clampedTop = Math.max(16, Math.min(top, window.innerHeight - cartFab.offsetHeight - 16));
  applyFabPos(snapped, clampedTop);
  localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left: snapped, top: clampedTop }));
}
function loadFabPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAB_POS_KEY));
    if (saved && typeof saved.left === 'number') { applyFabPos(saved.left, saved.top); snapFab(); return; }
  } catch {}
  // 默认右下角
  cartFab.style.right = '20px';
  cartFab.style.bottom = '20px';
}

cartFab.addEventListener('pointerdown', (e) => {
  fabDragging = true;
  fabMoved = false;
  const rect = cartFab.getBoundingClientRect();
  fabStartX = e.clientX; fabStartY = e.clientY;
  fabOriginLeft = rect.left; fabOriginTop = rect.top;
  cartFab.classList.add('dragging');
  cartFab.setPointerCapture(e.pointerId);
});
cartFab.addEventListener('pointermove', (e) => {
  if (!fabDragging) return;
  const dx = e.clientX - fabStartX, dy = e.clientY - fabStartY;
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) fabMoved = true;
  if (fabMoved) applyFabPos(fabOriginLeft + dx, fabOriginTop + dy);
});
function endFabDrag(e) {
  if (!fabDragging) return;
  fabDragging = false;
  cartFab.classList.remove('dragging');
  if (fabMoved) { snapFab(); }
  else { cartFab.classList.remove('clicked'); void cartFab.offsetWidth; cartFab.classList.add('clicked'); openCart(); }
  try { cartFab.releasePointerCapture(e.pointerId); } catch {}
}
cartFab.addEventListener('pointerup', endFabDrag);
cartFab.addEventListener('pointercancel', endFabDrag);

loadFabPos();
document.getElementById('cart-close').addEventListener('click', closeCart);
document.getElementById('cart-backdrop').addEventListener('click', closeCart);

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 校验图片 URL：仅允许 site 内 images/ 或 http(s):// 开头，且不能含用于逃逸 src 属性的引号
function isSafeImageUrl(url) {
  if (typeof url !== 'string') return false;
  if (/["']/.test(url) || /\s/.test(url)) return false;
  return /^(images\/|https?:\/\/)/i.test(url);
}

// 价格：兼容 "5.5" 或 "¥5.5"，统一提取数字
function priceNumber(p) {
  const n = parseFloat(String(p == null ? '' : p).replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : 0;
}
function priceDigits(n) {
  return n % 1 ? n.toFixed(2) : String(n);
}
function priceHtml(p) {
  const n = priceNumber(p);
  if (n <= 0) return escapeHtml(String(p == null ? '' : p)) || '—';
  return `<span class="price-sym">¥</span>${priceDigits(n)}`;
}

let currentSection = '全部';
let currentCategory = '全部';
let currentPage = 1;

function renderSections() {
  const sections = (window._siteData.sections || []);
  const bar = document.getElementById('section-bar');
  bar.innerHTML = '';
  bar.appendChild(makeSectionTab('全部', true));
  sections.forEach(s => bar.appendChild(makeSectionTab(s, false)));
  document.querySelectorAll('.section-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSection = tab.dataset.section;
      currentCategory = '全部';
      currentPage = 1;
      renderCategories(currentSection);
      applyFilter();
    });
  });
}

function makeSectionTab(label, active) {
  const b = document.createElement('button');
  b.className = 'section-tab' + (active ? ' active' : '');
  b.textContent = label;
  b.dataset.section = label;
  return b;
}

// 读取游戏的细分标签：优先 categories 数组，兼容旧 category 单值
function getGameCategories(g) {
  if (Array.isArray(g.categories)) return g.categories.map(String).map(s => s.trim()).filter(Boolean);
  if (g.category && String(g.category).trim()) {
    return String(g.category).split(/[,，/、]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function renderCategories(section) {
  const bar = document.getElementById('category-bar');
  if (section === '全部') {
    bar.hidden = true;
    currentCategory = '全部';
    return;
  }
  bar.hidden = false;
  const cats = [...new Set(allGames
    .filter(g => (g.section || '').trim() === section)
    .flatMap(g => getGameCategories(g)))];
  bar.innerHTML = '';
  bar.appendChild(makeCategoryTab('全部', true));
  cats.forEach(c => bar.appendChild(makeCategoryTab(c, false)));
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.cat;
      currentPage = 1;
      applyFilter();
    });
  });
}

function makeCategoryTab(label, active) {
  const b = document.createElement('button');
  b.className = 'category-tab' + (active ? ' active' : '');
  b.textContent = label;
  b.dataset.cat = label;
  return b;
}

function getFilteredList() {
  const kw = document.getElementById('search-box').value.trim().toLowerCase();
  let list = allGames;
  if (currentSection !== '全部') list = list.filter(g => (g.section || '').trim() === currentSection);
  if (currentCategory !== '全部') list = list.filter(g => getGameCategories(g).includes(currentCategory));
  if (kw) list = list.filter(g => (g.name + g.description).toLowerCase().includes(kw));
  return list;
}

function paginate(list) {
  const pageSize = parseInt((window._siteData && window._siteData.pageSize), 10) || 12;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  return { pageItems: list.slice(start, start + pageSize), totalPages };
}

function renderGames(list) {
  const { pageItems, totalPages } = paginate(list);
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  const tip = document.getElementById('empty-tip');
  if (!list.length) { tip.hidden = false; document.getElementById('pagination').hidden = true; return; }
  tip.hidden = true;
  pageItems.forEach(g => grid.appendChild(buildCard(g)));
  renderPagination(list.length, totalPages);
}

function renderPagination(total, totalPages) {
  const p = document.getElementById('pagination');
  if (totalPages <= 1) { p.innerHTML = ''; p.hidden = true; return; }
  p.hidden = false;
  p.innerHTML = '';
  const btn = (label, page, opts = {}) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (opts.disabled) b.disabled = true;
    if (opts.active) b.className = 'active';
    if (!opts.disabled) b.addEventListener('click', () => { currentPage = page; applyFilter(); });
    return b;
  };
  p.appendChild(btn('‹', currentPage - 1, { disabled: currentPage === 1 }));
  // 页码窗口：显示 1, ..., 当前页-1, 当前页, 当前页+1, ..., 末页（窄窗口省略）
  const pageWindow = 2;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= pageWindow) pages.push(i);
  }
  let last = 0;
  pages.forEach(i => {
    if (last && i - last > 1) {
      const el = document.createElement('span');
      el.className = 'page-ellipsis';
      el.textContent = '…';
      p.appendChild(el);
    }
    p.appendChild(btn(String(i), i, { active: i === currentPage }));
    last = i;
  });
  p.appendChild(btn('›', currentPage + 1, { disabled: currentPage === totalPages }));
}

function buildCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  const coverHtml = game.cover && isSafeImageUrl(game.cover)
    ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}" loading="lazy">`
    : escapeHtml(game.name.charAt(0));
  const inCart = cartItems.some(it => it.gid === game.id);
  card.innerHTML = `
    <div class="card-cover">${coverHtml}</div>
    <div class="card-body">
      <div class="card-name">${escapeHtml(game.name)}</div>
      <div class="card-meta">
        <span class="card-price">${priceHtml(game.price)}</span>
        <button class="card-add${inCart ? ' added' : ''}" data-id="${escapeHtml(game.id)}" aria-label="加入购物车">${inCart ? '✓' : '+'}</button>
      </div>
      <div class="card-tags">
        <span class="card-section">${escapeHtml(game.section || '')}</span>
        ${getGameCategories(game).map(c => `<span class="card-category">${escapeHtml(c)}</span>`).join('')}
      </div>
    </div>`;
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-add')) return;
    openDetail(game);
  });
  const addBtn = card.querySelector('.card-add');
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleAddClick(game);
  });
  return card;
}

// ── 选版弹窗：默认合集 + 子项列表 ──────────────────────────────
let selectedSubEntry = null; // 选版弹窗当前选中的商品（合集或子项）

function openSubPicker(game) {
  selectedSubEntry = null;
  document.getElementById('sub-title').textContent = game.name;
  const main = document.getElementById('sub-main');
  main.innerHTML = '';
  const list = document.getElementById('sub-list');
  list.innerHTML = '';
  // 主选项：合集（不默认选中，由顾客点击选择）
  main.appendChild(buildSubOption(game, { gid: game.id, mode: 'bundle' }));
  // 其他版本
  (game.subs || []).forEach(sub => {
    list.appendChild(buildSubOption(game, { gid: game.id, mode: 'sub', subId: sub.id }));
  });
  document.getElementById('sub-confirm').disabled = true;
  document.getElementById('sub-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSubPicker() {
  document.getElementById('sub-modal').hidden = true;
  // 详情弹窗或购物车抽屉仍开着时，保留其滚动锁，不重置 overflow
  if (document.getElementById('detail-modal').hidden && document.getElementById('cart-drawer').hidden) {
    document.body.style.overflow = '';
  }
}

function buildSubOption(game, entry) {
  const isBundle = entry.mode === 'bundle';
  const sub = isBundle ? null : (game.subs || []).find(s => s.id === entry.subId);
  const name = isBundle ? game.name : (sub && sub.name) || '';
  const price = isBundle ? game.price : (sub && sub.price != null ? sub.price : '');
  const cover = isBundle ? game.cover : (sub && sub.cover) || '';
  const coverHtml = cover && isSafeImageUrl(cover)
    ? `<img src="${cover}" alt="${escapeHtml(name)}">`
    : '<span>图</span>';
  const tag = isBundle ? '<span class="so-tag">合集</span>' : '';
  const btn = document.createElement('button');
  btn.className = 'sub-option';
  btn.innerHTML = `
    <div class="so-cover">${coverHtml}${tag}</div>
    <div class="so-name">${escapeHtml(name)}</div>
    <div class="so-price">${priceHtml(price)}</div>`;
  // 点击 = 选中（单选高亮），不直接加购
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sub-option').forEach(o => o.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSubEntry = entry;
    document.getElementById('sub-confirm').disabled = false;
  });
  return btn;
}

// 加购统一入口：有子项弹选版，无子项直接加购
function handleAddClick(game) {
  if (game.subs && game.subs.length) {
    openSubPicker(game);
  } else {
    toggleCart({ gid: game.id, mode: 'bundle' });
  }
}

function applyFilter() {
  const list = getFilteredList();
  renderGames(list);
}

async function loadGames() {
  try {
    const res = await fetch('games.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    allGames = data.games.filter(g => g.published);
    document.getElementById('site-name').textContent = '';
    // 站名拆成单字 span，实现波浪弹起动画
    const nameChars = String(data.site.name || '').split('');
    const nameEl = document.getElementById('site-name');
    nameChars.forEach(ch => {
      const s = document.createElement('span');
      s.className = 't-char';
      s.textContent = ch;
      nameEl.appendChild(s);
    });
    document.getElementById('announcement').textContent = data.site.announcement;
    document.getElementById('footer-disclaimer').textContent = data.site.footer || '';
    window._siteData = data.site;
    resetPromoDismissed(); // 页面刷新后重置，下次满足可再弹
    renderSections();
    renderCategories('全部');
    applyFilter();
    renderCartBadge();
    renderCart();
  } catch (err) {
    document.getElementById('empty-tip').textContent = '数据加载失败，请稍后重试';
    document.getElementById('empty-tip').hidden = false;
    console.error(err);
  }
}

let galleryShots = [];
let galleryIndex = 0;

function openDetail(game) {
  const modal = document.getElementById('detail-modal');
  const infoEl = document.getElementById('modal-info');
  // 截图列表（主画廊/缩略图只显示截图）
  const safeShots = (game.screenshots || []).filter(isSafeImageUrl);
  galleryShots = safeShots;
  galleryIndex = 0;
  // 灯箱浏览列表 = 封面（若有）+ 截图
  const coverOk = game.cover && isSafeImageUrl(game.cover);
  lightboxShots = (coverOk ? [game.cover] : []).concat(safeShots);
  lightboxIndex = 0;
  const imgEl = document.getElementById('gallery-main');
  const emptyEl = document.getElementById('gallery-empty');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');
  // 封面展示
  const coverEl = document.getElementById('modal-cover');
  if (coverOk) {
    coverEl.hidden = false;
    document.getElementById('modal-cover-img').src = game.cover;
  } else {
    coverEl.hidden = true;
  }
  if (safeShots.length) {
    imgEl.hidden = false;
    emptyEl.hidden = true;
    prevBtn.hidden = safeShots.length < 2;
    nextBtn.hidden = safeShots.length < 2;
    renderThumbs();
    showGalleryImage();
  } else {
    imgEl.hidden = true;
    emptyEl.hidden = false;
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    document.getElementById('gallery-thumbs').hidden = true;
  }
  infoEl.innerHTML = `
    <div class="modal-title"><span>${escapeHtml(game.name)}</span><span class="modal-price">${priceHtml(game.price)}</span></div>
    <div class="modal-cats">${getGameCategories(game).map(c => `<span class="modal-category">${escapeHtml(c)}</span>`).join('')}</div>
    <p class="modal-desc">${escapeHtml(game.description || '暂无简介')}</p>`;
  const addBtn = document.getElementById('detail-add-btn');
  addBtn.dataset.gid = game.id;
  syncAllCartButtons();
  addBtn.onclick = () => {
    handleAddClick(game);
    syncAllCartButtons();
  };
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function galleryNav(dir) {
  if (!galleryShots.length) return;
  galleryIndex = (galleryIndex + dir + galleryShots.length) % galleryShots.length;
  showGalleryImage();
}

function renderThumbs() {
  const thumbs = document.getElementById('gallery-thumbs');
  if (galleryShots.length <= 1) { thumbs.hidden = true; return; }
  thumbs.hidden = false;
  thumbs.innerHTML = '';
  galleryShots.forEach((src, i) => {
    const img = document.createElement('img');
    img.className = 'gallery-thumb' + (i === galleryIndex ? ' active' : '');
    img.src = src;
    img.alt = '截图 ' + (i + 1);
    img.addEventListener('click', () => {
      galleryIndex = i;
      showGalleryImage();
    });
    thumbs.appendChild(img);
  });
}

function showGalleryImage() {
  const imgEl = document.getElementById('gallery-main');
  imgEl.src = galleryShots[galleryIndex];
  imgEl.classList.remove('gallery-fade');
  void imgEl.offsetWidth;
  imgEl.classList.add('gallery-fade');
  // 同步缩略图 active
  document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === galleryIndex);
  });
}

document.getElementById('gallery-prev').addEventListener('click', () => galleryNav(-1));
document.getElementById('gallery-next').addEventListener('click', () => galleryNav(1));

// 详情弹窗大图点击 → 打开全屏灯箱（从截图索引映射到灯箱列表，+1 跳过封面）
document.getElementById('gallery-main').addEventListener('click', () => {
  if (!galleryShots.length) return;
  openLightbox(galleryIndex + (lightboxShots.length > galleryShots.length ? 1 : 0));
});

// 详情弹窗封面点击 → 打开灯箱看封面
document.getElementById('modal-cover').addEventListener('click', () => {
  if (!lightboxShots.length) return;
  openLightbox(0);
});

// ── 全屏图片灯箱 ──────────────────────────────────────────
let lightboxOpen = false;
let lightboxShots = [];
let lightboxIndex = 0;

function openLightbox(index) {
  if (!lightboxShots.length) return;
  lightboxIndex = index;
  lightboxOpen = true;
  updateLightbox();
  document.getElementById('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('lightbox-prev').hidden = lightboxShots.length < 2;
  document.getElementById('lightbox-next').hidden = lightboxShots.length < 2;
}

function closeLightbox() {
  if (!lightboxOpen) return;
  lightboxOpen = false;
  document.getElementById('lightbox').hidden = true;
  // 若详情弹窗仍开着，把截图列表还原到灯箱里最后看的对应张
  if (!document.getElementById('detail-modal').hidden && galleryShots.length) {
    const shotIdx = lightboxIndex - (lightboxShots.length > galleryShots.length ? 1 : 0);
    if (shotIdx >= 0 && shotIdx < galleryShots.length) {
      galleryIndex = shotIdx;
      showGalleryImage();
    }
  }
  if (document.getElementById('detail-modal').hidden && document.getElementById('cart-drawer').hidden) {
    document.body.style.overflow = '';
  }
}

function updateLightbox() {
  const img = document.getElementById('lightbox-img');
  img.src = lightboxShots[lightboxIndex];
  document.getElementById('lightbox-counter').textContent =
    lightboxShots.length > 1 ? (lightboxIndex + 1) + ' / ' + lightboxShots.length : '';
}

function lightboxNav(dir) {
  if (lightboxShots.length < 2) return;
  lightboxIndex = (lightboxIndex + dir + lightboxShots.length) % lightboxShots.length;
  updateLightbox();
}

document.getElementById('lightbox-prev').addEventListener('click', () => lightboxNav(-1));
document.getElementById('lightbox-next').addEventListener('click', () => lightboxNav(1));
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
document.getElementById('lightbox-backdrop').addEventListener('click', closeLightbox);

// Esc：优先关闭选版弹窗，其次优惠弹窗/灯箱/详情/购物车
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('sub-modal').hidden) { closeSubPicker(); return; }
    if (!document.getElementById('seller-modal').hidden) { closeSellerModal(); return; }
    if (!document.getElementById('discount-modal').hidden) { closeDiscount(); return; }
    if (lightboxOpen) { closeLightbox(); }
    else if (!document.getElementById('detail-modal').hidden) closeDetail();
  }
  // 灯箱内方向键切换
  if (lightboxOpen && e.key === 'ArrowLeft') lightboxNav(-1);
  if (lightboxOpen && e.key === 'ArrowRight') lightboxNav(1);
});
document.getElementById('search-box').addEventListener('input', () => { currentPage = 1; applyFilter(); });

function closeDetail() {
  document.getElementById('detail-modal').hidden = true;
  document.body.style.overflow = '';
}

document.getElementById('modal-close').addEventListener('click', closeDetail);
document.getElementById('modal-backdrop').addEventListener('click', closeDetail);
document.getElementById('sub-close').addEventListener('click', closeSubPicker);
document.getElementById('sub-backdrop').addEventListener('click', closeSubPicker);
document.getElementById('sub-confirm').addEventListener('click', () => {
  if (!selectedSubEntry) return;
  addToCart(selectedSubEntry);
  closeSubPicker();
  syncAllCartButtons();
});

loadGames();
