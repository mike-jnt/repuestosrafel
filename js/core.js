'use strict';

const APP_VERSION = 'C1.8.1';
const STORAGE_KEY = 'repuestos_distribuidor_c1_8';
const LEGACY_STORAGE_KEY = 'repuestos_distribuidor_c1_7';
const SESSION_KEY = 'repuestos_distribuidor_session_c1_8';
const SIDEBAR_KEY = 'repuestos_distribuidor_sidebar_c1_8';
const PAGE_SIZE = 10;

console.log(`[Comercializadora MAR] Versión ${APP_VERSION}`);

const ROLE_PERMISSIONS = {
  Administrador: ['dashboard','catalog','orderNew','orders','quotes','returns','clients','portfolio','products','movements','purchases','suppliers','dispatches','cash','reports','users','settings'],
  Vendedor: ['dashboard','catalog','orderNew','orders','quotes','clients','portfolio','dispatches'],
  Bodega: ['dashboard','orders','returns','products','movements','purchases','suppliers','dispatches'],
  Ruta: ['dashboard','dispatches'],
  Contabilidad: ['dashboard','orders','clients','portfolio','purchases','cash','reports']
};

const MENU = [
  { section: 'Inicio', items: [['dashboard', 'Resumen', '🏠']] },
  { section: 'Ventas', items: [['catalog', 'Catálogo', '🖼️'], ['orderNew', 'Nuevo pedido', '📦'], ['orders', 'Pedidos', '📋'], ['quotes', 'Cotizaciones', '🧾'], ['returns', 'Devoluciones', '↩️']] },
  { section: 'Comercial', items: [['clients', 'Clientes', '👥'], ['portfolio', 'Cartera', '💳']] },
  { section: 'Inventario', items: [['products', 'Productos', '🛢️'], ['movements', 'Movimientos', '📊'], ['purchases', 'Compras', '🛒'], ['suppliers', 'Proveedores', '🏭']] },
  { section: 'Logística', items: [['dispatches', 'Despachos', '🚚']] },
  { section: 'Finanzas', items: [['cash', 'Caja', '💵'], ['reports', 'Reportes', '📈']] },
  { section: 'Administración', items: [['users', 'Usuarios', '🔐'], ['settings', 'Configuración', '⚙️']] }
];

const TITLES = {
  dashboard: 'Resumen', catalog: 'Catálogo', orderNew: 'Nuevo pedido', orders: 'Pedidos', quotes: 'Cotizaciones', returns: 'Devoluciones',
  clients: 'Clientes', portfolio: 'Cartera', products: 'Productos', movements: 'Movimientos de inventario',
  purchases: 'Compras', suppliers: 'Proveedores', dispatches: 'Despachos', cash: 'Caja', reports: 'Reportes',
  users: 'Usuarios', settings: 'Configuración'
};

const ui = {
  route: 'dashboard', sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === '1', orderCart: [], catalogCart: [], catalogSearch: '', catalogCategory: '', catalogSegment: '', catalogPriceList: 'general', selectedClientId: '',
  orderPage: 1, clientPage: 1, productPage: 1, movementPage: 1, quotePage: 1, returnPage: 1, purchasePage: 1,
  supplierPage: 1, dispatchPage: 1, portfolioPage: 1, paymentPage: 1, sourceDraftId: '',
  orderFilter: '', clientFilter: '', productFilter: '', quoteFilter: '', supplierFilter: '', portfolioFilter: '',
  reportFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  reportTo: new Date().toISOString().slice(0,10)
};

