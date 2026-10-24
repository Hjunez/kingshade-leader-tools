// ==UserScript==
// @name         KS Black Market PC
// @namespace    kingshade.ks-black-market
// @version      0.1.4
// @description  Best Black Market drug runs (export, import, round trip) for members of Politically Incorrect. Reads only from the KS Black Market server. Never clicks, navigates or contacts Torn.
// @author       Kingshade
// @match        https://www.torn.com/*
// @noframes
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      ks-blackmarket.hans-viklund.workers.dev
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Black_Market_PC.user.js
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Black_Market_PC.user.js
// ==/UserScript==
/*
 * KS Black Market 0.1.4 (PC) — disclosure
 * What it does : shows the best Black Market drug runs abroad (export, import and round trip) for the travel method
 *                and the number of item slots you pick, with a profit range (q10 / q50 / q90) and the chance of a profit.
 *                The numbers are calculated by the KS server from public price data and sent to this script. For
 *                members of Politically Incorrect only. Measurement, not advice; there are no buy or travel buttons.
 * Requests     : only https://ks-blackmarket.hans-viklund.workers.dev — POST /login (your Torn key, once per sign-in) and
 *                POST /latest when you open the panel and then every 60 seconds, but only while the panel is open and
 *                the tab is visible. The server asks Torn once per sign-in whose key it is (/v2/key/info). This script
 *                itself makes no request to torn.com or api.torn.com and reads nothing from Torn's pages.
 * Clicks       : none. It never clicks, submits or navigates. The only thing it looks for on the page is whether a
 *                captcha is VISIBLE; then its own button hides until the captcha is gone. It never touches a captcha.
 *                It runs in the top page only, never inside iframes.
 * Storage      : script manager storage, keys starting with "ksBm.v1." (your Torn key, travel method, item slots). The
 *                sign-in token is kept in memory only. Nothing is written to Torn's page or to localStorage.
 * Sharing      : your Torn key is sent to the KS Black Market server (a Cloudflare Worker) when you sign in. The server
 *                checks it with Torn, does not store it and does not log it. Nothing else is sent anywhere.
 * API key      : your own Torn key at access level Public is enough (no selections needed). It is used only for the
 *                faction membership check. If Torn rejects the key, or it does not belong to the faction, the saved
 *                key is removed and not tried again.
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
var KSBM_VERSION = '0.1.4';
var KSBM_PLATFORM = 'PC';

/* ================= KS Black Market — core (shared by PC and PDA) =================
 * Pure functions only: no DOM, no network, no storage, no clock (time is passed in).
 * The calculations are a port of ks_blackmarket/analysis.py and model.py (schema 2) and are tested against
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
  var MAX_ROWS = 400;

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

  function sanitizeRow(r) {
    if (!isPlainObject(r)) return null;
    if (!has(DRUGS, r.drug) || !COUNTRY_NAMES.hasOwnProperty(r.country)) return null;
    if (r.bm_status !== 'OK' && r.bm_status !== 'STALE') return null;
    if (!isNumOrNull(r.bm_price) || !isNumOrNull(r.bm_qty) || !isNumOrNull(r.bm_age_s)) return null;
    if (r.bm_status === 'OK' && !(isNum(r.bm_price) && r.bm_price > 0)) return null;
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
      pm[m] = { flight_min: v.flight_min, export_r: ew.value, import_r: iw.value };
    }
    return { drug: r.drug, country: r.country, bm_status: r.bm_status, bm_price: r.bm_price, bm_qty: r.bm_qty,
      bm_age_s: r.bm_age_s, per_method: pm };
  }

  /* The /latest answer {ok, receivedAt, serverAge, data}. Returns {ok:true, env} or {ok:false, reason}.
   * A row that does not pass is dropped and counted; a structural problem rejects the whole answer (fail closed). */
  function sanitizeEnvelope(raw) {
    if (!isPlainObject(raw) || raw.ok !== true) return { ok: false, reason: 'not an ok answer' };
    if (!isNum(raw.receivedAt) || raw.receivedAt <= 0) return { ok: false, reason: 'receivedAt' };
    if (!isNum(raw.serverAge) || raw.serverAge < 0) return { ok: false, reason: 'serverAge' };
    var d = raw.data;
    if (!isPlainObject(d) || d.schema !== 2) return { ok: false, reason: 'schema' };
    if (!has(STATUSES, d.status)) return { ok: false, reason: 'status' };
    if (!isNum(d.generated_at) || d.generated_at <= 0 || Math.floor(d.generated_at) !== d.generated_at) return { ok: false, reason: 'generated_at' };
    if (!isPlainObject(d.drugs) || !Array.isArray(d.rows)) return { ok: false, reason: 'drugs/rows' };
    var drugs = {};
    for (var i = 0; i < DRUGS.length; i++) {
      var src = d.drugs[DRUGS[i]];
      if (src === undefined) continue;
      var sd = sanitizeDrug(src);
      if (sd === null) return { ok: false, reason: 'drug ' + DRUGS[i] };
      drugs[DRUGS[i]] = sd;
    }
    var rows = [];
    var dropped = 0;
    var limit = Math.min(d.rows.length, MAX_ROWS);
    for (var j = 0; j < limit; j++) {
      var row = sanitizeRow(d.rows[j]);
      if (row === null || !drugs[row.drug]) dropped++;
      else rows.push(row);
    }
    dropped += d.rows.length - limit;
    return { ok: true, env: { receivedAt: raw.receivedAt, serverAge: raw.serverAge,
      latest: { status: d.status, generated_at: d.generated_at, drugs: drugs, rows: rows }, dropped: dropped } };
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

  function exportEval(latest, row, method, n) {
    var d = latest.drugs[row.drug];
    if (!d || row.bm_status !== 'OK' || d.im_status !== 'OK' || n < 1 || n > CUM_UNITS) return null;
    var cost = d.buy_cost_cum[n - 1];
    if (cost === null) return null;
    var pm = row.per_method[method];
    if (!pm) return null;
    var bm = row.bm_price;
    var point = bm * n - cost;
    var w = pm.export_r;
    var q = null;
    if (w) {
      q = {};
      ['q10', 'q50', 'q90'].forEach(function (k) { q[k] = pyRound(bm * (1 + w[k]) * n - cost); });
    }
    var basis = q ? q.q50 : point;
    return { kind: 'export', drug: row.drug, country: row.country, n: n, cost: cost, bm_price: bm, point: point, q: q,
      window_n: w ? w.n : null, flight_min: pm.flight_min, basis: basis, per_hour: basis / (2 * pm.flight_min / 60.0),
      p_win: w ? pAboveGrid(w.grid, rStarExport(bm, cost, n)) : null };
  }

  function importEval(latest, row, method, n) {
    var d = latest.drugs[row.drug];
    if (!d || row.bm_status !== 'OK' || d.im_status !== 'OK' || n < 1) return null;
    var nEff = Math.min(n, row.bm_qty || 0);
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
    return { kind: 'import', drug: row.drug, country: row.country, n: n, n_eff: nEff, bm_price: bm, point: point, q: q,
      window_n: w ? w.n : null, flight_min: pm.flight_min, basis: basis, per_hour: basis / (2 * pm.flight_min / 60.0),
      p_win: w ? pAboveGrid(w.grid, rStarImport(bm, d.im_lowest)) : null };
  }

  // Same order as analysis.evaluate_all: by profit per hour, best first (ties keep the order of the rows).
  function evaluateAll(latest, method, n) {
    var exp = [], imp = [];
    latest.rows.forEach(function (row) {
      if (!row.per_method[method]) return;
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

  // Rows with a window first, rows without ("no window") after them; inside each group by profit per hour.
  function windowedFirst(list) {
    return list.slice().sort(function (a, b) {
      var wa = a.q ? 0 : 1, wb = b.q ? 0 : 1;
      if (wa !== wb) return wa - wb;
      return b.per_hour - a.per_hour;
    });
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
      return { country: country, export: e, import: i, total: total, flight_min: fm, per_hour: total / (2 * fm / 60.0) };
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

  // Everything the panel shows, decided here. state: NO_DATA | STALE | STATUS | OK.
  function buildView(env, opts) {
    var method = validMethod(opts && opts.method);
    var seats = clampSeats(opts && opts.seats);
    var elapsed = opts && opts.elapsedS || 0;
    var view = { method: method, seats: seats, state: 'NO_DATA', headline: HEADLINE.NO_DATA, detail: '', ageS: null,
      status: null, exp: [], imp: [], trips: [], dropped: 0 };
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
    var all = evaluateAll(env.latest, method, seats);
    view.state = 'OK';
    view.headline = HEADLINE.OK;
    view.exp = windowedFirst(all.exp).slice(0, 10);
    view.imp = windowedFirst(all.imp).slice(0, 10);
    view.trips = roundTrips(all.exp, all.imp).slice(0, 5);
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
  // Chance of profit in words: "over 95%" / "under 5%" at the edge of the quantile grid, else a whole percent.
  function fmtP(pw) {
    if (!pw) return 'unknown';
    var pct = Math.round(pw.p * 100);
    if (pw.bound === 'ge') return 'over ' + pct + '%';
    if (pw.bound === 'le') return 'under ' + pct + '%';
    return pct + '%';
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
  function countryName(code) { return COUNTRY_NAMES.hasOwnProperty(code) ? COUNTRY_NAMES[code] : '?'; }

  return {
    STALE_S: STALE_S, METHODS: METHODS, DRUGS: DRUGS, STATUSES: STATUSES, DEFAULT_SEATS: DEFAULT_SEATS,
    DEFAULT_METHOD: DEFAULT_METHOD, MAX_SEATS: MAX_SEATS, COUNTRY_NAMES: COUNTRY_NAMES, GRID_PROBS: GRID_PROBS,
    pyRound: pyRound, sanitizeEnvelope: sanitizeEnvelope, dataAgeS: dataAgeS, sellNetPerUnit: sellNetPerUnit,
    pAboveGrid: pAboveGrid, rStarExport: rStarExport, rStarImport: rStarImport, exportEval: exportEval,
    importEval: importEval, evaluateAll: evaluateAll, windowedFirst: windowedFirst, roundTrips: roundTrips,
    clampSeats: clampSeats, validMethod: validMethod, buildView: buildView,
    NO_DATA_TEXT: NO_DATA_TEXT, fmtSigned: fmtSigned, fmtSignedCompact: fmtSignedCompact,
    fmtMoney: fmtMoney, fmtCompact: fmtCompact, fmtP: fmtP, fmtHM: fmtHM, fmtAge: fmtAge, countryName: countryName
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
    return {
      key: KSBM_API.validKey(key) ? key : '',
      method: KSBM_CORE.validMethod(method),
      seats: KSBM_CORE.clampSeats(seats)
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
    'h3{font-size:12.5px;line-height:1.3;margin:12px 0 4px;color:#cfe8c4}',
    '.row{padding:5px 0;border-top:1px solid #2c2c2c}',
    '.r1{display:flex;justify-content:space-between;gap:8px}.r1 .name{font-weight:700}',
    '.val{font-weight:700}.pos{color:#8fd16f}.neg{color:#e8827f}',
    '.r2{color:#b5b5b5;font-size:12px}',
    '.tag{display:inline-block;padding:0 5px;border-radius:3px;background:#4a3d1a;color:#f3dca3;font-size:10.5px;margin-left:4px}',
    '.empty{color:#999;padding:4px 0}',
    '.foot{margin-top:8px;color:#aaa;font-size:11.5px;border-top:1px solid #333;padding-top:6px}',
    '.pda .bm{width:44px;height:44px;border-radius:22px}.pda button.btn{padding:8px 12px}.pda .close{font-size:26px;padding:0 8px}'
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
  var EXPLAIN = 'Per trip = with your item slots, after the 5% Item Market fee. Usually = 8 of 10 past cases ended inside this range. Chance of profit = how often the same trip made money in the past. NEW PRICE = the price is too new to have a history yet.';
  var NOTE = 'Measurement, not advice. Prices abroad change about every 5 minutes.';

  /* cb: { onToggle(open), onSaveKey(text), onRemoveKey(), onMethod(m), onSeats(n), onRetry() } */
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

    var lists = h('div', 'lists');
    var legend = h('div', 'note legend', EXPLAIN);
    var foot = h('div', 'foot', NOTE);
    add(panel, head, meta, msg, settings, lists, legend, foot);
    add(wrap, panel, btn);
    shadow.appendChild(wrap);

    btn.addEventListener('click', function () { cb.onToggle(!wrap.classList.contains('open')); });
    closeBtn.addEventListener('click', function () { cb.onToggle(false); });
    retryBtn.addEventListener('click', function () { cb.onRetry(); });
    saveKey.addEventListener('click', function () { var v = keyInput.value; keyInput.value = ''; cb.onSaveKey(v); });
    removeKey.addEventListener('click', function () { cb.onRemoveKey(); });
    methodSel.addEventListener('change', function () { cb.onMethod(methodSel.value); });
    seatsIn.addEventListener('change', function () { seatsIn.value = String(C.clampSeats(seatsIn.value)); cb.onSeats(seatsIn.value); });

    function row(kind) { var r = h('div', 'row'); r.setAttribute('data-kind', kind); return r; }
    function money(cls, v) { return h('span', 'val ' + (v < 0 ? 'neg' : 'pos'), C.fmtMoney(v)); }

    function newPrice() { return h('span', 'tag', 'NEW PRICE'); }
    function perTrip(v) { return h('span', 'val ' + (v < 0 ? 'neg' : 'pos'), C.fmtSigned(v) + ' per trip'); }
    function tail(e) {
      return C.fmtSignedCompact(e.per_hour) + ' per hour · flight ' + C.fmtHM(e.flight_min) + ' each way';
    }
    // Third line of an export / import row: the usual range and the chance, or why there is none.
    function rangeLine(e) {
      return e.q
        ? 'Usually ' + C.fmtSigned(e.q.q10) + ' to ' + C.fmtSigned(e.q.q90) + ' · chance of profit: ' + C.fmtP(e.p_win)
        : 'Not enough price history yet, so no range or chance.';
    }

    function renderEval(e) {
      var r = row(e.kind);
      var l1 = h('div', 'r1');
      var name = h('span', 'name', e.drug + (e.kind === 'export' ? ' → ' : ' ← ') + C.countryName(e.country));
      if (!e.q) add(name, document.createTextNode(' '), newPrice());
      add(l1, name, perTrip(e.basis));
      var c = C.countryName(e.country);
      var buy = e.kind === 'export'
        ? 'Buy ' + e.n + ' in Torn at ' + C.fmtMoney(e.cost / e.n) + ' each · sell at ' + C.fmtMoney(e.bm_price) + ' each in ' + c
        : 'Buy ' + e.n_eff + ' in ' + c + '\'s Black Market at ' + C.fmtMoney(e.bm_price) + ' each · sell on the Item Market at home' + (e.n_eff < e.n ? ' (only ' + e.n_eff + ' in stock)' : '');
      return add(r, l1, h('div', 'r2', buy), h('div', 'r2', rangeLine(e)), h('div', 'r2', tail(e)));
    }

    function renderTrip(t) {
      var r = row('trip');
      var l1 = h('div', 'r1');
      add(l1, h('span', 'name', C.countryName(t.country)), h('span', 'val ' + (t.total < 0 ? 'neg' : 'pos'), C.fmtSigned(t.total) + ' per round trip'));
      var out = t.export ? 'Out: ' + t.export.drug + ' (' + C.fmtSigned(t.export.basis) + ')' : 'Out: nothing';
      var back = t.import ? 'Home: ' + t.import.drug + ' (' + C.fmtSigned(t.import.basis) + ')' : 'Home: nothing';
      var noWin = (t.export && !t.export.q) || (t.import && !t.import.q);
      var l3 = h('div', 'r2', tail(t));
      if (noWin) add(l3, document.createTextNode(' '), newPrice());
      return add(r, l1, h('div', 'r2', out + ' · ' + back), l3);
    }

    function section(title, kind, items, renderOne, emptyText) {
      var s = h('div', 'list-' + kind);
      s.appendChild(h('h3', null, title));
      if (!items.length) s.appendChild(h('div', 'empty', emptyText));
      items.forEach(function (it) { s.appendChild(renderOne(it)); });
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
        : 'Prices updated ' + C.fmtAge(view.ageS) + ' ago · ' + view.seats + ' item slots · ' + METHOD_LABEL[view.method] + (view.dropped ? ' · ' + view.dropped + ' unreadable row(s) skipped' : '');
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

      lists.textContent = '';
      if (view.state === 'OK') {
        lists.appendChild(section('Sell abroad — buy in Torn, sell in the Black Market abroad', 'export', view.exp, renderEval, 'Nothing pays right now.'));
        lists.appendChild(section('Bring home — buy in the Black Market abroad, sell on the Item Market at home', 'import', view.imp, renderEval, 'Nothing pays right now.'));
        lists.appendChild(section('Both ways — best item out and best item home, same country', 'trips', view.trips, renderTrip, 'Nothing pays right now.'));
      }
    }

    return {
      host: host,
      shadow: shadow,
      mount: function () { document.documentElement.appendChild(host); },
      unmount: function () { if (host.parentNode) host.parentNode.removeChild(host); },
      setOpen: function (open) { wrap.classList.toggle('open', !!open); },
      setHidden: function (hidden) { wrap.classList.toggle('hidden', !!hidden); },
      collapseSettings: function () { settings.open = false; },
      render: render
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
  var CAPTCHA_CHECK_DEBOUNCE_MS = 2000;
  var CAPTCHA_SELECTOR = 'iframe[src*="captcha" i],iframe[src*="turnstile" i],iframe[title*="captcha" i],[id*="captcha" i],[class*="captcha" i]';

  // ---- BOOT: never twice on one page
  if (typeof document === 'undefined' || !document.documentElement) return;
  var root = document.documentElement;
  if (root.hasAttribute('data-ks-bm') || document.getElementById('ks-bm-host')) return;
  root.setAttribute('data-ks-bm', KSBM_VERSION);

  var state = {
    open: false, disposed: false, env: null, fetchedAt: 0, message: null, seq: 0, appliedSeq: 0, epoch: 0, inflight: 0,
    retryAt: 0, captcha: false, settings: { key: '', method: KSBM_CORE.DEFAULT_METHOD, seats: KSBM_CORE.DEFAULT_SEATS },
    timer: null, staleTimer: null, captchaTimer: null, lastStart: 0, observer: null
  };
  var ui = null;
  var client = null;

  // ---- DETECT: what the page gives us. Without GM_xmlhttpRequest nothing can be fetched; say so.
  var canFetch = typeof GM_xmlhttpRequest === 'function';

  function now() { return Date.now(); }

  function view() {
    var elapsed = state.env ? (now() - state.fetchedAt) / 1000 : 0;
    return KSBM_CORE.buildView(state.env, { method: state.settings.method, seats: state.settings.seats, elapsedS: elapsed });
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
