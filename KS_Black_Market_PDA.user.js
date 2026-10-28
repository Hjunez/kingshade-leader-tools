// ==UserScript==
// @name         KS Black Market PDA
// @namespace    kingshade.ks-black-market
// @version      0.3.1
// @description  Travel advisor: the best runs abroad for every item sold abroad, and when to leave Torn to land right after a restock, for members of Politically Incorrect. Reads only from the KS Black Market server. Never clicks, navigates or contacts Torn.
// @author       Kingshade
// @match        https://www.torn.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      ks-blackmarket.hans-viklund.workers.dev
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Black_Market_PDA.user.js
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Black_Market_PDA.user.js
// ==/UserScript==
/*
 * KS Black Market 0.3.1 (PDA) — disclosure
 * What it does : your travel advisor. It lists the best runs abroad for every item sold abroad, not only drugs (best
 *                trips, sell abroad, bring home) for the travel method and the number of item slots you pick, strictly
 *                ordered by the profit you can expect per hour of flying. For goods you bring home it also says WHEN to
 *                leave Torn to land right after a restock, and how likely it is that the stock is still there when you
 *                land. Black Market goods come with a profit range (q10 / q50 / q90); goods from an ordinary shop (which
 *                buys back at 75% of its price, a fixed price) come with a certain profit. Four buttons filter the
 *                lists: All, Drugs, Black Market, Shop items. Tap a row for the details, including the cash you need.
 *                The numbers (also the restock times) are calculated by the KS server from public price and stock data
 *                and sent to this script. For members of Politically Incorrect only. Measurement, not advice; there
 *                are no buy or travel buttons, and no sound or notification.
 * Requests     : only https://ks-blackmarket.hans-viklund.workers.dev — POST /login (your Torn key, once per sign-in) and
 *                POST /latest when you open the panel and then every 60 seconds, but only while the panel is open and
 *                the tab is visible. The server asks Torn once per sign-in whose key it is (/v2/key/info). This script
 *                itself makes no request to torn.com or api.torn.com and reads nothing from Torn's pages.
 * Clicks       : none. It never clicks, submits or navigates. The only thing it looks for on the page is whether a
 *                captcha is VISIBLE; then its own button hides until the captcha is gone. It never touches a captcha.
 *                It runs in the top page only, never inside iframes.
 * Storage      : script manager storage, keys starting with "ksBm.v1." (your Torn key, travel method, item slots, list
 *                filter, selected tab). The
 *                sign-in token is kept in memory only. Nothing is written to Torn's page or to localStorage.
 * Sharing      : your Torn key is sent to the KS Black Market server (a Cloudflare Worker) when you sign in. The server
 *                checks it with Torn, does not store it and does not log it. Nothing else is sent anywhere.
 * API key      : your own Torn key at access level Public is enough (no selections needed). It is used only for the
 *                faction membership check. If Torn rejects the key, or it does not belong to the faction, the saved
 *                key is removed and not tried again.
 *
 * CHANGELOG 0.3.1
 * ADDED        : items that rarely sell out now show a chance instead of 'stock timing unknown'.
 *                Nothing changes in what the script requests, stores or shares.
 *
 * CHANGELOG 0.3.0
 * ADDED        : restock timer — when to leave Torn to land right after a restock, and the chance the stock is still there.
 * CHANGED      : simpler panel with tabs, two-line rows sorted by expected profit per hour.
 *                Nothing changes in what the script requests or shares; it also saves which tab you picked (ksBm.v1.tab).
 *
 * CHANGELOG 0.2.0
 * ADDED        : every item sold abroad, not only drugs; filter buttons; cash needed.
 * CHANGED      : reads the server's new file format (schema 3) and still reads the old one (schema 2). Nothing changes in
 *                what the script requests, stores or shares, except that it also saves your list filter.
 *
 * CHANGELOG 0.1.4
 * CHANGED      : published on Kingshade Leader Tools with automatic updates.
 *
 * CHANGELOG 0.1.3
 * CHANGED      : the panel is written in plain words: clearer headings, one sentence per line and a short explanation
 *                under the lists. "Seats" is now "Item slots" (1 to 43, the most a traveller can carry; standard 26). A
 *                saved value above 43 is set to 43. The calculations are unchanged.
 *
 * CHANGELOG 0.1.2
 * CHANGED      : the BM button and the panel moved to the bottom left, so they never cover Torn's chat windows
 *                (bottom right).
 *
 * CHANGELOG 0.1.1
 * FIXED        : the script no longer starts inside Torn's iframes (@noframes). A hidden element with "captcha" in its
 *                class or id no longer hides the BM button; only a visible one does. When the browser puts the page
 *                in its back/forward cache, the panel closes and the timers stop but the script stays, so the BM
 *                button is still there when you go back (before, it was removed for good).
 * CHANGED      : nothing in what the script requests, stores or shares. The server now signs its upload to the
 *                worker; this script is not involved in that.
 *
 * CHANGELOG 0.1.0
 * ADDED        : first version. Panel with a BM button (own shadow DOM), settings for key, travel method and seats,
 *                export top 10, import top 10, round trip top 5, STALE after 10 minutes, readable server states.
 * KNOWN ISSUES : travel method and seats are chosen by you; the script does not read them from Torn. Rows without
 *                enough price history are shown as "no window" after the rows that have one.
 * VERIFICATION : CANDIDATE. Unit tests against numbers from the server's Python code, and a browser run in Chromium
 *                with a fake server. Not run against the real server, real Torn pages or Torn PDA.
 */
