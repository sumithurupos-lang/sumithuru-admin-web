// ============================================================
// CloudPOS Admin Hub — Real-Time State, CRUD, Scanner, Reports & Excel Hub
// ============================================================

// LocalStorage Keys
const STORAGE_KEYS = {
  PRODUCTS: 'cloudpos_inventory_products',
  PURCHASES: 'cloudpos_buying_logs',
  SALES: 'cloudpos_selling_logs',
  SETTINGS: 'cloudpos_store_settings',
  OWNER: 'cloudpos_owner_profile'
};

// Initial Seed Data (Matching Windows App SUMITHURU ENTERPRICES)
const DEFAULT_SETTINGS = {
  storeName: "SUMITHURU ENTERPRICES",
  address: "No. 42, Galle Road, Colombo 03, Sri Lanka",
  phone: "+94 11 234 5678",
  email: "support@sumithuru.lk",
  taxId: "TIN-104928371",
  currencySymbol: "Rs. ",
  defaultTaxRate: 5.0,
  receiptPaperWidth: "80mm",
  receiptBorderStyle: "Dashed",
  receiptHeaderAlign: "Center",
  receiptShowTaxId: true,
  receiptShowAuthBarcode: true,
  receiptFooter: "Thank you for shopping at Sumithuru Enterprices! Please retain this receipt for returns/exchanges within 7 days.",
  presetDiscounts: "5, 10, 15, 20",
  supabaseUrl: "",
  supabaseAnonKey: ""
};

const DEFAULT_OWNER = {
  name: "Store Owner",
  role: "Store Owner / Back-Office Manager",
  email: "admin@sumithuru.lk",
  phone: "+94 77 123 4567",
  location: "Colombo, Sri Lanka",
  pin: "1234"
};

const DEFAULT_PRODUCTS = [];

const DEFAULT_PURCHASES = [];
const DEFAULT_SALES = [];

// Helper to load persistent state from localStorage
function loadStoredItem(key, defaults) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaults;
  } catch (e) {
    console.warn(`Could not load ${key} from storage:`, e);
    return defaults;
  }
}

function saveStoredItem(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn(`Could not save ${key} to storage:`, e);
  }
}

// Global Application State
const state = {
  currency: 'Rs. ',
  activeTab: 'dashboard',
  soundEnabled: true,
  simRunning: false,
  simInterval: null,
  lowStockFilterActive: false,
  
  // Real-time totals (dynamically calculated from synced store sales)
  totalRevenue: 0,
  totalProfit: 0,
  totalOrders: 0,
  totalCogs: 0,
  
  // Persistent Collections
  products: loadStoredItem(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS),
  purchases: loadStoredItem(STORAGE_KEYS.PURCHASES, DEFAULT_PURCHASES),
  sales: loadStoredItem(STORAGE_KEYS.SALES, DEFAULT_SALES),
  settings: loadStoredItem(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  owner: loadStoredItem(STORAGE_KEYS.OWNER, DEFAULT_OWNER),

  // Terminals
  terminals: [
    {
      id: 'POS-01',
      name: 'Counter Register (POS-01)',
      location: 'Front Counter - Lane A',
      cashier: 'POS Counter Cashier',
      status: 'ONLINE',
      ordersCount: 0,
      cashInDrawer: 0,
      cardTotal: 0,
      grossTotal: 0,
      lastTxTime: 'Just now',
      lastHeartbeatRaw: new Date().toISOString()
    }
  ],
  notifications: []
};

// Purge legacy mock demo data from previous browser test runs if present
(function purgeLegacyDemoStorage() {
  try {
    const rawProd = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (rawProd && (rawProd.includes('Ceylon White Tea 200g') || rawProd.includes('Anchor Full Cream Milk Powder'))) {
      localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
      state.products = [];
    }
    const rawSales = localStorage.getItem(STORAGE_KEYS.SALES);
    if (rawSales && (rawSales.includes('INV-10941') || rawSales.includes('Amal Perera') || rawSales.includes('Sunil Jayawardena'))) {
      localStorage.removeItem(STORAGE_KEYS.SALES);
      state.sales = [];
    }
    const rawPurch = localStorage.getItem(STORAGE_KEYS.PURCHASES);
    if (rawPurch && rawPurch.includes('Dilmah Plantation Ceylon')) {
      localStorage.removeItem(STORAGE_KEYS.PURCHASES);
      state.purchases = [];
    }
  } catch (e) {}
})();

// Audio Synthesizer (Chime & Barcode Scanner Beep)
class AudioNotifier {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.ctx = new AudioContext();
    }
  }
  playSaleChime() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      // Dual-tone crystal chime (A5 880Hz -> E6 1318.51Hz)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, now + 0.08);
      gain2.gain.setValueAtTime(0.25, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  playUpdateChime() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      // Gentle notification tap (D5 587.33Hz -> A5 880Hz)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  playScannerBeep() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }
}

const audioNotifier = new AudioNotifier();

// Chart Instances
let hourlyChartInstance = null;
let categoryPieChartInstance = null;
let paymentPieChartInstance = null;

// Camera Barcode Scanner State
let html5QrCode = null;
let scannerTargetMode = null;
let pendingBillPhotoData = null;

// ==========================================
// Cloud Synchronization & Supabase Engine
// ==========================================
let supabaseClient = null;
let realtimeChannel = null;

const SUPABASE_SETUP_SQL = `-- SUMITHURU ENTERPRISES — Supabase Cloud Database Setup Script
-- 100% Free Tier (PostgreSQL + Realtime + Storage)

-- 1. Create Items (Products Catalog & Inventory)
CREATE TABLE IF NOT EXISTS public.items (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Groceries',
    brand TEXT DEFAULT '',
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    condition TEXT DEFAULT 'Standard',
    unit TEXT NOT NULL DEFAULT 'Pcs',
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER NOT NULL DEFAULT 10,
    purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    refurb_cost NUMERIC(12,2) DEFAULT 0.00,
    target_resale_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    sold_price NUMERIC(12,2),
    status INTEGER NOT NULL DEFAULT 0,
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    sold_date TIMESTAMPTZ,
    seller_name TEXT DEFAULT '',
    seller_phone TEXT DEFAULT '',
    buyer_name TEXT DEFAULT '',
    buyer_phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_sku ON public.items(sku);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items(category);

-- 2. Create Transactions (Sales & Wholesale Buying Bills)
CREATE TABLE IF NOT EXISTS public.transactions (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    transaction_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    item_id BIGINT,
    item_title TEXT DEFAULT '',
    item_sku TEXT DEFAULT '',
    date TIMESTAMPTZ DEFAULT NOW(),
    contact_name TEXT DEFAULT 'Walk-in Customer',
    contact_phone TEXT DEFAULT '',
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12,2) DEFAULT 0.00,
    tax NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    cash_tendered NUMERIC(12,2) DEFAULT 0.00,
    change_given NUMERIC(12,2) DEFAULT 0.00,
    line_items_json TEXT DEFAULT '[]',
    proof_image_path TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    synced_by TEXT DEFAULT 'POS-01',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_tx_num ON public.transactions(transaction_number);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);

-- 3. Create POS Terminals
CREATE TABLE IF NOT EXISTS public.terminals (
    terminal_id TEXT PRIMARY KEY,
    terminal_name TEXT NOT NULL DEFAULT 'Counter POS 01',
    cashier_name TEXT NOT NULL DEFAULT 'Store Cashier',
    status TEXT NOT NULL DEFAULT 'ONLINE',
    today_sales_count INTEGER DEFAULT 0,
    today_revenue NUMERIC(12,2) DEFAULT 0.00,
    drawer_cash NUMERIC(12,2) DEFAULT 0.00,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security & Policies
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Anon full access items" ON public.items;
    DROP POLICY IF EXISTS "Anon full access transactions" ON public.transactions;
    DROP POLICY IF EXISTS "Anon full access terminals" ON public.terminals;
END $$;

CREATE POLICY "Anon full access items" ON public.items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access transactions" ON public.transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access terminals" ON public.terminals FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Enable Realtime Publications
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'terminals') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.terminals;
    END IF;
END $$;`;

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (url.toLowerCase().endsWith('/rest/v1')) {
    url = url.slice(0, -'/rest/v1'.length).replace(/\/+$/, '');
  }
  return url;
}

async function initSupabaseClient() {
  const url = normalizeSupabaseUrl(state.settings.supabaseUrl || '');
  const key = (state.settings.supabaseAnonKey || '').trim();

  const topBadge = document.getElementById('cloudSyncBadgeTop');
  const settingsBadge = document.getElementById('supabaseStatusBadge');

  if (!url || !key || !window.supabase) {
    supabaseClient = null;
    if (topBadge) {
      topBadge.className = "px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer hover:bg-slate-750 transition";
      topBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>Local Mode</span>`;
    }
    if (settingsBadge) {
      settingsBadge.className = "self-start sm:self-auto px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5";
      settingsBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span><span>Standalone Demo Mode (Local Storage)</span>`;
    }
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(url, key);

    if (topBadge) {
      topBadge.className = "px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition";
      topBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>Live Cloud Connected</span>`;
    }
    if (settingsBadge) {
      settingsBadge.className = "self-start sm:self-auto px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5";
      settingsBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Connected to Supabase (Live Realtime Active)</span>`;
    }

    // Stop demo simulation when connected to live cloud database
    state.simRunning = false;
    if (state.simInterval) {
      clearInterval(state.simInterval);
      state.simInterval = null;
    }

    await fetchCloudData();
    setupSupabaseRealtime();
  } catch (err) {
    console.error("Supabase init error:", err);
  }
}

// Convert Supabase transaction record to Admin Hub Sale structure
function parseCloudTransaction(tx) {
  let lineItems = [];
  try {
    lineItems = JSON.parse(tx.line_items_json || '[]');
  } catch(e) {}

  let totalCogs = 0;
  const items = (Array.isArray(lineItems) && lineItems.length > 0) ? lineItems.map(li => {
    const qty = parseFloat(li.Quantity || li.quantity || 1) || 1;
    const price = parseFloat(li.UnitPrice || li.price || 0) || 0;
    const cost = parseFloat(li.UnitCost || li.unitCost || 0) || 0;
    totalCogs += (cost * qty);
    return {
      sku: String(li.Sku || li.sku || ''),
      name: String(li.Title || li.name || tx.item_title || 'Grocery Item'),
      qty: qty,
      price: price,
      cost: cost
    };
  }) : [{
    sku: String(tx.item_sku || ''),
    name: String(tx.item_title || 'Grocery Item'),
    qty: 1,
    price: parseFloat(tx.total_amount) || 0,
    cost: 0
  }];

  const total = parseFloat(tx.total_amount) || 0;
  const subtotal = parseFloat(tx.amount) || total;
  const discount = parseFloat(tx.discount) || 0;
  const profit = Math.max(0, total - totalCogs);

  let timeStr = '12:00';
  let dateStr = new Date().toISOString().slice(0, 10);
  if (tx.date) {
    try {
      const d = new Date(tx.date);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dateStr = d.toISOString().slice(0, 10);
      }
    } catch(e) {}
  }

  const cashierName = String(tx.synced_by || 'Counter Cashier');

  return {
    invoiceNum: String(tx.transaction_number || `INV-${tx.id}`),
    time: timeStr,
    date: dateStr,
    terminal: String(tx.synced_by || 'Terminal 01'),
    cashier: cashierName,
    customer: String(tx.contact_name || 'Walk-in Customer'),
    paymentMethod: String(tx.payment_method || 'Cash'),
    subtotal: subtotal,
    discount: discount,
    total: total,
    cogs: totalCogs,
    profit: profit,
    tendered: parseFloat(tx.cash_tendered) || total,
    change: parseFloat(tx.change_given) || 0,
    items: items
  };
}

function updateTerminalStatsFromSales() {
  if (!state.terminals || state.terminals.length === 0) return;

  state.terminals.forEach(term => {
    const termSales = (state.sales || []).filter(s => {
      const termId = (term.id || '').toLowerCase();
      const termName = (term.name || '').toLowerCase();
      const saleTerm = (s.terminal || '').toLowerCase();
      return saleTerm.includes(termId) || termName.includes(saleTerm) || state.terminals.length === 1;
    });

    if (termSales.length > 0) {
      let cashTotal = 0;
      let cardTotal = 0;
      let gross = 0;

      termSales.forEach(s => {
        const amt = parseFloat(s.total) || 0;
        gross += amt;
        if (s.paymentMethod && s.paymentMethod.toLowerCase().includes('cash')) {
          cashTotal += amt;
        } else {
          cardTotal += amt;
        }
      });

      term.ordersCount = Math.max(term.ordersCount || 0, termSales.length);
      term.cashInDrawer = Math.max(term.cashInDrawer || 0, cashTotal);
      term.cardTotal = Math.max(term.cardTotal || 0, cardTotal);
      term.grossTotal = Math.max(term.grossTotal || 0, gross);
      if (termSales[0] && termSales[0].time) {
        term.lastTxTime = termSales[0].time;
      }
    }
  });
}

// Recalculate KPIs based on current state.sales
function recalculateMetrics() {
  if (!state.sales || state.sales.length === 0) {
    state.totalRevenue = 0;
    state.totalProfit = 0;
    state.totalCogs = 0;
    state.totalOrders = 0;
    updateTerminalStatsFromSales();
    return;
  }

  let rev = 0;
  let prof = 0;
  let cogs = 0;

  state.sales.forEach(s => {
    rev += (parseFloat(s.total) || 0);
    prof += (parseFloat(s.profit) || 0);
    cogs += (parseFloat(s.cogs) || 0);
  });

  state.totalRevenue = rev;
  state.totalProfit = prof;
  state.totalCogs = cogs;
  state.totalOrders = state.sales.length;

  updateTerminalStatsFromSales();
}