function nowIso() { return new Date().toISOString(); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function id(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function money(value) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num(value)); }
function formatPlain(value) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(num(value)); }
function dateTime(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); }
function dateOnly(value) { if (!value) return '—'; const d = new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', { dateStyle: 'medium' }); }
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
function initials(name) { return String(name || 'Cliente').split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase(); }
function clampPage(page, total) { return Math.max(1, Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)))); }
function paginate(items, page) { const safe = clampPage(page, items.length); return { page: safe, pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)), items: items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE), total: items.length }; }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function currentUser() { const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); return session ? DB.users.find(u => u.id === session.userId) || null : null; }
function currentUserEmail() { return currentUser()?.email || 'sistema@local'; }
function currentRole() { return currentUser()?.role || 'Administrador'; }
function can(route) { return (ROLE_PERMISSIONS[currentRole()] || []).includes(route); }
function nextNumber(counterKey, prefix) { DB.counters[counterKey] = num(DB.counters[counterKey]) + 1; return `${prefix}-${String(DB.counters[counterKey]).padStart(6, '0')}`; }
function priceListLabel(value) { return ({ general: 'Precio general', mayorista: 'Precio mayorista', distribuidor: 'Precio distribuidor', especial: 'Precio especial' })[value] || 'Precio general'; }
function paymentStatusFor(order) {
  if (order.status === 'Borrador') return 'Borrador';
  if (order.status === 'Convertido') return 'Convertido';
  const effectiveTotal = Math.max(0, num(order.total) - num(order.returnCredit));
  const balance = Math.max(0, effectiveTotal - num(order.paid));
  if (balance <= 0) return 'Pagado';
  if (order.dueDate && new Date(`${order.dueDate}T23:59:59`) < new Date()) return 'Vencido';
  if (num(order.paid) > 0) return 'Abonado';
  return order.paymentMethod === 'Crédito' ? 'Crédito' : 'Pendiente';
}
function orderEffectiveTotal(order) { return Math.max(0, num(order.total) - num(order.returnCredit)); }
function updateOrderFinancials(order) {
  if (['Borrador','Convertido'].includes(order.status)) { order.paid = 0; order.balance = 0; order.paymentStatus = order.status; return; }
  order.paid = DB.payments.filter(p => p.orderId === order.id && p.status !== 'Anulado').reduce((s,p) => s + num(p.amount), 0);
  order.returnCredit = DB.returns.filter(r => r.orderId === order.id && r.status !== 'Anulada').reduce((s,r) => s + num(r.creditAmount), 0);
  order.balance = Math.max(0, orderEffectiveTotal(order) - num(order.paid));
  order.paymentStatus = paymentStatusFor(order);
  order.updatedAt = nowIso();
}
function recalcClientBalance(clientId) {
  const client = DB.clients.find(c => c.id === clientId); if (!client) return;
  DB.orders.filter(o => o.clientId === clientId && !['Cancelado','Borrador','Convertido'].includes(o.status)).forEach(updateOrderFinancials);
  client.currentBalance = DB.orders.filter(o => o.clientId === clientId && !['Cancelado','Borrador','Convertido'].includes(o.status)).reduce((s,o) => s + num(o.balance), 0);
  client.updatedAt = nowIso();
}
function recalcAllBalances() { DB.clients.forEach(c => recalcClientBalance(c.id)); }
function audit(action, entityType, entityId, detail = '') {
  const record = { id: id('aud'), action, entityType, entityId, detail, createdAt: nowIso(), userId: currentUser()?.id || '', userEmail: currentUserEmail() };
  DB.auditLogs.unshift(record);
  if (typeof Cloud !== 'undefined' && Cloud.user && typeof Cloud.writeAudit === 'function') Cloud.writeAudit(record).catch(error => console.error('No se pudo guardar auditoría:', error));
  return record;
}