(function () {
'use strict';
var KSBM_VERSION = '0.3.1';
var KSBM_PLATFORM = 'PDA';

/* ================= KS Black Market — core (shared by PC and PDA) =================
 * Pure functions only: no DOM, no network, no storage, no clock (time is passed in).
 * The calculations are a port of ks_blackmarket/analysis.py and model.py (schema 2 and 3) and are tested against
 * numbers produced by the Python code from the same latest.json (userscript/test/fixtures).
 * Everything that comes from the server is untrusted: sanitizeEnvelope() runs before anything is shown.
 */
var KSBM_CORE = (function () {
  'use strict';

  var STALE_S = 600;                 // data older than this is STALE: no recommendations
  var SELL_FEE = 0.05;               // Item Market fee (same constant as the server)
  var GRID_PROBS = [];               // 0.05, 0.10, ... 0.95  (q05 ... q95)
  for (var g = 1; g <= 19; g++) GRID_PROBS.push(g / 20);
  var CUM_UNITS = 50;
  var MAX_SEATS = 43;                // highest possible item slots: 15 base + suitcase 3 + Excursion 10 + job special 5 + book 10
  var DEFAULT_SEATS = 26;
  var DEFAULT_METHOD = 'standard';
  var MAX_ROWS = 400;                // schema 2 (drugs only)
  var MAX_ROWS_V3 = 2000;            // schema 3 (every item sold abroad)
  var MAX_ITEMS_V3 = 2000;
  var SCHEMAS = [2, 3];
  var BM = 'BLACK_MARKET';
  var STD = 'STANDARD';
  var SHOP_TYPES = [BM, STD];
  var SELL_RULE = { BLACK_MARKET: 'current', STANDARD: '75pct' };
  var WINDOW_SOURCES = ['book', 'market_value'];
  // An item name from the server: text only, 1-60 characters, no markup. (The same rule as ks_blackmarket/output.py.)
  var NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .'&(),\/-]{0,59}$/;
  var GROUP_RE = /^[A-Za-z][A-Za-z0-9 _&\/'-]{0,39}$/;
  // The filter buttons above the lists: the key is what is saved under ksBm.v1.group.
  var GROUPS = ['all', 'drugs', 'bm', 'shop'];
  var GROUP_LABEL = { all: 'All', drugs: 'Drugs', bm: 'Black Market', shop: 'Shop items' };
  var DEFAULT_GROUP = 'all';
  // The three tabs under the filter buttons: the key is what is saved under ksBm.v1.tab.
  var TABS = ['trips', 'export', 'import'];
  var TAB_LABEL = { trips: 'Best trips', export: 'Sell abroad', import: 'Bring home' };
  var DEFAULT_TAB = 'trips';
  var LIST_MAX = 10;                 // every tab shows its ten best
  var UNKNOWN_MAX = 5;               // and at most five more whose chance is not known yet
  var RESTOCK_STATES = ['EMPTY', 'IN_STOCK', 'STEADY', 'UNKNOWN'];
  var RESTOCK_REASONS = ['few_events', 'late', 'no_events'];
  var GRID_N = 19;
  var LEAVE_NOW_S = 60;              // "LEAVE NOW" when the departure is at most this far away
  var LEAVE_SOON_S = 3600;           // "Leave in <m> min" within the hour, "Leave at <hh:mm> TCT" after that
  var SURE_P = 0.5;                  // below this chance (even with the best landing) the stock sells out first
  var HIDE_P = 0.20;                 // below this chance a run is no advice: it is not listed at all
  var BIN_S = 120;                   // the curve of a row has one value per 2 minutes
  var CURVE_LEN = 330;
  var LANDING_WINDOW_S = 360 * 60;   // the best landing is looked for in [now + F, now + F + 360 min]
  var SELLBACK_CAP = 100;            // a few units left by a sell-back still count as empty
  var STEADY_MIN_QTY = 26;           // a STEADY row has at least this many in stock (the server's CANDIDATE_SLOTS)
  var RATE_MAX = 1e9;

  var METHODS = ['standard', 'airstrip', 'wlt', 'business'];
  var DRUGS = ['Cannabis', 'Ecstasy', 'Ketamine', 'LSD', 'Opium', 'PCP', 'Shrooms', 'Speed', 'Vicodin', 'Xanax'];
  var COUNTRY_NAMES = {
    mex: 'Mexico', cay: 'Cayman Islands', can: 'Canada', haw: 'Hawaii', uni: 'United Kingdom', arg: 'Argentina',
    swi: 'Switzerland', jap: 'Japan', chi: 'China', uae: 'UAE', sou: 'South Africa'
  };
  var STATUSES = ['OK', 'COLLECTOR_STALE', 'KEY_STOPPED', 'STARTING'];
  var IM_STATUSES = ['OK', 'IM_STALE', 'UNKNOWN'];
  var STATUS_TEXT = {
    OK: 'OK',
    COLLECTOR_STALE: 'The server\'s price feed is delayed. No suggestions until it is back.',
    KEY_STOPPED: 'The server has paused price collection. No suggestions until it is back.',
    STARTING: 'The server is starting up. Suggestions appear within a few minutes.'
  };
  var HEADLINE = { OK: 'LIVE', STALE: 'OLD DATA', NO_DATA: 'NO DATA YET', COLLECTOR_STALE: 'PRICE FEED DELAYED',
    KEY_STOPPED: 'SERVER PAUSED', STARTING: 'STARTING UP' };
  var STALE_TEXT = 'Prices are more than 10 minutes old, so no suggestions are shown until fresh prices arrive.';
  var NO_DATA_TEXT = 'The server has not received any prices yet.';

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isNumOrNull(x) { return x === null || isNum(x); }
  function has(list, v) { return list.indexOf(v) >= 0; }
  function isPlainObject(o) { return typeof o === 'object' && o !== null && !Array.isArray(o); }

  /* ---------- Python-compatible rounding (round half to even) so results match analysis.py digit for digit ---------- */
  function pyRound(x) {
    var f = Math.floor(x);
    var d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return f % 2 === 0 ? f : f + 1;
  }

  /* ---------- sanitising the server answer ---------- */

  function sanitizeWindow(w) {
    if (w === null) return { ok: true, value: null };
    if (!isPlainObject(w) || !Array.isArray(w.grid) || w.grid.length !== 19) return { ok: false };
    for (var i = 0; i < 19; i++) {
      if (!isNum(w.grid[i])) return { ok: false };
      if (i > 0 && w.grid[i] < w.grid[i - 1]) return { ok: false };
    }
    if (!isNum(w.q10) || !isNum(w.q50) || !isNum(w.q90) || !isNum(w.n) || w.n < 1) return { ok: false };
    if (w.q10 !== w.grid[1] || w.q50 !== w.grid[9] || w.q90 !== w.grid[17]) return { ok: false };
    return { ok: true, value: { q10: w.q10, q50: w.q50, q90: w.q90, n: w.n, grid: w.grid.slice() } };
  }

  function sanitizeDrug(d) {
    if (!isPlainObject(d)) return null;
    if (!has(IM_STATUSES, d.im_status)) return null;
    if (!isNumOrNull(d.im_lowest) || !isNumOrNull(d.sell_net_per_unit) || !isNumOrNull(d.im_age_s) || !isNumOrNull(d.market_price)) return null;
    if (!Array.isArray(d.buy_cost_cum) || d.buy_cost_cum.length !== CUM_UNITS) return null;
    for (var i = 0; i < CUM_UNITS; i++) if (!isNumOrNull(d.buy_cost_cum[i])) return null;
    return { im_status: d.im_status, im_lowest: d.im_lowest, sell_net_per_unit: d.sell_net_per_unit,
      im_age_s: d.im_age_s, market_price: d.market_price, buy_cost_cum: d.buy_cost_cum.slice() };
  }

  /* The restock forecast of a row (server 0.4.0; STEADY since 0.4.1). A row without it, or with one that does not pass, is simply "Stock timing
   * unknown" - never a guess. Checked as strictly as ks_blackmarket/output.py checks it. Returns the clean copy or null. */
  function isInt(x) { return isNum(x) && Math.floor(x) === x; }
  function sanitizeGrid(g) {
    if (g === null) return { ok: true, value: null };
    if (!Array.isArray(g) || g.length !== GRID_N) return { ok: false };
    for (var i = 0; i < GRID_N; i++) {
      if (!isInt(g[i]) || g[i] < 0) return { ok: false };
      if (i > 0 && g[i] < g[i - 1]) return { ok: false };
    }
    return { ok: true, value: g.slice() };
  }
  function sanitizeRestock(rs, qty) {
    if (!isPlainObject(rs)) return null;
    if (!has(RESTOCK_STATES, rs.state)) return null;
    if (rs.reason !== null && !has(RESTOCK_REASONS, rs.reason)) return null;
    if ((rs.state === 'UNKNOWN') !== (rs.reason !== null)) return null;
    if (rs.since !== null && !(isInt(rs.since) && rs.since > 0)) return null;
    var a = sanitizeGrid(rs.a_grid), b = sanitizeGrid(rs.b_grid);
    if (!a.ok || !b.ok) return null;
    if (!isInt(rs.n_a) || rs.n_a < 0 || !isInt(rs.n_b) || rs.n_b < 0) return null;
    var curve = null;
    if (rs.curve !== null) {
      if (!Array.isArray(rs.curve) || rs.curve.length !== CURVE_LEN) return null;
      for (var ci = 0; ci < CURVE_LEN; ci++) if (!isInt(rs.curve[ci]) || rs.curve[ci] < 0 || rs.curve[ci] > 1000) return null;
      curve = rs.curve.slice();
    }
    if ((curve === null) !== (rs.state === 'UNKNOWN')) return null;           // EMPTY / IN_STOCK / STEADY have a curve, UNKNOWN has none
    var rate = null;
    if (rs.state === 'STEADY') {                                              // only STEADY has a rate, one decimal, and never a grid or a hit
      if (!isNum(rs.rate_per_h) || rs.rate_per_h < 0 || rs.rate_per_h > RATE_MAX || Math.abs(rs.rate_per_h * 10 - Math.round(rs.rate_per_h * 10)) > 1e-9) return null;
      if (a.value !== null || b.value !== null || rs.hit !== null) return null;
      rate = rs.rate_per_h;
    } else if (Object.prototype.hasOwnProperty.call(rs, 'rate_per_h')) return null;
    var hit = null;
    if (rs.hit !== null) {
      var h = rs.hit;
      if (!isPlainObject(h) || !isInt(h.n) || !isInt(h.within_120) || !isInt(h.within_300)) return null;
      if (!(h.n > 0 && h.within_120 >= 0 && h.within_120 <= h.within_300 && h.within_300 <= h.n)) return null;
      hit = { n: h.n, within_120: h.within_120, within_300: h.within_300 };
    }
    if (rs.state === 'EMPTY' || rs.state === 'IN_STOCK') {
      if (rs.since === null || a.value === null || b.value === null) return null;
      if (rs.state === 'EMPTY' && !(isNum(qty) && qty <= SELLBACK_CAP)) return null;      // what the row says must match
      if (rs.state === 'IN_STOCK' && !(isNum(qty) && qty > 0)) return null;
    }
    if (rs.state === 'STEADY' && !(isNum(qty) && qty >= STEADY_MIN_QTY)) return null;
    var out = { state: rs.state, since: rs.since, a_grid: a.value, b_grid: b.value, n_a: rs.n_a, n_b: rs.n_b, hit: hit, reason: rs.reason, curve: curve };
    if (rate !== null) out.rate_per_h = rate;
    return out;
  }

  // ---- one row. schema 2: a drug, always Black Market (the old server knew nothing else). schema 3: any item.
  function sanitizeRow(r, schema) {
    if (!isPlainObject(r)) return null;
    var v3 = schema === 3;
    if (v3 ? !(typeof r.drug === 'string' && NAME_RE.test(r.drug)) : !has(DRUGS, r.drug)) return null;
    if (!COUNTRY_NAMES.hasOwnProperty(r.country)) return null;
    if (r.bm_status !== 'OK' && r.bm_status !== 'STALE') return null;
    if (!isNumOrNull(r.bm_price) || !isNumOrNull(r.bm_qty) || !isNumOrNull(r.bm_age_s)) return null;
    if (r.bm_status === 'OK' && !(isNum(r.bm_price) && r.bm_price > 0)) return null;
    var shop = BM, group = 'Drug', stock = r.bm_qty;
    if (v3) {
      if (!has(SHOP_TYPES, r.shop_type) || r.sell_rule !== SELL_RULE[r.shop_type]) return null;
      if (typeof r.group !== 'string' || !GROUP_RE.test(r.group)) return null;
      if (!isNumOrNull(r.stock) || r.stock !== r.bm_qty) return null;
      // A fixed-price shop is calculated with integers (floor of 75 %): a price with decimals is not a price we know.
      if (r.shop_type === STD && r.bm_status === 'OK' && Math.floor(r.bm_price) !== r.bm_price) return null;
      shop = r.shop_type;
      group = r.group;
      stock = r.stock;
    }
    var pm = {};
    if (!isPlainObject(r.per_method)) return null;
    for (var i = 0; i < METHODS.length; i++) {
      var m = METHODS[i];
      var v = r.per_method[m];
      if (v === undefined) continue;
      if (!isPlainObject(v) || !isNum(v.flight_min) || v.flight_min < 1 || v.flight_min > 2000) return null;
      var ew = sanitizeWindow(v.export_r === undefined ? null : v.export_r);
      var iw = sanitizeWindow(v.import_r === undefined ? null : v.import_r);
      if (!ew.ok || !iw.ok) return null;
      var source = null;
      if (v3) {
        source = v.im_window_source === undefined ? undefined : v.im_window_source;
        if (source !== null && !has(WINDOW_SOURCES, source)) return null;
        if ((source === null) !== (iw.value === null)) return null;
        if (shop === STD && ew.value !== null) return null;           // a fixed price has no export window
      } else if (iw.value !== null) {
        source = 'book';                                              // the old server only knew the order book
      }
      pm[m] = { flight_min: v.flight_min, export_r: ew.value, import_r: iw.value, im_window_source: source };
    }
    return { drug: r.drug, country: r.country, bm_status: r.bm_status, bm_price: r.bm_price, bm_qty: r.bm_qty,
      bm_age_s: r.bm_age_s, shop_type: shop, sell_rule: SELL_RULE[shop], stock: stock, group: group, per_method: pm,
      restock: v3 ? sanitizeRestock(r.restock, r.bm_qty) : null };
  }

  /* The /latest answer {ok, receivedAt, serverAge, data}. Returns {ok:true, env} or {ok:false, reason}.
   * A row that does not pass is dropped and counted; a structural problem rejects the whole answer (fail closed).
   * schema 2 (older server) and schema 3 are both read. */
  function sanitizeEnvelope(raw) {
    if (!isPlainObject(raw) || raw.ok !== true) return { ok: false, reason: 'not an ok answer' };
    if (!isNum(raw.receivedAt) || raw.receivedAt <= 0) return { ok: false, reason: 'receivedAt' };
    if (!isNum(raw.serverAge) || raw.serverAge < 0) return { ok: false, reason: 'serverAge' };
    var d = raw.data;
    if (!isPlainObject(d) || !has(SCHEMAS, d.schema)) return { ok: false, reason: 'schema' };
    var schema = d.schema;
    if (!has(STATUSES, d.status)) return { ok: false, reason: 'status' };
    if (!isNum(d.generated_at) || d.generated_at <= 0 || Math.floor(d.generated_at) !== d.generated_at) return { ok: false, reason: 'generated_at' };
    if (!isPlainObject(d.drugs) || !Array.isArray(d.rows)) return { ok: false, reason: 'drugs/rows' };
    // A map without a prototype: an item called "constructor" or "toString" must not find Object's own members.
    var drugs = Object.create(null);
    var names = [];
    if (schema === 2) {
      for (var i = 0; i < DRUGS.length; i++) if (d.drugs[DRUGS[i]] !== undefined) names.push(DRUGS[i]);
    } else {
      var keys = Object.keys(d.drugs);
      if (keys.length > MAX_ITEMS_V3) return { ok: false, reason: 'too many items' };
      for (var k = 0; k < keys.length; k++) {
        if (!NAME_RE.test(keys[k])) return { ok: false, reason: 'item name' };
        names.push(keys[k]);
      }
    }
    for (var n = 0; n < names.length; n++) {
      var sd = sanitizeDrug(d.drugs[names[n]]);
      if (sd === null) return { ok: false, reason: 'item ' + names[n] };
      drugs[names[n]] = sd;
    }
    var rows = [];
    var dropped = 0;
    var cap = schema === 3 ? MAX_ROWS_V3 : MAX_ROWS;
    var limit = Math.min(d.rows.length, cap);
    for (var j = 0; j < limit; j++) {
      var row = sanitizeRow(d.rows[j], schema);
      if (row === null || !drugs[row.drug]) dropped++;
      else rows.push(row);
    }
    dropped += d.rows.length - limit;
    return { ok: true, env: { receivedAt: raw.receivedAt, serverAge: raw.serverAge,
      latest: { schema: schema, status: d.status, generated_at: d.generated_at, drugs: drugs, rows: rows }, dropped: dropped } };
  }

  /* ---------- age ---------- */

  // Seconds old at this moment: the age the server reported, plus the time the file waited on the server before it
  // arrived there (receivedAt - generated_at, never negative), plus the time since this answer was fetched here.
  function dataAgeS(env, elapsedS) {
    var wait = Math.max(0, env.receivedAt / 1000 - env.latest.generated_at);
    return env.serverAge + wait + Math.max(0, elapsedS || 0);
  }

  /* ---------- profit calculation (port of analysis.py) ---------- */

  function sellNetPerUnit(lowest) { return Math.max(1, lowest - 1) * (1.0 - SELL_FEE); }

  function pAboveGrid(grid, rStar) {
    if (rStar < grid[0]) return { p: 0.95, bound: 'ge' };
    var i = 0;
    for (var k = 0; k < grid.length; k++) if (grid[k] <= rStar) i = k;
    if (i === grid.length - 1) return { p: 0.05, bound: 'le' };
    var lo = grid[i], hi = grid[i + 1];
    var cdf = GRID_PROBS[i] + (GRID_PROBS[i + 1] - GRID_PROBS[i]) * (rStar - lo) / (hi - lo);
    return { p: 1 - cdf, bound: null };
  }
  function rStarExport(bm, cost, n) { return cost / (bm * n) - 1; }
  function rStarImport(bm, lowest) { return (bm / (1.0 - SELL_FEE) + 1) / lowest - 1; }

  // What the shop abroad pays for one item: BLACK_MARKET the current price, STANDARD floor(0,75 x its price).
  // 3 * price is exact in a double and so is the division by 4, so the floor is exactly Python's (3 * price) // 4.
  function shopSellUnit(price, shop) { return shop === STD ? Math.floor(3 * price / 4) : price; }

  function rowPasses(row, flt) {
    if (flt === 'drugs') return row.group === 'Drug';
    if (flt === 'bm') return row.shop_type === BM;
    if (flt === 'shop') return row.shop_type === STD;
    return true;                                                     // 'all' and anything unknown
  }

  function exportEval(latest, row, method, n) {
    var d = latest.drugs[row.drug];
    if (!d || row.bm_status !== 'OK' || d.im_status !== 'OK' || n < 1 || n > CUM_UNITS) return null;
    var cost = d.buy_cost_cum[n - 1];
    if (cost === null) return null;
    var pm = row.per_method[method];
    if (!pm) return null;
    var bm = row.bm_price;
    var sellUnit = shopSellUnit(bm, row.shop_type);
    var point = sellUnit * n - cost;
    if (row.shop_type === STD) {
      // A fixed price: the range is the point value and the chance is 1 if it pays, otherwise 0.
      return { kind: 'export', drug: row.drug, country: row.country, n: n, cost: cost, bm_price: bm, shop_type: row.shop_type,
        sell_unit: sellUnit, fixed: true, point: point, q: null, window_n: null, flight_min: pm.flight_min, basis: point,
        per_hour: point / (2 * pm.flight_min / 60.0), p_win: { p: point > 0 ? 1 : 0, bound: null }, cash_needed: cost };
    }
    var w = pm.export_r;
    var q = null;
    if (w) {
      q = {};
      ['q10', 'q50', 'q90'].forEach(function (k) { q[k] = pyRound(bm * (1 + w[k]) * n - cost); });
    }
    var basis = q ? q.q50 : point;
    return { kind: 'export', drug: row.drug, country: row.country, n: n, cost: cost, bm_price: bm, shop_type: row.shop_type,
      sell_unit: sellUnit, fixed: false, point: point, q: q, window_n: w ? w.n : null, flight_min: pm.flight_min,
      basis: basis, per_hour: basis / (2 * pm.flight_min / 60.0),
      p_win: w ? pAboveGrid(w.grid, rStarExport(bm, cost, n)) : null, cash_needed: cost };
  }

  function importEval(latest, row, method, n) {
    var d = latest.drugs[row.drug];
    if (!d || row.bm_status !== 'OK' || d.im_status !== 'OK' || n < 1) return null;
    var nEff = Math.min(n, row.bm_qty || 0);
    // Sold out now but with a restock forecast: the restock is assumed to be enough for your item slots (same as analysis.py).
    if (row.restock && row.restock.state === 'EMPTY') nEff = n;
    if (nEff <= 0) return null;
    if (d.sell_net_per_unit === null || d.im_lowest === null) return null;
    var bm = row.bm_price;
    var pm = row.per_method[method];
    if (!pm) return null;
    var point = pyRound(d.sell_net_per_unit * nEff) - bm * nEff;
    var w = pm.import_r;
    var q = null;
    if (w) {
      q = {};
      ['q10', 'q50', 'q90'].forEach(function (k) {
        q[k] = pyRound(sellNetPerUnit(d.im_lowest * (1 + w[k])) * nEff) - bm * nEff;
      });
    }
    var basis = q ? q.q50 : point;
    return { kind: 'import', drug: row.drug, country: row.country, n: n, n_eff: nEff, bm_price: bm, shop_type: row.shop_type,
      stock: row.stock, window_source: pm.im_window_source, fixed: false, point: point, q: q, window_n: w ? w.n : null,
      flight_min: pm.flight_min, basis: basis, per_hour: basis / (2 * pm.flight_min / 60.0),
      p_win: w ? pAboveGrid(w.grid, rStarImport(bm, d.im_lowest)) : null, cash_needed: bm * nEff, restock: row.restock || null };
  }

  // Same order as analysis.evaluate_all: by profit per hour, best first (ties keep the order of the rows).
  // flt: all | drugs | bm | shop (the filter buttons).
  function evaluateAll(latest, method, n, flt) {
    var exp = [], imp = [];
    latest.rows.forEach(function (row) {
      if (!row.per_method[method] || !rowPasses(row, flt)) return;
      var e = exportEval(latest, row, method, n);
      if (e) exp.push(e);
      var i = importEval(latest, row, method, n);
      if (i) imp.push(i);
    });
    var byHour = function (a, b) { return b.per_hour - a.per_hour; };
    exp.sort(byHour);
    imp.sort(byHour);
    return { exp: exp, imp: imp };
  }

  /* ---------- the restock forecast: the chance that the stock is there when you land ----------
   * The server (renewal model, stage 4.1) sends a curve per row: 330 promille values, value i = the chance at generatedAt + (i + 1) x 120 s.
   * The panel only picks from it: the bin in [now + F, now + F + 360 min] with the highest value, the earliest on a tie. */

  // Returns {i, v} (v in promille) or null when no bin of the curve lies in the window (the data is too old). Whole seconds only.
  function chooseFromCurve(curve, generatedAt, nowS, F) {
    var off = Math.floor(nowS) - generatedAt;
    var lo = Math.ceil((F + off) / BIN_S) - 1;
    var hi = Math.floor((F + off + LANDING_WINDOW_S) / BIN_S) - 1;
    if (lo < 0) lo = 0;
    if (hi > curve.length - 1) hi = curve.length - 1;
    if (lo > hi) return null;
    var best = lo;
    for (var i = lo + 1; i <= hi; i++) if (curve[i] > curve[best]) best = i;
    return { i: best, v: curve[best] };
  }

  // What the restock forecast says about leaving NOW. F = flight time in seconds one way. Never a guess: known is false for UNKNOWN,
  // for a row without the field and when the curve is too old to reach the window.
  function stockAdvice(rs, nowS, F, generatedAt) {
    var none = { known: false, state: 'UNKNOWN', p: null, landing: null, depart: null, restock: rs || null, flight_s: F };
    if (!rs || rs.state === 'UNKNOWN' || !rs.curve) return none;
    var c = chooseFromCurve(rs.curve, generatedAt, nowS, F);
    if (c === null) return none;
    var landing = generatedAt + (c.i + 1) * BIN_S;
    return { known: true, state: rs.state, p: c.v / 1000, landing: landing, depart: landing - F, restock: rs, flight_s: F };
  }

  // The little label on a row. Recomputed every second from the same advice, so it counts down without a new fetch.
  //   LEAVE NOW (green) | Leave in <m> min (yellow, rounded up) | Leave at <hh:mm> TCT (yellow) | Sells out first (grey) |
  //   Stock timing unknown (grey)
  function timeMark(adv, nowS) {
    if (!adv || !adv.known) return { kind: 'unknown', tone: 'grey', text: 'Stock timing unknown' };
    if (adv.p < SURE_P) return { kind: 'sells', tone: 'grey', text: 'Sells out first' };
    var wait = adv.depart - nowS;
    if (wait <= LEAVE_NOW_S) return { kind: 'now', tone: 'green', text: 'LEAVE NOW' };
    if (wait <= LEAVE_SOON_S) return { kind: 'soon', tone: 'yellow', text: 'Leave in ' + Math.ceil(wait / 60) + ' min' };
    return { kind: 'later', tone: 'yellow', text: 'Leave at ' + fmtTct(adv.depart) + ' TCT' };
  }

  /* ---------- the lists: expected profit per hour, strictly in order ---------- */

  // chance = p_stock x p_win. An export needs no stock timing (p_stock = 1); a fixed shop price has p_win = 1 (or 0).
  // null = not known: no window, or no restock forecast.
  function chanceOf(e, adv) {
    var pw = e.p_win;
    if (!pw) return null;
    if (e.kind === 'export') return { p: pw.p };
    if (!adv || !adv.known) return null;
    return { p: adv.p * pw.p };
  }

  // Expected profit per hour of flying: profit (q50) x chance / (2 x flight hours). null while the chance is not known.
  function expectedPerHour(basis, chance, flightMin) {
    if (!chance) return null;
    return basis * chance.p / (2 * flightMin / 60.0);
  }

  // A round trip: both legs have to work, so the chances multiply. A leg that is missing counts as certain.
  function tripChance(t, advImport) {
    var p = 1;
    if (t.export) { var ce = chanceOf(t.export, null); if (ce === null) return null; p *= ce.p; }
    if (t.import) { var ci = chanceOf(t.import, advImport); if (ci === null) return null; p *= ci.p; }
    return { p: p };
  }

  function nameOfCountry(code) { return COUNTRY_NAMES.hasOwnProperty(code) ? COUNTRY_NAMES[code] : '?'; }

  // One list entry. kind: export | import | trip.
  function entryOf(kind, e, t, adv) {
    var isTrip = kind === 'trip';
    var flight = (isTrip ? t : e).flight_min;
    var basis = isTrip ? t.total : e.basis;
    var chance = isTrip ? tripChance(t, adv) : chanceOf(e, adv);
    var needsStock = kind === 'import' || (isTrip && !!t.import);                 // an export needs no stock timing
    var stockKnown = !needsStock || (!!adv && adv.known);
    return {
      needsStock: needsStock, stockKnown: stockKnown, hidden: needsStock && stockKnown && adv.p < HIDE_P,
      kind: kind, key: kind + '|' + (isTrip ? t.country : e.drug + '|' + e.country),
      name: isTrip ? nameOfCountry(t.country) : e.drug, country: isTrip ? t.country : e.country,
      e: e, t: t, basis: basis, flight_min: flight, advice: adv, chance: chance,
      perHour: expectedPerHour(basis, chance, flight)
    };
  }

  function tieBreak(a, b) {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.country < b.country ? -1 : (a.country > b.country ? 1 : 0);
  }
  function byPerHour(a, b) { return b.perHour !== a.perHour ? b.perHour - a.perHour : tieBreak(a, b); }
  function byBasis(a, b) { return b.basis !== a.basis ? b.basis - a.basis : tieBreak(a, b); }
  // Only runs that would pay (profit per trip above zero) are listed - a list of losses is no advice.
  // ranked: entries whose chance is known, strictly by expected profit per hour, the ten best.
  // unknown: entries whose chance is not known yet (no window, or no restock forecast) that would pay, by profit per trip.
  function split(entries) {
    var ranked = entries.filter(function (x) { return x.basis > 0 && x.perHour !== null; }).sort(byPerHour).slice(0, LIST_MAX);
    var unknown = entries.filter(function (x) { return x.perHour === null && x.basis > 0; }).sort(byBasis).slice(0, UNKNOWN_MAX);
    return { ranked: ranked, unknown: unknown };
  }

  // The three lists of the panel for a latest.json, a method, a number of item slots and a filter. nowS = server time now.
  function advise(latest, method, n, flt, nowS) {
    var all = evaluateAll(latest, method, n, flt);
    var advOf = function (i) { return stockAdvice(i.restock, nowS, i.flight_min * 60, latest.generated_at); };
    var impEntries = all.imp.map(function (i) { return entryOf('import', i, null, advOf(i)); });
    var expEntries = all.exp.map(function (e) { return entryOf('export', e, null, null); });
    var trips = roundTrips(all.exp, all.imp).map(function (t) { return entryOf('trip', null, t, t.import ? advOf(t.import) : null); });
    var shown = function (x) { return !x.hidden; };                                // chance below 0.20: no advice
    return { trips: split(trips.filter(shown)), export: split(expEntries), import: split(impEntries.filter(shown)) };
  }

  /* ---------- what a row says (pure text, tested against the Python numbers) ---------- */

  var FIXED_PROFIT = 'Fixed shop price, so this profit is certain if you buy at these prices.';
  var FIXED_LOSS = 'Fixed shop price, so this trip loses money at these prices.';
  var NO_RANGE_EXPORT = 'Not enough price history yet, so no range or chance.';
  var NO_RANGE_IMPORT = 'No price range yet (price history too short)';
  var UNKNOWN_GROUP_TITLE = 'Not enough history yet';
  var LEGEND = 'Per hour = expected profit per hour of flying, after the 5% Item Market fee. Tap a row for details.';

  // The two lines of a compact row. group: 'ranked' (the big number is expected profit per hour) or 'unknown' (the chance
  // is not known yet; the big number is the profit per trip, which is what that group is sorted by).
  function rowView(en, nowS, group) {
    var left = en.kind === 'trip' ? en.name : en.name + (en.kind === 'export' ? ' → ' : ' ← ') + countryName(en.country);
    var big = group === 'ranked' ? fmtPerHour(en.perHour) : fmtSignedCompact(en.basis) + '/trip';
    var mark = en.needsStock && en.stockKnown ? timeMark(en.advice, nowS) : null;       // only when the chance of stock is known
    var parts = [];
    if (mark) parts.push(mark.text);
    if (group === 'ranked') {
      parts.push(fmtSignedCompact(en.basis) + ' per trip');
      parts.push(fmtChance(en.chance) + ' chance');
    } else {
      parts.push(en.stockKnown ? 'price history too short' : 'stock timing unknown');
    }
    return { left: left, big: big, mark: mark, line2: parts.join(' · '), positive: group === 'ranked' ? en.perHour >= 0 : en.basis >= 0 };
  }

  function exportLines(L, e) {
    var c = countryName(e.country);
    var shop = e.shop_type === STD;
    L.push('Buy ' + e.n + ' in Torn at ' + fmtMoney(e.cost / e.n) + ' each · ' + (shop
      ? 'the ' + c + ' shop pays ' + fmtMoney(e.sell_unit) + ' each (75% of its price)'
      : 'sell at ' + fmtMoney(e.bm_price) + ' each in ' + c));
    L.push(e.fixed ? (e.point > 0 ? FIXED_PROFIT : FIXED_LOSS)
      : (e.q ? 'Usually ' + fmtSigned(e.q.q10) + ' to ' + fmtSigned(e.q.q90) + ' · chance of profit: ' + fmtChance({ p: e.p_win.p }) : NO_RANGE_EXPORT));
    L.push('Cash needed: ' + fmtCompact(e.cash_needed));
  }

  function importLines(L, i, adv) {
    var rs = i.restock;
    L.push('Buy ' + i.n_eff + ' in ' + countryName(i.country) + ' at ' + fmtMoney(i.bm_price) + ' each · sell on the Item Market at home'
      + (i.n_eff < i.n ? ' (only ' + i.n_eff + ' in stock)' : ''));
    L.push(i.q ? 'Usually ' + fmtSigned(i.q.q10) + ' to ' + fmtSigned(i.q.q90) + ' per trip' : NO_RANGE_IMPORT);
    if (rs && rs.state === 'EMPTY' && adv && adv.known) {
      L.push('Restock expected ' + fmtTct(rs.since + rs.a_grid[9]) + ' TCT (usually ' + fmtTct(rs.since + rs.a_grid[1]) + '–' + fmtTct(rs.since + rs.a_grid[17]) + ')');
      L.push('Leave at ' + fmtTct(adv.depart) + ' TCT to land at ' + fmtTct(adv.landing) + ' TCT');
    } else if (rs && rs.state === 'IN_STOCK') {
      L.push('In stock now: ' + i.stock + ' · usually lasts ' + fmtHM(Math.floor(rs.b_grid[9] / 60)) + ' after a restock');
    } else if (rs && rs.state === 'STEADY') {
      L.push('Plenty in stock: ' + i.stock + ' · sells about ' + fmtSellRate(rs.rate_per_h));
    }
    if (rs && rs.hit) L.push('Restock forecast hit: ' + rs.hit.within_300 + ' of the last ' + rs.hit.n + ' within 5 min');
    L.push('Chance the stock is there when you land: ' + (adv && adv.known ? fmtChance({ p: adv.p }) : 'unknown'));
    L.push('Cash needed: ' + fmtCompact(i.cash_needed));
  }

  // The lines that fold out under a row, one sentence each. Every row ends with the flight time.
  function detailLines(en, nowS) {
    var L = [];
    if (en.kind === 'export') exportLines(L, en.e);
    else if (en.kind === 'import') importLines(L, en.e, en.advice);
    else {
      var t = en.t;
      L.push((t.export ? 'Out: ' + t.export.drug + ' (' + fmtSigned(t.export.basis) + ')' : 'Out: nothing') + ' · '
        + (t.import ? 'Home: ' + t.import.drug + ' (' + fmtSigned(t.import.basis) + ')' : 'Home: nothing'));
      if (t.import) importLines(L, t.import, en.advice);
      else if (t.export) exportLines(L, t.export);
    }
    L.push('Flight ' + fmtHM(en.flight_min) + ' each way');
    return L;
  }

  // Port of analysis.round_trips: best positive export + best positive import per country.
  function roundTrips(exp, imp) {
    var best = {};
    var order = [];
    exp.forEach(function (e) {
      if (e.basis > 0 && (!best[e.country] || e.basis > best[e.country][0].basis)) {
        if (!best[e.country]) { best[e.country] = [null, null]; order.push(e.country); }
        best[e.country][0] = e;
      }
    });
    imp.forEach(function (i) {
      if (i.basis > 0) {
        if (!best[i.country]) { best[i.country] = [null, null]; order.push(i.country); }
        var b = best[i.country];
        if (b[1] === null || i.basis > b[1].basis) b[1] = i;
      }
    });
    var out = order.map(function (country) {
      var e = best[country][0], i = best[country][1];
      var total = (e ? e.basis : 0) + (i ? i.basis : 0);
      var fm = (e || i).flight_min;
      return { country: country, export: e, import: i, total: total, flight_min: fm, per_hour: total / (2 * fm / 60.0),
        cash_needed: (e ? e.cash_needed : 0) + (i ? i.cash_needed : 0) };
    });
    out.sort(function (a, b) { return b.per_hour - a.per_hour; });
    return out;
  }

  /* ---------- the view model ---------- */

  function clampSeats(v) {
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return DEFAULT_SEATS;
    return Math.max(1, Math.min(MAX_SEATS, n));
  }
  function validMethod(m) { return has(METHODS, m) ? m : DEFAULT_METHOD; }
  function validGroup(g) { return has(GROUPS, g) ? g : DEFAULT_GROUP; }

  function validTab(t) { return has(TABS, t) ? t : DEFAULT_TAB; }

  // The clock. The panel counts time on the SERVER's clock, so a wrong clock on the phone or PC does not move a departure.
  // offset = (receivedAt / 1000 + serverAge) - the local time when the answer came; server time = local time + offset.
  function clockOffsetS(env, fetchedAtMs) { return env.receivedAt / 1000 + env.serverAge - fetchedAtMs / 1000; }
  function serverNowS(offsetS, localMs) { return localMs / 1000 + offsetS; }

  // Everything the panel shows, decided here. state: NO_DATA | STALE | STATUS | OK.
  // opts: { method, seats, group, tab, elapsedS, nowS }  (nowS = server time; without it the time the file was made plus its age)
  function buildView(env, opts) {
    var method = validMethod(opts && opts.method);
    var seats = clampSeats(opts && opts.seats);
    var group = validGroup(opts && opts.group);
    var tab = validTab(opts && opts.tab);
    var elapsed = opts && opts.elapsedS || 0;
    var view = { method: method, seats: seats, group: group, tab: tab, state: 'NO_DATA', headline: HEADLINE.NO_DATA, detail: '',
      ageS: null, status: null, lists: null, nowS: null, dropped: 0 };
    if (!env) return view;
    var age = dataAgeS(env, elapsed);
    view.ageS = age;
    view.status = env.latest.status;
    view.dropped = env.dropped || 0;
    if (age > STALE_S) {
      view.state = 'STALE';
      view.headline = HEADLINE.STALE;
      view.detail = STALE_TEXT;
      return view;
    }
    if (env.latest.status !== 'OK') {
      view.state = 'STATUS';
      view.headline = HEADLINE[env.latest.status];
      view.detail = STATUS_TEXT[env.latest.status];
      return view;
    }
    var nowS = opts && isNum(opts.nowS) ? Math.floor(opts.nowS) : env.latest.generated_at + Math.floor(age);
    view.nowS = nowS;
    view.state = 'OK';
    view.headline = HEADLINE.OK;
    view.lists = advise(env.latest, method, seats, group, nowS);
    return view;
  }

  /* ---------- text formatting ---------- */

  function groupDigits(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtMoney(x) {
    if (!isNum(x)) return '-';
    var r = Math.round(Math.abs(x));
    return (x < 0 && r !== 0 ? '-' : '') + '$' + groupDigits(r);
  }
  function fmtCompact(x) {
    if (!isNum(x)) return '-';
    var a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'k';
    return s + '$' + Math.round(a);
  }
  // Plus in front of a gain, minus in front of a loss.
  function fmtSigned(x) {
    if (!isNum(x)) return '-';
    return (x < 0 && Math.round(Math.abs(x)) !== 0 ? '-' : '+') + fmtMoney(Math.abs(x));
  }
  function fmtSignedCompact(x) {
    if (!isNum(x)) return '-';
    return (x < 0 ? '-' : '+') + fmtCompact(Math.abs(x));
  }
  function fmtHM(minutes) {
    var m = Math.floor(minutes);
    return Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
  }
  function fmtAge(sec) {
    var s = Math.max(0, Math.floor(sec));
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
    return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // A clock time in TCT (= UTC), rounded UP to the minute so that nobody leaves a few seconds too early.
  function fmtTct(epochS) {
    var m = Math.ceil(epochS / 60);
    return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
  }
  // Chance as text everywhere: under 0.05 "under 5%", 0.90 or more "90%+" (the model is calibrated to about 90% at best, nothing higher
  // is shown), otherwise rounded DOWN to a multiple of 5 ("85%").
  function fmtChance(c) {
    if (!c) return 'unknown';
    if (c.p < 0.05) return 'under 5%';
    if (c.p >= 0.9) return '90%+';
    return (Math.floor(c.p * 20 + 1e-9) * 5) + '%';
  }
  function fmtPerHour(x) { return fmtSignedCompact(x) + '/h'; }
  // The sales rate of a STEADY row: "under 1/h" below one unit an hour, otherwise a whole number ("12/h").
  function fmtSellRate(r) { return r < 1 ? 'under 1/h' : Math.round(r) + '/h'; }
  function countryName(code) { return COUNTRY_NAMES.hasOwnProperty(code) ? COUNTRY_NAMES[code] : '?'; }

  return {
    STALE_S: STALE_S, METHODS: METHODS, DRUGS: DRUGS, STATUSES: STATUSES, DEFAULT_SEATS: DEFAULT_SEATS,
    DEFAULT_METHOD: DEFAULT_METHOD, MAX_SEATS: MAX_SEATS, COUNTRY_NAMES: COUNTRY_NAMES, GRID_PROBS: GRID_PROBS,
    GROUPS: GROUPS, GROUP_LABEL: GROUP_LABEL, DEFAULT_GROUP: DEFAULT_GROUP, validGroup: validGroup, rowPasses: rowPasses,
    shopSellUnit: shopSellUnit, MAX_ROWS: MAX_ROWS, MAX_ROWS_V3: MAX_ROWS_V3,
    pyRound: pyRound, sanitizeEnvelope: sanitizeEnvelope, dataAgeS: dataAgeS, sellNetPerUnit: sellNetPerUnit,
    pAboveGrid: pAboveGrid, rStarExport: rStarExport, rStarImport: rStarImport, exportEval: exportEval,
    importEval: importEval, evaluateAll: evaluateAll, roundTrips: roundTrips,
    TABS: TABS, TAB_LABEL: TAB_LABEL, DEFAULT_TAB: DEFAULT_TAB, validTab: validTab, advise: advise, stockAdvice: stockAdvice,
    timeMark: timeMark, chooseFromCurve: chooseFromCurve, chanceOf: chanceOf, sanitizeRestock: sanitizeRestock,
    clockOffsetS: clockOffsetS, serverNowS: serverNowS, fmtTct: fmtTct, fmtChance: fmtChance, fmtPerHour: fmtPerHour, fmtSellRate: fmtSellRate,
    LIST_MAX: LIST_MAX, UNKNOWN_MAX: UNKNOWN_MAX, HIDE_P: HIDE_P, SURE_P: SURE_P,
    rowView: rowView, detailLines: detailLines, LEGEND: LEGEND, UNKNOWN_GROUP_TITLE: UNKNOWN_GROUP_TITLE, FIXED_PROFIT: FIXED_PROFIT,
    FIXED_LOSS: FIXED_LOSS,
    clampSeats: clampSeats, validMethod: validMethod, buildView: buildView,
    NO_DATA_TEXT: NO_DATA_TEXT, fmtSigned: fmtSigned, fmtSignedCompact: fmtSignedCompact,
    fmtMoney: fmtMoney, fmtCompact: fmtCompact, fmtHM: fmtHM, fmtAge: fmtAge, countryName: countryName
  };
})();

/* ================= KS Black Market — server client (shared by PC and PDA) =================
 * The ONLY thing this script talks to is the KS Black Market worker, with two requests:
 *   POST /login   {"key": "<your Torn key>"}        -> {"session": "...", "expiresAt": ...}
 *   POST /latest  {"session": "<from /login>"}       -> the newest numbers from ks-server
 * Both are POST with a JSON body. The sign-in lives in memory only and travels in the body, never in a header or
 * the URL. The Torn key is sent to /login and nowhere else. No request ever goes to Torn.
 * This part has no DOM and no GM_* calls: the transport is passed in, so it can be tested without a browser.
 */
var KSBM_API = (function () {
  'use strict';

  var ORIGIN = 'https://ks-blackmarket.hans-viklund.workers.dev';
  var PATHS = ['/login', '/latest'];
  var KEY_RE = /^[A-Za-z0-9]{16}$/;

  function validKey(k) { return typeof k === 'string' && KEY_RE.test(k); }

  // The only way a URL is ever made. Anything that is not exactly the worker's /login or /latest is refused.
  function urlFor(path) {
    if (PATHS.indexOf(path) < 0) throw new Error('Blocked non-allowlisted endpoint');
    return ORIGIN + path;
  }

  // Worker answers to plain English. Only our own texts are shown, never text taken from the answer.
  var LOGIN_TEXT = {
    invalid_key: 'Torn says the key is incorrect. The saved key was removed.',
    key_access_too_low: 'The key has too low access (a Public key is enough). The saved key was removed.',
    key_owner_in_federal_jail: 'The key owner is in federal jail. The saved key was removed.',
    key_owner_inactive: 'The key is disabled because its owner was inactive. The saved key was removed.',
    key_paused: 'The key is paused in Torn. The saved key was removed.',
    not_a_member: 'This tool is only for members of Politically Incorrect. The saved key was removed.',
    key_malformed: 'That does not look like a Torn key (16 letters and digits). The saved key was removed.'
  };

  function classifyLogin(status, body) {
    var reason = body && typeof body.reason === 'string' ? body.reason : '';
    var error = body && typeof body.error === 'string' ? body.error : '';
    if (status === 200 && body && body.ok === true && typeof body.session === 'string' && body.session.length > 0 && body.session.length < 4096) {
      return { ok: true, session: body.session, expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : null };
    }
    var retryAfterS = body && typeof body.retryAfterSeconds === 'number' ? Math.min(3600, Math.max(0, body.retryAfterSeconds)) : 0;
    if (status === 429) {
      return { ok: false, code: 'BLOCKED', message: 'Too many sign-in attempts. Waiting before trying again.', retryAfterS: retryAfterS || 60, dropKey: false };
    }
    if (status === 400 && reason === 'key_malformed') {
      return { ok: false, code: 'KEY_REJECTED', message: LOGIN_TEXT.key_malformed, dropKey: true };
    }
    if (status === 401 && error === 'key_rejected' && body.retryable === false && LOGIN_TEXT[reason]) {
      return { ok: false, code: 'KEY_REJECTED', message: LOGIN_TEXT[reason], dropKey: true };
    }
    if (status === 403 && (reason === 'not_a_member' || error === 'not_a_member')) {
      return { ok: false, code: 'NOT_MEMBER', message: LOGIN_TEXT.not_a_member, dropKey: true };
    }
    if (status === 401 && error === 'key_rejected') {
      return { ok: false, code: 'KEY_REJECTED', message: 'Torn rejected the key. The saved key was removed.', dropKey: true };
    }
    if (status === 0) return { ok: false, code: 'SERVER', message: 'The server could not be reached. Trying again in a minute.', dropKey: false };
    if (status >= 500 || status === 502 || status === 503) {
      return { ok: false, code: 'RETRY', message: 'Torn or the server had a temporary problem. Trying again in a minute.', dropKey: false };
    }
    return { ok: false, code: 'SERVER', message: 'The server gave an unexpected answer (' + status + ').', dropKey: false };
  }

  /* deps: { post(path, bodyObject) -> Promise<{status, json}>, getKey() -> string, forgetKey(), now() -> ms }
   * fetchLatest() -> Promise<{ok:true, env} | {ok:false, code, message, retryAfterS?}> and never throws. */
  function createClient(deps) {
    var session = null;
    var rejected = false;           // set when the key was rejected for good: no more tries until a new key is saved
    var blockedUntil = 0;

    function reset() { session = null; }
    function unblock() { rejected = false; blockedUntil = 0; session = null; }

    async function login(key) {
      var res;
      try { res = await deps.post('/login', { key: key }); } catch (e) { res = { status: 0, json: null }; }
      var c = classifyLogin(res.status, res.json);
      if (c.ok) { session = c.session; return c; }
      if (c.dropKey) { rejected = true; try { deps.forgetKey(); } catch (e2) { /* nothing to do */ } }
      if (c.code === 'BLOCKED') blockedUntil = deps.now() + c.retryAfterS * 1000;
      return c;
    }

    async function fetchLatest() {
      try {
        if (rejected) return { ok: false, code: 'KEY_REJECTED', message: 'No valid key. Save a new Torn key in Settings.' };
        var key = deps.getKey();
        if (!validKey(key)) return { ok: false, code: 'NO_KEY', message: 'Save your Torn API key in Settings to sign in.' };
        if (blockedUntil > deps.now()) {
          return { ok: false, code: 'BLOCKED', message: 'Too many sign-in attempts. Waiting before trying again.', retryAfterS: Math.ceil((blockedUntil - deps.now()) / 1000) };
        }
        var freshLogin = false;
        if (session === null) {
          var l = await login(key);
          if (!l.ok) return l;
          freshLogin = true;
        }
        for (var attempt = 0; attempt < 2; attempt++) {
          var res;
          try { res = await deps.post('/latest', { session: session }); } catch (e3) { res = { status: 0, json: null }; }
          if (res.status === 401) {
            session = null;
            // One new sign-in per fetch, and none right after a sign-in that was just issued.
            if (attempt === 0 && !freshLogin) {
              var l2 = await login(key);
              if (!l2.ok) return l2;
              freshLogin = true;
              continue;
            }
            return { ok: false, code: 'AUTH', message: 'The server did not accept the sign-in. Press Retry, or save the key again.' };
          }
          if (res.status === 503 && res.json && res.json.error === 'NO_DATA') {
            return { ok: false, code: 'NO_DATA', message: 'The server has not received any prices yet.' };
          }
          if (res.status === 200) {
            var s = KSBM_CORE.sanitizeEnvelope(res.json);
            if (!s.ok) return { ok: false, code: 'BAD_DATA', message: 'The server sent data this script cannot read (' + s.reason + '). Nothing is shown.' };
            return { ok: true, env: s.env };
          }
          if (res.status === 0) return { ok: false, code: 'SERVER', message: 'The server could not be reached. Trying again in a minute.' };
          return { ok: false, code: 'SERVER', message: 'The server gave an unexpected answer (' + res.status + ').' };
        }
        return { ok: false, code: 'AUTH', message: 'The server did not accept the sign-in. Press Retry, or save the key again.' };
      } catch (e4) {
        return { ok: false, code: 'SERVER', message: 'Unexpected error: ' + (e4 && e4.name ? e4.name : 'error') };
      }
    }

    return { fetchLatest: fetchLatest, reset: reset, unblock: unblock, hasSession: function () { return session !== null; } };
  }

  return { ORIGIN: ORIGIN, PATHS: PATHS, validKey: validKey, urlFor: urlFor, classifyLogin: classifyLogin, createClient: createClient };
})();

/* ================= KS Black Market — platform glue (the only code that uses GM_*) =================
 * Storage under the namespace "ksBm.v1." in the script manager's own storage, and the one transport the API client
 * uses: GM_xmlhttpRequest, always POST, always to the KS Black Market worker (the address is built in KSBM_API.urlFor).
 */
var KSBM_IO = (function () {
  'use strict';

  var NS = 'ksBm.v1.';
  var memory = {};                  // used when the script manager gives no storage; nothing is persisted then
  var MAX_RESPONSE_CHARS = 8000000;
  var TIMEOUT_MS = 20000;

  function persistent() { return typeof GM_getValue === 'function' && typeof GM_setValue === 'function'; }

  // GM_getValue answers at once in Tampermonkey and may answer with a promise elsewhere: await handles both.
  async function load(name, fallback) {
    try {
      if (persistent()) {
        var v = await Promise.resolve(GM_getValue(NS + name, fallback));
        return v === undefined ? fallback : v;
      }
    } catch (e) { /* fall through to memory */ }
    return Object.prototype.hasOwnProperty.call(memory, name) ? memory[name] : fallback;
  }

  function save(name, value) {
    memory[name] = value;
    try { if (typeof GM_setValue === 'function') GM_setValue(NS + name, value); } catch (e) { /* kept in memory only */ }
  }

  async function loadSettings() {
    var key = await load('key', '');
    var method = await load('method', KSBM_CORE.DEFAULT_METHOD);
    var seats = await load('seats', KSBM_CORE.DEFAULT_SEATS);
    var group = await load('group', KSBM_CORE.DEFAULT_GROUP);
    var tab = await load('tab', KSBM_CORE.DEFAULT_TAB);
    return {
      key: KSBM_API.validKey(key) ? key : '',
      method: KSBM_CORE.validMethod(method),
      seats: KSBM_CORE.clampSeats(seats),
      group: KSBM_CORE.validGroup(group),
      tab: KSBM_CORE.validTab(tab)
    };
  }

  // One request to the worker. Resolves {status, json}; status 0 means the request did not complete. Never rejects.
  function post(path, body) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(r) { if (!done) { done = true; resolve(r); } }
      var url;
      try { url = KSBM_API.urlFor(path); } catch (e) { finish({ status: 0, json: null }); return; }
      if (typeof GM_xmlhttpRequest !== 'function') { finish({ status: 0, json: null }); return; }
      try {
        GM_xmlhttpRequest({
          method: 'POST',
          url: url,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          data: JSON.stringify(body),
          timeout: TIMEOUT_MS,
          anonymous: true,
          onload: function (r) {
            var text = typeof r.responseText === 'string' ? r.responseText : '';
            if (text.length > MAX_RESPONSE_CHARS) { finish({ status: 0, json: null }); return; }
            var json = null;
            try { json = JSON.parse(text); } catch (e2) { json = null; }
            if (json === null || typeof json !== 'object' || Array.isArray(json)) json = null;
            finish({ status: (r.status | 0), json: json });
          },
          onerror: function () { finish({ status: 0, json: null }); },
          ontimeout: function () { finish({ status: 0, json: null }); },
          onabort: function () { finish({ status: 0, json: null }); }
        });
      } catch (e3) { finish({ status: 0, json: null }); }
    });
  }

  return { persistent: persistent, loadSettings: loadSettings, save: save, post: post };
})();

/* ================= KS Black Market — panel (Shadow DOM) =================
 * One small "BM" button and one panel, both inside their own shadow root on a host element that is a direct child of
 * <html>. Nothing of Torn's page is read, moved, hidden or styled. Every piece of text is set with textContent from
 * our own formatting of numbers; nothing from the server is ever put in as HTML.
 * The text of every row comes from KSBM_CORE.rowView / detailLines (pure functions, tested against the Python numbers);
 * this file only puts it on the screen.
 */
var KSBM_UI = (function () {
  'use strict';

  var C = KSBM_CORE;

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}',
    '.wrap{position:fixed;left:8px;bottom:84px;z-index:2147483000;color:#e8e8e8;font-size:13px;line-height:1.35}',
    '.wrap.hidden{display:none}',
    '.bm{display:flex;align-items:center;justify-content:center;width:38px;height:38px;margin-right:auto;border-radius:19px;border:2px solid #6aa84f;background:#1d2a1a;color:#cfe8c4;font-weight:700;font-size:13px;cursor:pointer;padding:0}',
    '.bm.warn{border-color:#d9a441;color:#f3dca3;background:#2b2412}.bm.bad{border-color:#c0504d;color:#f1b3b1;background:#2b1615}',
    '.panel{display:none;width:min(430px,calc(100vw - 16px));max-height:76vh;overflow:auto;margin-bottom:8px;border:1px solid #444;border-radius:8px;background:#1b1b1b;box-shadow:0 4px 18px rgba(0,0,0,.6);padding:8px}',
    '.wrap.open .panel{display:block}',
    '.head{display:flex;align-items:center;gap:8px;margin-bottom:4px}.title{font-weight:700;font-size:14px;flex:1}',
    '.chip{padding:1px 8px;border-radius:9px;font-size:11px;font-weight:700;background:#2d4a24;color:#cfe8c4}',
    '.chip.warn{background:#5a4514;color:#f3dca3}.chip.bad{background:#5a2321;color:#f1b3b1}',
    '.close{background:none;border:0;color:#bbb;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}',
    '.meta{color:#aaa;font-size:11.5px;margin-bottom:4px}',
    '.msg{display:none;margin:4px 0;padding:6px 8px;border-radius:6px;background:#3a2b12;color:#f3dca3}.msg.show{display:block}',
    '.msg.bad{background:#3a1816;color:#f1b3b1}',
    'details.settings{margin:6px 0;border:1px solid #333;border-radius:6px;padding:4px 8px}',
    'details.settings summary{cursor:pointer;color:#ccc}',
    '.field{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0}.field label{min-width:92px;color:#bbb}',
    '.field input,.field select{background:#262626;color:#eee;border:1px solid #555;border-radius:4px;padding:4px 6px;font-size:13px}',
    '.field input.key{flex:1;min-width:140px}.field input.seats{width:72px}',
    'button.btn{background:#2f3f2b;color:#e6f2e0;border:1px solid #577a4b;border-radius:4px;padding:4px 10px;font-size:12.5px;cursor:pointer}',
    'button.btn.sec{background:#2a2a2a;border-color:#555;color:#ddd}',
    '.note{color:#9a9a9a;font-size:11.5px}.settings .note{margin:6px 0}',
    'h3{font-size:12.5px;line-height:1.3;margin:12px 0 2px;color:#9a9a9a;font-weight:700}',
    '.filters{display:none;flex-wrap:wrap;gap:6px;margin:10px 0 0}.filters.show{display:flex}',
    '.filters button{background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:15px;padding:5px 12px;font-size:12.5px;cursor:pointer}',
    '.filters button.on{background:#3d6a2f;border-color:#8fd16f;color:#fff;font-weight:700}',
    '.tabs{display:none;gap:4px;margin:8px 0 2px;border-bottom:1px solid #333}.tabs.show{display:flex}',
    '.tabs button{flex:1;background:none;color:#aaa;border:0;border-bottom:3px solid transparent;padding:7px 4px;font-size:13px;cursor:pointer}',
    '.tabs button.on{color:#fff;font-weight:700;border-bottom-color:#8fd16f}',
    '.row{padding:7px 2px;border-top:1px solid #2c2c2c;cursor:pointer}.row:first-child{border-top:0}',
    '.row:focus-visible{outline:2px solid #8fd16f;outline-offset:-2px}',
    '.r1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
    '.name{font-weight:700;min-width:0;overflow-wrap:anywhere}',
    '.big{font-weight:700;font-size:16px;white-space:nowrap}.pos{color:#8fd16f}.neg{color:#e8827f}',
    '.r2{color:#b5b5b5;font-size:12px;margin-top:1px}',
    '.mark{display:inline-block;padding:0 6px;border-radius:3px;font-weight:700;font-size:11.5px}',
    '.mark.green{background:#2d5a24;color:#d8f5cc}.mark.yellow{background:#5a4514;color:#f3dca3}.mark.grey{background:#333;color:#aaa;font-weight:400}',
    '.details{display:none;margin:5px 0 2px;padding-left:8px;border-left:2px solid #444}.row.open .details{display:block}',
    '.details .d{color:#cfcfcf;font-size:12px;margin:2px 0}',
    '.empty{color:#999;padding:6px 0}',
    '.foot{margin-top:8px;color:#aaa;font-size:11.5px;border-top:1px solid #333;padding-top:6px}',
    '.legend{margin-top:8px}',
    '.pda .bm{width:44px;height:44px;border-radius:22px}.pda button.btn{padding:8px 12px}.pda .close{font-size:26px;padding:0 8px}',
    '.pda .filters button{padding:10px 14px}.pda .tabs button{padding:11px 2px}.pda .row{padding:10px 2px}'
  ].join('');

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  // Short names for the meta line, long names for the list in Settings.
  var METHOD_LABEL = { standard: 'Standard', airstrip: 'Airstrip', wlt: 'WLT', business: 'Business' };
  var METHOD_LONG = { standard: 'Standard', airstrip: 'Airstrip (Private Island)', wlt: 'WLT (Wind Lines shares)', business: 'Business Class ticket' };
  var SLOTS_HELP = 'How many items you can carry when you travel. Airstrip, WLT and Business give 15; suitcase, the Excursion faction perk, job specials and the Smuggling For Beginners book add more. Highest possible: ' + KSBM_CORE.MAX_SEATS + '.';
  var PRIVACY = 'Your key is sent only to the KS Black Market server, which checks with Torn that you are in Politically Incorrect. The server does not store it. A Public key is enough. This script never contacts Torn.';
  var NOTE = 'Measurement, not advice. Prices abroad change about every 5 minutes.';
  var EMPTY_TEXT = 'Nothing pays right now.';

  /* cb: { onToggle(open), onSaveKey(text), onRemoveKey(), onMethod(m), onSeats(n), onGroup(g), onTab(t), onRetry() } */
  function create(platform, cb) {
    var host = document.createElement('div');
    host.id = 'ks-bm-host';
    var shadow = host.attachShadow({ mode: 'open' });
    var style = h('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    var wrap = h('div', 'wrap' + (platform === 'PDA' ? ' pda' : ''));
    var btn = h('button', 'bm', 'BM');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'KS Black Market');
    var panel = h('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'KS Black Market');

    var head = h('div', 'head');
    var chip = h('span', 'chip', 'NO DATA YET');
    var closeBtn = h('button', 'close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    add(head, h('span', 'title', 'KS Black Market ' + platform), chip, closeBtn);

    var meta = h('div', 'meta');
    var msg = h('div', 'msg');
    msg.setAttribute('role', 'status');
    var retryBtn = h('button', 'btn sec', 'Retry');
    retryBtn.type = 'button';

    // ---- settings
    var settings = h('details', 'settings');
    var summary = h('summary', null, 'Settings');
    var keyInput = h('input', 'key');
    keyInput.type = 'password';
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.placeholder = 'Paste your Torn API key (16 characters)';
    var saveKey = h('button', 'btn', 'Save key');
    saveKey.type = 'button';
    var removeKey = h('button', 'btn sec', 'Remove');
    removeKey.type = 'button';
    var keyState = h('span', 'note');
    var methodSel = h('select');
    C.METHODS.forEach(function (m) { var o = h('option', null, METHOD_LONG[m]); o.value = m; methodSel.appendChild(o); });
    var seatsIn = h('input', 'seats');
    seatsIn.type = 'number';
    seatsIn.min = '1';
    seatsIn.max = String(C.MAX_SEATS);
    seatsIn.step = '1';
    var f1 = add(h('div', 'field'), h('label', null, 'Torn API key'), keyInput, saveKey, removeKey);
    var f1b = add(h('div', 'field'), keyState);
    var f2 = add(h('div', 'field'), h('label', null, 'Travel method'), methodSel);
    var f3 = add(h('div', 'field'), h('label', null, 'Item slots'), seatsIn);
    var f3b = h('div', 'note', SLOTS_HELP);
    var discl = h('div', 'note', PRIVACY);
    add(settings, summary, f1, f1b, f2, f3, f3b, discl);

    // ---- the filter above the tabs: All / Drugs / Black Market / Shop items
    var filters = h('div', 'filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Show');
    var filterBtns = {};
    C.GROUPS.forEach(function (g) {
      var b = h('button', null, C.GROUP_LABEL[g]);
      b.type = 'button';
      b.setAttribute('data-group', g);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { cb.onGroup(g); });
      filterBtns[g] = b;
      filters.appendChild(b);
    });

    // ---- the three tabs under the filter: Best trips / Sell abroad / Bring home
    var tabs = h('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    var tabBtns = {};
    C.TABS.forEach(function (t) {
      var b = h('button', null, C.TAB_LABEL[t]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', t);
      b.setAttribute('aria-selected', 'false');
      b.addEventListener('click', function () { openKey = null; cb.onTab(t); });
      tabBtns[t] = b;
      tabs.appendChild(b);
    });

    var lists = h('div', 'lists');
    var legend = h('div', 'note legend', C.LEGEND);
    var foot = h('div', 'foot', NOTE);
    add(panel, head, meta, msg, settings, filters, tabs, lists, legend, foot);
    add(wrap, panel, btn);
    shadow.appendChild(wrap);

    btn.addEventListener('click', function () { cb.onToggle(!wrap.classList.contains('open')); });
    closeBtn.addEventListener('click', function () { cb.onToggle(false); });
    retryBtn.addEventListener('click', function () { cb.onRetry(); });
    saveKey.addEventListener('click', function () { var v = keyInput.value; keyInput.value = ''; cb.onSaveKey(v); });
    removeKey.addEventListener('click', function () { cb.onRemoveKey(); });
    methodSel.addEventListener('change', function () { cb.onMethod(methodSel.value); });
    seatsIn.addEventListener('change', function () { seatsIn.value = String(C.clampSeats(seatsIn.value)); cb.onSeats(seatsIn.value); });

    // ---- the rows. Whole row = one button: it folds its details out and in; only one row is open at a time.
    var openKey = null;                 // the row that is folded out (survives a new fetch while the row is still in the list)
    var rowEls = [];                    // [{ el, key }] of the rows on screen
    var markEls = [];                   // [{ span, adv, shown }] the time labels on screen, redrawn every second

    function setOpenRow(key) {
      openKey = key;
      rowEls.forEach(function (r) {
        var on = r.key === key;
        r.el.classList.toggle('open', on);
        r.el.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    }

    function paintMark(m, mark) {
      m.span.className = 'mark ' + mark.tone;
      m.span.textContent = mark.text;
    }

    function renderRow(en, group, nowS) {
      var rv = C.rowView(en, nowS, group);
      var r = h('div', 'row');
      r.setAttribute('role', 'button');
      r.setAttribute('tabindex', '0');
      r.setAttribute('data-kind', en.kind);
      r.setAttribute('data-group', group);
      r.setAttribute('aria-expanded', 'false');
      var l1 = add(h('div', 'r1'), h('span', 'name', rv.left), h('span', 'big ' + (rv.positive ? 'pos' : 'neg'), rv.big));
      var l2 = h('div', 'r2');
      if (rv.mark) {
        var span = h('span', 'mark ' + rv.mark.tone, rv.mark.text);
        markEls.push({ span: span, adv: en.advice });
        l2.appendChild(span);
        l2.appendChild(document.createTextNode(' · ' + rv.line2.slice(rv.mark.text.length + 3)));
      } else {
        l2.textContent = rv.line2;
      }
      var det = h('div', 'details');
      C.detailLines(en, nowS).forEach(function (line) { det.appendChild(h('div', 'd', line)); });
      add(r, l1, l2, det);
      var toggle = function () { setOpenRow(openKey === en.key ? null : en.key); };
      r.addEventListener('click', toggle);
      r.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
      rowEls.push({ el: r, key: en.key });
      return r;
    }

    function renderList(list, nowS) {
      var s = h('div', 'list');
      if (!list.ranked.length && !list.unknown.length) s.appendChild(h('div', 'empty', EMPTY_TEXT));
      list.ranked.forEach(function (en) { s.appendChild(renderRow(en, 'ranked', nowS)); });
      if (list.unknown.length) {
        var g = h('div', 'unknown-group');
        g.appendChild(h('h3', null, C.UNKNOWN_GROUP_TITLE));
        list.unknown.forEach(function (en) { g.appendChild(renderRow(en, 'unknown', nowS)); });
        s.appendChild(g);
      }
      return s;
    }

    /* ctx: { settings:{key, method, seats}, persistent, message:{text, tone}|null, canRetry } */
    function render(view, ctx) {
      var tone = view.state === 'OK' ? '' : (view.state === 'NO_DATA' ? 'warn' : 'bad');
      chip.className = 'chip' + (tone ? ' ' + tone : '');
      chip.textContent = view.headline;
      btn.className = 'bm' + (tone ? ' ' + tone : '');
      meta.textContent = view.ageS === null
        ? 'No prices received yet.'
        : METHOD_LABEL[view.method] + ' · ' + view.seats + ' item slots · prices ' + C.fmtAge(view.ageS) + ' old' + (view.dropped ? ' · ' + view.dropped + ' unreadable row(s) skipped' : '');
      var text = ctx.message ? ctx.message.text : (view.state === 'STALE' || view.state === 'STATUS' ? view.detail : '');
      msg.textContent = text;
      msg.className = 'msg' + (text ? ' show' : '') + (ctx.message && ctx.message.tone === 'bad' ? ' bad' : '');
      if (text && ctx.canRetry) msg.appendChild(retryBtn);
      keyState.textContent = ctx.settings.key
        ? 'A key is saved' + (ctx.persistent ? '.' : ' for this page only (your script manager gives no storage).')
        : 'No key saved.';
      methodSel.value = ctx.settings.method;
      if (document.activeElement !== seatsIn && shadow.activeElement !== seatsIn) seatsIn.value = String(ctx.settings.seats);
      if (!ctx.settings.key) settings.open = true;

      var ok = view.state === 'OK';
      filters.classList.toggle('show', ok);
      tabs.classList.toggle('show', ok);
      C.GROUPS.forEach(function (g) {
        var on = g === view.group;
        filterBtns[g].classList.toggle('on', on);
        filterBtns[g].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      C.TABS.forEach(function (t) {
        var on = t === view.tab;
        tabBtns[t].classList.toggle('on', on);
        tabBtns[t].setAttribute('aria-selected', on ? 'true' : 'false');
      });

      lists.textContent = '';
      rowEls = [];
      markEls = [];
      if (ok) {
        lists.appendChild(renderList(view.lists[view.tab], view.nowS));
        setOpenRow(rowEls.some(function (r) { return r.key === openKey; }) ? openKey : null);
      } else {
        openKey = null;
      }
      legend.style.display = ok ? '' : 'none';
    }

    // Redraws the time labels from the advice they already have: a new second, no new data, no reordering.
    function tickMarks(nowS) {
      markEls.forEach(function (m) { paintMark(m, C.timeMark(m.adv, nowS)); });
    }

    return {
      host: host,
      shadow: shadow,
      mount: function () { document.documentElement.appendChild(host); },
      unmount: function () { if (host.parentNode) host.parentNode.removeChild(host); },
      setOpen: function (open) { wrap.classList.toggle('open', !!open); },
      setHidden: function (hidden) { wrap.classList.toggle('hidden', !!hidden); },
      collapseSettings: function () { settings.open = false; },
      render: render,
      tickMarks: tickMarks
    };
  }

  return { create: create, NOTE: NOTE };
})();

/* ================= KS Black Market — lifecycle =================
 * BOOT -> DETECT -> INITIALIZE -> RENDER -> OBSERVE -> UPDATE -> DISPOSE
 * The script only reads from the KS Black Market worker. No clicks, no navigation, no requests to Torn.
 */
(function () {
  'use strict';

  var POLL_MS = 60000;
  var TICK_MS = 1000;              // the little time labels count down on the server's clock, once a second, only while the panel is open
  var CAPTCHA_CHECK_DEBOUNCE_MS = 2000;
  var CAPTCHA_SELECTOR = 'iframe[src*="captcha" i],iframe[src*="turnstile" i],iframe[title*="captcha" i],[id*="captcha" i],[class*="captcha" i]';

  // ---- BOOT: never twice on one page
  if (typeof document === 'undefined' || !document.documentElement) return;
  var root = document.documentElement;
  if (root.hasAttribute('data-ks-bm') || document.getElementById('ks-bm-host')) return;
  root.setAttribute('data-ks-bm', KSBM_VERSION);

  var state = {
    open: false, disposed: false, env: null, fetchedAt: 0, message: null, seq: 0, appliedSeq: 0, epoch: 0, inflight: 0,
    retryAt: 0, captcha: false, clockOffsetS: 0,
    settings: { key: '', method: KSBM_CORE.DEFAULT_METHOD, seats: KSBM_CORE.DEFAULT_SEATS, group: KSBM_CORE.DEFAULT_GROUP, tab: KSBM_CORE.DEFAULT_TAB },
    timer: null, staleTimer: null, clockTimer: null, captchaTimer: null, lastStart: 0, observer: null
  };
  var ui = null;
  var client = null;

  // ---- DETECT: what the page gives us. Without GM_xmlhttpRequest nothing can be fetched; say so.
  var canFetch = typeof GM_xmlhttpRequest === 'function';

  function now() { return Date.now(); }

  // Time on the server's clock: the local clock plus the difference measured when the last answer came (C5).
  function serverNow() { return KSBM_CORE.serverNowS(state.clockOffsetS, now()); }

  function view() {
    var elapsed = state.env ? (now() - state.fetchedAt) / 1000 : 0;
    return KSBM_CORE.buildView(state.env, { method: state.settings.method, seats: state.settings.seats, group: state.settings.group,
      tab: state.settings.tab, elapsedS: elapsed, nowS: serverNow() });
  }

  // ---- RENDER
  function render() {
    if (state.disposed || !ui) return;
    var v = view();
    var message = state.message;
    if (!canFetch && !message) message = { text: 'This script manager does not provide GM_xmlhttpRequest, so nothing can be fetched.', tone: 'bad' };
    ui.render(v, {
      settings: state.settings, persistent: KSBM_IO.persistent(), message: message,
      canRetry: !!(state.message && state.message.retry)
    });
    scheduleStale(v);
    scheduleTicks(v);
  }

  // One timer for the labels, started when the lists are on screen and stopped when the panel closes or the page goes
  // away. Never two at once.
  function scheduleTicks(v) {
    if (!state.open || v.state !== 'OK') { stopTicks(); return; }
    if (state.clockTimer) return;
    // eslint-disable-next-line no-restricted-syntax -- only redraws the labels of the open panel from numbers it already has; no request
    state.clockTimer = setInterval(function () {
      if (state.disposed || !state.open || !ui) { stopTicks(); return; }
      ui.tickMarks(serverNow());
    }, TICK_MS);
  }
  function stopTicks() {
    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
  }

  // One timer, only while the panel is open: re-render at the moment the data turns STALE.
  function scheduleStale(v) {
    if (state.staleTimer) { clearTimeout(state.staleTimer); state.staleTimer = null; }
    if (!state.open || v.state !== 'OK' || v.ageS === null) return;
    var wait = (KSBM_CORE.STALE_S - v.ageS) * 1000 + 300;
    if (wait > 0 && wait < 3600000) state.staleTimer = setTimeout(render, wait);
  }

  // ---- UPDATE
  async function fetchNow() {
    if (state.disposed || !state.open || state.captcha || !canFetch) return;
    var mySeq = ++state.seq;
    var myEpoch = state.epoch;
    state.lastStart = now();
    state.inflight++;
    var result;
    try { result = await client.fetchLatest(); } finally { state.inflight--; }
    if (state.disposed || myEpoch !== state.epoch || !state.open) return;   // the panel was closed meanwhile
    if (mySeq < state.appliedSeq) return;                                    // a newer answer is already on screen
    state.appliedSeq = mySeq;
    if (result.ok) {
      state.env = result.env;
      state.fetchedAt = now();
      state.clockOffsetS = KSBM_CORE.clockOffsetS(result.env, state.fetchedAt);
      state.message = null;
      state.retryAt = 0;
    } else {
      if (result.code === 'NO_DATA') { state.message = { text: KSBM_CORE.NO_DATA_TEXT, tone: 'warn' }; }
      else state.message = { text: result.message, tone: result.code === 'BLOCKED' || result.code === 'SERVER' || result.code === 'RETRY' ? 'warn' : 'bad', retry: result.code === 'AUTH' || result.code === 'SERVER' || result.code === 'RETRY' };
      if (result.code === 'BLOCKED') state.retryAt = now() + (result.retryAfterS || 60) * 1000;
      if (result.code === 'KEY_REJECTED' || result.code === 'NOT_MEMBER') {
        state.settings.key = '';          // the client already removed it from storage
        KSBM_IO.save('key', '');
      }
    }
    render();
  }

  function tick(forced) {
    if (state.disposed || !state.open || state.captcha) return;
    if (!forced) {
      if (document.visibilityState !== 'visible') return;           // only while the tab is visible
      if (state.inflight > 0) return;
      if (state.retryAt > now()) return;
    }
    fetchNow();
  }

  function startTimer() {
    stopTimer();
    // eslint-disable-next-line no-restricted-syntax -- the only poll: our own worker, only while the panel is open and the tab is visible
    state.timer = setInterval(function () { tick(false); }, POLL_MS);
  }
  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    if (state.staleTimer) { clearTimeout(state.staleTimer); state.staleTimer = null; }
  }

  function setOpen(open) {
    if (state.disposed || state.open === open) return;
    state.open = open;
    state.epoch++;                                  // answers to requests from before this moment are ignored
    ui.setOpen(open);
    if (open) {
      checkCaptcha();
      render();
      startTimer();
      tick(true);
    } else {
      stopTimer();
      stopTicks();
    }
  }

  // ---- OBSERVE
  // An element counts as a captcha only if it is SHOWN: it has a box on the page and is not display:none or
  // visibility:hidden. A hidden element that merely has "captcha" in its class or id must never hide our button.
  // If the browser cannot tell, it counts as shown (pausing is the safe side).
  function isShown(el) {
    try {
      if (!el.getClientRects || el.getClientRects().length === 0) return false;
      var cs = window.getComputedStyle(el);
      return !cs || (cs.display !== 'none' && cs.visibility !== 'hidden');
    } catch (e) { return true; }
  }
  function checkCaptcha() {
    var present = false;
    try {                                              // only whether a shown one exists; never touched
      var found = document.querySelectorAll(CAPTCHA_SELECTOR);
      for (var i = 0; i < found.length && !present; i++) present = isShown(found[i]);
    } catch (e) { present = false; }
    if (present === state.captcha) return;
    state.captcha = present;
    ui.setHidden(present);                              // pause our own UI while a captcha is shown
    if (!present && state.open) { render(); tick(true); }
  }
  function scheduleCaptchaCheck() {
    if (state.captchaTimer || state.disposed) return;
    state.captchaTimer = setTimeout(function () { state.captchaTimer = null; checkCaptcha(); }, CAPTCHA_CHECK_DEBOUNCE_MS);
  }
  function onVisibility() {
    if (state.disposed || !state.open) return;
    checkCaptcha();
    if (document.visibilityState === 'visible') {
      render();
      if (!state.captcha && now() - state.lastStart >= POLL_MS) tick(true);
    }
  }

  // ---- DISPOSE
  // pagehide with persisted=true: the page goes into the browser's back/forward cache and may come back. The panel
  // closes and the timers stop (no work while frozen), but the script and its button stay, so going back finds them.
  // pagehide with persisted=false: the page is really going away; take everything down.
  function onPageHide(e) {
    if (state.disposed) return;
    if (e && e.persisted) {
      setOpen(false);
      if (state.captchaTimer) { clearTimeout(state.captchaTimer); state.captchaTimer = null; }
      return;
    }
    dispose();
  }
  function onPageShow(e) {
    if (state.disposed || !(e && e.persisted)) return;
    checkCaptcha();
  }
  function dispose() {
    if (state.disposed) return;
    state.disposed = true;
    state.epoch++;
    stopTimer();
    stopTicks();
    if (state.captchaTimer) { clearTimeout(state.captchaTimer); state.captchaTimer = null; }
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    if (ui) ui.unmount();
    root.removeAttribute('data-ks-bm');
  }

  // ---- INITIALIZE
  async function init() {
    state.settings = await KSBM_IO.loadSettings();
    if (state.disposed) return;
    client = KSBM_API.createClient({
      post: KSBM_IO.post,
      getKey: function () { return state.settings.key; },
      forgetKey: function () { state.settings.key = ''; KSBM_IO.save('key', ''); },
      now: now
    });
    ui = KSBM_UI.create(KSBM_PLATFORM, {
      onToggle: setOpen,
      onSaveKey: function (text) {
        var k = String(text || '').trim();
        if (!KSBM_API.validKey(k)) {
          state.message = { text: 'That does not look like a Torn key: it should be 16 letters and digits.', tone: 'bad' };
          render();
          return;
        }
        state.settings.key = k;
        KSBM_IO.save('key', k);
        client.unblock();
        ui.collapseSettings();
        state.message = null;
        state.retryAt = 0;
        render();
        tick(true);
      },
      onRemoveKey: function () {
        state.settings.key = '';
        KSBM_IO.save('key', '');
        client.reset();
        state.env = null;
        state.message = { text: 'The saved key was removed.', tone: 'warn' };
        render();
      },
      onMethod: function (m) { state.settings.method = KSBM_CORE.validMethod(m); KSBM_IO.save('method', state.settings.method); render(); },
      onSeats: function (n) { state.settings.seats = KSBM_CORE.clampSeats(n); KSBM_IO.save('seats', state.settings.seats); render(); },
      onGroup: function (g) { state.settings.group = KSBM_CORE.validGroup(g); KSBM_IO.save('group', state.settings.group); render(); },
      onTab: function (t) { state.settings.tab = KSBM_CORE.validTab(t); KSBM_IO.save('tab', state.settings.tab); render(); },
      onRetry: function () { client.reset(); state.retryAt = 0; tick(true); }
    });
    ui.mount();
    render();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    try {
      state.observer = new MutationObserver(scheduleCaptchaCheck);
      // also attributes: a captcha that is already in the page can become visible by a style or class change
      state.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    } catch (e) { state.observer = null; }
    checkCaptcha();
  }

  try { window.__ksBlackMarket = { version: KSBM_VERSION, platform: KSBM_PLATFORM, dispose: dispose }; } catch (e) { /* sandbox without window */ }
  init().catch(function () { dispose(); });
})();

})();