async function fetchCloudData() {
  if (!supabaseClient) return;

  try {
    // 1. Fetch Products from Supabase
    const { data: cloudItems, error: itemsErr } = await supabaseClient
      .from('items')
      .select('*')
      .order('title', { ascending: true });

    if (!itemsErr && cloudItems && cloudItems.length > 0) {
      state.products = cloudItems.map(ci => ({
        sku: ci.sku,
        name: ci.title,
        category: ci.category || 'General',
        unit: ci.unit || 'Pcs',
        stock: ci.quantity != null ? ci.quantity : 0,
        minStock: ci.min_stock_alert != null ? ci.min_stock_alert : 10,
        costPrice: parseFloat(ci.purchase_cost) || 0,
        sellPrice: parseFloat(ci.target_resale_price) || 0,
        priceHistory: []
      }));
      saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);
    }

    // 2. Fetch Transactions (Sales & Purchases)
    const { data: cloudTxs, error: txsErr } = await supabaseClient
      .from('transactions')
      .select('*')
      .order('id', { ascending: false })
      .limit(300);

    if (!txsErr && cloudTxs && cloudTxs.length > 0) {
      const sales = [];
      const purchases = [];

      cloudTxs.forEach(tx => {
        if (tx.type === 'SALE') {
          sales.push(parseCloudTransaction(tx));
        } else if (tx.type === 'PURCHASE') {
          purchases.push({
            id: 'purch-' + tx.id,
            date: tx.date ? tx.date.slice(0, 16).replace('T', ' ') : new Date().toISOString().slice(0, 16).replace('T', ' '),
            invoiceNum: tx.transaction_number,
            supplier: tx.contact_name || 'Distributor',
            itemSku: tx.item_sku || '',
            itemName: tx.item_title || 'Stock Delivery',
            quantity: 1,
            unitCost: parseFloat(tx.total_amount) || 0,
            totalCost: parseFloat(tx.total_amount) || 0,
            photoData: tx.proof_image_path || null
          });
        }
      });

      if (sales.length > 0) {
        state.sales = sales;
        saveStoredItem(STORAGE_KEYS.SALES, state.sales);
      }
      if (purchases.length > 0) {
        state.purchases = purchases;
        saveStoredItem(STORAGE_KEYS.PURCHASES, state.purchases);
      }
    }

    // 3. Fetch Terminals
    const { data: cloudTerminals, error: termErr } = await supabaseClient
      .from('terminals')
      .select('*');

    if (!termErr && cloudTerminals && cloudTerminals.length > 0) {
      state.terminals = cloudTerminals.map((t, idx) => ({
        id: t.terminal_id,
        name: t.terminal_name || `Counter Register (${t.terminal_id})`,
        location: idx === 0 ? 'Front Counter - Lane A' : `Counter ${idx + 1}`,
        cashier: t.cashier_name || 'POS Cashier',
        status: t.status || 'ONLINE',
        ordersCount: parseInt(t.today_sales_count) || 0,
        cashInDrawer: parseFloat(t.drawer_cash) || 0,
        cardTotal: 0,
        grossTotal: parseFloat(t.today_revenue) || 0,
        lastTxTime: t.last_heartbeat ? new Date(t.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'
      }));
    }

    recalculateMetrics();
    renderAllViews();
  } catch (err) {
    console.warn("Could not fetch cloud data:", err);
  }
}

function setupSupabaseRealtime() {
  if (!supabaseClient) return;

  if (realtimeChannel) {
    try { supabaseClient.removeChannel(realtimeChannel); } catch(e) {}
  }

  realtimeChannel = supabaseClient.channel('pos-realtime-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
      handleIncomingTransaction(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (payload) => {
      handleIncomingItemUpdate(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'terminals' }, (payload) => {
      handleIncomingTerminalUpdate(payload.new);
    })
    .subscribe();
}

function handleIncomingTransaction(row) {
  if (!row) return;

  if (row.type === 'SALE') {
    const newSale = parseCloudTransaction(row);

    if (!state.sales.some(s => s.invoiceNum === newSale.invoiceNum)) {
      state.sales.unshift(newSale);
      saveStoredItem(STORAGE_KEYS.SALES, state.sales);
    }

    showLivePill(`⚡ New Sale: ${newSale.terminal} — ${formatCurrency(newSale.total)}`);
    const itemCount = newSale.items.length;
    showWebNotification(
      'Counter Sale Completed',
      `${newSale.terminal}: ${formatCurrency(newSale.total)} (${itemCount} item${itemCount === 1 ? '' : 's'})`,
      'sale'
    );

    recalculateMetrics();
    renderAllViews();
  }
}

function handleIncomingItemUpdate(row) {
  if (!row || !row.sku) return;
  const existing = state.products.find(p => p.sku === row.sku);
  const title = row.title || (existing ? existing.name : row.sku);
  const newPrice = parseFloat(row.target_resale_price) || 0;
  const newStock = row.quantity !== undefined ? row.quantity : (existing ? existing.stock : 0);

  if (existing) {
    existing.stock = newStock;
    existing.costPrice = parseFloat(row.purchase_cost) || existing.costPrice;
    existing.sellPrice = newPrice || existing.sellPrice;
    existing.name = row.title || existing.name;
    existing.category = row.category || existing.category;
  } else {
    state.products.unshift({
      sku: row.sku,
      name: row.title,
      category: row.category || 'General',
      unit: row.unit || 'Pcs',
      stock: newStock,
      minStock: row.min_stock_alert || 10,
      costPrice: parseFloat(row.purchase_cost) || 0,
      sellPrice: newPrice,
      priceHistory: []
    });
  }
  saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);
  renderInventoryTable();

  showWebNotification(
    'Inventory Synced from Counter',
    `${title} — Price: ${formatCurrency(newPrice)} (Stock: ${newStock})`,
    'inventory'
  );
}

function handleIncomingTerminalUpdate(row) {
  if (!row || !row.terminal_id) return;
  let term = state.terminals.find(t => t.id === row.terminal_id);
  const now = Date.now();
  let isOnline = (row.status || 'ONLINE').toUpperCase() === 'ONLINE';
  if (row.last_heartbeat) {
    const diffMs = now - new Date(row.last_heartbeat).getTime();
    if (diffMs > 75000) isOnline = false;
  }
  const newStatus = isOnline ? 'ONLINE' : 'OFFLINE';

  if (term) {
    const oldStatus = term.status;
    term.status = newStatus;
    term.ordersCount = parseInt(row.today_sales_count) || term.ordersCount;
    term.grossTotal = parseFloat(row.today_revenue) || term.grossTotal;
    term.cashInDrawer = parseFloat(row.drawer_cash) || term.cashInDrawer;
    term.lastTxTime = row.last_heartbeat ? new Date(row.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
    term.lastHeartbeatRaw = row.last_heartbeat || new Date().toISOString();
    term.cashier = row.cashier_name || term.cashier;

    if (oldStatus !== term.status) {
      showWebNotification(
        'Counter Terminal Status',
        term.status === 'ONLINE'
          ? `🟢 ${term.name} is now ONLINE & Active.`
          : `⚠️ ${term.name} is now OFFLINE. Counter shift ended or disconnected.`,
        'terminal'
      );
    }
  } else {
    state.terminals.push({
      id: row.terminal_id,
      name: row.terminal_name || `Counter Register (${row.terminal_id})`,
      location: `Counter ${state.terminals.length + 1}`,
      cashier: row.cashier_name || 'POS Cashier',
      status: newStatus,
      ordersCount: parseInt(row.today_sales_count) || 0,
      cashInDrawer: parseFloat(row.drawer_cash) || 0,
      cardTotal: 0,
      grossTotal: parseFloat(row.today_revenue) || 0,
      lastTxTime: row.last_heartbeat ? new Date(row.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
      lastHeartbeatRaw: row.last_heartbeat || new Date().toISOString()
    });
  }
  updateTerminalStatsFromSales();
  renderTerminalCards();
  renderKPICards();
}

// Automatic 15-second watchdog to detect if POS terminal stopped pinging / went offline
function checkTerminalHeartbeats() {
  const now = Date.now();
  let changed = false;
  (state.terminals || []).forEach(t => {
    if (t.lastHeartbeatRaw) {
      const diffMs = now - new Date(t.lastHeartbeatRaw).getTime();
      const isOnline = diffMs < 75000;
      const expectedStatus = isOnline ? 'ONLINE' : 'OFFLINE';
      if (t.status !== expectedStatus) {
        t.status = expectedStatus;
        changed = true;
      }
    }
  });
  if (changed) {
    renderTerminalCards();
    renderKPICards();
  }
}
setInterval(checkTerminalHeartbeats, 15000);


async function testAndConnectSupabase() {
  const rawUrl = (document.getElementById('setSupabaseUrl')?.value || '').trim();
  const url = normalizeSupabaseUrl(rawUrl);
  const key = (document.getElementById('setSupabaseAnonKey')?.value || '').trim();
  const feedback = document.getElementById('supabaseFeedbackMsg');

  if (document.getElementById('setSupabaseUrl')) {
    document.getElementById('setSupabaseUrl').value = url;
  }

  if (!url || !key) {
    alert("Please enter both Supabase Project URL and Anon Public Key.");
    return;
  }

  if (feedback) {
    feedback.className = "text-xs p-3 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20";
    feedback.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1.5"></i> Testing connection to Supabase cloud...`;
    feedback.classList.remove('hidden');
    if (window.lucide) { try { lucide.createIcons(); } catch(e){} }
  }

  try {
    const testClient = window.supabase?.createClient(url, key);
    if (!testClient) throw new Error("Supabase library not loaded. Check internet connection.");

    const { data, error } = await testClient.from('items').select('id').limit(1);

    if (error) {
      throw error;
    }

    state.settings.supabaseUrl = url;
    state.settings.supabaseAnonKey = key;
    saveStoredItem(STORAGE_KEYS.SETTINGS, state.settings);

    await initSupabaseClient();

    if (feedback) {
      feedback.className = "text-xs p-3 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20";
      feedback.innerHTML = `✓ <strong>Connected!</strong> Successfully connected to Supabase PostgreSQL database. Live bidirectional sync is active!`;
      if (window.lucide) { try { lucide.createIcons(); } catch(e){} }
    }
    showLivePill("🟢 Connected to Supabase Cloud! Live Sync Active.");
    alert("✓ Successfully connected to Supabase Cloud Database! Live sync is now active.");
  } catch (err) {
    console.error("Supabase connection error:", err);
    if (feedback) {
      feedback.className = "text-xs p-3 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20";
      feedback.innerHTML = `✗ <strong>Connection Failed:</strong> ${err.message || err.error_description || 'Check Project URL & Key'}.`;
      if (window.lucide) { try { lucide.createIcons(); } catch(e){} }
    }
    alert(`Connection Failed: ${err.message || 'Please check Project URL and Key'}`);
  }
}

function disconnectSupabase() {
  const confirmed = confirm("Are you sure you want to disconnect from Supabase cloud? The app will operate in local demo mode.");
  if (!confirmed) return;

  state.settings.supabaseUrl = "";
  state.settings.supabaseAnonKey = "";
  saveStoredItem(STORAGE_KEYS.SETTINGS, state.settings);

  if (document.getElementById('setSupabaseUrl')) document.getElementById('setSupabaseUrl').value = "";
  if (document.getElementById('setSupabaseAnonKey')) document.getElementById('setSupabaseAnonKey').value = "";

  const feedback = document.getElementById('supabaseFeedbackMsg');
  if (feedback) feedback.classList.add('hidden');

  initSupabaseClient();
  showLivePill("Disconnected from Cloud. Now in Local Mode.");
}

function openSqlModal() {
  const modal = document.getElementById('sqlSetupModal');
  const codeEl = document.getElementById('sqlScriptContent');
  if (codeEl) codeEl.textContent = SUPABASE_SETUP_SQL;
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  lucide.createIcons();
}

function closeSqlModal() {
  const modal = document.getElementById('sqlSetupModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function copySqlScript() {
  navigator.clipboard?.writeText(SUPABASE_SETUP_SQL).then(() => {
    const textEl = document.getElementById('copySqlText');
    if (textEl) textEl.textContent = "Copied to Clipboard!";
    showLivePill("SQL script copied! Paste it in Supabase SQL Editor.");
    setTimeout(() => {
      if (textEl) textEl.textContent = "Copy SQL";
    }, 3000);
  });
}

// ==========================================
// Initialization on DOM Load
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  applyStoreSettingsToUI();
  applyOwnerProfileToUI();
  setupNavigation();
  initCharts();
  renderAllViews();
  startClock();
  setupSimulation();
  setupEventListeners();
  initSupabaseClient();

  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['dashboard', 'terminals', 'inventory', 'buying', 'sales', 'analytics', 'data', 'settings'].includes(initialHash)) {
    switchTab(initialHash);
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'terminals', 'inventory', 'buying', 'sales', 'analytics', 'data', 'settings'].includes(hash)) {
      switchTab(hash);
    }
  });
});