function defaultDB() {
  const createdAt = nowIso();
  const clients = [
    { id: 'cli_general', code: 'CLI-0001', type: 'Venta de contado', businessName: 'Venta de contado', contactName: '', document: '', phone: '', whatsapp: '', city: '', zone: '', address: '', priceList: 'general', paymentTerms: 'Contado', creditDays: 0, creditLimit: 0, currentBalance: 0, status: 'Activo', sellerId: 'usr_vendedor', notes: '', createdAt, updatedAt: createdAt },
    { id: 'cli_motor', code: 'CLI-0002', type: 'Almacén de repuestos', businessName: 'Repuestos El Motor', contactName: 'Carlos Pérez', document: '901234567', phone: '3001234567', whatsapp: '573001234567', city: 'Armenia', zone: 'Centro', address: 'Carrera 18 # 20-15', priceList: 'distribuidor', paymentTerms: 'Crédito 15 días', creditDays: 15, creditLimit: 3000000, currentBalance: 0, status: 'Activo', sellerId: 'usr_vendedor', notes: 'Recibe pedidos de 8:00 a. m. a 4:00 p. m.', createdAt, updatedAt: createdAt }
  ];
  const suppliers = [
    { id: 'sup_1', code: 'PROV-0001', businessName: 'Lubricantes Nacionales', contactName: 'Andrea Gómez', document: '900123456', phone: '3105556677', city: 'Bogotá', address: 'Zona industrial', paymentTerms: 'Crédito 30 días', status: 'Activo', notes: '', createdAt, updatedAt: createdAt }
  ];
  const products = [
    { id: 'pro_1', code: 'ACE-20W50-1L', barcode: '770000000001', name: 'Aceite motor 20W-50', brand: 'LubriMax', category: 'Aceites para carro', segment: 'Carros', viscosity: '20W-50', presentation: '1 litro', unit: 'Unidad', unitsPerCase: 12, location: 'A-01', supplierId: 'sup_1', stock: 48, minStock: 12, cost: 19000, prices: { general: 28000, mayorista: 25500, distribuidor: 23500 }, status: 'Activo', createdAt, updatedAt: createdAt },
    { id: 'pro_2', code: 'ACE-15W40-GAL', barcode: '770000000002', name: 'Aceite diésel 15W-40', brand: 'MotorPro', category: 'Aceites para carro', segment: 'Carros', viscosity: '15W-40', presentation: 'Galón', unit: 'Unidad', unitsPerCase: 4, location: 'A-02', supplierId: 'sup_1', stock: 22, minStock: 6, cost: 82000, prices: { general: 118000, mayorista: 109000, distribuidor: 103000 }, status: 'Activo', createdAt, updatedAt: createdAt },
    { id: 'pro_3', code: 'MOT-10W40-1L', barcode: '770000000003', name: 'Aceite moto 4T 10W-40', brand: 'MotoPlus', category: 'Aceites para moto', segment: 'Motos', viscosity: '10W-40', presentation: '1 litro', unit: 'Unidad', unitsPerCase: 12, location: 'B-01', supplierId: 'sup_1', stock: 36, minStock: 12, cost: 22000, prices: { general: 33000, mayorista: 30000, distribuidor: 28000 }, status: 'Activo', createdAt, updatedAt: createdAt },
    { id: 'pro_4', code: 'REF-COOL-1L', barcode: '770000000004', name: 'Refrigerante concentrado', brand: 'CoolDrive', category: 'Refrigerantes', segment: 'Carros y motos', viscosity: '', presentation: '1 litro', unit: 'Unidad', unitsPerCase: 12, location: 'C-01', supplierId: 'sup_1', stock: 9, minStock: 10, cost: 12000, prices: { general: 19000, mayorista: 17500, distribuidor: 16000 }, status: 'Activo', createdAt, updatedAt: createdAt }
  ];
  const users = [
    { id: 'usr_admin', name: 'Administrador', email: 'admin@repuestos.local', password: '123456', role: 'Administrador', status: 'Activo', createdAt },
    { id: 'usr_vendedor', name: 'Vendedor', email: 'vendedor@repuestos.local', password: '123456', role: 'Vendedor', status: 'Activo', createdAt },
    { id: 'usr_bodega', name: 'Bodega', email: 'bodega@repuestos.local', password: '123456', role: 'Bodega', status: 'Activo', createdAt },
    { id: 'usr_ruta', name: 'Ruta', email: 'ruta@repuestos.local', password: '123456', role: 'Ruta', status: 'Activo', createdAt },
    { id: 'usr_conta', name: 'Contabilidad', email: 'contabilidad@repuestos.local', password: '123456', role: 'Contabilidad', status: 'Activo', createdAt }
  ];
  return {
    settings: { businessName: 'Comercializadora MAR', nit: '', address: '', city: '', phone: '', email: '', whatsappCountryCode: '57', bankInfo: '', defaultDeliveryCost: 0, footer: 'Gracias por su compra.', documentLabel: 'FACTURA DE COMPRA' },
    counters: { clients: 2, products: 4, orders: 0, quotes: 0, returns: 0, suppliers: 1, purchases: 0, payments: 0, cashSessions: 0, expenses: 0 },
    clients, suppliers, products, orders: [], quotes: [], returns: [], purchases: [], payments: [], inventoryMovements: [], cashSessions: [], expenses: [], users, auditLogs: [], paymentPromises: [], version: APP_VERSION, updatedAt: createdAt
  };
}