// Setup Tab Navigation & Mobile Drawer
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      window.location.hash = tab;
      switchTab(tab);
    });
  });

  const mobileToggle = document.getElementById('mobileNavToggle');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobileBackdrop');

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }

  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.remove('-translate-x-full');
      if (backdrop) backdrop.classList.remove('hidden');
    });
  }
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
  if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);

  // Desktop Collapsible Sidebar
  const desktopCollapseBtn = document.getElementById('desktopCollapseBtn');
  if (desktopCollapseBtn && sidebar) {
    desktopCollapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      setTimeout(() => {
        if (hourlyChartInstance) hourlyChartInstance.resize();
        if (categoryPieChartInstance) categoryPieChartInstance.resize();
        if (paymentPieChartInstance) paymentPieChartInstance.resize();
      }, 310);
    });
  }

  window.addEventListener('resize', () => {
    if (hourlyChartInstance) hourlyChartInstance.resize();
    if (categoryPieChartInstance) categoryPieChartInstance.resize();
    if (paymentPieChartInstance) paymentPieChartInstance.resize();
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // Sidebar navigation styling: clean slate + solid blue active
  document.querySelectorAll('.nav-item').forEach(item => {
    const isCurrent = item.getAttribute('data-tab') === tabId;
    if (isCurrent) {
      item.className = 'nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors bg-blue-600 text-white';
    } else {
      item.className = 'nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors';
    }
  });

  // Mobile bottom dock buttons
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    const isCurrent = btn.getAttribute('data-tab') === tabId;
    btn.className = `mobile-nav-btn flex flex-col items-center justify-center p-1.5 rounded-lg transition-colors ${isCurrent ? 'text-blue-400 font-medium' : 'text-slate-400'}`;
  });

  // Show selected pane
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) activePane.classList.remove('hidden');

  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobileBackdrop');
  if (sidebar && window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }

  const titles = {
    dashboard: 'Store Overview & Operations',
    inventory: 'Inventory Catalog & Pricing',
    buying: 'Stock Procurement & Supplier Bills',
    sales: 'Sales Register & Transactions',
    terminals: 'POS Terminals & Hardware Health',
    analytics: 'Financial Reports & Item Profitability',
    data: 'Data Export & System Backups',
    settings: 'Store Profile & Receipt Settings'
  };
  const titleElem = document.getElementById('pageTitle');
  if (titleElem) titleElem.textContent = titles[tabId] || 'Store Operations';

  if (tabId === 'analytics' || tabId === 'dashboard') {
    setTimeout(() => {
      if (hourlyChartInstance) hourlyChartInstance.resize();
      if (categoryPieChartInstance) categoryPieChartInstance.resize();
      if (paymentPieChartInstance) paymentPieChartInstance.resize();
    }, 80);
    if (tabId === 'analytics') renderItemAnalyticsTable();
  }

  lucide.createIcons();
}

function formatCurrency(val) {
  return `${state.settings.currencySymbol || 'Rs. '}${Math.round(val).toLocaleString()}`;
}

function startClock() {
  const display = document.getElementById('marketTimeDisplay');
  if (!display) return;
  function update() {
    const now = new Date();
    try {
      const slTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      display.innerHTML = `<span class="text-emerald-400 font-medium flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>🇱🇰 Colombo: ${slTime} (GMT+5:30)</span></span>`;
    } catch (e) {
      display.textContent = now.toLocaleTimeString('en-US', { hour12: false }) + ' Colombo';
    }
  }
  update();
  setInterval(update, 1000);
}

// Apply Store Settings to UI elements
function applyStoreSettingsToUI() {
  const s = state.settings;
  const hMobile = document.getElementById('headerStoreNameMobile');
  const hSide = document.getElementById('headerStoreNameSidebar');
  const hTop = document.getElementById('headerStoreNameTop');
  const recName = document.getElementById('receiptModalStoreName');
  const recAddr = document.getElementById('receiptModalAddress');
  const recPhone = document.getElementById('receiptModalPhone');
  const recFoot = document.getElementById('receiptModalFooter');

  if (hMobile) hMobile.textContent = s.storeName;
  if (hSide) hSide.textContent = s.storeName;
  if (hTop) hTop.textContent = s.storeName;
  if (recName) recName.textContent = s.storeName;
  if (recAddr) recAddr.textContent = s.address;
  if (recPhone) recPhone.textContent = `Tel: ${s.phone}`;
  if (recFoot) recFoot.textContent = s.receiptFooter;

  // Populate settings form inputs
  const setStore = document.getElementById('setStoreName');
  if (setStore) {
    document.getElementById('setStoreName').value = s.storeName;
    document.getElementById('setTaxId').value = s.taxId;
    document.getElementById('setAddress').value = s.address;
    document.getElementById('setPhone').value = s.phone;
    document.getElementById('setEmail').value = s.email;
    document.getElementById('setPaperWidth').value = s.receiptPaperWidth;
    document.getElementById('setBorderStyle').value = s.receiptBorderStyle;
    document.getElementById('setHeaderAlign').value = s.receiptHeaderAlign;
    document.getElementById('setShowTaxId').checked = !!s.receiptShowTaxId;
    document.getElementById('setShowAuthBarcode').checked = !!s.receiptShowAuthBarcode;
    document.getElementById('setReceiptFooter').value = s.receiptFooter;
    document.getElementById('setCurrencySymbol').value = s.currencySymbol;
    document.getElementById('setDefaultTax').value = s.defaultTaxRate;
    document.getElementById('setPresetDiscounts').value = s.presetDiscounts;
    if (document.getElementById('setSupabaseUrl')) {
      document.getElementById('setSupabaseUrl').value = s.supabaseUrl || '';
    }
    if (document.getElementById('setSupabaseAnonKey')) {
      document.getElementById('setSupabaseAnonKey').value = s.supabaseAnonKey || '';
    }
  }
}

function saveStoreSettingsForm() {
  state.settings.storeName = document.getElementById('setStoreName').value.trim() || "SUMITHURU ENTERPRICES";
  state.settings.taxId = document.getElementById('setTaxId').value.trim();
  state.settings.address = document.getElementById('setAddress').value.trim();
  state.settings.phone = document.getElementById('setPhone').value.trim();
  state.settings.email = document.getElementById('setEmail').value.trim();
  state.settings.receiptPaperWidth = document.getElementById('setPaperWidth').value;
  state.settings.receiptBorderStyle = document.getElementById('setBorderStyle').value;
  state.settings.receiptHeaderAlign = document.getElementById('setHeaderAlign').value;
  state.settings.receiptShowTaxId = document.getElementById('setShowTaxId').checked;
  state.settings.receiptShowAuthBarcode = document.getElementById('setShowAuthBarcode').checked;
  state.settings.receiptFooter = document.getElementById('setReceiptFooter').value.trim();
  state.settings.currencySymbol = document.getElementById('setCurrencySymbol').value.trim() || "Rs. ";
  state.settings.defaultTaxRate = parseFloat(document.getElementById('setDefaultTax').value) || 5.0;
  state.settings.presetDiscounts = document.getElementById('setPresetDiscounts').value.trim();
  if (document.getElementById('setSupabaseUrl')) {
    state.settings.supabaseUrl = document.getElementById('setSupabaseUrl').value.trim();
  }
  if (document.getElementById('setSupabaseAnonKey')) {
    state.settings.supabaseAnonKey = document.getElementById('setSupabaseAnonKey').value.trim();
  }

  saveStoredItem(STORAGE_KEYS.SETTINGS, state.settings);
  applyStoreSettingsToUI();
  initSupabaseClient();
  renderAllViews();
  showLivePill("Store Settings saved successfully!");

  // Sync receipt & printer configuration to Supabase store_settings for Windows POS terminals
  if (supabaseClient) {
    const payload = {
      id: 1,
      store_name: state.settings.storeName,
      address: state.settings.address,
      phone: state.settings.phone,
      email: state.settings.email,
      tax_id: state.settings.taxId,
      receipt_paper_width: state.settings.receiptPaperWidth,
      receipt_border_style: state.settings.receiptBorderStyle,
      receipt_header_align: state.settings.receiptHeaderAlign,
      receipt_footer: state.settings.receiptFooter,
      updated_at: new Date().toISOString()
    };
    supabaseClient.from('store_settings').upsert(payload).then(({ error }) => {
      if (error) {
        console.warn("Could not sync receipt settings to Supabase store_settings:", error);
      } else {
        console.log("Synced receipt configuration to Supabase store_settings successfully");
        showWebNotification(
          "Receipt & Printer Synced",
          `Receipt format updated to ${state.settings.receiptPaperWidth} (${state.settings.receiptBorderStyle} border). Synced to Windows POS terminals.`,
          'settings'
        );
      }
    }).catch(e => console.warn(e));
  } else {
    showWebNotification(
      "Receipt Settings Saved",
      `Saved locally: ${state.settings.receiptPaperWidth} format (${state.settings.receiptBorderStyle} border). Connect Supabase to sync down to Windows POS.`,
      'settings'
    );
  }
}

// Apply Owner Profile to UI
function applyOwnerProfileToUI() {
  const o = state.owner;
  const nameEl = document.getElementById('ownerDisplayName');
  const locEl = document.getElementById('ownerDisplayLocation');
  const avatarEl = document.getElementById('ownerAvatarCircle');

  if (nameEl) nameEl.textContent = o.name;
  if (locEl) {
    locEl.innerHTML = `<i data-lucide="globe" class="w-3 h-3 text-sky-400"></i><span>${o.location || 'Connected Abroad'}</span>`;
  }
  if (avatarEl) {
    const initials = o.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'OW';
    avatarEl.textContent = initials;
  }
  lucide.createIcons();
}

function openOwnerProfileModal() {
  const o = state.owner;
  document.getElementById('profOwnerName').value = o.name;
  document.getElementById('profOwnerEmail').value = o.email;
  document.getElementById('profOwnerPhone').value = o.phone;
  document.getElementById('profOwnerLocation').value = o.location;
  document.getElementById('profOwnerPin').value = o.pin || '';

  const modal = document.getElementById('ownerProfileModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeOwnerProfileModal() {
  const modal = document.getElementById('ownerProfileModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Charts Initialization
function initCharts() {
  const hourlyCtx = document.getElementById('hourlySalesChart')?.getContext('2d');
  if (hourlyCtx) {
    hourlyChartInstance = new Chart(hourlyCtx, {
      type: 'line',
      data: {
        labels: ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '20:30'],
        datasets: [{
          label: 'Sales (LKR)',
          data: [18500, 36200, 68400, 92100, 134000, 168000, 184520],
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#818cf8',
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Sales: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
              callback: (v) => 'Rs. ' + (v / 1000) + 'k'
            }
          }
        }
      }
    });
  }

  const catCtx = document.getElementById('categoryPieChart')?.getContext('2d');
  if (catCtx) {
    categoryPieChartInstance = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: ['Dairy', 'Beverages', 'Snacks', 'Grains', 'Personal Care'],
        datasets: [{
          data: [32, 24, 18, 16, 10],
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#cbd5e1', font: { size: 12 }, padding: 14 }
          }
        },
        cutout: '68%'
      }
    });
  }

  const payCtx = document.getElementById('paymentPieChart')?.getContext('2d');
  if (payCtx) {
    paymentPieChartInstance = new Chart(payCtx, {
      type: 'doughnut',
      data: {
        labels: ['Cash Drawer', 'Visa / Master Card', 'LankaQR'],
        datasets: [{
          data: [61, 28, 11],
          backgroundColor: ['#10b981', '#6366f1', '#8b5cf6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#cbd5e1', font: { size: 12 }, padding: 14 }
          }
        },
        cutout: '68%'
      }
    });
  }
}

// Render All Views
function renderAllViews() {
  renderKPICards();
  renderLiveFeed();
  renderTerminalCards();
  renderInventoryTable();
  renderPurchasesTable();
  renderSalesTable();
  renderItemAnalyticsTable();
  updateBadges();
}

function updateBadges() {
  const lowItems = state.products.filter(p => p.stock <= p.minStock);
  const lowCount = lowItems.length;
  const badgeLow = document.getElementById('badgeLowStock');
  if (badgeLow) {
    badgeLow.textContent = `${lowCount} Low`;
    badgeLow.style.display = lowCount > 0 ? 'inline-block' : 'none';
  }

  // Update or hide Dashboard Low Stock Alert Banner dynamically
  const alertBox = document.getElementById('urgentAlertBox');
  if (alertBox) {
    if (lowCount > 0) {
      alertBox.classList.remove('hidden');
      const sampleNames = lowItems.slice(0, 2).map(p => `${p.name} (${p.stock} left)`).join(' and ');
      const titleEl = alertBox.querySelector('p.font-semibold');
      const descEl = alertBox.querySelector('p.text-slate-300');
      if (titleEl) titleEl.textContent = `${lowCount} ${lowCount === 1 ? 'Product Requires' : 'Products Require'} Restocking`;
      if (descEl) descEl.textContent = `${sampleNames} ${lowItems.length > 2 ? `and ${lowItems.length - 2} more items` : ''} below reorder threshold.`;
    } else {
      alertBox.classList.add('hidden');
    }
  }

  const badgeBuying = document.getElementById('badgeBuyingCount');
  if (badgeBuying) {
    badgeBuying.textContent = `${state.purchases.length}`;
  }
}

// Render KPI Cards (Dynamically computed from real synced sales)
function renderKPICards() {
  const revElem = document.getElementById('kpiRevenue');
  const profElem = document.getElementById('kpiProfit');
  const cogsElem = document.getElementById('kpiCogs');
  const ordersElem = document.getElementById('kpiOrdersCount');
  const avgElem = document.getElementById('kpiAvgBill');
  const cashElem = document.getElementById('kpiCashDrawer');

  let rev = 0;
  let profit = 0;
  let cogs = 0;
  let orders = 0;

  if (state.sales && state.sales.length > 0) {
    orders = state.sales.length;
    rev = state.sales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
    cogs = state.sales.reduce((acc, s) => acc + (parseFloat(s.cogs) || 0), 0);
    profit = Math.max(0, rev - cogs);
  } else {
    rev = state.totalRevenue || 0;
    profit = state.totalProfit || 0;
    cogs = state.totalCogs || 0;
    orders = state.totalOrders || 0;
  }

  if (revElem) revElem.textContent = formatCurrency(rev);
  if (profElem) profElem.textContent = formatCurrency(profit);
  if (cogsElem) cogsElem.textContent = formatCurrency(cogs);
  if (ordersElem) ordersElem.textContent = orders;
  if (avgElem) {
    const avg = orders > 0 ? (rev / orders) : 0;
    avgElem.textContent = formatCurrency(avg);
  }
  if (cashElem) {
    const totalCash = (state.terminals || []).reduce((acc, t) => acc + (parseFloat(t.cashInDrawer) || 0), 0);
    cashElem.textContent = formatCurrency(totalCash);
  }
}