function migrateLegacy(raw) {
  const base = defaultDB();
  if (!raw || typeof raw !== 'object') return base;
  const migrated = {
    ...base,
    settings: { ...base.settings, ...(raw.settings || {}) },
    counters: { ...base.counters, ...(raw.counters || {}) },
    clients: Array.isArray(raw.clients) ? raw.clients.map(c => ({ creditDays: 0, zone: '', sellerId: 'usr_vendedor', ...c })) : base.clients,
    suppliers: Array.isArray(raw.suppliers) ? raw.suppliers : base.suppliers,
    products: Array.isArray(raw.products) ? raw.products.map(p => ({ barcode: '', segment: '', unit: 'Unidad', location: '', supplierId: '', image: null, imageThumb: '', ...p })) : base.products,
    orders: Array.isArray(raw.orders) ? raw.orders.map(o => ({ dueDate: '', deliveryStatus: o.status || 'Confirmado', returnCredit: 0, assignedTo: '', dispatchDate: '', payments: [], ...o })) : [],
    quotes: Array.isArray(raw.quotes) ? raw.quotes : [],
    returns: Array.isArray(raw.returns) ? raw.returns : [],
    purchases: Array.isArray(raw.purchases) ? raw.purchases : [],
    payments: Array.isArray(raw.payments) ? raw.payments : [],
    inventoryMovements: Array.isArray(raw.inventoryMovements) ? raw.inventoryMovements : Array.isArray(raw.movements) ? raw.movements : [],
    cashSessions: Array.isArray(raw.cashSessions) ? raw.cashSessions : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    users: Array.isArray(raw.users) && raw.users.length ? raw.users.map(u => ({ password: '123456', name: u.email || 'Usuario', ...u })) : base.users,
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
    paymentPromises: Array.isArray(raw.paymentPromises) ? raw.paymentPromises : [],
    version: APP_VERSION,
    updatedAt: nowIso()
  };
  migrated.orders.forEach(o => {
    if (num(o.paid) > 0 && !migrated.payments.some(p => p.orderId === o.id)) migrated.payments.push({ id: id('pay'), number: `PAG-MIG-${o.number}`, orderId: o.id, clientId: o.clientId, amount: num(o.paid), method: o.paymentMethod || 'No definido', reference: 'Migración C1.0', notes: 'Pago inicial migrado', status: 'Aplicado', createdAt: o.createdAt || nowIso(), createdBy: o.createdBy || 'migracion@local' });
  });
  return migrated;
}

function normalizeDB(raw) {
  const db = migrateLegacy(raw);
  const base = defaultDB();
  const arrays = ['clients','suppliers','products','orders','quotes','returns','purchases','payments','inventoryMovements','cashSessions','expenses','users','auditLogs','paymentPromises'];
  arrays.forEach(k => { if (!Array.isArray(db[k])) db[k] = base[k]; });
  db.settings = { ...base.settings, ...(db.settings || {}) };
  if (!db.settings.businessName || ['Repuestos Pro', 'Repuestos Pro Distribuidor'].includes(db.settings.businessName)) db.settings.businessName = 'Comercializadora MAR';
  const legacyPlaceholders = { nit: ['NIT pendiente'], address: ['Dirección pendiente'], city: ['Ciudad pendiente'], phone: ['300 000 0000'] };
  Object.entries(legacyPlaceholders).forEach(([key, values]) => { if (values.includes(String(db.settings[key] || '').trim())) db.settings[key] = ''; });
  if (!db.settings.documentLabel || /COMPROBANTE COMERCIAL DE PEDIDO/i.test(db.settings.documentLabel)) db.settings.documentLabel = 'FACTURA DE COMPRA';
  if (!db.settings.footer || /Documento comercial no equivalente a factura electrónica/i.test(db.settings.footer)) db.settings.footer = 'Gracias por su compra.';
  db.orders.forEach(order => {
    const current = Number(order.pdf?.version || 1);
    if (order.pdf?.layoutVersion !== 2) order.pdf = { ...(order.pdf || {}), generated: false, needsUpload: true, version: current, layoutVersion: 2, fileName: `FACTURA_COMPRA_${order.number}-V${current}.pdf`, storage: 'firestore-base64' };
  });
  db.counters = { ...base.counters, ...(db.counters || {}) };
  db.version = APP_VERSION;
  recalcAgainst(db);
  return db;
}

function recalcAgainst(db) {
  db.orders.forEach(order => {
    if (['Borrador','Convertido'].includes(order.status)) {
      order.paid = 0; order.balance = 0; order.paymentStatus = order.status; return;
    }
    order.paid = db.payments.filter(p => p.orderId === order.id && p.status !== 'Anulado').reduce((s,p)=>s+num(p.amount),0);
    order.returnCredit = db.returns.filter(r => r.orderId === order.id && r.status !== 'Anulada').reduce((s,r)=>s+num(r.creditAmount),0);
    order.balance = Math.max(0, num(order.total)-num(order.returnCredit)-num(order.paid));
    order.paymentStatus = paymentStatusFor(order);
  });
  db.clients.forEach(client => {
    client.currentBalance = db.orders.filter(o => o.clientId === client.id && !['Cancelado','Borrador','Convertido'].includes(o.status)).reduce((s,o)=>s+num(o.balance),0);
  });
}

function loadDB() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return normalizeDB(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = normalizeDB(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return defaultDB();
  } catch (error) {
    console.warn('No se pudo leer la base local:', error);
    return defaultDB();
  }
}

let DB = loadDB();

function localCacheSnapshot(db) {
  const sortRecent = (items, limit) => (Array.isArray(items) ? items.slice().sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, limit) : []);
  return {
    settings: deepClone(db.settings || {}), counters: deepClone(db.counters || {}),
    clients: sortRecent(db.clients, 1200), products: sortRecent(db.products, 1600).map(product => { const copy = { ...product }; delete copy.imageThumb; return copy; }), suppliers: sortRecent(db.suppliers, 500),
    orders: sortRecent(db.orders, 300), quotes: sortRecent(db.quotes, 200), returns: sortRecent(db.returns, 200),
    purchases: sortRecent(db.purchases, 200), payments: sortRecent(db.payments, 400),
    inventoryMovements: sortRecent(db.inventoryMovements, 350), cashSessions: sortRecent(db.cashSessions, 120),
    expenses: sortRecent(db.expenses, 200), users: sortRecent(db.users, 100), auditLogs: sortRecent(db.auditLogs, 150),
    paymentPromises: sortRecent(db.paymentPromises, 200), version: APP_VERSION, updatedAt: nowIso(), cacheLimited: true
  };
}