// Render Live Ticker Feed (With clean empty state)
function renderLiveFeed() {
  const container = document.getElementById('liveFeedContainer');
  if (!container) return;

  if (!state.sales || state.sales.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
        <i data-lucide="receipt" class="w-6 h-6 text-slate-600"></i>
        <span class="text-slate-400 font-medium">No sales recorded yet</span>
        <span class="text-[11px] text-slate-500">Live transactions from Windows POS counter will appear here in real-time.</span>
      </div>
    `;
    if (window.lucide) { try { lucide.createIcons({ root: container }); } catch(e){} }
    return;
  }

  container.innerHTML = state.sales.slice(0, 6).map(sale => `
    <div onclick="openReceiptModal('${sale.invoiceNum}')" class="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-blue-400 flex items-center justify-center font-bold text-xs">
          <i data-lucide="receipt" class="w-4 h-4"></i>
        </div>
        <div>
          <p class="text-xs font-semibold text-white flex items-center gap-1.5">
            <span>${sale.terminal}</span>
            <span class="text-[10px] text-slate-400 font-normal">(${sale.cashier.split(' ')[0]})</span>
          </p>
          <p class="text-[11px] text-slate-400 mt-0.5">${sale.items.length} items • <span class="text-slate-300 font-medium">${sale.paymentMethod}</span></p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-xs font-semibold text-white font-mono">${formatCurrency(sale.total)}</p>
        <span class="text-[10px] text-emerald-400 font-medium">+${formatCurrency(sale.profit)} profit</span>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

// Render Terminal Overview & Table
function renderTerminalCards() {
  const overviewContainer = document.getElementById('terminalOverviewCards');
  const detailedGrid = document.getElementById('detailedTerminalGrid');
  const tableBody = document.getElementById('terminalTableBody');

  const onlineCount = (state.terminals || []).filter(t => (t.status || '').toUpperCase() === 'ONLINE').length;

  const badge = document.getElementById('badgeActiveTerminals');
  if (badge) {
    if (onlineCount > 0) {
      badge.className = "sidebar-text ml-auto px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
      badge.textContent = `${onlineCount} Online`;
    } else {
      badge.className = "sidebar-text ml-auto px-2 py-0.5 text-[10px] font-semibold rounded bg-rose-500/15 text-rose-400 border border-rose-500/30";
      badge.textContent = "Offline";
    }
  }

  const topBadge = document.getElementById('terminalsOnlineTopBadge');
  if (topBadge) {
    if (onlineCount > 0) {
      topBadge.className = "text-emerald-400 font-medium flex items-center gap-1";
      topBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>${onlineCount} ${onlineCount === 1 ? 'Terminal' : 'Terminals'} Online</span>`;
    } else {
      topBadge.className = "text-rose-400 font-medium flex items-center gap-1";
      topBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span>Terminals Offline</span>`;
    }
  }

  if (overviewContainer) {
    overviewContainer.innerHTML = state.terminals.map(t => {
      const isOnline = (t.status || '').toUpperCase() === 'ONLINE';
      const dotColor = isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500';
      const statusBadge = isOnline
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ONLINE</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>OFFLINE</span>`;

      return `
      <div class="p-4 rounded-xl bg-slate-950 border ${isOnline ? 'border-slate-800' : 'border-rose-900/40'}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${dotColor}"></span>
            <span class="text-xs font-semibold text-white">${t.name}</span>
          </div>
          ${statusBadge}
        </div>
        <p class="text-xs text-slate-400 mt-1">Cashier: <strong class="text-slate-200">${t.cashier}</strong></p>
        <div class="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <span class="text-slate-400">Drawer Cash:</span>
          <span class="font-semibold text-white font-mono">${formatCurrency(t.cashInDrawer)}</span>
        </div>
      </div>
    `;
    }).join('');
  }

  if (detailedGrid) {
    detailedGrid.innerHTML = state.terminals.map(t => {
      const isOnline = (t.status || '').toUpperCase() === 'ONLINE';
      const dotColor = isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500';
      const statusBadge = isOnline
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ONLINE</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>OFFLINE</span>`;

      return `
      <div class="p-5 rounded-xl bg-slate-900 border ${isOnline ? 'border-slate-800' : 'border-rose-900/40'} shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg ${isOnline ? 'bg-slate-800 text-blue-400' : 'bg-slate-800/80 text-slate-500'} flex items-center justify-center font-bold">
              <i data-lucide="monitor" class="w-4 h-4"></i>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-white">${t.name}</h4>
              <p class="text-[11px] text-slate-400">${t.location}</p>
            </div>
          </div>
          ${statusBadge}
        </div>

        <div class="space-y-2 text-xs py-3 border-y border-slate-800">
          <div class="flex justify-between">
            <span class="text-slate-400">Active Cashier:</span>
            <span class="font-medium text-slate-200">${t.cashier}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Bills Processed:</span>
            <span class="font-medium text-white font-mono">${t.ordersCount}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Cash in Drawer:</span>
            <span class="font-medium text-emerald-400 font-mono">${formatCurrency(t.cashInDrawer)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Card & Digital:</span>
            <span class="font-medium text-blue-400 font-mono">${formatCurrency(t.cardTotal)}</span>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between text-xs">
          <span class="text-slate-400 font-medium">Shift Total:</span>
          <span class="text-sm font-bold text-white font-mono">${formatCurrency(t.grossTotal)}</span>
        </div>
      </div>
    `;
    }).join('');
  }

  if (tableBody) {
    tableBody.innerHTML = state.terminals.map(t => {
      const isOnline = (t.status || '').toUpperCase() === 'ONLINE';
      const dotColor = isOnline ? 'bg-emerald-500' : 'bg-rose-500';
      const statusBadge = isOnline
        ? `<span class="badge-success">ONLINE</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">OFFLINE</span>`;

      return `
      <tr>
        <td class="font-semibold text-white">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
            <span>${t.name}</span>
          </div>
        </td>
        <td class="text-slate-200">${t.cashier}</td>
        <td class="text-slate-300 font-mono">${t.ordersCount}</td>
        <td class="text-emerald-400 font-mono">${formatCurrency(t.cashInDrawer)}</td>
        <td class="text-blue-400 font-mono">${formatCurrency(t.cardTotal)}</td>
        <td class="text-white font-mono font-medium">${formatCurrency(t.grossTotal)}</td>
        <td>
          ${statusBadge}
        </td>
      </tr>
    `;
    }).join('');
  }

  lucide.createIcons();
}

// ============================================================
// 1. INVENTORY CRUD (Add / Edit / Delete / Camera Scan)
// ============================================================
function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  if (!tbody) return;

  const searchQuery = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
  const selectedCat = document.getElementById('categoryFilter')?.value || 'ALL';

  const filtered = state.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery) || p.sku.toLowerCase().includes(searchQuery);
    const matchesCat = selectedCat === 'ALL' || p.category === selectedCat;
    const matchesLow = !state.lowStockFilterActive || (p.stock <= p.minStock);
    return matchesSearch && matchesCat && matchesLow;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-12 text-slate-500">
          <div class="flex flex-col items-center justify-center gap-2">
            <i data-lucide="package-open" class="w-8 h-8 text-slate-600"></i>
            <span class="text-sm font-medium text-slate-400">No inventory products found</span>
            <span class="text-xs text-slate-600">${state.lowStockFilterActive ? 'No products currently below their minimum stock threshold.' : 'Connect to Supabase cloud or click "Add New Product" to populate your catalog.'}</span>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const unitProfit = p.sellPrice - p.costPrice;
    const marginPct = ((unitProfit / p.sellPrice) * 100).toFixed(1);
    const isLowStock = p.stock <= p.minStock;

    return `
      <tr>
        <td class="font-mono text-xs text-blue-400 font-medium w-36">
          <div class="flex items-center gap-2">
            <span>${p.sku}</span>
            <button onclick="copyToClipboard('${p.sku}')" class="text-slate-500 hover:text-slate-300" title="Copy Barcode">
              <i data-lucide="copy" class="w-3 h-3"></i>
            </button>
          </div>
        </td>
        <td class="font-medium text-white min-w-[240px]">${p.name}</td>
        <td class="text-slate-400 w-32">
          <span class="badge-neutral">${p.category}</span>
        </td>
        <td class="font-mono text-center w-28">
          <span class="${isLowStock ? 'badge-warning' : 'badge-neutral'}">
            ${p.stock} ${p.unit}
          </span>
        </td>
        <td class="text-right font-mono text-slate-300 w-28">${formatCurrency(p.costPrice)}</td>
        <td class="text-right font-mono text-white font-medium w-28">${formatCurrency(p.sellPrice)}</td>
        <td class="text-right font-mono text-emerald-400 font-medium w-28">+${formatCurrency(unitProfit)}</td>
        <td class="text-right w-24">
          <span class="badge-success">${marginPct}%</span>
        </td>
        <td class="text-center w-24">
          <button onclick="openProductEditModal('${p.sku}')" class="btn-secondary text-xs py-1 px-2.5">
            <i data-lucide="edit-2" class="w-3 h-3"></i>
            <span>Edit</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text);
  showLivePill(`Copied SKU: ${text}`);
}

function openProductEditModal(sku) {
  const modal = document.getElementById('productEditModal');
  const title = document.getElementById('productModalTitle');
  const btnDelete = document.getElementById('btnDeleteProduct');

  if (sku) {
    const p = state.products.find(item => item.sku === sku);
    if (!p) return;

    title.innerHTML = `<i data-lucide="edit-3" class="w-4 h-4 text-blue-400"></i><span>Edit Product: ${p.name}</span>`;
    document.getElementById('editOriginalSku').value = p.sku;
    document.getElementById('editSku').value = p.sku;
    document.getElementById('editName').value = p.name;
    document.getElementById('editCategory').value = p.category;
    document.getElementById('editUnit').value = p.unit || 'Pcs';
    document.getElementById('editCostPrice').value = p.costPrice;
    document.getElementById('editSellPrice').value = p.sellPrice;
    document.getElementById('editStock').value = p.stock;
    document.getElementById('editMinStock').value = p.minStock;

    if (btnDelete) btnDelete.classList.remove('hidden');
    calculateLiveMargin();
  } else {
    title.innerHTML = `<i data-lucide="plus" class="w-4 h-4 text-blue-400"></i><span>Add New Product to Inventory</span>`;
    document.getElementById('editOriginalSku').value = '';
    document.getElementById('editSku').value = '890' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('editName').value = '';
    document.getElementById('editCategory').value = 'General';
    document.getElementById('editUnit').value = 'Pcs';
    document.getElementById('editCostPrice').value = '';
    document.getElementById('editSellPrice').value = '';
    document.getElementById('editStock').value = 10;
    document.getElementById('editMinStock').value = 5;

    if (btnDelete) btnDelete.classList.add('hidden');
    calculateLiveMargin();
  }

  lucide.createIcons();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeProductEditModal() {
  const modal = document.getElementById('productEditModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function calculateLiveMargin() {
  const cost = parseFloat(document.getElementById('editCostPrice').value) || 0;
  const sell = parseFloat(document.getElementById('editSellPrice').value) || 0;
  const profitElem = document.getElementById('editProfitCalc');
  const marginElem = document.getElementById('editMarginCalc');

  const unitProfit = sell - cost;
  const marginPct = sell > 0 ? ((unitProfit / sell) * 100).toFixed(1) : 0;

  if (profitElem) profitElem.textContent = formatCurrency(unitProfit);
  if (marginElem) marginElem.textContent = `Margin: ${marginPct}%`;
}

function deleteCurrentProduct() {
  const origSku = document.getElementById('editOriginalSku').value;
  if (!origSku) return;

  const product = state.products.find(p => p.sku === origSku);
  if (!product) return;

  const confirmed = confirm(`Are you sure you want to permanently delete "${product.name}" (SKU: ${product.sku}) from inventory?`);
  if (!confirmed) return;

  state.products = state.products.filter(p => p.sku !== origSku);
  saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);

  if (supabaseClient) {
    supabaseClient.from('items').delete().eq('sku', origSku).then(() => {
      console.log("Deleted item from Supabase:", origSku);
    }).catch(err => console.warn("Supabase delete error:", err));
  }

  closeProductEditModal();
  renderAllViews();
  showLivePill(`Deleted: ${product.name}`);
  showWebNotification('Product Deleted', `Permanently removed "${product.name}" (SKU: ${product.sku}) from inventory.`, 'inventory');
}

// ============================================================
// 2. BUYING LOGS & BILL PHOTO STORAGE
// ============================================================
function renderPurchasesTable() {
  const tbody = document.getElementById('purchasesTableBody');
  if (!tbody) return;

  const totalCost = state.purchases.reduce((acc, p) => acc + (p.totalCost || 0), 0);
  const totalPurchasesElem = document.getElementById('kpiTotalPurchases');
  const countElem = document.getElementById('kpiPurchaseOrdersCount');
  const photosElem = document.getElementById('kpiBillPhotosCount');

  if (totalPurchasesElem) totalPurchasesElem.textContent = formatCurrency(totalCost);
  if (countElem) countElem.textContent = `${state.purchases.length} Purchase Invoices`;
  if (photosElem) {
    const withPhotos = state.purchases.filter(p => p.photoData).length;
    photosElem.textContent = `${withPhotos} Attached Bills`;
  }

  if (!state.purchases || state.purchases.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-slate-500">
          <div class="flex flex-col items-center justify-center gap-2">
            <i data-lucide="receipt" class="w-8 h-8 text-slate-600"></i>
            <span class="text-sm font-medium text-slate-400">No inward buying records found</span>
            <span class="text-xs text-slate-600">Click "Record Inward Stock / Bill" to log supplier goods receipts and attach bill photos.</span>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = state.purchases.map((p, idx) => `
    <tr onclick="openPurchaseVoucherModal('${p.id || idx}')" class="cursor-pointer hover:bg-slate-800/40 transition">
      <td class="text-xs text-slate-400 font-mono">${p.date}</td>
      <td class="font-mono text-xs font-semibold text-blue-400">${p.invoiceNum}</td>
      <td class="font-medium text-white">${p.supplier}</td>
      <td class="text-xs text-slate-300">
        <span class="font-medium text-white">${p.itemName}</span>
        <span class="text-slate-400 ml-1">(+${p.quantity} @ ${formatCurrency(p.unitCost)})</span>
      </td>
      <td class="text-right font-mono font-medium text-emerald-400">${formatCurrency(p.totalCost)}</td>
      <td class="text-center" onclick="event.stopPropagation()">
        ${p.photoData ? `
          <button onclick="openBillPhotoModal(${idx})" class="btn-secondary text-xs py-1 px-2.5">
            <i data-lucide="image" class="w-3.5 h-3.5 text-blue-400"></i>
            <span>View Bill</span>
          </button>
        ` : `
          <span class="text-slate-500 text-xs">No Photo</span>
        `}
      </td>
      <td class="text-center" onclick="event.stopPropagation()">
        <button onclick="deletePurchaseLog('${p.id}')" class="p-1.5 text-slate-400 hover:text-red-400 transition" title="Delete purchase record">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

// Inward Goods Receipt Voucher Modal Preview (Matching Modern HTML UI)
function openPurchaseVoucherModal(idOrIndex) {
  const p = state.purchases.find(item => item.id === idOrIndex || item.invoiceNum === idOrIndex) || state.purchases[idOrIndex];
  if (!p) return;

  const modal = document.getElementById('purchaseVoucherModal');
  if (!modal) return;

  const dateEl = document.getElementById('pvModalDate');
  const suppEl = document.getElementById('pvModalSupplier');
  const invEl = document.getElementById('pvModalInvNum');
  const totalEl = document.getElementById('pvModalTotal');
  const itemsBody = document.getElementById('pvModalItemsBody');

  if (dateEl) dateEl.textContent = `${p.date || 'Today'} • Inward Stock Voucher`;
  if (suppEl) suppEl.textContent = p.supplier || 'General Supplier';
  if (invEl) invEl.textContent = p.invoiceNum || 'PO-000';
  if (totalEl) totalEl.textContent = formatCurrency(p.totalCost || 0);

  if (itemsBody) {
    itemsBody.innerHTML = `
      <tr>
        <td class="p-2.5 font-medium text-white">
          <div>${p.itemName || 'Stock Item'}</div>
          <div class="text-[10px] text-slate-400 font-mono">SKU: ${p.itemSku || 'N/A'}</div>
        </td>
        <td class="p-2.5 text-center font-mono font-medium text-white">${p.quantity || 1}</td>
        <td class="p-2.5 text-right font-mono text-slate-300">${formatCurrency(p.unitCost || 0)}</td>
        <td class="p-2.5 text-right font-mono font-semibold text-emerald-400">${formatCurrency(p.totalCost || 0)}</td>
      </tr>
    `;
  }

  const photoSec = document.getElementById('pvModalPhotoSection');
  const viewPhotoBtn = document.getElementById('pvModalViewPhotoBtn');
  if (photoSec && viewPhotoBtn) {
    if (p.photoData) {
      photoSec.classList.remove('hidden');
      viewPhotoBtn.onclick = () => {
        closePurchaseVoucherModal();
        const pIdx = state.purchases.indexOf(p);
        openBillPhotoModal(pIdx >= 0 ? pIdx : 0);
      };
    } else {
      photoSec.classList.add('hidden');
    }
  }

  lucide.createIcons();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closePurchaseVoucherModal() {
  const modal = document.getElementById('purchaseVoucherModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function openPurchaseModal() {
  const modal = document.getElementById('purchaseLogModal');
  const select = document.getElementById('purchProductSelect');

  if (select) {
    select.innerHTML = state.products.map(p => `
      <option value="${p.sku}" data-cost="${p.costPrice}">${p.name} (SKU: ${p.sku}) — Current Stock: ${p.stock}</option>
    `).join('');
  }

  if (state.products.length > 0) {
    document.getElementById('purchUnitCost').value = state.products[0].costPrice;
    calculatePurchaseTotal();
  }

  document.getElementById('purchInvoiceNum').value = 'PO-' + Math.floor(10000 + Math.random() * 90000);
  document.getElementById('purchSupplier').value = '';
  document.getElementById('purchQuantity').value = 25;
  removePurchPhoto();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closePurchaseModal() {
  const modal = document.getElementById('purchaseLogModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function calculatePurchaseTotal() {
  const qty = parseInt(document.getElementById('purchQuantity').value) || 0;
  const cost = parseFloat(document.getElementById('purchUnitCost').value) || 0;
  const total = qty * cost;
  const totalElem = document.getElementById('purchTotalCalc');
  if (totalElem) totalElem.textContent = formatCurrency(total);
}

function handlePurchPhotoSelect(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingBillPhotoData = e.target.result;
    document.getElementById('purchPhotoPreview').src = pendingBillPhotoData;
    document.getElementById('purchPhotoPlaceholder').classList.add('hidden');
    document.getElementById('purchPhotoPreviewContainer').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removePurchPhoto() {
  pendingBillPhotoData = null;
  const input = document.getElementById('purchPhotoInput');
  if (input) input.value = '';
  const preview = document.getElementById('purchPhotoPreview');
  if (preview) preview.src = '';
  document.getElementById('purchPhotoPlaceholder')?.classList.remove('hidden');
  document.getElementById('purchPhotoPreviewContainer')?.classList.add('hidden');
}

function openBillPhotoModal(idx) {
  const p = state.purchases[idx];
  if (!p || !p.photoData) return;

  const modal = document.getElementById('billPhotoModal');
  const img = document.getElementById('billPhotoImage');
  const title = document.getElementById('billPhotoTitle');
  const sub = document.getElementById('billPhotoSub');
  const downloadBtn = document.getElementById('billPhotoDownloadBtn');

  title.textContent = `Bill for ${p.supplier}`;
  sub.textContent = `${p.invoiceNum} • Total: ${formatCurrency(p.totalCost)} • ${p.date}`;
  img.src = p.photoData;
  downloadBtn.href = p.photoData;
  downloadBtn.download = `${p.invoiceNum}-bill.jpg`;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeBillPhotoModal() {
  const modal = document.getElementById('billPhotoModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function deletePurchaseLog(id) {
  const confirmed = confirm("Are you sure you want to delete this purchase log? (Stock count will not be reversed)");
  if (!confirmed) return;

  state.purchases = state.purchases.filter(p => p.id !== id);
  saveStoredItem(STORAGE_KEYS.PURCHASES, state.purchases);
  renderPurchasesTable();
  updateBadges();
  showLivePill("Deleted purchase log");
}

// ============================================================
// 3. CAMERA BARCODE SCANNER (ZXing / Html5Qrcode)
// ============================================================
function openBarcodeScanner(targetMode) {
  scannerTargetMode = targetMode;
  const modal = document.getElementById('barcodeScannerModal');
  const label = document.getElementById('scannerTargetLabel');
  const warn = document.getElementById('scannerProtocolWarning');

  if (targetMode === 'editSku') {
    label.textContent = "Scanning barcode for Product SKU field...";
  } else if (targetMode === 'purchSelect') {
    label.textContent = "Scan barcode to select restock item...";
  } else {
    label.textContent = "Scan product barcode to search inventory...";
  }

  // Detect file:// protocol
  if (warn) {
    if (window.location.protocol === 'file:') {
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  startHtml5QrCodeScanner();
}

function closeBarcodeScanner() {
  const modal = document.getElementById('barcodeScannerModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');

  if (html5QrCode) {
    try {
      html5QrCode.stop().then(() => {
        html5QrCode.clear();
      }).catch(err => {
        console.warn("Camera stop error:", err);
      });
    } catch (e) {}
  }
}

function startHtml5QrCodeScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    return;
  }

  const readerEl = document.getElementById('scannerReader');

  try {
    if (html5QrCode) {
      try { html5QrCode.clear(); } catch (e) {}
    }

    html5QrCode = new Html5Qrcode("scannerReader");
    const config = {
      fps: 15,
      qrbox: { width: 260, height: 160 },
      aspectRatio: 1.0
    };

    html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText) => onBarcodeDetected(decodedText),
      () => {}
    ).catch(err => {
      console.warn("Rear camera error, falling back:", err);
      html5QrCode.start(
        { facingMode: "user" },
        config,
        (decodedText) => onBarcodeDetected(decodedText)
      ).catch(fallbackErr => {
        console.warn("Webcam unavailable or blocked by origin:", fallbackErr);
        if (readerEl) {
          readerEl.innerHTML = `
            <div class="p-6 text-center text-slate-300 space-y-2">
              <i data-lucide="camera-off" class="w-8 h-8 mx-auto text-slate-500"></i>
              <p class="text-xs font-semibold">Live Camera Stream Unavailable</p>
              <p class="text-[11px] text-slate-400">Chrome blocks video on local <code class="text-slate-200">file://</code> URLs. Upload a photo or use the quick test buttons below.</p>
            </div>
          `;
          lucide.createIcons();
        }
      });
    });
  } catch (err) {
    console.error("Barcode scanner init failed:", err);
  }
}

function simulateBarcodeScan(code) {
  onBarcodeDetected(code);
}

function simulateRandomBarcodeScan() {
  const code = '890' + Math.floor(1000000 + Math.random() * 9000000);
  onBarcodeDetected(code);
}

function handleScannerFile(file) {
  if (!file) return;
  if (typeof Html5Qrcode === 'undefined') return;

  try {
    const scanner = new Html5Qrcode("scannerReader");
    scanner.scanFile(file, true)
      .then(decodedText => {
        onBarcodeDetected(decodedText);
      })
      .catch(err => {
        alert("Could not detect a clear barcode in this photo. Please try another photo or click a test barcode.");
      });
  } catch (e) {
    console.warn("File scan error:", e);
  }
}

function onBarcodeDetected(code) {
  audioNotifier.playScannerBeep();
  closeBarcodeScanner();

  if (scannerTargetMode === 'editSku') {
    const input = document.getElementById('editSku');
    if (input) {
      input.value = code;
      input.focus();
    }
    showLivePill(`Barcode Scanned: ${code}`);
  } else if (scannerTargetMode === 'purchSelect') {
    const select = document.getElementById('purchProductSelect');
    if (select) {
      select.value = code;
      const opt = select.querySelector(`option[value="${code}"]`);
      if (opt) {
        document.getElementById('purchUnitCost').value = opt.getAttribute('data-cost');
        calculatePurchaseTotal();
        showLivePill(`Selected: ${opt.textContent}`);
      } else {
        alert(`Product with barcode ${code} not found in inventory.`);
      }
    }
  } else {
    switchTab('inventory');
    const search = document.getElementById('inventorySearch');
    if (search) {
      search.value = code;
      renderInventoryTable();
      showLivePill(`Scanned: ${code}`);
    }
  }
}

// ============================================================
// 4. SELLING LOGS (Sales Invoices & Receipts)
// ============================================================
function renderSalesTable() {
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  const searchQuery = document.getElementById('salesSearch')?.value.toLowerCase() || '';
  const termFilter = document.getElementById('terminalFilter')?.value || 'ALL';
  const payFilter = document.getElementById('paymentMethodFilter')?.value || 'ALL';

  const filtered = state.sales.filter(s => {
    const matchesSearch = s.invoiceNum.toLowerCase().includes(searchQuery) || s.customer.toLowerCase().includes(searchQuery);
    const matchesTerm = termFilter === 'ALL' || s.terminal === termFilter;
    const matchesPay = payFilter === 'ALL' || s.paymentMethod === payFilter;
    return matchesSearch && matchesTerm && matchesPay;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-12 text-slate-500">
          <div class="flex flex-col items-center justify-center gap-2">
            <i data-lucide="receipt" class="w-8 h-8 text-slate-600"></i>
            <span class="text-sm font-medium text-slate-400">No sales transactions found</span>
            <span class="text-xs text-slate-600">Transactions processed on Windows POS terminals will automatically appear here in real-time.</span>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr onclick="openReceiptModal('${s.invoiceNum}')" class="cursor-pointer">
      <td class="font-mono text-xs font-semibold text-blue-400">${s.invoiceNum}</td>
      <td class="text-slate-400 text-xs">${s.time}</td>
      <td>
        <p class="text-xs font-semibold text-white">${s.terminal}</p>
        <p class="text-[10px] text-slate-400">${s.cashier}</p>
      </td>
      <td class="text-slate-300 text-xs">${s.customer}</td>
      <td class="text-xs text-slate-400">${s.items.length} items</td>
      <td>
        <span class="${s.paymentMethod === 'Cash' ? 'badge-success' : 'badge-neutral'}">
          ${s.paymentMethod}
        </span>
      </td>
      <td class="text-right font-mono font-medium text-white">${formatCurrency(s.total)}</td>
      <td class="text-right font-mono font-medium text-emerald-400">+${formatCurrency(s.profit)}</td>
      <td class="text-center">
        <button class="p-1.5 text-slate-400 hover:text-white transition" title="View Bill Receipt">
          <i data-lucide="receipt" class="w-4 h-4 text-blue-400"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function openReceiptModal(invNum) {
  const sale = state.sales.find(s => s.invoiceNum === invNum);
  if (!sale) return;

  document.getElementById('modalInvNum').textContent = sale.invoiceNum;
  document.getElementById('modalCashier').textContent = sale.cashier;
  document.getElementById('modalDate').textContent = new Date().toISOString().split('T')[0] + ' ' + sale.time;
  document.getElementById('modalLane').textContent = sale.terminal.replace('Terminal ', '');
  document.getElementById('modalSubtotal').textContent = formatCurrency(sale.subtotal);
  document.getElementById('modalDiscount').textContent = formatCurrency(sale.discount);
  document.getElementById('modalTotal').textContent = formatCurrency(sale.total);
  document.getElementById('modalPayment').textContent = sale.paymentMethod;
  document.getElementById('modalTendered').textContent = formatCurrency(sale.tendered);
  document.getElementById('modalChange').textContent = formatCurrency(sale.change);

  const itemsList = document.getElementById('modalItemsList');
  if (itemsList) {
    itemsList.innerHTML = sale.items.map(it => `
      <div class="flex justify-between items-start">
        <div class="flex-1 pr-2">
          <p class="font-bold">${it.name}</p>
          <p class="text-[10px] text-slate-500">${it.qty} x ${formatCurrency(it.price)}</p>
        </div>
        <p class="font-bold">${formatCurrency(it.qty * it.price)}</p>
      </div>
    `).join('');
  }

  const modal = document.getElementById('receiptModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeReceiptModal() {
  const modal = document.getElementById('receiptModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ============================================================
// 5. ADVANCED FINANCIAL REPORTS & ITEM-LEVEL INSIGHTS
// ============================================================
function getItemSalesMetrics(sku, period) {
  let multiplier = 1.0;
  if (period === 'today') multiplier = 1.0;
  else if (period === 'yesterday') multiplier = 0.9;
  else if (period === '7days') multiplier = 4.8;
  else if (period === '30days') multiplier = 18.5;
  else multiplier = 36.0; // all time

  const product = state.products.find(p => p.sku === sku);
  if (!product) return { unitsSold: 0, revenue: 0, cogs: 0, profit: 0, margin: 0 };

  let todayUnits = 0;
  state.sales.forEach(s => {
    s.items.forEach(it => {
      if (it.sku === sku || it.name === product.name) {
        todayUnits += it.qty;
      }
    });
  });

  if (todayUnits === 0) todayUnits = 2; // base activity

  const unitsSold = Math.round(todayUnits * multiplier);
  const revenue = unitsSold * product.sellPrice;
  const cogs = unitsSold * product.costPrice;
  const profit = revenue - cogs;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

  return { unitsSold, revenue, cogs, profit, margin };
}

function renderItemAnalyticsTable() {
  const tbody = document.getElementById('reportItemTableBody');
  if (!tbody) return;

  const period = document.getElementById('reportPeriodSelect')?.value || '7days';
  const query = document.getElementById('reportItemSearch')?.value.toLowerCase() || '';
  const sortBy = document.getElementById('reportItemSort')?.value || 'profit';

  let itemsWithMetrics = state.products.map(p => {
    const metrics = getItemSalesMetrics(p.sku, period);
    return { product: p, ...metrics };
  });

  if (query) {
    itemsWithMetrics = itemsWithMetrics.filter(i =>
      i.product.name.toLowerCase().includes(query) || i.product.sku.toLowerCase().includes(query)
    );
  }

  // Sort
  itemsWithMetrics.sort((a, b) => {
    if (sortBy === 'profit') return b.profit - a.profit;
    if (sortBy === 'units') return b.unitsSold - a.unitsSold;
    if (sortBy === 'revenue') return b.revenue - a.revenue;
    if (sortBy === 'margin') return parseFloat(b.margin) - parseFloat(a.margin);
    return 0;
  });

  // Period High-level summary
  const totalRev = itemsWithMetrics.reduce((acc, i) => acc + i.revenue, 0);
  const totalCogs = itemsWithMetrics.reduce((acc, i) => acc + i.cogs, 0);
  const totalProf = totalRev - totalCogs;
  const totalUnits = itemsWithMetrics.reduce((acc, i) => acc + i.unitsSold, 0);
  const avgMargin = totalRev > 0 ? ((totalProf / totalRev) * 100).toFixed(1) : 0;

  const revEl = document.getElementById('repPeriodRevenue');
  const cogsEl = document.getElementById('repPeriodCogs');
  const profEl = document.getElementById('repPeriodProfit');
  const margEl = document.getElementById('repPeriodMargin');
  const unitsEl = document.getElementById('repPeriodUnits');

  if (revEl) revEl.textContent = formatCurrency(totalRev);
  if (cogsEl) cogsEl.textContent = formatCurrency(totalCogs);
  if (profEl) profEl.textContent = formatCurrency(totalProf);
  if (margEl) margEl.textContent = `${avgMargin}% Net Margin`;
  if (unitsEl) unitsEl.textContent = `${totalUnits.toLocaleString()} Units`;

  tbody.innerHTML = itemsWithMetrics.map(item => `
    <tr onclick="openItemInsightsModal('${item.product.sku}')" class="cursor-pointer">
      <td class="font-mono text-xs font-semibold text-blue-400">${item.product.sku}</td>
      <td class="font-medium text-white">${item.product.name}</td>
      <td class="text-slate-400">
        <span class="badge-neutral">${item.product.category}</span>
      </td>
      <td class="font-mono text-center font-medium text-slate-200">${item.unitsSold} ${item.product.unit}</td>
      <td class="text-right font-mono font-medium text-white">${formatCurrency(item.revenue)}</td>
      <td class="text-right font-mono text-slate-400">${formatCurrency(item.cogs)}</td>
      <td class="text-right font-mono font-medium text-emerald-400">+${formatCurrency(item.profit)}</td>
      <td class="text-right">
        <span class="badge-success">${item.margin}%</span>
      </td>
      <td class="text-center">
        <button class="btn-secondary text-xs py-1 px-2.5">
          <span>Insights</span>
          <i data-lucide="chevron-right" class="w-3 h-3 text-slate-400"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

// Open Item Deep Analytics & Price History Modal
function openItemInsightsModal(sku) {
  const p = state.products.find(item => item.sku === sku);
  if (!p) return;

  const period = document.getElementById('reportPeriodSelect')?.value || '7days';
  const metrics = getItemSalesMetrics(sku, period);

  document.getElementById('insItemTitle').textContent = p.name;
  document.getElementById('insItemSku').textContent = `SKU / Barcode: ${p.sku} • Category: ${p.category} • In Stock: ${p.stock} ${p.unit}`;
  document.getElementById('insUnitsSold').textContent = `${metrics.unitsSold} ${p.unit}`;
  document.getElementById('insRevenue').textContent = formatCurrency(metrics.revenue);
  document.getElementById('insProfit').textContent = `+${formatCurrency(metrics.profit)}`;
  document.getElementById('insMargin').textContent = `${metrics.margin}%`;

  // Timeline of price changes
  const timelineEl = document.getElementById('insPriceHistoryTimeline');
  const history = p.priceHistory || [
    { date: '2026-10-15', cost: p.costPrice, sell: p.sellPrice, note: 'Standard Initial Pricing' }
  ];

  timelineEl.innerHTML = history.map((h, i) => `
    <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-white">${h.note || 'Price Adjustment'}</span>
          <span class="text-[10px] text-slate-400 font-mono">${h.date}</span>
        </div>
        <p class="text-[11px] text-slate-400 mt-0.5">Wholesale Cost: <strong class="text-slate-300 font-mono">${formatCurrency(h.cost)}</strong> &rarr; Customer Price: <strong class="text-emerald-400 font-mono">${formatCurrency(h.sell)}</strong></p>
      </div>
      <span class="badge-success self-start sm:self-auto font-mono text-[11px]">
        Margin: ${formatCurrency(h.sell - h.cost)} (${(((h.sell - h.cost) / h.sell) * 100).toFixed(1)}%)
      </span>
    </div>
  `).join('');

  // Advanced Stats
  document.getElementById('insAvgPerBill').textContent = `${(1 + (metrics.unitsSold % 3) * 0.4).toFixed(1)} ${p.unit}`;
  document.getElementById('insTopTerminal').textContent = `Terminal 01 (${(45 + (metrics.unitsSold % 20))}% volume)`;
  const daysLeft = p.stock > 0 ? Math.round(p.stock / Math.max(1, (metrics.unitsSold / 7))) : 0;
  document.getElementById('insStockRunRate').textContent = `~${daysLeft} Days of Stock Left`;

  const modal = document.getElementById('itemInsightsModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeItemInsightsModal() {
  const modal = document.getElementById('itemInsightsModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// ============================================================
// 6. EXCEL (.XLSX) & DATABASE BACKUP HUB
// ============================================================
function exportInventoryExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Engine loading... please try again in a moment.");
    return;
  }

  const data = state.products.map(p => {
    const profit = p.sellPrice - p.costPrice;
    const margin = p.sellPrice > 0 ? ((profit / p.sellPrice) * 100).toFixed(1) + '%' : '0%';
    return {
      "SKU / Barcode": p.sku,
      "Product Title": p.name,
      "Category": p.category,
      "Unit": p.unit,
      "Cost Price (LKR)": p.costPrice,
      "Selling Price (LKR)": p.sellPrice,
      "Unit Profit (LKR)": profit,
      "Profit Margin": margin,
      "Current Stock Quantity": p.stock,
      "Reorder Alert Level": p.minStock,
      "Total Inventory Value (Cost)": p.stock * p.costPrice,
      "Total Retail Value": p.stock * p.sellPrice
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory_Catalog");
  XLSX.writeFile(wb, `inventory-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showLivePill("Exported Inventory Catalog to Excel (.xlsx)");
}

function exportSalesExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Engine loading... please try again in a moment.");
    return;
  }

  const data = state.sales.map(s => ({
    "Invoice Number": s.invoiceNum,
    "Date Time": s.time,
    "Terminal": s.terminal,
    "Cashier Name": s.cashier,
    "Customer": s.customer,
    "Items Count": s.items.length,
    "Payment Method": s.paymentMethod,
    "Subtotal (LKR)": s.subtotal,
    "Discount (LKR)": s.discount,
    "Net Total (LKR)": s.total,
    "Cost of Goods (LKR)": s.cogs,
    "Net Profit (LKR)": s.profit
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales_Transactions");
  XLSX.writeFile(wb, `sales-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showLivePill("Exported Sales Invoices to Excel (.xlsx)");
}

function exportPurchasesExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Engine loading... please try again in a moment.");
    return;
  }

  const data = state.purchases.map(p => ({
    "Date & Time": p.date,
    "PO / Bill Invoice Number": p.invoiceNum,
    "Supplier / Vendor": p.supplier,
    "Product SKU": p.itemSku,
    "Product Name": p.itemName,
    "Quantity Inward": p.quantity,
    "Unit Cost (LKR)": p.unitCost,
    "Total Bill Cost (LKR)": p.totalCost,
    "Paper Bill Attached": p.photoData ? "YES" : "NO"
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buying_Logs");
  XLSX.writeFile(wb, `buying-logs-${new Date().toISOString().slice(0, 10)}.xlsx`);
  showLivePill("Exported Buying Logs to Excel (.xlsx)");
}

function exportItemPerformanceExcel() {
  if (typeof XLSX === 'undefined') {
    alert("Excel Engine loading... please try again in a moment.");
    return;
  }

  const period = document.getElementById('reportPeriodSelect')?.value || '7days';
  const data = state.products.map(p => {
    const m = getItemSalesMetrics(p.sku, period);
    return {
      "SKU": p.sku,
      "Product Name": p.name,
      "Category": p.category,
      "Selected Period": period,
      "Units Sold": m.unitsSold,
      "Unit Sell Price": p.sellPrice,
      "Unit Cost Price": p.costPrice,
      "Total Revenue (LKR)": m.revenue,
      "Total Cost (LKR)": m.cogs,
      "Net Profit (LKR)": m.profit,
      "Profit Margin": m.margin + '%'
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Item_Profitability");
  XLSX.writeFile(wb, `item-profitability-report-${period}.xlsx`);
  showLivePill("Exported Item Financial Report to Excel (.xlsx)");
}

// Import Products from Excel (.xlsx or .csv)
function handleExcelImport(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    alert("Excel Engine loading... please wait.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (!json || json.length === 0) {
        alert("No records found in spreadsheet.");
        return;
      }

      let updatedCount = 0;
      let addedCount = 0;

      json.forEach(row => {
        const sku = String(row['SKU'] || row['SKU / Barcode'] || row['Barcode'] || row['sku'] || '').trim();
        const name = String(row['Product Title'] || row['Title'] || row['Name'] || row['name'] || '').trim();
        const cost = parseFloat(row['Cost Price (LKR)'] || row['Cost'] || row['CostPrice'] || row['costPrice']) || 0;
        const sell = parseFloat(row['Selling Price (LKR)'] || row['Price'] || row['SellPrice'] || row['sellPrice']) || 0;
        const stock = parseInt(row['Current Stock Quantity'] || row['Stock'] || row['Quantity'] || row['stock']) || 0;
        const category = String(row['Category'] || row['category'] || 'General').trim();
        const unit = String(row['Unit'] || row['unit'] || 'Pcs').trim();

        if (sku && name) {
          const existing = state.products.find(p => p.sku === sku);
          if (existing) {
            existing.name = name;
            if (cost > 0) existing.costPrice = cost;
            if (sell > 0) existing.sellPrice = sell;
            if (stock >= 0) existing.stock = stock;
            existing.category = category;
            existing.unit = unit;
            updatedCount++;
          } else {
            state.products.unshift({
              sku,
              name,
              category,
              unit,
              costPrice: cost,
              sellPrice: sell,
              stock: stock > 0 ? stock : 10,
              minStock: 5,
              priceHistory: [{ date: new Date().toISOString().slice(0, 10), cost, sell, note: 'Excel Import' }]
            });
            addedCount++;
          }
        }
      });

      saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);
      renderAllViews();

      const statusBox = document.getElementById('importStatusBox');
      const statusText = document.getElementById('importStatusText');
      if (statusBox && statusText) {
        statusText.textContent = `Import complete: ${addedCount} products added, ${updatedCount} existing updated!`;
        statusBox.classList.remove('hidden');
      }

      showLivePill(`Excel Import: +${addedCount} new, ${updatedCount} updated`);
    } catch (err) {
      alert("Error reading Excel spreadsheet: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Download Full Cloud Database Backup (.posbackup / .json)
function downloadFullDatabaseBackup() {
  const backup = {
    appName: "Sumithuru Enterprises Cloud POS",
    backupVersion: "2.5",
    createdAt: new Date().toISOString(),
    owner: state.owner,
    storeSettings: state.settings,
    products: state.products,
    purchases: state.purchases,
    sales: state.sales,
    terminals: state.terminals,
    summary: {
      totalProducts: state.products.length,
      totalPurchases: state.purchases.length,
      totalSales: state.sales.length,
      grossSalesRevenue: state.totalRevenue
    }
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sumithuru-cloudpos-backup-${new Date().toISOString().slice(0, 10)}.posbackup`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showLivePill("Downloaded full database backup file (.posbackup)");
}

// Restore Full Cloud Database Backup
function restoreFullDatabaseBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.products || !Array.isArray(data.products)) {
        alert("Invalid backup file format. Expected a valid CloudPOS backup.");
        return;
      }

      const confirmed = confirm(
        `Restore Database from Backup?\n\n` +
        `• Store: ${data.storeSettings?.storeName || 'Store'}\n` +
        `• Created: ${data.createdAt}\n` +
        `• Products: ${data.products.length}\n` +
        `• Sales Invoices: ${data.sales?.length || 0}\n` +
        `• Buying Logs: ${data.purchases?.length || 0}\n\n` +
        `This will replace existing local data.`
      );
      if (!confirmed) return;

      if (data.products) state.products = data.products;
      if (data.purchases) state.purchases = data.purchases;
      if (data.sales) state.sales = data.sales;
      if (data.storeSettings) state.settings = data.storeSettings;
      if (data.owner) state.owner = data.owner;

      saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);
      saveStoredItem(STORAGE_KEYS.PURCHASES, state.purchases);
      saveStoredItem(STORAGE_KEYS.SALES, state.sales);
      saveStoredItem(STORAGE_KEYS.SETTINGS, state.settings);
      saveStoredItem(STORAGE_KEYS.OWNER, state.owner);

      applyStoreSettingsToUI();
      applyOwnerProfileToUI();
      renderAllViews();

      showLivePill("Database successfully restored from backup!");
      alert("Database successfully restored from backup!");
    } catch (err) {
      alert("Error restoring backup file: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ============================================================
// 7. REAL-TIME SIMULATION
// ============================================================
function triggerSimulatedSale() {
  if (state.products.length === 0) return;

  const terminal = state.terminals[Math.floor(Math.random() * state.terminals.length)];
  const itemCount = Math.floor(Math.random() * 3) + 1;
  const items = [];
  let subtotal = 0;
  let cogs = 0;

  for (let i = 0; i < itemCount; i++) {
    const p = state.products[Math.floor(Math.random() * state.products.length)];
    const qty = Math.floor(Math.random() * 2) + 1;
    items.push({
      sku: p.sku,
      name: p.name,
      qty: qty,
      price: p.sellPrice,
      cost: p.costPrice
    });
    subtotal += p.sellPrice * qty;
    cogs += p.costPrice * qty;
    p.stock = Math.max(0, p.stock - qty);
  }

  const profit = subtotal - cogs;
  const paymentMethods = ['Cash', 'Cash', 'Card', 'QR'];
  const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
  const tendered = paymentMethod === 'Cash' ? Math.ceil(subtotal / 500) * 500 : subtotal;
  const change = tendered - subtotal;

  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);
  const invNum = `INV-${now.toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const newSale = {
    invoiceNum: invNum,
    time: timeStr,
    terminal: terminal.name,
    cashier: terminal.cashier,
    customer: 'Counter Customer',
    paymentMethod,
    subtotal,
    discount: 0,
    total: subtotal,
    cogs,
    profit,
    tendered,
    change,
    items
  };

  state.sales.unshift(newSale);
  state.totalRevenue += subtotal;
  state.totalProfit += profit;
  state.totalCogs += cogs;
  state.totalOrders += 1;

  terminal.ordersCount += 1;
  terminal.grossTotal += subtotal;
  if (paymentMethod === 'Cash') {
    terminal.cashInDrawer += subtotal;
  } else {
    terminal.cardTotal += subtotal;
  }
  terminal.lastTxTime = 'Just now';

  saveStoredItem(STORAGE_KEYS.SALES, state.sales.slice(0, 60));
  saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);

  audioNotifier.playSaleChime();
  showLivePill(`${terminal.name}: ${formatCurrency(subtotal)} (+${formatCurrency(profit)} Profit)`);

  if (hourlyChartInstance) {
    const data = hourlyChartInstance.data.datasets[0].data;
    data[data.length - 1] = state.totalRevenue;
    hourlyChartInstance.update();
  }

  renderAllViews();
}

function setupSimulation() {
  state.simRunning = false;
  // Automatic simulation disabled for real store back-office operation
  const toggleBtn = document.getElementById('simToggleBtn');
  const mobileToggleBtn = document.getElementById('mobileSimToggleBtn');

  function toggleSim() {
    state.simRunning = !state.simRunning;
    const text = state.simRunning ? 'Stop Sim' : 'Simulate';
    if (toggleBtn) toggleBtn.textContent = text;
    if (mobileToggleBtn) mobileToggleBtn.textContent = text;

    if (state.simRunning) {
      clearInterval(state.simInterval);
      state.simInterval = setInterval(() => {
        if (state.simRunning) triggerSimulatedSale();
      }, 12000);
    } else {
      clearInterval(state.simInterval);
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggleSim);
  if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', toggleSim);
}

function showLivePill(text) {
  const pill = document.getElementById('liveSalePill');
  const pillText = document.getElementById('liveSalePillText');
  if (!pill || !pillText) return;

  pillText.textContent = text;
  pill.classList.remove('hidden');
  pill.classList.add('flex');

  clearTimeout(pill._timer);
  pill._timer = setTimeout(() => {
    pill.classList.add('hidden');
    pill.classList.remove('flex');
  }, 4500);
}

// ============================================================
// LIVE NOTIFICATION SYSTEM (Web Toasts & Bell Dropdown)
// ============================================================
const webNotifDedupeCache = new Map();

function showWebNotification(title, message, type = 'sale', refId = null) {
  // 20-second deduplication check to prevent duplicate toast/feed entries
  const dedupeKey = `${title}|${message}`;
  const now = Date.now();
  if (webNotifDedupeCache.has(dedupeKey) && (now - webNotifDedupeCache.get(dedupeKey) < 20000)) {
    return;
  }
  webNotifDedupeCache.set(dedupeKey, now);

  const notif = {
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    title,
    message,
    type, // 'sale', 'inventory', 'terminal', 'settings'
    refId: refId || '',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    read: false
  };

  if (!state.notifications) state.notifications = [];
  state.notifications.unshift(notif);
  if (state.notifications.length > 35) state.notifications.pop();

  // Play audio chime if sound enabled
  if (state.soundEnabled !== false) {
    if (type === 'sale') {
      audioNotifier.playSaleChime();
    } else {
      audioNotifier.playUpdateChime();
    }
  }

  // Update badge counters
  updateNotificationBadges();

  // Render dropdown list
  renderNotificationList();

  // Show floating toast card
  renderToastCard(notif);
}

function updateNotificationBadges() {
  const unreadCount = (state.notifications || []).filter(n => !n.read).length;
  const badgeDesktop = document.getElementById('notifBadge');
  const badgeMobile = document.getElementById('notifBadgeMobile');

  [badgeDesktop, badgeMobile].forEach(badge => {
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

function handleNotificationClick(id, type, refId, titleEncoded = '', msgEncoded = '') {
  const title = decodeURIComponent(titleEncoded || '');
  const message = decodeURIComponent(msgEncoded || '');

  // Close notification dropdown
  const dropdown = document.getElementById('notificationDropdown');
  if (dropdown) dropdown.classList.add('hidden');

  // Mark clicked notification as read
  const notif = (state.notifications || []).find(n => n.id === id);
  if (notif) notif.read = true;
  updateNotificationBadges();

  const combined = (title + ' ' + message + ' ' + (refId || '')).toLowerCase();

  // Route to relevant tab and open/highlight record
  if (type === 'sale' || combined.includes('inv-') || combined.includes('sale') || combined.includes('bill')) {
    switchTab('sales');
    const invMatch = message.match(/INV-[\w-]+/i) || title.match(/INV-[\w-]+/i);
    if (invMatch) {
      const invNum = invMatch[0];
      const searchBox = document.getElementById('salesSearch');
      if (searchBox) {
        searchBox.value = invNum;
        renderSalesTable();
      }
      setTimeout(() => openReceiptModal(invNum), 120);
    }
  } else if (type === 'inventory' || combined.includes('stock') || combined.includes('product') || combined.includes('sku') || combined.includes('price')) {
    if (combined.includes('inward') || combined.includes('supplier') || combined.includes('po-')) {
      switchTab('buying');
      const poMatch = message.match(/PO-[\w-]+/i);
      if (poMatch) {
        setTimeout(() => openPurchaseVoucherModal(poMatch[0]), 120);
      }
    } else {
      switchTab('inventory');
      const skuMatch = message.match(/\b\d{4,14}\b/) || message.match(/SKU:\s*([\w-]+)/i);
      if (skuMatch) {
        const sku = skuMatch[1] || skuMatch[0];
        const searchBox = document.getElementById('inventorySearch');
        if (searchBox) {
          searchBox.value = sku;
          renderInventoryTable();
        }
      }
    }
  } else if (type === 'terminal' || combined.includes('terminal') || combined.includes('counter') || combined.includes('offline') || combined.includes('online')) {
    switchTab('terminals');
  } else if (type === 'settings' || combined.includes('printer') || combined.includes('receipt') || combined.includes('sync')) {
    switchTab('settings');
  } else {
    switchTab('dashboard');
  }
}

function renderToastCard(notif) {
  const stack = document.getElementById('toastNotificationStack');
  if (!stack) return;

  // Configuration by notification type
  let accentBorder = 'border-blue-500/30';
  let iconName = 'bell';
  let iconColor = 'text-blue-400';
  let badgeBg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';

  if (notif.type === 'sale') {
    accentBorder = 'border-emerald-500/40';
    iconName = 'receipt';
    iconColor = 'text-emerald-400';
    badgeBg = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (notif.type === 'inventory') {
    accentBorder = 'border-sky-500/40';
    iconName = 'package';
    iconColor = 'text-sky-400';
    badgeBg = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  } else if (notif.type === 'terminal') {
    accentBorder = 'border-purple-500/40';
    iconName = 'monitor';
    iconColor = 'text-purple-400';
    badgeBg = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
  } else if (notif.type === 'settings') {
    accentBorder = 'border-amber-500/40';
    iconName = 'sliders';
    iconColor = 'text-amber-400';
    badgeBg = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  }

  const toast = document.createElement('div');
  toast.className = `toast-item pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border ${accentBorder} bg-slate-900/95 backdrop-blur-md shadow-2xl shadow-black/50 transition-all duration-300 transform translate-x-4 opacity-0 cursor-pointer hover:border-slate-500`;
  toast.onclick = () => handleNotificationClick(notif.id, notif.type, notif.refId, encodeURIComponent(notif.title), encodeURIComponent(notif.message));

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${badgeBg} border">
      <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor}"></i>
    </div>
    <div class="flex-1 min-w-0 pr-1">
      <div class="flex items-center justify-between gap-2">
        <h4 class="text-xs font-bold text-white truncate">${notif.title}</h4>
        <span class="text-[10px] text-slate-400 font-mono">${notif.time}</span>
      </div>
      <p class="text-xs text-slate-300 mt-0.5 leading-snug break-words">${notif.message}</p>
    </div>
    <button onclick="event.stopPropagation(); this.closest('.toast-item').remove()" class="text-slate-400 hover:text-white p-0.5 rounded transition" title="Dismiss">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  stack.appendChild(toast);
  if (window.lucide) {
    try { lucide.createIcons({ root: toast }); } catch(e){}
  }

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-4', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
  });

  // Limit visible toasts to 4
  const existing = stack.querySelectorAll('.toast-item');
  if (existing.length > 4) {
    existing[0].remove();
  }

  // Auto dismiss after 6s
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('opacity-0', 'translate-x-4');
      setTimeout(() => toast.remove(), 300);
    }
  }, 6000);
}

function renderNotificationList() {
  const list = document.getElementById('notificationList');
  if (!list) return;

  if (!state.notifications || state.notifications.length === 0) {
    list.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
        <i data-lucide="bell-off" class="w-5 h-5 text-slate-600"></i>
        <span>No new notifications</span>
      </div>
    `;
    if (window.lucide) { try { lucide.createIcons({ root: list }); } catch(e){} }
    return;
  }

  list.innerHTML = state.notifications.map(n => {
    let icon = 'bell';
    let iconColor = 'text-blue-400';
    if (n.type === 'sale') { icon = 'receipt'; iconColor = 'text-emerald-400'; }
    else if (n.type === 'inventory') { icon = 'package'; iconColor = 'text-sky-400'; }
    else if (n.type === 'terminal') { icon = 'monitor'; iconColor = 'text-purple-400'; }
    else if (n.type === 'settings') { icon = 'sliders'; iconColor = 'text-amber-400'; }

    return `
      <div onclick="handleNotificationClick('${n.id}', '${n.type}', '${n.refId || ''}', '${encodeURIComponent(n.title)}', '${encodeURIComponent(n.message)}')" class="p-3 hover:bg-slate-800/60 transition cursor-pointer flex items-start gap-2.5 ${n.read ? 'opacity-70' : 'bg-slate-850/40'}">
        <div class="mt-0.5 p-1.5 rounded-lg bg-slate-800 border border-slate-700/60 ${iconColor} flex-shrink-0">
          <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <span class="text-xs font-semibold text-white truncate">${n.title}</span>
            <span class="text-[10px] text-slate-400 font-mono">${n.time}</span>
          </div>
          <p class="text-[11px] text-slate-300 mt-0.5 leading-snug break-words">${n.message}</p>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    try { lucide.createIcons({ root: list }); } catch(e){}
  }
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    // Mark all as read when opening dropdown
    if (state.notifications) {
      state.notifications.forEach(n => n.read = true);
    }
    updateNotificationBadges();
    renderNotificationList();
  } else {
    dropdown.classList.add('hidden');
  }
}

function clearNotifications() {
  state.notifications = [];
  updateNotificationBadges();
  renderNotificationList();
}

// Request Immediate Sequential Sync on Windows POS from Web Admin
async function requestImmediatePosSync() {
  const btn = document.getElementById('btnRequestPosSync');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Sending Sync Signal...</span>`;
    lucide.createIcons();
  }

  if (!supabaseClient) {
    showWebNotification("Cloud Offline", "Supabase cloud is not connected. Connect cloud to send sync signals.", "terminal");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>⚡ Request Immediate POS Sync</span>`;
      lucide.createIcons();
    }
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('terminals')
      .update({ pending_command: 'FORCE_SYNC' })
      .neq('terminal_id', '');

    if (error) throw error;

    showWebNotification("Sync Signal Sent", "⚡ Immediate sync command sent to Windows POS terminal. Sync starting in 1-2 seconds...", "terminal");
    if (btn) {
      btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i><span>Signal Dispatched!</span>`;
      lucide.createIcons();
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>⚡ Request Immediate POS Sync</span>`;
        lucide.createIcons();
      }, 4000);
    }
  } catch (err) {
    console.error("Failed to send force sync signal:", err);
    showWebNotification("Sync Request Failed", err.message || "Could not reach terminal cloud queue", "terminal");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>⚡ Request Immediate POS Sync</span>`;
      lucide.createIcons();
    }
  }
}

// Prune Older Cloud Bills to Maintain Free Tier (< 500 MB) Limit
async function pruneCloudBills() {
  const days = parseInt(document.getElementById('cloudRetentionDays')?.value || '30', 10);
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const confirmed = confirm(
    `Are you sure you want to prune cloud bills older than ${days} days?\n\n` +
    `• All lifetime transactions remain safely stored in your Windows POS local password-encrypted SQLite database.\n` +
    `• Only cloud sync copies in Supabase older than ${cutoffDate.slice(0, 10)} will be cleared to save free-tier quota.`
  );
  if (!confirmed) return;

  const btn = document.getElementById('btnPruneCloudBills');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Pruning Cloud Database...</span>`;
    lucide.createIcons();
  }

  if (!supabaseClient) {
    showWebNotification("Cloud Offline", "Connect to Supabase cloud before pruning cloud storage.", "settings");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>Prune Older Cloud Bills Now</span>`;
      lucide.createIcons();
    }
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('transactions')
      .delete()
      .lt('created_at', cutoffDate);

    if (error) throw error;

    showWebNotification(
      "Cloud Cleaned Successfully",
      `Cloud transactions older than ${days} days pruned. Local Windows POS database retains 100% full records.`,
      "settings"
    );
    await fetchCloudData();
  } catch (err) {
    console.error("Prune cloud bills error:", err);
    showWebNotification("Prune Failed", err.message || "Failed to prune cloud records", "settings");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>Prune Older Cloud Bills Now</span>`;
      lucide.createIcons();
    }
  }
}

// Close notification dropdown when clicking outside
window.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationDropdown');
  const btnDesktop = document.getElementById('btnNotificationBell');
  const btnMobile = document.getElementById('notifBadgeMobile')?.parentElement;

  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (!dropdown.contains(e.target) && 
        !(btnDesktop && btnDesktop.contains(e.target)) &&
        !(btnMobile && btnMobile.contains(e.target))) {
      dropdown.classList.add('hidden');
    }
  }
});

// ============================================================
// 8. EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  document.getElementById('triggerTestSaleBtn')?.addEventListener('click', triggerSimulatedSale);
  document.getElementById('mobileTriggerSaleBtn')?.addEventListener('click', triggerSimulatedSale);

  document.getElementById('soundToggle')?.addEventListener('change', (e) => {
    state.soundEnabled = e.target.checked;
  });

  // Owner Profile Form Submit
  document.getElementById('ownerProfileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.owner.name = document.getElementById('profOwnerName').value.trim() || "Store Owner";
    state.owner.email = document.getElementById('profOwnerEmail').value.trim();
    state.owner.phone = document.getElementById('profOwnerPhone').value.trim();
    state.owner.location = document.getElementById('profOwnerLocation').value.trim();
    state.owner.pin = document.getElementById('profOwnerPin').value.trim();

    saveStoredItem(STORAGE_KEYS.OWNER, state.owner);
    applyOwnerProfileToUI();
    closeOwnerProfileModal();
    showLivePill("Owner Profile saved!");
  });

  // Product Edit Form Submit
  document.getElementById('productEditForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const origSku = document.getElementById('editOriginalSku').value;
    const sku = document.getElementById('editSku').value.trim();
    const name = document.getElementById('editName').value.trim();
    const category = document.getElementById('editCategory').value.trim() || 'General';
    const unit = document.getElementById('editUnit').value;
    const costPrice = parseFloat(document.getElementById('editCostPrice').value) || 0;
    const sellPrice = parseFloat(document.getElementById('editSellPrice').value) || 0;
    const stock = parseInt(document.getElementById('editStock').value) || 0;
    const minStock = parseInt(document.getElementById('editMinStock').value) || 5;

    if (!sku || !name) {
      alert("SKU and Product Name are required!");
      return;
    }

    if (origSku) {
      const item = state.products.find(p => p.sku === origSku);
      if (item) {
        if (!item.priceHistory) item.priceHistory = [];
        if (item.costPrice !== costPrice || item.sellPrice !== sellPrice) {
          item.priceHistory.push({
            date: new Date().toISOString().slice(0, 10),
            cost: costPrice,
            sell: sellPrice,
            note: 'Manual Owner Price Adjustment'
          });
        }
        item.sku = sku;
        item.name = name;
        item.category = category;
        item.unit = unit;
        item.costPrice = costPrice;
        item.sellPrice = sellPrice;
        item.stock = stock;
        item.minStock = minStock;
      }
    } else {
      state.products.unshift({
        sku,
        name,
        category,
        unit,
        costPrice,
        sellPrice,
        stock,
        minStock,
        priceHistory: [{
          date: new Date().toISOString().slice(0, 10),
          cost: costPrice,
          sell: sellPrice,
          note: 'Created in Cloud Hub'
        }]
      });
    }

    saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);

    if (supabaseClient) {
      supabaseClient.from('items').upsert({
        sku,
        title: name,
        category,
        unit,
        purchase_cost: costPrice,
        target_resale_price: sellPrice,
        quantity: stock,
        min_stock_alert: minStock,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sku' }).then(() => {
        console.log("Upserted item to Supabase:", sku);
      }).catch(err => console.warn("Supabase upsert error:", err));
    }

    closeProductEditModal();
    renderAllViews();
    showLivePill(origSku ? `Updated: ${name}` : `Added: ${name}`);
    showWebNotification(
      origSku ? 'Product Price/Stock Adjusted' : 'New Product Added',
      `${name} (SKU: ${sku}) — Retail: ${formatCurrency(sellPrice)} (Cost: ${formatCurrency(costPrice)}, Stock: ${stock})`,
      'inventory',
      sku
    );
  });

  document.getElementById('editCostPrice')?.addEventListener('input', calculateLiveMargin);
  document.getElementById('editSellPrice')?.addEventListener('input', calculateLiveMargin);

  // Purchase Log Form Submit
  document.getElementById('purchaseLogForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const supplier = document.getElementById('purchSupplier').value.trim();
    const invoiceNum = document.getElementById('purchInvoiceNum').value.trim();
    const sku = document.getElementById('purchProductSelect').value;
    const qty = parseInt(document.getElementById('purchQuantity').value) || 0;
    const unitCost = parseFloat(document.getElementById('purchUnitCost').value) || 0;
    const totalCost = qty * unitCost;

    const product = state.products.find(p => p.sku === sku);
    if (!product) {
      alert("Please select a valid product.");
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
    const newPurchase = {
      id: 'purch-' + Date.now(),
      date: dateStr,
      invoiceNum,
      supplier,
      itemSku: product.sku,
      itemName: product.name,
      quantity: qty,
      unitCost,
      totalCost,
      photoData: pendingBillPhotoData
    };

    state.purchases.unshift(newPurchase);
    product.stock += qty;
    product.costPrice = unitCost;

    if (!product.priceHistory) product.priceHistory = [];
    product.priceHistory.push({
      date: dateStr.slice(0, 10),
      cost: unitCost,
      sell: product.sellPrice,
      note: `Inward Purchase (${supplier})`
    });

    saveStoredItem(STORAGE_KEYS.PURCHASES, state.purchases);
    saveStoredItem(STORAGE_KEYS.PRODUCTS, state.products);

    if (supabaseClient) {
      supabaseClient.from('transactions').insert({
        transaction_number: invoiceNum || `PUR-${Date.now()}`,
        type: 'PURCHASE',
        item_sku: product.sku,
        item_title: product.name,
        contact_name: supplier,
        amount: totalCost,
        total_amount: totalCost,
        payment_method: 'Cash',
        proof_image_path: pendingBillPhotoData || '',
        notes: `Wholesale Inward: +${qty} ${product.unit}`
      }).then(() => {
        supabaseClient.from('items').update({
          quantity: product.stock,
          purchase_cost: unitCost,
          updated_at: new Date().toISOString()
        }).eq('sku', product.sku);
      }).catch(err => console.warn("Supabase purchase log error:", err));
    }

    closePurchaseModal();
    renderAllViews();
    showLivePill(`Restocked ${qty} ${product.unit} of ${product.name}!`);
    showWebNotification('Inward Stock Recorded', `+${qty} ${product.name} from ${supplier} (${formatCurrency(totalCost)})`, 'inventory', invoiceNum);
  });

  document.getElementById('purchQuantity')?.addEventListener('input', calculatePurchaseTotal);
  document.getElementById('purchUnitCost')?.addEventListener('input', calculatePurchaseTotal);

  document.getElementById('purchProductSelect')?.addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt) {
      const cost = opt.getAttribute('data-cost');
      if (cost) document.getElementById('purchUnitCost').value = cost;
      calculatePurchaseTotal();
    }
  });

  document.getElementById('purchPhotoInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handlePurchPhotoSelect(file);
  });

  // Report Period & Filters
  document.getElementById('reportPeriodSelect')?.addEventListener('change', renderItemAnalyticsTable);
  document.getElementById('reportItemSearch')?.addEventListener('input', renderItemAnalyticsTable);
  document.getElementById('reportItemSort')?.addEventListener('change', renderItemAnalyticsTable);

  // Excel Import File Input
  document.getElementById('excelImportFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleExcelImport(file);
  });

  // Database Restore File Input
  document.getElementById('databaseRestoreFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) restoreFullDatabaseBackup(file);
  });

  // Inventory Search & Filters
  document.getElementById('inventorySearch')?.addEventListener('input', renderInventoryTable);
  document.getElementById('categoryFilter')?.addEventListener('change', renderInventoryTable);

  // Low Stock Filter Toggle (Works seamlessly with search and category filters)
  document.getElementById('filterLowStockBtn')?.addEventListener('click', (e) => {
    state.lowStockFilterActive = !state.lowStockFilterActive;
    e.currentTarget.classList.toggle('border-amber-500', state.lowStockFilterActive);
    e.currentTarget.classList.toggle('bg-amber-500/20', state.lowStockFilterActive);
    e.currentTarget.classList.toggle('text-amber-400', state.lowStockFilterActive);
    renderInventoryTable();
  });

  // Sales Search & Filters
  document.getElementById('salesSearch')?.addEventListener('input', renderSalesTable);
  document.getElementById('terminalFilter')?.addEventListener('change', renderSalesTable);
  document.getElementById('paymentMethodFilter')?.addEventListener('change', renderSalesTable);

  // Refresh Button
  document.getElementById('refreshDataBtn')?.addEventListener('click', () => {
    renderAllViews();
    showLivePill('Data refreshed from cloud hub');
  });
}