function saveDB({ skipCloud = false } = {}) {
  DB.updatedAt = nowIso();
  DB.version = APP_VERSION;
  recalcAllBalances();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(localCacheSnapshot(DB))); }
  catch (error) {
    console.error('No se pudo guardar la base local:', error);
    if (error?.name === 'QuotaExceededError') throw new Error('El navegador no tiene espacio suficiente. Exporta una copia y elimina archivos locales antiguos.');
    throw error;
  }
  if (!skipCloud && typeof Cloud !== 'undefined') Cloud.queueSync(DB);
}

function productionEmptyDB(profile = null) {
  const db = defaultDB();
  const now = nowIso();
  db.clients = [{ id: 'cli_general', code: 'CLI-0001', type: 'Venta de contado', businessName: 'Venta de contado', contactName: '', document: '', phone: '', whatsapp: '', city: '', zone: '', address: '', priceList: 'general', paymentTerms: 'Contado', creditDays: 0, creditLimit: 0, currentBalance: 0, status: 'Activo', sellerId: profile?.id || '', notes: '', createdAt: now, updatedAt: now }];
  db.suppliers = [];
  db.products = [];
  db.orders = [];
  db.quotes = [];
  db.returns = [];
  db.purchases = [];
  db.payments = [];
  db.inventoryMovements = [];
  db.cashSessions = [];
  db.expenses = [];
  db.auditLogs = [];
  db.paymentPromises = [];
  db.users = profile ? [{ ...profile, id: profile.id || profile.uid }] : [];
  db.counters = { clients: 1, products: 0, orders: 0, quotes: 0, returns: 0, suppliers: 0, purchases: 0, payments: 0, cashSessions: 0, expenses: 0 };
  db.updatedAt = now;
  return db;
}

function activeCashSession() { return DB.cashSessions.find(s => s.status === 'Abierta') || null; }
function paymentsInRange(fromIso, toIso) { return DB.payments.filter(p => p.status !== 'Anulado' && p.createdAt >= fromIso && p.createdAt <= toIso); }
function orderById(orderId) { return DB.orders.find(o => o.id === orderId); }
function clientById(clientId) { return DB.clients.find(c => c.id === clientId); }
function productById(productId) { return DB.products.find(p => p.id === productId); }
function supplierById(supplierId) { return DB.suppliers.find(s => s.id === supplierId); }
function paymentBadge(status) { const cls = ({Pagado:'ok',Abonado:'warn',Crédito:'info',Pendiente:'warn',Vencido:'danger',Borrador:'gray',Convertido:'gray'})[status] || 'gray'; return `<span class="badge ${cls}">${esc(status)}</span>`; }
function statusBadge(status) { const cls = ({Confirmado:'info','En preparación':'warn','Listo para despacho':'warn','En ruta':'info',Entregado:'ok','Entrega parcial':'warn',Cancelado:'danger',Borrador:'gray',Convertido:'gray','Pendiente de aprobación':'warn',Pendiente:'warn',Recibida:'ok',Anulada:'danger'})[status] || 'gray'; return `<span class="badge ${cls}">${esc(status)}</span>`; }
function emptyState(text) { return `<div class="empty">${esc(text)}</div>`; }
function statCard(label, value, icon, help = '') { return `<div class="card stat"><div><div class="label">${esc(label)}</div><div class="value">${value}</div>${help ? `<div class="tiny muted" style="margin-top:6px">${esc(help)}</div>` : ''}</div><div class="icon">${icon}</div></div>`; }
function paginationHtml(page, key) { if (page.pages <= 1) return ''; return `<div class="pagination"><button class="btn btn-secondary btn-sm" data-page-key="${key}" data-page="${page.page-1}" ${page.page<=1?'disabled':''}>Anterior</button><span class="pill">Página ${page.page} de ${page.pages}</span><button class="btn btn-secondary btn-sm" data-page-key="${key}" data-page="${page.page+1}" ${page.page>=page.pages?'disabled':''}>Siguiente</button></div>`; }
function downloadText(text, fileName, type = 'text/plain;charset=utf-8') { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
function csvEscape(value) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text; }
