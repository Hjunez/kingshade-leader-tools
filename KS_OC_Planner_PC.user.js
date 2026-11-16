// ==UserScript==
// @name         KS OC Planner PC
// @namespace    kingshade.torn
// @version      0.4.0
// @description  Shows KS OC Planner's advice on Faction > Crimes as notes under the roles of every OC card (role weight, your own CPR, the suggested line-up) and a small control panel in the tab; shares your own CPR only when you turn sharing on; never clicks or joins anything for you.
// @author       Kingshade
// @match        https://www.torn.com/factions.php*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      oc.kingshadeprotocol.com
// ==/UserScript==

/*
 * DISCLOSURE (what this script does)
 *  - Purpose:   On Faction > Crimes it writes a few lines of its own under EVERY role of EVERY OC card on the page: the role
 *               weight, your own CPR for that role against the faction minimum, the line-up KS OC Planner suggests
 *               (names and roles, never anybody's CPR but your own) and, where you are not in the OC, your best seat in it.
 *               A small control panel inside the tab, above Torn's own tab buttons, holds the one line that says what to do,
 *               the buttons, the key and the sharing switch. It only gives advice. It never clicks, joins, leaves or starts
 *               anything for you and never changes a Torn element: it only adds its own boxes, marked data-ksocp.
 *  - Page:      The script reads, on the Crimes tab that you have open yourself: the part of the address after the #
 *               (which tab is open), whether a captcha is on the page (the panel pauses and makes no requests then),
 *               and the OC cards (their data-oc-id and the role names) so it knows where to write its notes.
 *               No clicks, no requests, no navigation: the page is only read and your own boxes are added to it.
 *  - Network:   (1) api.torn.com, your own organized crimes (empty roles in Recruiting OCs, with your CPR), read
 *               directly in this browser; the key travels only in the Authorization header.
 *               (2) oc.kingshadeprotocol.com through GM_xmlhttpRequest: login, your CPR when sharing is on,
 *               your suggestion, your stored data, delete your data. Nothing else, nothing in the background:
 *               it asks when the Crimes tab opens or becomes visible again and when you press a button.
 *               Redrawing the notes after Torn redraws a card makes no request.
 *  - Storage:   Tampermonkey storage, rooms ksocp.v1.*: your API key (until you press Remove key), the login
 *               session, your consent, the sharing switch and times, the panel state.
 *  - Sharing:   OFF until you turn it on after reading the disclosure. Then your CPR for empty OC roles is sent
 *               to oc.kingshadeprotocol.com (at most once an hour and when you press Share now). Your API key
 *               is sent there once per login only so the server can ask Torn who you are; it is never stored there.
 *  - API key:   A Minimal key, or a Custom key with user > organizedcrimes. Your key is never asked for anywhere else.
 */
(function () {
  "use strict";

  const VERSION = "0.4.0";
  const INSTANCE_KEY = "__ksOcPlannerPC";

  // ------------------------------------------------------------------ constants

  const OC_WORKER_ORIGIN = "https://oc.kingshadeprotocol.com";
  const WORKER_PATHS = ["/session", "/cpr/submit", "/cpr/mine", "/cpr/delete", "/plan/mine"];
  const TORN_OC_URL = "https://api.torn.com/v2/user/organizedcrimes?comment=KSOCPlanner";
  const KEY_LINK = "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=KSOCPlannerPC&user=organizedcrimes";

  const ROOM_KEY = "ksocp.v1.apiKey";
  const ROOM_SESSION = "ksocp.v1.session";
  const ROOM_CONSENT = "ksocp.v1.consent";
  const ROOM_SHARE = "ksocp.v1.share";
  const ROOM_UI = "ksocp.v1.ui";
  const ROOM_BLOCK = "ksocp.v1.block";
  const ROOM_DEBUG = "ksocp.v1.debug";

  const KEY_PATTERN = /^[A-Za-z0-9]{8,64}$/;
  const CRIMES_HASH_RE = /(?:^|[#/&?])tab=crimes(?:[&/?]|$)/i;
  const CAPTCHA_SELECTOR = '[class*="captcha" i], iframe[src*="captcha" i]';
  const CONTROL_RE = /[\u0000-\u001f\u007f]/;
  const POSITION_RE = /^P[1-6]$/;
  // What is read from Torn's Crimes tab (class PREFIXES only: Torn's class names carry a changing suffix).
  const HOST_ID = "faction-crimes";
  const ROOT_ID = "faction-crimes-root";
  const CARD_SELECTOR = "[data-oc-id]";
  const OWN_ATTR = "data-ksocp";

  const SESSION_MARGIN_MS = 30 * 1000;
  const PLAN_MAX_AGE_MS = 5 * 60 * 1000;
  const SHARE_EVERY_MS = 60 * 60 * 1000;
  const SHARE_CLAIM_MS = 2 * 60 * 1000;
  const DELETE_ARM_MS = 5 * 1000;
  const REQUEST_TIMEOUT_MS = 30 * 1000;
  const SUBMIT_MAX_CRIMES = 20;
  const SLOTS_MAX = 6;
  const BOARD_MAX = 30;
  const NAME_MAX = 60;
  const LABEL_MAX = 40;
  const SHOW_NAME_MAX = 60;
  const DAILY_LIMIT_FALLBACK = 30;
  // Same limit the server uses for "stale" (72 h); here it only decides a label.
  const CPR_STALE_SECONDS = 72 * 3600;

  // The disclosure: five headings as in Torn's own table, in this order. One text, shown at "I agree" and under "About".
  const DISCLOSURE = [
    { title: "DATA STORAGE", text: "Your own CPR values for empty OC roles (OC name, role, CPR, item available yes/no, time fetched) are stored on Kingshade's server oc.kingshadeprotocol.com (Cloudflare) for at most 14 days, and are deleted earlier when you press Delete my data or leave the faction. Your API key is never stored on the server. It is stored only in this browser (Tampermonkey storage) until you press Remove key." },
    { title: "DATA SHARING", text: "OC leaders of PoIitically Incorrect (Kingshade, Cheese, Rabid) see everyone's shared CPR and the full plan. Every member of the faction sees the suggested line-up of every OC (names and roles) on the Crimes tab, never your CPR. Nothing is public or shared with another faction." },
    { title: "PURPOSE OF USE", text: "Suggesting which role in an OC gives our faction the best chance of success. Role weights come from tornprobability.com; nothing about you is sent there. The script never joins, leaves or starts an OC for you." },
    { title: "KEY STORAGE AND SHARING", text: "Your key is sent to oc.kingshadeprotocol.com once per login (about every 10 minutes while you use the panel) so the server can check with Torn who you are and that you are in the faction. It is used directly from this browser to read your own organizedcrimes. It is never logged or shown to anyone." },
    { title: "KEY ACCESS LEVEL", text: "A Minimal key, or a Custom key with user → organizedcrimes." },
  ];
  const DISCLOSURE_FOOT = "Sharing is off until you turn it on. When it is on, your CPR is shared when you open Faction > Crimes (at most once an hour) and when you press Share now.";

  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }
  // Consent is given for THIS text. Change one letter of it and the version changes, so the consent has to be given again.
  const DISCLOSURE_VERSION = "d" + fnv1a(DISCLOSURE.map(function (d) { return d.title + "\n" + d.text; }).join("\n") + "\n" + DISCLOSURE_FOOT);

  const T = {
    BAD_KEY: "This does not look like a Torn API key.",
    rejected: function (n) { return "Torn rejected the key (code " + n + "). Change the key."; },
    NO_ACCESS: "Your key lacks access. Make a key with the link below.",
    BUSY: "Torn is busy. Try again in a minute.",
    NOT_IN_FACTION: "KS OC Planner is only for members of PoIitically Incorrect.",
    waitLogin: function (min) { return "Too many failed logins. Wait " + min + " min."; },
    PLAN_UNKNOWN: "UNKNOWN: unexpected answer from KS OC Planner.",
    TORN_UNKNOWN: "UNKNOWN: unexpected answer from Torn.",
    NOTHING: "Nothing to share: Torn shows you no empty slots in Recruiting OCs right now.",
    NO_KEY: "Save your Torn API key first.",
    OLDER_SERVER: "Server is older than this script: only your own OC is shown.",
    RECONSENT: "The data sharing text has changed. Read it below and press I agree to keep sharing. Nothing is shared until you do.",
    WITH_YOU: "With you in it: ",
    NO_OPTIONS: "No suggestions: share your CPR while OCs are recruiting.",
    NO_MOVES: "No moves suggested.",
    PLANNING_LOCKED: "This OC is planning. The line-up is locked.",
    NO_WEIGHTS: "No role weights for this crime: every seat counts the same.",
    PAUSED: "Paused: captcha on the page.",
    KEY_HELP: "No key? Make one here.",
    LINK_LINE: "Make a key here.",
    WAITING: "Waiting for the Crimes tab",
    NO_BEST: "No open OC reaches the minimum for you",
    unmatched: function (name) { return "Could not match " + name + " on the page"; },
  };

  // ----------------------------------------------------------------- tiny helpers

  function isPlain(v) { return typeof v === "object" && v !== null && !Array.isArray(v); }
  function isInt(v) { return typeof v === "number" && Number.isSafeInteger(v); }
  function cleanText(v, max) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length < 1 || t.length > max || CONTROL_RE.test(t)) return null;
    return t;
  }
  // Text from the server or Torn, only ever shown with textContent, cut and stripped of control characters.
  function shown(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max || SHOW_NAME_MAX) : ""; }
  function safeCode(v) { return typeof v === "string" ? v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) : ""; }

  function agoText(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.floor(m / 60);
    return h < 48 ? h + " h ago" : Math.floor(h / 24) + " days ago";
  }
  // A role weight as Torn shows it: one decimal and a percent sign ("46.3%", "20.0%").
  function fmtW(w) { return (Math.round(w * 10) / 10).toFixed(1) + "%"; }
  // A time span in seconds: "5 d 9 h", "2 h 5 min", "12 min", "less than 1 min".
  function fmtSpan(sec) {
    const s = Math.max(0, Math.floor(sec));
    if (s < 60) return "less than 1 min";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " h " + (m % 60) + " min";
    return Math.floor(h / 24) + " d " + (h % 24) + " h";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  // What a sitter's note says on the page: "planning 40%", "locked" or both. Nothing when nobody sits there.
  function planShort(progN, hasSitter, locked) {
    if (!hasSitter) return "";
    const parts = [];
    if (typeof progN === "number" && progN > 0) parts.push("planning " + progN + "%");
    if (locked) parts.push("locked");
    return parts.join(" · ");
  }
  // A role name as the page and the server write it, made comparable: lower case, no blanks, no "#".
  function normRole(s) { return typeof s === "string" ? s.toLowerCase().replace(/[\s#]+/g, "") : ""; }

  // ------------------------------------------------------------------ the store (Tampermonkey rooms)

  // Every read is defensive: anything that does not look right reads as the default (sharing off, no session).
  function createStore(gm) {
    function read(room) {
      let v = null;
      try { v = gm.get(room, null); } catch (e) { v = null; }
      return isPlain(v) && v.schemaVersion === 1 ? v : null;
    }
    function write(room, obj) { try { gm.set(room, obj); } catch (e) { /* storage unavailable: nothing is kept */ } }
    const posNum = function (v) { return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null; };
    return {
      getKey: function () {
        let v = null;
        try { v = gm.get(ROOM_KEY, null); } catch (e) { v = null; }
        return typeof v === "string" && KEY_PATTERN.test(v) ? v : null;
      },
      setKey: function (k) { try { gm.set(ROOM_KEY, k); } catch (e) { /* ignore */ } },
      delKey: function () { try { gm.del(ROOM_KEY); } catch (e) { /* ignore */ } },
      getSession: function () {
        const v = read(ROOM_SESSION);
        if (!v || typeof v.session !== "string" || v.session === "" || typeof v.tornId !== "string" || !Number.isFinite(v.expiresAt) || !Number.isFinite(v.offset)) return null;
        return { session: v.session, tornId: v.tornId, isLeader: v.isLeader === true, expiresAt: v.expiresAt, offset: v.offset };
      },
      setSession: function (s) { write(ROOM_SESSION, { schemaVersion: 1, session: s.session, tornId: s.tornId, isLeader: s.isLeader === true, expiresAt: s.expiresAt, offset: s.offset }); },
      delSession: function () { try { gm.del(ROOM_SESSION); } catch (e) { /* ignore */ } },
      hasConsent: function () {
        const v = read(ROOM_CONSENT);
        return !!v && v.textVersion === DISCLOSURE_VERSION;
      },
      setConsent: function (at) { write(ROOM_CONSENT, { schemaVersion: 1, textVersion: DISCLOSURE_VERSION, at: at }); },
      getShare: function () {
        const v = read(ROOM_SHARE) || {};
        return { enabled: v.enabled === true, lastSharedAt: posNum(v.lastSharedAt), lastRunAt: posNum(v.lastRunAt), claimAt: posNum(v.claimAt), blockedUntil: posNum(v.blockedUntil) };
      },
      setShare: function (patch) {
        const cur = this.getShare();
        const next = Object.assign({}, cur, patch);
        write(ROOM_SHARE, { schemaVersion: 1, enabled: next.enabled === true, lastSharedAt: next.lastSharedAt, lastRunAt: next.lastRunAt, claimAt: next.claimAt, blockedUntil: next.blockedUntil });
      },
      getUi: function () { const v = read(ROOM_UI); return { collapsed: !!v && v.collapsed === true }; },
      setUi: function (u) { write(ROOM_UI, { schemaVersion: 1, collapsed: u.collapsed === true }); },
      // The block remembers THAT this key was refused (a hash of it, never the key) so nothing more is sent until the key is changed.
      getBlock: function (key) {
        const v = read(ROOM_BLOCK);
        return v && key && v.keyHash === fnv1a(key + "|ksocp") && typeof v.text === "string" ? { text: v.text } : null;
      },
      setBlock: function (key, text) { write(ROOM_BLOCK, { schemaVersion: 1, keyHash: fnv1a(key + "|ksocp"), text: text }); },
      delBlock: function () { try { gm.del(ROOM_BLOCK); } catch (e) { /* ignore */ } },
    };
  }

  // ------------------------------------------------------- Torn answer -> what to send

  // json: Torn's answer to user/organizedcrimes. Returns { kind: "unknown" } when the shape is not what the spec says,
  // otherwise the crimes to send (only Recruiting OCs, only the empty slots), how many there were and how many were skipped.
  function buildSubmission(json) {
    const raw = isPlain(json) ? json.organizedcrimes : undefined;
    if (!Array.isArray(raw)) return { kind: "unknown" };
    const good = [];
    const seen = new Set();
    let skipped = 0;
    for (const c of raw) {
      if (!isPlain(c) || typeof c.status !== "string") return { kind: "unknown" };
      if (c.status !== "Recruiting") continue;
      if (typeof c.id !== "number" || typeof c.name !== "string" || typeof c.difficulty !== "number" || !Array.isArray(c.slots)) return { kind: "unknown" };
      const empties = [];
      for (const s of c.slots) {
        if (!isPlain(s) || !isPlain(s.position_info) || typeof s.position_info.id !== "string" || typeof s.position_info.label !== "string" || typeof s.checkpoint_pass_rate !== "number") return { kind: "unknown" };
        if (s.user === undefined || (s.user !== null && !isPlain(s.user))) return { kind: "unknown" };
        const ir = s.item_requirement;
        if (ir !== null && ir !== undefined && (!isPlain(ir) || typeof ir.is_available !== "boolean")) return { kind: "unknown" };
        if (s.user === null) empties.push(s);
      }
      if (empties.length === 0) continue;
      // From here on a crime that breaks a limit is skipped, not the whole answer.
      const name = cleanText(c.name, NAME_MAX);
      let ok = isInt(c.id) && c.id > 0 && !seen.has(c.id) && name !== null && isInt(c.difficulty) && c.difficulty >= 1 && c.difficulty <= 10 && empties.length <= SLOTS_MAX;
      const slots = [];
      const pos = new Set();
      if (ok) {
        for (const s of empties) {
          const positionId = s.position_info.id;
          const label = cleanText(s.position_info.label, LABEL_MAX);
          const cpr = s.checkpoint_pass_rate;
          if (!POSITION_RE.test(positionId) || pos.has(positionId) || label === null || !isInt(cpr) || cpr < 0 || cpr > 100) { ok = false; break; }
          pos.add(positionId);
          slots.push({ positionId: positionId, label: label, cpr: cpr, itemAvailable: s.item_requirement ? s.item_requirement.is_available : null });
        }
      }
      if (!ok) { skipped++; continue; }
      seen.add(c.id);
      slots.sort(function (a, b) { return a.positionId < b.positionId ? -1 : 1; });
      good.push({ crimeId: c.id, name: name, difficulty: c.difficulty, slots: slots });
    }
    good.sort(function (a, b) { return a.crimeId - b.crimeId; });
    return { kind: "ok", crimes: good.slice(0, SUBMIT_MAX_CRIMES), total: good.length, skipped: skipped };
  }

  // ------------------------------------------------------------ codes -> text (exact)

  function flagText(f, ctx) {
    const code = isPlain(f) && typeof f.code === "string" ? f.code : "";
    const nm = function (id) { return ctx.nameOf(id); };
    const lb = function (id) { return ctx.labelOf(id); };
    switch (code) {
      case "CPR_IMPROVEMENT": return "Better line-up: no role gets a lower CPR.";
      case "WEIGHTED_IMPROVEMENT": return "Better line-up overall (by role weight), but one role gets a lower CPR.";
      case "FLOOR_IMPROVEMENT": return "More roles reach the faction minimum.";
      case "NO_CHANGE": return "The current line-up is already the best known.";
      case "EQUIVALENT": return "Several line-ups are equally good.";
      case "NO_WEIGHTS": return T.NO_WEIGHTS;
      case "DATA_MISSING":
        return f.reason === "locked_cpr_unknown"
          ? nm(f.userId) + "'s locked CPR for " + lb(f.positionId) + " is unknown."
          : "Data missing: " + nm(f.userId) + " has not shared CPR for " + lb(f.positionId) + ".";
      case "LOCKED": return nm(f.userId) + " has started planning in " + lb(f.positionId) + " and is not moved.";
      case "NO_QUALIFIED_MEMBER": return lb(f.positionId) + ": nobody who shared CPR reaches the minimum.";
      case "STALE_CPR": return nm(f.userId) + "'s CPR for " + lb(f.positionId) + " is over 72 h old.";
      case "STATE_STALE":
        return typeof f.ageSeconds === "number"
          ? "Plan unavailable: the OC data on the server is " + Math.max(0, Math.floor(f.ageSeconds / 60)) + " min old. Try Refresh later."
          : "Plan unavailable: the OC data on the server is not available yet. Try Refresh later.";
      case "NO_DATA": return "You have not shared your CPR yet.";
      case "OK_TO_JOIN": return "OK TO JOIN";
      case "BELOW_FLOOR": return "BELOW MINIMUM";
      default: return "UNKNOWN: " + (safeCode(code) || "?");
    }
  }

  // ------------------------------------------------------------ the plan answer -> blocks to draw

  const PLAN_STATUSES = ["seated", "free", "unknown"];

  function strOrNull(v) { return v === null || typeof v === "string"; }
  function numOrNull(v) { return v === null || (typeof v === "number" && Number.isFinite(v)); }
  // Fields that only worker 0.1.1 sends: absent is fine (an older worker), present must have the right type.
  function optBool(v) { return v === undefined || typeof v === "boolean"; }
  function optNum(v) { return v === undefined || (typeof v === "number" && Number.isFinite(v)); }
  function optNumOrNull(v) { return v === undefined || numOrNull(v); }
  function optBoolOrNull(v) { return v === undefined || v === null || typeof v === "boolean"; }
  // The crime id (the page's data-oc-id): absent is fine (then no notes are drawn on the page for that OC), present must be a whole number.
  function optId(v) { return v === undefined || (isInt(v) && v > 0); }
  function seatCprOk(y) { return y === undefined || y === null || (isPlain(y) && typeof y.value === "number" && Number.isFinite(y.value) && numOrNull(y.ageSeconds) && typeof y.stale === "boolean"); }

  // The board (worker 0.1.2): one entry per OC of the plan. Absent is fine (an older worker), present must have exactly this shape.
  function boardSlotOk(s) {
    return isPlain(s) && typeof s.positionId === "string" && typeof s.label === "string" && numOrNull(s.weight) && typeof s.locked === "boolean" &&
      (s.occupant === null || (isPlain(s.occupant) && typeof s.occupant.userId === "string" && strOrNull(s.occupant.name) && numOrNull(s.occupant.progress))) &&
      (s.proposed === null || (isPlain(s.proposed) && typeof s.proposed.userId === "string" && strOrNull(s.proposed.name))) &&
      (s.yourCpr === null || (isPlain(s.yourCpr) && typeof s.yourCpr.value === "number" && Number.isFinite(s.yourCpr.value) && numOrNull(s.yourCpr.ageSeconds) &&
        typeof s.yourCpr.stale === "boolean" && (s.yourCpr.source === "locked" || s.yourCpr.source === "shared")));
  }
  function boardEntryOk(e) {
    return isPlain(e) && isInt(e.crimeId) && e.crimeId > 0 && typeof e.name === "string" && typeof e.difficulty === "number" && typeof e.status === "string" &&
      numOrNull(e.readyAt) && numOrNull(e.expiredAt) && typeof e.floor === "number" && typeof e.optimized === "boolean" && typeof e.label === "string" && typeof e.hasWeights === "boolean" &&
      Array.isArray(e.flags) && e.flags.every(function (f) { return isPlain(f) && typeof f.code === "string"; }) &&
      Array.isArray(e.slots) && e.slots.length >= 1 && e.slots.length <= SLOTS_MAX && e.slots.every(boardSlotOk) &&
      Array.isArray(e.changes) && e.changes.every(function (c) { return isPlain(c) && typeof c.userId === "string" && strOrNull(c.name) && typeof c.fromPositionId === "string" && typeof c.toPositionId === "string" && typeof c.involvesYou === "boolean"; }) &&
      isPlain(e.you) && typeof e.you.sitsHere === "boolean" && strOrNull(e.you.positionId) &&
      (e.you.bestSeat === null || (isPlain(e.you.bestSeat) && typeof e.you.bestSeat.positionId === "string" && typeof e.you.bestSeat.cpr === "number" && Number.isFinite(e.you.bestSeat.cpr) && typeof e.you.bestSeat.meetsFloor === "boolean"));
  }
  function boardOk(b) {
    if (!Array.isArray(b) || b.length > BOARD_MAX) return false;
    const seen = new Set();
    for (const e of b) {
      if (!boardEntryOk(e) || seen.has(e.crimeId)) return false;
      seen.add(e.crimeId);
    }
    return true;
  }

  function planShapeOk(j) {
    if (!isPlain(j) || j.ok !== true || !Array.isArray(j.flags) || !isPlain(j.state) || !isPlain(j.you) || !Array.isArray(j.you.flags) || !Array.isArray(j.options)) return false;
    if (typeof j.state.stale !== "boolean" || !numOrNull(j.state.ageSeconds === undefined ? undefined : j.state.ageSeconds)) return false;
    if (typeof j.status !== "string" || PLAN_STATUSES.indexOf(j.status) < 0) return false;
    if (!j.flags.every(function (f) { return isPlain(f) && typeof f.code === "string"; })) return false;
    if (!j.you.flags.every(function (f) { return isPlain(f) && typeof f.code === "string"; })) return false;
    if (j.status === "unknown") return j.flags.some(function (f) { return f.code === "STATE_STALE"; });
    if (j.board !== undefined && !boardOk(j.board)) return false;
    if (j.status === "seated") {
      const oc = j.oc;
      if (!isPlain(oc) || typeof oc.name !== "string" || typeof oc.difficulty !== "number" || typeof oc.status !== "string" || typeof oc.floor !== "number" || typeof oc.optimized !== "boolean" || typeof oc.label !== "string" || !optBool(oc.hasWeights) || !optId(oc.crimeId)) return false;
      if (!Array.isArray(oc.flags) || !oc.flags.every(function (f) { return isPlain(f) && typeof f.code === "string"; })) return false;
      if (!Array.isArray(oc.slots) || oc.slots.length < 1 || !Array.isArray(oc.changes) || !isPlain(oc.yourPosition)) return false;
      const slotsOk = oc.slots.every(function (s) {
        return isPlain(s) && typeof s.positionId === "string" && typeof s.label === "string" && numOrNull(s.weight) && typeof s.locked === "boolean" &&
          (s.occupant === null || (isPlain(s.occupant) && typeof s.occupant.userId === "string" && strOrNull(s.occupant.name))) &&
          (s.proposed === null || (isPlain(s.proposed) && typeof s.proposed.userId === "string" && strOrNull(s.proposed.name))) &&
          (s.yourCpr === null || (isPlain(s.yourCpr) && numOrNull(s.yourCpr.value) && (s.yourCpr.source === "locked" || s.yourCpr.source === "shared") && numOrNull(s.yourCpr.ageSeconds))) &&
          typeof s.yourSlot === "boolean";
      });
      if (!slotsOk) return false;
      return oc.changes.every(function (c) { return isPlain(c) && typeof c.userId === "string" && strOrNull(c.name) && typeof c.fromPositionId === "string" && typeof c.toPositionId === "string" && typeof c.involvesYou === "boolean"; });
    }
    // free
    return j.options.every(function (o) {
      return isPlain(o) && typeof o.code === "string" && typeof o.name === "string" && typeof o.difficulty === "number" && typeof o.floor === "number" && typeof o.positionId === "string" &&
        typeof o.label === "string" && typeof o.weight === "number" && typeof o.yourCpr === "number" && typeof o.stale === "boolean" &&
        Array.isArray(o.changes) && o.changes.every(function (c) { return isPlain(c) && typeof c.userId === "string" && strOrNull(c.name) && typeof c.fromPositionId === "string" && typeof c.toPositionId === "string"; }) &&
        Array.isArray(o.missingPositions) && o.missingPositions.every(function (p) { return typeof p === "string"; }) &&
        optBool(o.hasWeights) && optId(o.crimeId) &&
        Array.isArray(o.seating) && o.seating.every(function (s) {
          return isPlain(s) && typeof s.positionId === "string" && typeof s.label === "string" && strOrNull(s.name) &&
            optNum(s.weight) && seatCprOk(s.yourCpr) && optBoolOrNull(s.locked) && optNumOrNull(s.progress);
        });
    });
  }

  // The time line of an OC: "Ready in 5 d 3 h", "Overdue 2 h 5 min", "Expires in …", "Expired" or "". nowS: the server's clock in seconds (null: unknown).
  function timeTextOf(status, readyAt, expiredAt, nowS) {
    if (nowS === null) return "";
    if (status === "Planning") {
      if (typeof readyAt === "number") return readyAt > nowS ? "Ready in " + fmtSpan(readyAt - nowS) : "Overdue " + fmtSpan(nowS - readyAt);
      return "Ready in –";
    }
    if (typeof expiredAt === "number") return expiredAt > nowS ? "Expires in " + fmtSpan(expiredAt - nowS) : "Expired";
    return "";
  }
  function byPosition(a, b) { return a.positionId < b.positionId ? -1 : a.positionId > b.positionId ? 1 : 0; }

  // What the board (worker 0.1.2) says about every OC, as the cards to draw on the page: [{ crimeId, name, roles, rowLines }].
  // roles: one per seat { key, label, weight, tone, cpr, min, src, marks[], plan }. The only CPR numbers in it are the viewer's own
  // (yourCpr and the best seat); the server never sends anybody else's. options: the old free-view entries (they may hold the moves a
  // sitter would have to make for the viewer's best seat); [] for a seated viewer.
  function boardCards(j, options) {
    const me = typeof j.tornId === "string" ? j.tornId : null;
    const nowS = typeof j.serverTime === "number" ? j.serverTime : null;
    const optionOf = new Map();
    for (const o of options) { if (typeof o.crimeId === "number") optionOf.set(o.crimeId, o); }
    return j.board.map(function (e) {
      const names = new Map();
      const labels = new Map();
      const remember = function (id, name) { if (typeof id === "string" && typeof name === "string") names.set(id, shown(name)); };
      for (const s of e.slots) {
        labels.set(s.positionId, shown(s.label, LABEL_MAX));
        if (s.occupant) remember(s.occupant.userId, s.occupant.name);
        if (s.proposed) remember(s.proposed.userId, s.proposed.name);
      }
      for (const c of e.changes) remember(c.userId, c.name);
      const opt = optionOf.get(e.crimeId) || null;
      if (opt) for (const c of opt.changes) remember(c.userId, c.name);
      const nameOf = function (id) { return names.has(id) ? names.get(id) : "#" + shown(String(id), 20); };
      const labelOf = function (id) { return labels.has(id) ? labels.get(id) : shown(String(id), 20); };
      const you = function (id) { return me !== null && id === me ? " (you)" : ""; };
      const best = e.you.sitsHere ? null : e.you.bestSeat;

      const roles = e.slots.slice().sort(byPosition).map(function (s) {
        const yc = s.yourCpr;
        const value = yc !== null ? yc.value : null;
        let src = "";
        if (yc !== null) {
          const ago = typeof yc.ageSeconds === "number" ? "shared " + agoText(yc.ageSeconds * 1000) : "shared";
          src = yc.source === "locked" ? "locked" : yc.stale === true ? "stale · " + ago : ago;
        }
        const occ = s.occupant;
        const prop = s.proposed;
        const progN = occ !== null && typeof occ.progress === "number" && Number.isFinite(occ.progress) ? Math.round(occ.progress) : null;
        const changed = (prop === null ? null : prop.userId) !== (occ === null ? null : occ.userId);
        const marks = [];
        if (best !== null && best.positionId === s.positionId) {
          marks.push(best.meetsFloor ? { kind: "best", text: "Your best seat here" } : { kind: "move", text: "Best here, below minimum" });
        }
        if (changed) marks.push({ kind: "move", text: "→ " + (prop === null ? "empty" : nameOf(prop.userId) + you(prop.userId)) });
        return {
          key: normRole(s.label),
          label: shown(s.label, LABEL_MAX),
          weight: e.hasWeights === false || s.weight === null ? "–" : fmtW(s.weight),
          tone: value === null ? "none" : value >= e.floor ? "ok" : "warn",
          cpr: value === null ? "–" : String(value),
          min: e.floor,
          src: src,
          marks: marks,
          plan: planShort(progN, occ !== null, s.locked === true),
        };
      });

      const timeText = timeTextOf(e.status, e.readyAt, e.expiredAt, nowS);
      const labelText = e.optimized === false ? T.PLANNING_LOCKED : flagText({ code: e.label }, { nameOf: nameOf, labelOf: labelOf });
      const lead = best !== null ? [flagText({ code: best.meetsFloor ? "OK_TO_JOIN" : "BELOW_FLOOR" }, { nameOf: nameOf, labelOf: labelOf })] : [];
      const rowLines = ["KS: " + lead.concat([labelText, "Faction minimum " + e.floor + "%"], timeText ? [timeText] : []).join(" · ")];
      // The OC the viewer sits in keeps what 0.3.0 showed him: every note of the plan (who has started planning, whose CPR is missing or old ...).
      // On the other cards only the label, the minimum, the time, the moves and the weights line are written.
      if (e.you.sitsHere && e.optimized !== false) {
        e.flags.forEach(function (f, i) {
          if ((i === 0 && f.code === e.label) || f.code === "NO_WEIGHTS") return;
          rowLines.push(flagText(f, { nameOf: nameOf, labelOf: labelOf }));
        });
      }
      const seen = new Set();
      for (const c of e.changes) {
        seen.add(c.userId + "|" + c.fromPositionId + "|" + c.toPositionId);
        rowLines.push(nameOf(c.userId) + ": " + labelOf(c.fromPositionId) + " → " + labelOf(c.toPositionId) + (c.involvesYou ? " (you)" : ""));
      }
      // A free viewer whose best seat is held by a sitter: the moves that would make room for him.
      if (opt) {
        for (const c of opt.changes) {
          if (seen.has(c.userId + "|" + c.fromPositionId + "|" + c.toPositionId)) continue;
          rowLines.push(T.WITH_YOU + nameOf(c.userId) + " moves " + labelOf(c.fromPositionId) + " → " + labelOf(c.toPositionId));
        }
      }
      if (e.hasWeights === false) rowLines.push(T.NO_WEIGHTS);
      return { crimeId: String(e.crimeId), name: shown(e.name), roles: roles, rowLines: rowLines };
    });
  }

  // -> { ok: false } for a shape we do not know, otherwise { ok: true, status, stateText, stale, blocks[], todo, cards[] }.
  // blocks: the few lines the panel itself shows ({t:"line"|"note", text, cls}); the OC information is in cards (drawn on Torn's own OC
  // cards, see createCards). Every text is drawn with textContent.
  function renderPlan(j) {
    if (!planShapeOk(j)) return { ok: false };
    const names = new Map();
    const labels = new Map();
    const remember = function (id, name) { if (typeof id === "string" && typeof name === "string") names.set(id, shown(name)); };
    if (j.status === "seated") {
      for (const s of j.oc.slots) {
        labels.set(s.positionId, shown(s.label, LABEL_MAX));
        if (s.occupant) remember(s.occupant.userId, s.occupant.name);
        if (s.proposed) remember(s.proposed.userId, s.proposed.name);
      }
      for (const c of j.oc.changes) remember(c.userId, c.name);
    } else if (j.status === "free") {
      for (const o of j.options) {
        for (const s of o.seating) { if (s.userId) remember(s.userId, s.name); }
        for (const c of o.changes) remember(c.userId, c.name);
      }
    }
    // Option labels come per option, so the lookup for a free view is made per option below.
    const ctxFor = function (labelMap) {
      return {
        nameOf: function (id) { return names.has(id) ? names.get(id) : "#" + shown(String(id), 20); },
        labelOf: function (id) { return labelMap.has(id) ? labelMap.get(id) : shown(String(id), 20); },
      };
    };
    const blocks = [];
    const state = j.state;
    let stateText = "OC data age unknown";
    if (typeof state.ageSeconds === "number") {
      const m = Math.max(0, Math.floor(state.ageSeconds / 60));
      stateText = m < 1 ? "OC data less than 1 min old" : "OC data " + m + " min old";
    }

    if (j.status === "unknown") {
      const f = j.flags.find(function (x) { return x.code === "STATE_STALE"; });
      blocks.push({ t: "line", text: flagText(f, ctxFor(labels)), cls: "err" });
      return { ok: true, status: "unknown", stateText: "unavailable", stale: true, blocks: blocks, todo: null, cards: [], board: false };
    }
    const hasBoard = Array.isArray(j.board);
    // A worker without the board (0.1.1 and older) still gets the viewer's own OC drawn, as 0.3.0 did.
    if (!hasBoard) blocks.push({ t: "note", text: T.OLDER_SERVER });

    if (j.status === "seated") {
      const oc = j.oc;
      const ctx = ctxFor(labels);
      for (const f of j.you.flags) {
        if (f.code === "NO_DATA") blocks.push({ t: "note", text: flagText(f, ctx) });
      }
      // The one line that says what to do: stay, or move (the member does it himself in Torn).
      const yp = oc.yourPosition;
      let todo = null;
      if (typeof yp.now === "string") {
        todo = yp.moveSuggested === true && typeof yp.proposed === "string"
          ? "Move to " + ctx.labelOf(yp.proposed) + " — you do it yourself in Torn"
          : "Stay in " + ctx.labelOf(yp.now);
      }
      let cards = [];
      if (hasBoard) cards = boardCards(j, []);
      else cards = legacySeatedCard(j, ctx);
      return { ok: true, status: "seated", stateText: stateText, stale: state.stale === true, blocks: blocks, todo: todo, cards: cards, board: hasBoard };
    }

    // free: one entry per open OC, in the order the server gives them. Never sorted here.
    if (j.options.length === 0) {
      const noData = j.you.flags.some(function (f) { return f.code === "NO_DATA"; });
      blocks.push({ t: "line", text: noData ? flagText({ code: "NO_DATA" }, ctxFor(labels)) : T.NO_OPTIONS, cls: "note" });
    }
    const cards = hasBoard ? boardCards(j, j.options) : legacyFreeCards(j, ctxFor);
    // The one line that says what to do. Several OCs can reach the minimum and the member picks among them himself (no order between OCs is ever made), so then the line only points at the cards.
    const okOptions = j.options.filter(function (o) { return o.code === "OK_TO_JOIN"; });
    let todo = null;
    if (j.options.length > 0) {
      if (okOptions.length === 0) todo = T.NO_BEST;
      else if (okOptions.length === 1) {
        const o = okOptions[0];
        todo = "Best for you: " + shown(o.name) + " · " + shown(o.label, LABEL_MAX) + " · CPR " + o.yourCpr + " (minimum " + o.floor + ")";
      } else todo = okOptions.length + " open OCs reach the minimum for you. Your best seat in each is marked on its card";
    }
    return { ok: true, status: "free", stateText: stateText, stale: state.stale === true, blocks: blocks, todo: todo, cards: cards, board: hasBoard };
  }

  // ---- worker 0.1.1 and older: no board. The viewer's own OC (seated) or the OCs with a suggestion (free), as 0.3.0 drew them.
  function legacySeatedCard(j, ctx) {
    const oc = j.oc;
    if (typeof oc.crimeId !== "number") return [];
    const sorted = oc.slots.slice().sort(byPosition);
    const nowS = typeof j.serverTime === "number" ? j.serverTime : null;
    const timeText = timeTextOf(oc.status, oc.readyAt, oc.expiredAt, nowS);
    // Role weights exist unless the worker says otherwise (an older worker has no hasWeights: its NO_WEIGHTS flag decides).
    const noWeights = oc.hasWeights === false || (oc.hasWeights !== true && oc.flags.some(function (f) { return f.code === "NO_WEIGHTS"; }));
    const seats = sorted.map(function (s) {
      const occ = s.occupant;
      const yc = s.yourCpr;
      const value = yc !== null && typeof yc.value === "number" ? yc.value : null;
      let src = "";
      if (yc !== null && yc.source === "locked") src = "locked";
      else if (yc !== null && yc.source === "shared") {
        const ago = typeof yc.ageSeconds === "number" ? "shared " + agoText(yc.ageSeconds * 1000) : "shared";
        src = typeof yc.ageSeconds === "number" && yc.ageSeconds > CPR_STALE_SECONDS ? "stale · " + ago : ago;
      }
      const progN = occ !== null && typeof occ.progress === "number" && Number.isFinite(occ.progress) ? Math.round(occ.progress) : null;
      const same = (s.proposed === null ? null : s.proposed.userId) === (occ === null ? null : occ.userId);
      return {
        key: normRole(s.label),
        label: shown(s.label, LABEL_MAX),
        weight: noWeights || s.weight === null ? "–" : fmtW(s.weight),
        tone: value === null ? "none" : value >= oc.floor ? "ok" : "warn",
        cpr: value === null ? "–" : String(value),
        min: oc.floor,
        src: src,
        marks: same ? [] : [{ kind: "move", text: "→ " + (s.proposed === null ? "empty" : ctx.nameOf(s.proposed.userId)) }],
        plan: planShort(progN, occ !== null, s.locked === true),
      };
    });
    const labelText = oc.optimized === false ? T.PLANNING_LOCKED : flagText({ code: oc.label }, ctx);
    const rowLines = ["KS: " + labelText + " · Faction minimum " + oc.floor + "%" + (timeText ? " · " + timeText : "")];
    if (oc.optimized !== false) {
      oc.flags.forEach(function (f, i) {
        if (i === 0 && f.code === oc.label) return;
        rowLines.push(flagText(f, ctx));
      });
      for (const c of oc.changes) {
        rowLines.push(ctx.nameOf(c.userId) + ": " + ctx.labelOf(c.fromPositionId) + " → " + ctx.labelOf(c.toPositionId) + (c.involvesYou ? " (you)" : ""));
      }
    }
    return [{ crimeId: String(oc.crimeId), name: shown(oc.name), roles: seats, rowLines: rowLines }];
  }

  function legacyFreeCards(j, ctxFor) {
    const cards = [];
    for (const o of j.options) {
      if (typeof o.crimeId !== "number") continue;
      const lmap = new Map();
      for (const s of o.seating) lmap.set(s.positionId, shown(s.label, LABEL_MAX));
      lmap.set(o.positionId, shown(o.label, LABEL_MAX));
      const ctx = ctxFor(lmap);
      const lines = [];
      lines.push("Your best role: " + shown(o.label, LABEL_MAX) + " — your CPR " + o.yourCpr + " (minimum " + o.floor + ")");
      if (o.hasWeights === false) lines.push(T.NO_WEIGHTS);
      for (const c of o.changes) lines.push(ctx.nameOf(c.userId) + " moves " + ctx.labelOf(c.fromPositionId) + " → " + ctx.labelOf(c.toPositionId));
      if (o.equivalent === true) lines.push(flagText({ code: "EQUIVALENT" }, ctx));
      if (o.stale === true) lines.push("(your CPR is over 72 h old — share again)");
      if (o.missingPositions.length > 0) lines.push("Not shared yet for: " + o.missingPositions.map(function (p) { return ctx.labelOf(p); }).join(", "));
      const dest = new Map();
      for (const c of o.changes) dest.set(c.toPositionId, ctx.nameOf(c.userId));
      const seats = o.seating.map(function (s) {
        const yc = s.yourCpr;
        let value = null;
        let src = "";
        if (yc !== undefined && yc !== null) {
          value = yc.value;
          const ago = typeof yc.ageSeconds === "number" ? "shared " + agoText(yc.ageSeconds * 1000) : "shared";
          src = yc.stale === true ? "stale · " + ago : ago;
        } else if (yc === undefined && s.positionId === o.positionId) {
          // An older worker names only the position it suggests, with your value there.
          value = o.yourCpr;
          const ago = typeof o.cprAgeSeconds === "number" ? "shared " + agoText(o.cprAgeSeconds * 1000) : "shared";
          src = o.stale === true ? "stale · " + ago : ago;
        }
        const moved = dest.has(s.positionId);
        const progN = typeof s.progress === "number" && Number.isFinite(s.progress) ? Math.round(s.progress) : null;
        const other = s.you !== true && s.userId !== null && !moved;
        let weight = "–";
        if (o.hasWeights !== false) {
          if (typeof s.weight === "number") weight = fmtW(s.weight);
          else if (s.positionId === o.positionId && o.weight !== 1) weight = fmtW(o.weight);
        }
        return {
          key: normRole(s.label),
          label: shown(s.label, LABEL_MAX),
          weight: weight,
          tone: value === null ? "none" : value >= o.floor ? "ok" : "warn",
          cpr: value === null ? "–" : String(value),
          min: o.floor,
          src: src,
          marks: moved ? [{ kind: "move", text: dest.get(s.positionId) + " moves here" }]
            : s.positionId === o.positionId ? [o.code === "OK_TO_JOIN" ? { kind: "best", text: "Best for you" } : { kind: "move", text: "Best here, below minimum" }]
              : [],
          plan: planShort(progN, other, s.locked === true),
        };
      });
      cards.push({
        crimeId: String(o.crimeId),
        name: shown(o.name),
        roles: seats,
        rowLines: ["KS: " + flagText({ code: o.code }, ctx) + " · best role " + shown(o.label, LABEL_MAX) + " · CPR " + o.yourCpr].concat(lines.slice(1)),
      });
    }
    return cards;
  }

  // /cpr/mine -> lines for the "Show my data" list. { ok: false } for a shape we do not know.
  function renderMyData(j) {
    if (!isPlain(j) || j.ok !== true || !Array.isArray(j.scenarioRows) || !isInt(j.submissionsToday) || typeof j.serverTime !== "number") return { ok: false };
    const rows = [];
    for (const r of j.scenarioRows) {
      if (!isPlain(r) || typeof r.scenario !== "string" || typeof r.label !== "string" || typeof r.cpr !== "number" || typeof r.fetchedAt !== "number") return { ok: false };
      rows.push(shown(r.scenario) + " · " + shown(r.label, LABEL_MAX) + " · CPR " + r.cpr + " · " + agoText(Math.max(0, j.serverTime - r.fetchedAt) * 1000));
    }
    const limit = isInt(j.dailyLimit) ? j.dailyLimit : DAILY_LIMIT_FALLBACK;
    const days = isInt(j.retentionDays) ? j.retentionDays : 14;
    return {
      ok: true,
      rows: rows,
      empty: rows.length === 0 ? "You have no stored values." : null,
      shares: "Shares today: " + j.submissionsToday + " of " + limit,
      kept: "Kept for " + days + " days at most.",
    };
  }

  // ------------------------------------------------------------------------ the core

  // deps: gm {get,set,del}, now() ms, workerPost(path, body) -> {status, json}, tornGet(key) -> {status, json},
  //       visible(), captcha(), active(), log(text)
  function createApp(deps) {
    const store = createStore(deps.gm);
    const listeners = [];
    const S = {
      epoch: 0,
      running: false,
      collapsed: false,
      aboutOpen: false,
      consentPrompt: false,
      loginP: null,
      loginBlockedUntil: 0,
      busy: { plan: false, share: false, data: false },
      planSeq: 0,
      planShownSeq: 0,
      planTriedAt: 0,
      plan: null,
      err: { key: null, share: null, plan: null, data: null },
      shareResult: null,
      myData: null,
      showData: false,
      delArmedUntil: 0,
      delResult: null,
    };

    const now = function () { return deps.now(); };
    const emit = function () { for (const f of listeners.slice()) { try { f(); } catch (e) { /* a broken listener never stops the core */ } } };
    const stale = function (ep) { return ep !== S.epoch || !S.running; };
    const canNet = function (ep) { return S.running && ep === S.epoch && deps.visible() === true && deps.active() === true && !deps.captcha(); };
    const log = function (text) { try { deps.log(text); } catch (e) { /* ignore */ } };
    const shareEnabled = function () { return store.getShare().enabled && store.hasConsent(); };
    // Sharing was on, but the data sharing text has changed since the member agreed: nothing is shared until he agrees to the new text.
    const needsReconsent = function () { return store.getShare().enabled === true && !store.hasConsent(); };
    const err = function (text, link) { return { text: text, link: link === true }; };

    function blockFor(key) { return key ? store.getBlock(key) : null; }

    // ---- error mapping (Torn codes, as in the login rules)
    function mapTornCode(code) {
      if (code === 2 || code === 10 || code === 13 || code === 18) return { text: T.rejected(code), block: true };
      if (code === 16) return { text: T.NO_ACCESS, link: true };
      if (code === 5 || code === 9 || code === 17) return { text: T.BUSY };
      return { text: "UNKNOWN: Torn error code " + (code === null ? "?" : code) + "." };
    }
    function mapTornResult(tr) {
      if (!isPlain(tr) || tr.status === 0) return { text: "UNKNOWN: could not reach Torn." };
      if (isPlain(tr.json) && isPlain(tr.json.error)) return mapTornCode(isInt(tr.json.error.code) ? tr.json.error.code : null);
      if (tr.status !== 200) return { text: "UNKNOWN: Torn answered with HTTP " + safeCode(String(tr.status)) + "." };
      return null;
    }

    // ---- the login (one at a time; the key goes to the server only here)
    function sessionRecord() {
      const s = store.getSession();
      if (!s) return null;
      return now() + s.offset < s.expiresAt - SESSION_MARGIN_MS ? s : null;
    }
    function ensureSession(ep) {
      const have = sessionRecord();
      if (have) return Promise.resolve({ ok: true, session: have.session });
      if (S.loginP) return S.loginP;
      const p = doLogin(ep).then(function (r) { if (S.loginP === p) S.loginP = null; return r; }, function (e) { if (S.loginP === p) S.loginP = null; throw e; });
      S.loginP = p;
      return p;
    }
    async function doLogin(ep) {
      const key = store.getKey();
      if (!key) return { ok: false, text: T.NO_KEY };
      const blk = blockFor(key);
      if (blk) return { ok: false, text: blk.text };
      if (now() < S.loginBlockedUntil) return { ok: false, text: T.waitLogin(Math.max(1, Math.ceil((S.loginBlockedUntil - now()) / 60000))) };
      if (!canNet(ep)) return { ok: false, silent: true };
      const r = await deps.workerPost("/session", { key: key });
      const j = isPlain(r) ? r.json : null;
      if (r && r.status === 200 && isPlain(j) && j.ok === true && typeof j.session === "string" && typeof j.tornId === "string" && typeof j.issuedAt === "number" && typeof j.expiresAt === "number") {
        // The key was removed or changed while the answer was on its way: that session is not kept.
        if (store.getKey() !== key) return { ok: false, silent: true };
        // The offset between this PC's clock and the server's, taken when the answer arrived.
        store.setSession({ session: j.session, tornId: j.tornId, isLeader: j.isLeader === true, expiresAt: j.expiresAt, offset: j.issuedAt - now() });
        log("login ok");
        return stale(ep) ? { ok: false, silent: true } : { ok: true, session: j.session };
      }
      if (stale(ep)) return { ok: false, silent: true };
      const e = isPlain(j) && typeof j.error === "string" ? j.error : "";
      const status = r ? r.status : 0;
      if (e === "key_rejected") {
        const code = isInt(j.tornErrorCode) ? j.tornErrorCode : null;
        const m = mapTornCode(code);
        if (m.text.indexOf("UNKNOWN") === 0 && j.retryable === true) { log("login error " + code); return { ok: false, text: T.BUSY }; }
        if (m.block) store.setBlock(key, m.text);
        log("login error " + code);
        return { ok: false, text: m.text, link: m.link === true };
      }
      if (e === "not_in_faction" || status === 403) {
        store.setBlock(key, T.NOT_IN_FACTION);
        log("login error not_in_faction");
        return { ok: false, text: T.NOT_IN_FACTION };
      }
      if (e === "login_blocked" || e === "login_paused") {
        const secs = isInt(j.retryAfterSeconds) && j.retryAfterSeconds > 0 ? j.retryAfterSeconds : 60;
        S.loginBlockedUntil = now() + secs * 1000;
        log("login error " + e);
        return { ok: false, text: T.waitLogin(Math.max(1, Math.ceil(secs / 60))) };
      }
      if (e === "invalid_key") { log("login error invalid_key"); return { ok: false, text: T.BAD_KEY }; }
      log("login error " + (safeCode(e) || status));
      return { ok: false, text: "UNKNOWN: login failed (" + (safeCode(e) || "no answer") + ")." };
    }

    // ---- a worker call with a session: one new login on a 401, then the error is shown
    async function authed(path, extra, ep) {
      // A key that Torn or the server refused stays refused: nothing at all is sent until the key is changed.
      const blk = blockFor(store.getKey());
      if (blk) return { ok: false, text: blk.text };
      for (let attempt = 0; attempt < 2; attempt++) {
        const s = await ensureSession(ep);
        if (stale(ep)) return { ok: false, silent: true };
        if (!s.ok) return s;
        if (!canNet(ep)) return { ok: false, silent: true };
        const body = Object.assign({ session: s.session }, extra);
        const r = await deps.workerPost(path, body);
        if (stale(ep)) return { ok: false, silent: true };
        if (r && r.status === 401) {
          store.delSession();
          if (attempt === 0) continue;
          return { ok: false, text: "UNKNOWN: KS OC Planner refused the login (unauthorized)." };
        }
        if (r && r.status === 403 && isPlain(r.json) && r.json.error === "not_in_faction") {
          const k = store.getKey();
          if (k) store.setBlock(k, T.NOT_IN_FACTION);
          return { ok: false, text: T.NOT_IN_FACTION };
        }
        return { ok: true, r: r };
      }
      return { ok: false, text: "UNKNOWN: KS OC Planner refused the login (unauthorized)." };
    }

    // ---- the plan
    async function fetchPlan(ep) {
      if (S.busy.plan || !S.running) return;
      if (!store.getKey()) return;
      if (!canNet(ep)) return;
      S.busy.plan = true;
      const seq = ++S.planSeq;
      S.planTriedAt = now();
      S.err.plan = null;
      emit();
      try {
        const a = await authed("/plan/mine", {}, ep);
        if (stale(ep)) return;
        if (seq < S.planShownSeq) return;
        S.planShownSeq = seq;
        if (!a.ok) {
          S.plan = null;
          if (!a.silent) S.err.plan = err(a.text, a.link);
          return;
        }
        const r = a.r;
        if (r.status === 200) {
          const view = renderPlan(r.json);
          if (!view.ok) { S.plan = null; S.err.plan = err(T.PLAN_UNKNOWN); log("plan error shape"); return; }
          S.plan = view;
          log("plan ok");
          return;
        }
        S.plan = null;
        const code = isPlain(r.json) && typeof r.json.error === "string" ? safeCode(r.json.error) : "";
        S.err.plan = err("UNKNOWN: KS OC Planner answered " + safeCode(String(r.status)) + (code ? " (" + code + ")" : "") + ".");
        log("plan error " + (code || r.status));
      } finally {
        if (ep === S.epoch) S.busy.plan = false;
        emit();
      }
    }
    const planDue = function (reason) { return reason !== "visible" || S.planTriedAt === 0 || now() - S.planTriedAt > PLAN_MAX_AGE_MS; };

    // ---- sharing
    function shareDue() {
      if (!shareEnabled() || !store.getKey()) return false;
      const sh = store.getShare();
      const t = now();
      if (sh.blockedUntil !== null && t < sh.blockedUntil) return false;
      if (sh.claimAt !== null && t - sh.claimAt >= 0 && t - sh.claimAt < SHARE_CLAIM_MS) return false;
      if (sh.lastRunAt !== null) {
        const age = t - sh.lastRunAt;
        if (age >= 0 && age < SHARE_EVERY_MS) return false;
      }
      return true;
    }

    async function shareCore(ep, st) {
      const key = store.getKey();
      const blk = blockFor(key);
      if (blk) { S.err.share = err(blk.text); return false; }
      const s = await ensureSession(ep);
      if (stale(ep)) return false;
      if (!s.ok) { if (!s.silent) S.err.share = err(s.text, s.link); return false; }
      // Logged in: whatever happens next, the plan is still worth asking for afterwards.
      st.plan = true;
      if (!shareEnabled() || !canNet(ep)) return false;

      const tr = await deps.tornGet(key);
      if (stale(ep)) return false;
      const te = mapTornResult(tr);
      if (te) {
        if (te.block) store.setBlock(key, te.text);
        S.err.share = err(te.text, te.link);
        log("share error torn");
        return false;
      }
      const built = buildSubmission(tr.json);
      if (built.kind === "unknown") { S.err.share = err(T.TORN_UNKNOWN); log("share error torn shape"); return false; }
      // fetchedAt: the moment Torn answered, on the server's clock (this PC's clock plus the offset taken at login).
      const rec = store.getSession();
      const fetchedAt = Math.floor((now() + (rec ? rec.offset : 0)) / 1000);
      if (built.crimes.length === 0) {
        if (built.skipped > 0) {
          S.err.share = err("UNKNOWN: " + plural(built.skipped, "OC", "OCs") + " from Torn had values the server would refuse. Nothing was sent.");
          return false;
        }
        S.shareResult = { kind: "none" };
        store.setShare({ lastRunAt: now() });
        log("share ok none");
        return true;
      }
      if (!shareEnabled() || !canNet(ep)) return false;
      const a = await authed("/cpr/submit", { fetchedAt: fetchedAt, crimes: built.crimes }, ep);
      if (stale(ep)) return false;
      if (!a.ok) { if (!a.silent) S.err.share = err(a.text, a.link); return false; }
      const r = a.r;
      const j = isPlain(r.json) ? r.json : {};
      if (r.status === 200 && j.ok === true && isPlain(j.accepted) && isInt(j.accepted.scenarioRows)) {
        const t = now();
        store.setShare({ lastSharedAt: t, lastRunAt: t, blockedUntil: null });
        const extra = [];
        if (built.total > built.crimes.length) extra.push(built.crimes.length + " of " + built.total + " shared");
        if (built.skipped > 0) extra.push(built.skipped + " skipped");
        S.shareResult = { kind: "ok", values: j.accepted.scenarioRows, ocs: built.crimes.length, extra: extra, at: t };
        log("share ok");
        return true;
      }
      if (r.status === 429 && j.error === "daily_limit") {
        const secs = isInt(j.retryAfterSeconds) && j.retryAfterSeconds > 0 ? j.retryAfterSeconds : 3600;
        store.setShare({ blockedUntil: now() + secs * 1000 });
        S.err.share = err("Daily limit reached (" + DAILY_LIMIT_FALLBACK + " shares). Try again in " + Math.max(1, Math.ceil(secs / 3600)) + " h.");
        log("share error daily_limit");
        return true;
      }
      if (r.status === 400 && j.error === "bad_request") {
        S.err.share = err("UNKNOWN: the server refused the data (field " + (safeCode(j.detail) || "?") + ").");
        log("share error bad_request");
        return false;
      }
      const code = safeCode(j.error);
      S.err.share = err("UNKNOWN: KS OC Planner answered " + safeCode(String(r.status)) + (code ? " (" + code + ")" : "") + ".");
      log("share error " + (code || r.status));
      return false;
    }

    async function runShare(ep) {
      if (S.busy.share || !S.running || !shareEnabled() || !store.getKey() || !canNet(ep)) return;
      S.busy.share = true;
      S.err.share = null;
      S.shareResult = null;
      store.setShare({ claimAt: now() });
      emit();
      const st = { plan: false };
      try {
        await shareCore(ep, st);
      } finally {
        if (ep === S.epoch) {
          S.busy.share = false;
          store.setShare({ claimAt: null });
        }
        emit();
      }
      // (5) the plan, straight after a share (when the login worked, whatever the share itself said).
      if (st.plan && !stale(ep)) await fetchPlan(ep);
    }

    // ---- what happens when the Crimes tab opens, becomes visible again, or a key is saved
    async function kick(reason) {
      const ep = S.epoch;
      if (!canNet(ep)) return;
      if (shareDue()) {
        await runShare(ep);
        return;
      }
      if (planDue(reason)) await fetchPlan(ep);
    }

    // ------------------------------------------------------------ public API

    const api = {
      subscribe: function (f) { listeners.push(f); return function () { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; },
      start: function () {
        S.epoch++;
        S.running = true;
        S.collapsed = store.getUi().collapsed;
        S.aboutOpen = false;
        S.consentPrompt = false;
        S.plan = null;
        S.planTriedAt = 0;
        S.planShownSeq = S.planSeq;
        S.err = { key: null, share: null, plan: null, data: null };
        S.shareResult = null;
        S.myData = null;
        S.showData = false;
        S.delArmedUntil = 0;
        S.delResult = null;
        S.busy = { plan: false, share: false, data: false };
        S.loginP = null;
      },
      // DISPOSE: whatever is still on its way is dropped when it arrives.
      stop: function () {
        S.epoch++;
        S.running = false;
        S.plan = null;
        S.myData = null;
        S.busy = { plan: false, share: false, data: false };
        S.loginP = null;
        store.setShare({ claimAt: null });
      },
      kick: kick,
      onVisible: function () { return kick("visible"); },
      refreshState: emit,

      saveKey: function (text) {
        const k = typeof text === "string" ? text.trim() : "";
        if (!KEY_PATTERN.test(k)) { S.err.key = err(T.BAD_KEY); emit(); return Promise.resolve(false); }
        store.setKey(k);
        store.delSession();
        store.delBlock();
        S.loginBlockedUntil = 0;
        S.err = { key: null, share: null, plan: null, data: null };
        emit();
        return kick("key").then(function () { return true; });
      },
      removeKey: function () {
        store.delKey();
        store.delSession();
        store.delBlock();
        S.loginBlockedUntil = 0;
        S.plan = null;
        S.myData = null;
        S.showData = false;
        S.shareResult = null;
        S.err = { key: null, share: null, plan: null, data: null };
        S.epoch++;
        S.busy = { plan: false, share: false, data: false };
        S.loginP = null;
        emit();
      },
      refresh: function () { return fetchPlan(S.epoch); },
      shareNow: function () { return runShare(S.epoch); },
      toggleCollapsed: function () {
        S.collapsed = !S.collapsed;
        store.setUi({ collapsed: S.collapsed });
        emit();
        if (!S.collapsed && planDue("visible")) return fetchPlan(S.epoch);
        return Promise.resolve();
      },
      toggleAbout: function () { S.aboutOpen = !S.aboutOpen; emit(); },
      // The switch. Off -> on needs the consent for THIS disclosure text; without it the text is shown with "I agree".
      toggleSharing: function () {
        if (shareEnabled()) {
          store.setShare({ enabled: false });
          emit();
          return Promise.resolve();
        }
        if (!store.hasConsent()) { S.consentPrompt = !S.consentPrompt; emit(); return Promise.resolve(); }
        store.setShare({ enabled: true });
        emit();
        return kick("key");
      },
      agree: function () {
        if (!S.consentPrompt && !needsReconsent()) return Promise.resolve();
        store.setConsent(now());
        store.setShare({ enabled: true });
        S.consentPrompt = false;
        emit();
        return kick("key");
      },
      // Cancel on the new-text question = sharing stays off (it is switched off, not just paused).
      cancelConsent: function () { S.consentPrompt = false; if (needsReconsent()) store.setShare({ enabled: false }); emit(); },

      showMyData: async function () {
        if (S.showData) { S.showData = false; emit(); return; }
        if (S.busy.data || !store.getKey()) return;
        const ep = S.epoch;
        if (!canNet(ep)) return;
        S.busy.data = true;
        S.err.data = null;
        S.delResult = null;
        emit();
        try {
          const a = await authed("/cpr/mine", {}, ep);
          if (stale(ep)) return;
          if (!a.ok) { S.myData = null; if (!a.silent) S.err.data = err(a.text, a.link); return; }
          const v = a.r.status === 200 ? renderMyData(a.r.json) : { ok: false };
          if (!v.ok) { S.myData = null; S.err.data = err(T.PLAN_UNKNOWN); return; }
          S.myData = v;
          S.showData = true;
        } finally {
          if (ep === S.epoch) S.busy.data = false;
          emit();
        }
      },
      // First press arms the button for 5 seconds, the second press inside that time deletes. No window.confirm.
      deleteMyData: async function () {
        if (S.busy.data || !store.getKey()) return;
        const t = now();
        if (!(t < S.delArmedUntil)) { S.delArmedUntil = t + DELETE_ARM_MS; S.delResult = null; emit(); return; }
        S.delArmedUntil = 0;
        const ep = S.epoch;
        if (!canNet(ep)) { emit(); return; }
        S.busy.data = true;
        S.err.data = null;
        emit();
        try {
          const a = await authed("/cpr/delete", {}, ep);
          if (stale(ep)) return;
          if (!a.ok) { if (!a.silent) S.err.data = err(a.text, a.link); return; }
          const j = a.r.json;
          if (a.r.status === 200 && isPlain(j) && j.ok === true && isInt(j.deletedRows)) {
            S.delResult = "Deleted " + plural(j.deletedRows, "row", "rows") + ".";
            S.myData = null;
            S.showData = false;
            S.shareResult = null;
            store.setShare({ enabled: false, lastSharedAt: null, lastRunAt: null, blockedUntil: null });
            log("delete ok");
          } else {
            S.err.data = err(T.PLAN_UNKNOWN);
            log("delete error");
          }
        } finally {
          if (ep === S.epoch) S.busy.data = false;
          emit();
        }
      },

      // What the panel draws. Plain data, no DOM.
      view: function () {
        const t = now();
        const key = store.getKey();
        const sh = store.getShare();
        const enabled = sh.enabled && store.hasConsent();
        const rows = [];
        const reconsent = needsReconsent();
        rows.push({ id: "key", text: key ? "Key: saved ••••" + key.slice(-4) : "Key: none" });
        if (S.err.key) rows.push({ id: "keyerr", text: S.err.key.text, cls: "err" });
        rows.push({
          id: "sharing",
          text: enabled ? "Sharing: on · " + (sh.lastSharedAt !== null ? "last shared " + agoText(t - sh.lastSharedAt) : "not shared yet") : "Sharing: off",
        });
        if (reconsent) rows.push({ id: "reconsent", text: T.RECONSENT, cls: "err" });
        if (S.err.share) rows.push({ id: "shareerr", text: S.err.share.text, cls: "err" });
        if (S.shareResult) {
          const r = S.shareResult;
          const text = r.kind === "none"
            ? T.NOTHING
            : ["Shared " + plural(r.values, "value", "values") + " in " + plural(r.ocs, "OC", "OCs")].concat(r.extra, [agoText(t - r.at)]).join(" · ");
          rows.push({ id: "shareresult", text: text, cls: "dim" });
        }
        let planText = "Plan: not loaded";
        if (S.busy.plan && !S.plan) planText = "Plan: loading…";
        else if (S.plan) planText = S.plan.status === "unknown" ? "Plan: unavailable" : "Plan: " + S.plan.stateText;
        else if (S.err.plan) planText = "Plan: unavailable";
        rows.push({ id: "plan", text: planText });
        if (S.err.plan) rows.push({ id: "planerr", text: S.err.plan.text, cls: "err" });
        if (S.err.data) rows.push({ id: "dataerr", text: S.err.data.text, cls: "err" });
        const needsLink = !!((S.err.share && S.err.share.link) || (S.err.plan && S.err.plan.link) || (S.err.data && S.err.data.link));
        return {
          running: S.running,
          paused: deps.captcha() === true,
          collapsed: S.collapsed,
          hasKey: !!key,
          rows: rows,
          needsLink: needsLink,
          sharingOn: enabled,
          canShareNow: enabled && !!key,
          busy: S.busy.plan || S.busy.share || S.busy.data,
          consentPrompt: S.consentPrompt || reconsent,
          aboutOpen: S.aboutOpen,
          plan: S.plan,
          todo: S.plan && typeof S.plan.todo === "string" ? S.plan.todo : null,
          myData: S.showData ? S.myData : null,
          showingData: S.showData,
          delArmed: t < S.delArmedUntil,
          delResult: S.delResult,
        };
      },
    };
    return api;
  }

  // ------------------------------------------------------------------------ the panel

  // Torn's own look (dark grey cards, header bands, a WEIGHT box under each role), but every rule is OURS:
  // nothing is inherited from Torn's stylesheet and nothing here relies on hover or on text that is cut off.
  const CSS = [
    "#ksocp-panel{display:block;position:static;box-sizing:border-box;width:100%;margin:0 0 10px;padding:0;background:#333333;color:#d8d8d8;border:1px solid #585858;border-radius:5px;font:13px/1.4 Arial,Helvetica,sans-serif;text-align:left;letter-spacing:normal;text-transform:none}",
    "#ksocp-panel *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;letter-spacing:normal;text-transform:none;text-shadow:none}",
    "#ksocp-panel .ksocp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;padding:2px 6px 2px 10px;background:linear-gradient(180deg,#5a5a5a 0,#2f2f2f 100%);border-bottom:1px solid #585858;border-radius:4px 4px 0 0;font-size:13px;font-weight:700;color:#f9f9f9}",
    "#ksocp-panel .ksocp-body{padding:8px 10px 10px}",
    "#ksocp-panel .ksocp-todo{margin:0 0 8px;padding:6px 10px;background:#393939;border:1px solid #585858;border-left:4px solid #00a500;border-radius:4px;color:#f9f9f9;font-size:14px;font-weight:700;overflow-wrap:anywhere}",
    "#ksocp-panel .ksocp-status{display:flex;flex-wrap:wrap;gap:6px}",
    "#ksocp-panel .ksocp-status .ksocp-row{margin:0;padding:3px 8px;background:#393939;border:1px solid #585858;border-radius:4px}",
    "#ksocp-panel .ksocp-status .ksocp-row.err{flex:1 1 100%;background:#48302d;border-color:#ff9f96}",
    "#ksocp-panel .ksocp-row{margin:2px 0;color:#d8d8d8;font-size:12px;overflow-wrap:anywhere}",
    "#ksocp-panel .ksocp-row.err{color:#ff9f96;font-weight:700}",
    "#ksocp-panel .ksocp-row.dim,#ksocp-panel .ksocp-line.note{color:#bcbcbc}",
    "#ksocp-panel .ksocp-keybox{margin:8px 0 4px}",
    "#ksocp-panel input.ksocp-input{display:block;width:100%;height:auto;margin:0 0 4px;padding:5px 7px;background:#222222;color:#ffffff;border:1px solid #585858;border-radius:4px;font-size:12px;box-shadow:none}",
    "#ksocp-panel .ksocp-btns{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 4px}",
    "#ksocp-panel button.ksocp-btn{appearance:none;-webkit-appearance:none;display:inline-block;width:auto;height:auto;min-width:0;min-height:0;margin:0;padding:4px 9px;background:#444444;color:#dddddd;border:1px solid #585858;border-radius:4px;font-size:12px;font-weight:700;line-height:1.3;cursor:pointer;box-shadow:none;float:none}",
    "#ksocp-panel button.ksocp-btn:hover{background:#525252}",
    "#ksocp-panel button.ksocp-btn.primary{background:#3a3a3a;border-color:#00a500;color:#6fe06f}",
    "#ksocp-panel button.ksocp-btn.primary:hover{background:#464646}",
    "#ksocp-panel button.ksocp-btn.danger{background:#444444;border-color:#8c4a4a;color:#ff9f96}",
    "#ksocp-panel button.ksocp-btn.armed{background:#8f1d1d;border-color:#ff9f96;color:#ffffff}",
    "#ksocp-panel button.ksocp-btn.quiet{background:#444444;border-color:#585858;color:#dddddd}",
    "#ksocp-panel button.ksocp-btn:disabled{opacity:1;color:#a8a8a8;background:#3a3a3a;cursor:default}",
    "#ksocp-panel a.ksocp-link{color:#7fbaff;text-decoration:underline;font-size:12px}",
    "#ksocp-panel .ksocp-disc{margin:8px 0;padding:8px;background:#2b2b2b;border:1px solid #585858;border-radius:4px}",
    "#ksocp-panel .ksocp-disc h4{margin:6px 0 2px;padding:0;font-size:11px;font-weight:700;color:#f9f9f9;background:none;border:0}",
    "#ksocp-panel .ksocp-disc p{margin:0 0 4px;padding:0;font-size:11.5px;color:#d8d8d8}",
    "#ksocp-panel .ksocp-content{margin-top:8px;border-top:1px solid #585858;padding-top:8px}",
    "#ksocp-panel .ksocp-title{margin:0;font-size:13px;font-weight:700;color:#f9f9f9;overflow-wrap:anywhere}",
    "#ksocp-panel .ksocp-line{margin:3px 0;font-size:12px;color:#d8d8d8;overflow-wrap:anywhere}",
    "#ksocp-panel .ksocp-line.label{font-weight:700;color:#f9f9f9}",
    "#ksocp-panel .ksocp-line.time{color:#f9f9f9;font-weight:700}",
    "#ksocp-panel .ksocp-line.err{color:#ff9f96;font-weight:700}",
    // The notes under Torn's own role boxes and the line under the role row. Own colours, own sizes, nothing from Torn's stylesheet.
    ".ksocp-rolebox{box-sizing:border-box;display:block;width:100%;margin:4px 0 0;padding:3px 4px 4px;background:#393939;border:2px solid #585858;border-radius:4px;color:#d8d8d7;font:11px/1.3 Arial,Helvetica,sans-serif;text-align:center;letter-spacing:normal;text-transform:none;text-shadow:none;overflow-wrap:anywhere}",
    ".ksocp-rolebox div,.ksocp-rolebox span{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;letter-spacing:normal;text-transform:none;text-shadow:none}",
    ".ksocp-rolebox.best{border-color:#00a500}",
    ".ksocp-rolebox.move{border-color:#f7c019}",
    ".ksocp-rolebox .ksocp-rb-weight{font-size:11px;font-weight:700;color:#dddddd}",
    ".ksocp-rolebox .ksocp-rb-wl{font-weight:400;color:#cfcfcf}",
    ".ksocp-rolebox .ksocp-rb-you{margin-top:3px;padding:2px 3px;border-radius:3px;font-size:11px;font-weight:700}",
    ".ksocp-rolebox .ksocp-rb-you.ok{background:#3f442d;color:#94d82d}",
    ".ksocp-rolebox .ksocp-rb-you.warn{background:#48422d;color:#f7c019}",
    ".ksocp-rolebox .ksocp-rb-you.none{background:#393939;color:#a3a3a3}",
    ".ksocp-rolebox .ksocp-rb-src,.ksocp-rolebox .ksocp-rb-plan{margin-top:2px;font-size:10px;line-height:1.25;color:#cfcfcf}",
    ".ksocp-rolebox .ksocp-rb-mark{margin-top:3px;font-size:11px;font-weight:700}",
    ".ksocp-rolebox .ksocp-rb-mark.best{color:#94d82d}",
    ".ksocp-rolebox .ksocp-rb-mark.move{color:#f7c019}",
    ".ksocp-cardrow{box-sizing:border-box;display:block;margin:0;padding:6px 10px 8px;background:#333333;border-top:1px solid #585858;border-radius:0 0 5px 5px;color:#d8d8d8;font:12px/1.4 Arial,Helvetica,sans-serif;text-align:left;letter-spacing:normal;text-transform:none;text-shadow:none;overflow-wrap:anywhere}",
    ".ksocp-cardrow div{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;letter-spacing:normal;text-transform:none;text-shadow:none}",
    ".ksocp-cardrow .ksocp-cr-main{font-weight:700;color:#f9f9f9}",
    ".ksocp-cardrow .ksocp-cr-line{margin-top:2px;color:#d8d8d8}",
  ].join("\n");

  function createUi(app, doc) {
    let root = null;
    let styleEl = null;
    let refs = null;
    let unsub = null;
    let timer = 0;
    let keySig = null;
    let notes = { waiting: false, issues: [], sig: "-|" };

    function h(tag, cls, text) {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined && text !== null) e.textContent = text;
      return e;
    }
    function button(label, cls, onClick) {
      const b = h("button", "ksocp-btn" + (cls ? " " + cls : ""), label);
      b.type = "button";
      b.addEventListener("click", onClick);
      return b;
    }
    function link(text) {
      const a = h("a", "ksocp-link", text);
      a.href = KEY_LINK;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    }

    function disclosureBox() {
      const box = h("div", "ksocp-disc");
      for (const d of DISCLOSURE) {
        box.appendChild(h("h4", "", d.title));
        box.appendChild(h("p", "", d.text));
      }
      box.appendChild(h("p", "", DISCLOSURE_FOOT));
      return box;
    }

    // The panel holds only a few lines of its own (a note, an error); the information about the OCs is written on Torn's own OC cards.
    function blocksToDom(blocks) {
      const frag = doc.createDocumentFragment();
      for (const b of blocks) {
        if (b.t === "line" || b.t === "note") {
          frag.appendChild(h("div", "ksocp-line" + (b.cls ? " " + b.cls : "") + (b.t === "note" ? " note" : ""), b.text));
        }
      }
      return frag;
    }

    function buildKeyBox(v) {
      const box = h("div", "ksocp-keybox");
      if (v.hasKey) return box;
      const input = h("input", "ksocp-input");
      input.type = "password";
      input.placeholder = "Torn API key";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
      const save = function () { const val = input.value; input.value = ""; app.saveKey(val); };
      input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") save(); });
      box.appendChild(h("label", "ksocp-row", "Torn API key"));
      box.appendChild(input);
      box.appendChild(button("Save key", "primary", save));
      const help = h("div", "ksocp-row dim");
      help.appendChild(link(T.KEY_HELP));
      box.appendChild(help);
      // Torn's API rules: the disclosure is shown where a key is asked for.
      box.appendChild(disclosureBox());
      return box;
    }

    function render() {
      if (!root) return;
      const v = app.view();
      refs.toggle.textContent = v.collapsed ? "Show" : "Hide";
      refs.toggle.setAttribute("aria-expanded", v.collapsed ? "false" : "true");
      refs.body.style.display = v.collapsed ? "none" : "";
      if (v.collapsed) return;

      if (v.paused) {
        refs.status.replaceChildren(h("div", "ksocp-row err", T.PAUSED));
        for (const k of ["todo", "keyBox", "btns", "disc", "content", "data"]) refs[k].style.display = "none";
        return;
      }
      for (const k of ["keyBox", "btns", "disc", "content", "data"]) refs[k].style.display = "";

      // The one line that says what to do comes first.
      refs.todo.textContent = v.todo || "";
      refs.todo.style.display = v.todo ? "" : "none";

      const rowsFrag = doc.createDocumentFragment();
      for (const r of v.rows) rowsFrag.appendChild(h("div", "ksocp-row" + (r.cls ? " " + r.cls : ""), r.text));
      if (v.needsLink) {
        const d = h("div", "ksocp-row");
        d.appendChild(link(T.LINK_LINE));
        rowsFrag.appendChild(d);
      }
      // What the page itself showed the script: no Crimes list yet, or an OC whose roles did not match.
      if (notes.waiting) rowsFrag.appendChild(h("div", "ksocp-row dim", T.WAITING));
      for (const name of notes.issues) rowsFrag.appendChild(h("div", "ksocp-row err", T.unmatched(name)));
      refs.status.replaceChildren(rowsFrag);

      // The key field is only rebuilt when the key appears or goes, so typing is never interrupted.
      const sig = v.hasKey ? "has" : "none";
      if (sig !== keySig) { keySig = sig; refs.keyBox.replaceChildren(...buildKeyBox(v).childNodes); }

      const bf = doc.createDocumentFragment();
      bf.appendChild(button("Refresh", "", function () { app.refresh(); })).disabled = !v.hasKey || v.busy;
      if (v.canShareNow) bf.appendChild(button("Share now", "", function () { app.shareNow(); })).disabled = v.busy;
      bf.appendChild(button(v.sharingOn ? "Turn sharing off" : "Share my CPR with KS OC Planner", v.sharingOn ? "quiet" : "primary", function () { app.toggleSharing(); }));
      bf.appendChild(button(v.showingData ? "Hide my data" : "Show my data", "quiet", function () { app.showMyData(); })).disabled = !v.hasKey || v.busy;
      bf.appendChild(button(v.delArmed ? "Click again to delete everything" : "Delete my data", v.delArmed ? "armed" : "danger", function () { app.deleteMyData(); })).disabled = !v.hasKey || (v.busy && !v.delArmed);
      bf.appendChild(button("About", "quiet", function () { app.toggleAbout(); }));
      if (v.hasKey) bf.appendChild(button("Remove key", "danger", function () { app.removeKey(); }));
      refs.btns.replaceChildren(bf);

      const dc = doc.createDocumentFragment();
      if (v.consentPrompt || v.aboutOpen) {
        dc.appendChild(disclosureBox());
        if (v.consentPrompt) {
          const row = h("div", "ksocp-btns");
          row.appendChild(button("I agree", "primary", function () { app.agree(); }));
          row.appendChild(button("Cancel", "quiet", function () { app.cancelConsent(); }));
          dc.appendChild(row);
        }
      }
      refs.disc.replaceChildren(dc);

      refs.content.replaceChildren(v.plan ? blocksToDom(v.plan.blocks) : doc.createDocumentFragment());

      const dd = doc.createDocumentFragment();
      if (v.myData) {
        dd.appendChild(h("div", "ksocp-title", "Your stored data"));
        if (v.myData.empty) dd.appendChild(h("div", "ksocp-line", v.myData.empty));
        for (const r of v.myData.rows) dd.appendChild(h("div", "ksocp-line", r));
        dd.appendChild(h("div", "ksocp-line note", v.myData.shares));
        dd.appendChild(h("div", "ksocp-line note", v.myData.kept));
      }
      if (v.delResult) dd.appendChild(h("div", "ksocp-line label", v.delResult));
      refs.data.replaceChildren(dd);
      refs.data.style.display = v.myData || v.delResult ? "" : "none";

      if (timer) { clearTimeout(timer); timer = 0; }
      if (v.delArmed) timer = setTimeout(function () { timer = 0; render(); }, DELETE_ARM_MS + 50);
    }

    // The panel is a block INSIDE the Crimes tab: the first element of #faction-crimes, above Torn's own tab buttons.
    // Called again (after a redraw by Torn or when the tab is entered again) it only puts the same panel back if it is gone.
    function mount(host) {
      if (!root) {
        styleEl = h("style");
        styleEl.id = "ksocp-style";
        styleEl.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(styleEl);
        root = h("div");
        root.id = "ksocp-panel";
        const head = h("div", "ksocp-head");
        const title = h("span", "", "KS OC Planner v" + VERSION);
        const toggle = button("Hide", "quiet", function () { app.toggleCollapsed(); });
        head.appendChild(title);
        head.appendChild(toggle);
        const body = h("div", "ksocp-body");
        refs = { toggle: toggle, body: body, todo: h("div", "ksocp-todo"), status: h("div", "ksocp-status"), keyBox: h("div", "ksocp-keybox"), btns: h("div", "ksocp-btns"), disc: h("div"), content: h("div", "ksocp-content"), data: h("div", "ksocp-content") };
        for (const k of ["todo", "status", "keyBox", "btns", "disc", "content", "data"]) body.appendChild(refs[k]);
        root.appendChild(head);
        root.appendChild(body);
        keySig = null;
        unsub = app.subscribe(render);
      }
      if (!root.isConnected || root.parentNode !== host) host.insertBefore(root, host.firstElementChild);
      render();
    }

    function unmount() {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (unsub) { unsub(); unsub = null; }
      if (root) { root.remove(); root = null; }
      if (styleEl) { styleEl.remove(); styleEl = null; }
      refs = null;
    }

    // What the page told the script (see boot). Redrawn only when it changed.
    function setNotes(next) {
      const sig = (next.waiting ? "w" : "-") + "|" + next.issues.join("\n");
      if (sig === notes.sig) return;
      notes = { waiting: next.waiting, issues: next.issues.slice(), sig: sig };
      render();
    }

    return { mount: mount, unmount: unmount, render: render, setNotes: setNotes, panel: function () { return root; } };
  }

  // ------------------------------------------------- the notes on Torn's own OC cards

  // The roles of one OC card in the order of the page: { layer, rowEl, roles: [{ el, key }] }, or null when the card is not built the way
  // this script knows (then nothing is drawn on it). Class PREFIXES only; the role is told by its text, never by its place in the row.
  function readRoles(card) {
    const layer = card.querySelector('[class*="contentLayer___"]');
    if (!layer) return null;
    const scenario = layer.querySelector(':scope > [class*="scenario___"]');
    const rowEl = scenario ? scenario.nextElementSibling : null;
    if (!rowEl || String(rowEl.className).indexOf("wrapper___") < 0) return null;
    const roles = [];
    for (const el of rowEl.children) {
      if (el.hasAttribute(OWN_ATTR)) continue;
      const title = el.querySelector('[class*="slotHeader___"] [class*="title___"]');
      if (!title) return null;
      roles.push({ el: el, key: normRole(title.textContent) });
    }
    return roles.length > 0 ? { layer: layer, rowEl: rowEl, roles: roles } : null;
  }

  // The server's roles matched to the page's roles by TEXT. One clear match for every role on both sides, or null.
  function matchRoles(specRoles, domRoles) {
    const byKey = new Map();
    for (const r of specRoles) {
      if (!r.key || byKey.has(r.key)) return null;
      byKey.set(r.key, r);
    }
    if (byKey.size !== domRoles.length) return null;
    const seen = new Set();
    const out = [];
    for (const d of domRoles) {
      const r = byKey.get(d.key);
      if (!r || seen.has(d.key)) return null;
      seen.add(d.key);
      out.push(r);
    }
    return out;
  }

  // Draws KS's own boxes on the OC cards of the Crimes tab and takes them away again. Only own nodes (data-ksocp) are ever added or
  // removed; no Torn element is changed, no listener is put on one, the Join button and the role menus are not touched.
  function createCards(doc) {
    const prints = new WeakMap();
    function el(tag, cls, text) {
      const e = doc.createElement(tag);
      e.setAttribute(OWN_ATTR, "1");
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function boxToDom(r) {
      const box = el("div", "ksocp-rolebox" + (r.marks.length > 0 ? " " + r.marks[0].kind : ""));
      const w = el("div", "ksocp-rb-weight");
      w.appendChild(el("span", "ksocp-rb-wl", "WEIGHT "));
      w.appendChild(el("span", "ksocp-rb-wv", r.weight));
      box.appendChild(w);
      box.appendChild(el("div", "ksocp-rb-you " + r.tone, "You: " + r.cpr + " · min " + r.min));
      if (r.src) box.appendChild(el("div", "ksocp-rb-src", r.src));
      for (const m of r.marks) box.appendChild(el("div", "ksocp-rb-mark " + m.kind, m.text));
      if (r.plan) box.appendChild(el("div", "ksocp-rb-plan", r.plan));
      return box;
    }
    function rowToDom(lines) {
      const row = el("div", "ksocp-cardrow");
      lines.forEach(function (text, i) { row.appendChild(el("div", i === 0 ? "ksocp-cr-main" : "ksocp-cr-line", text)); });
      return row;
    }
    function strip(card) {
      for (const n of Array.from(card.querySelectorAll("[" + OWN_ATTR + "]"))) n.remove();
      prints.delete(card);
    }
    function clear(rootEl) {
      for (const n of Array.from((rootEl || doc).querySelectorAll("[" + OWN_ATTR + "]"))) {
        if (n.id !== "ksocp-panel") n.remove();
      }
    }
    // specs: the cards of the plan ([{ crimeId, name, roles, rowLines }]). Returns the names of OCs on the page that could not be matched
    // and how many cards were written to. Running it twice in a row writes nothing the second time.
    function draw(rootEl, specs) {
      const byId = new Map();
      for (const s of specs) byId.set(s.crimeId, s);
      const issues = [];
      let wrote = 0;
      for (const card of Array.from(rootEl.querySelectorAll(CARD_SELECTOR))) {
        const spec = byId.get(card.getAttribute("data-oc-id"));
        if (!spec) {
          if (card.querySelector("[" + OWN_ATTR + "]")) strip(card);
          continue;
        }
        const page = readRoles(card);
        const matched = page ? matchRoles(spec.roles, page.roles) : null;
        if (!page || !matched) {
          if (card.querySelector("[" + OWN_ATTR + "]")) strip(card);
          issues.push(spec.name);
          continue;
        }
        const print = JSON.stringify([spec.name, spec.roles, spec.rowLines, page.roles.map(function (r) { return r.key; })]);
        // Already drawn exactly like this and still all there (one box under every role, one row): leave it alone.
        const have = prints.get(card);
        const intact = !!have && have.print === print && card.querySelectorAll("[" + OWN_ATTR + "]").length === have.nodes &&
          page.roles.every(function (r) { return r.el.querySelectorAll(":scope > .ksocp-rolebox").length === 1; }) &&
          page.layer.querySelectorAll(":scope > .ksocp-cardrow").length === 1;
        if (intact) continue;
        strip(card);
        page.roles.forEach(function (r, i) { r.el.appendChild(boxToDom(matched[i])); });
        page.rowEl.after(rowToDom(spec.rowLines));
        prints.set(card, { print: print, nodes: card.querySelectorAll("[" + OWN_ATTR + "]").length });
        wrote++;
      }
      return { issues: issues, wrote: wrote };
    }
    return { draw: draw, clear: clear, strip: strip };
  }

  // -------------------------------------------------------------- the plumbing that touches the browser

  // The ONE place this script calls the KS OC Planner server: GM_xmlhttpRequest, POST with a JSON body, only the paths in WORKER_PATHS.
  function workerPost(path, body) {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (status, json) { if (!done) { done = true; resolve({ status: status, json: json }); } };
      if (WORKER_PATHS.indexOf(path) < 0) { finish(0, null); return; }
      try {
        GM_xmlhttpRequest({
          method: "POST",
          url: OC_WORKER_ORIGIN + path,
          anonymous: true,
          timeout: REQUEST_TIMEOUT_MS,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          data: JSON.stringify(body),
          onload: function (r) { let j = null; try { j = JSON.parse(r.responseText); } catch (e) { j = null; } finish(r.status, j); },
          onerror: function () { finish(0, null); },
          ontimeout: function () { finish(0, null); },
          onabort: function () { finish(0, null); },
        });
      } catch (e) { finish(0, null); }
    });
  }

  // The ONE call to Torn: your own organized crimes, the key only in the Authorization header.
  function tornGet(key) {
    return window.fetch(TORN_OC_URL, {
      method: "GET",
      headers: { Authorization: "ApiKey " + key, Accept: "application/json" },
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).then(
      function (res) { return res.json().then(function (j) { return { status: res.status, json: j }; }, function () { return { status: res.status, json: null }; }); },
      function () { return { status: 0, json: null }; }
    );
  }

  function boot() {
    if (window[INSTANCE_KEY]) return;
    window[INSTANCE_KEY] = VERSION;

    const gm = {
      get: function (k, d) { return GM_getValue(k, d); },
      set: function (k, v) { GM_setValue(k, v); },
      del: function (k) { GM_deleteValue(k); },
    };
    let debugOn = false;
    try { debugOn = GM_getValue(ROOM_DEBUG, "") === "1"; } catch (e) { debugOn = false; }

    let on = false;
    let bodyObserver = null;
    let cardsObserver = null;
    let unsubApp = null;
    let host = null;
    let wasPaused = false;
    let token = 0;
    let pending = false;
    let runs = 0;
    const isCrimesHash = function () { return CRIMES_HASH_RE.test(window.location.hash); };

    const app = createApp({
      gm: gm,
      now: function () { return Date.now(); },
      workerPost: workerPost,
      tornGet: tornGet,
      visible: function () { return document.visibilityState === "visible"; },
      captcha: function () { return !!document.querySelector(CAPTCHA_SELECTOR); },
      active: function () { return on; },
      log: function (text) { if (debugOn) console.log("[KS-OCP] " + text); },
    });
    const ui = createUi(app, document);
    const cardNotes = createCards(document);

    function onVisibility() {
      if (document.visibilityState === "visible") app.onVisible();
    }

    // ---- the redraw of the notes on the cards: ONE run per animation frame, however many changes came in. It reads the plan that was
    // fetched last; it never asks for anything. Running it twice in a row writes nothing the second time.
    function run() {
      pending = false;
      if (!on) return;
      if (!host || !host.isConnected) {
        host = document.getElementById(HOST_ID);
        if (!host) return;
        attachHost();
      }
      runs++;
      let panel = ui.panel();
      if (!panel || !panel.isConnected) { ui.mount(host); panel = ui.panel(); }
      if (panel) panel.setAttribute("data-ksocp-runs", String(runs));
      const rootEl = document.getElementById(ROOT_ID);
      const inHost = !!rootEl && host.contains(rootEl);
      const v = app.view();
      let issues = [];
      if (inHost) {
        if (!v.running || v.paused || !v.plan || !Array.isArray(v.plan.cards)) cardNotes.clear(rootEl);
        else issues = cardNotes.draw(rootEl, v.plan.cards).issues;
      }
      ui.setNotes({ waiting: !inHost, issues: issues });
      // Whatever our own drawing just did to the page is not news to the observer.
      if (cardsObserver) cardsObserver.takeRecords();
    }
    function schedule() {
      if (!on || pending) return;
      pending = true;
      const mine = token;
      window.requestAnimationFrame(function () { if (mine === token) run(); else pending = false; });
    }

    // Is this node one of ours (the panel or a data-ksocp node)?
    function isOwnNode(n) {
      const e = n.nodeType === 1 ? n : n.parentElement;
      return !!e && !!e.closest("[" + OWN_ATTR + "], #ksocp-panel");
    }
    // A change counts when it is not only about our own nodes. A change by us never starts another run (no loop). Our own node being
    // REMOVED by somebody else (Torn redrawing a card) does count: it has to come back.
    function onCards(list) {
      for (const m of list) {
        if (isOwnNode(m.target)) continue;
        if (m.removedNodes.length === 0 && Array.prototype.every.call(m.addedNodes, isOwnNode)) continue;
        schedule();
        return;
      }
    }

    // Shallow watch on <body> so a captcha appearing or leaving is noticed, and so the Crimes tab is found when it appears later.
    function onBody() {
      if (!host) tryAttach();
      const p = !!document.querySelector(CAPTCHA_SELECTOR);
      if (p === wasPaused) return;
      wasPaused = p;
      app.refreshState();
      if (!p) app.onVisible();
    }
    // The panel goes into the Crimes tab (#faction-crimes) and the observer watches that tab: its cards (inside #faction-crimes-root) and
    // the panel itself. One observer at a time.
    function attachHost() {
      ui.mount(host);
      if (cardsObserver) cardsObserver.disconnect();
      cardsObserver = new MutationObserver(onCards);
      cardsObserver.observe(host, { childList: true, subtree: true });
    }
    function tryAttach() {
      const h = document.getElementById(HOST_ID);
      if (!h) return;
      host = h;
      attachHost();
      // The tab is found: the body watch goes back to the shallow one (observe() on the same target replaces its options).
      if (bodyObserver) bodyObserver.observe(document.body, { childList: true });
      schedule();
    }

    // INITIALIZE
    function initialize() {
      on = true;
      wasPaused = !!document.querySelector(CAPTCHA_SELECTOR);
      app.start();
      tryAttach();
      unsubApp = app.subscribe(schedule);
      document.addEventListener("visibilitychange", onVisibility);
      bodyObserver = new MutationObserver(onBody);
      // Deep only while the Crimes tab is not in the page yet (then it is looked for when something is added); shallow once it is found.
      bodyObserver.observe(document.body, { childList: true, subtree: host === null });
      app.kick("open");
      schedule();
    }
    // DISPOSE: the observers go, our notes go from the cards. The panel stays where it is (the tab hides it).
    function dispose() {
      on = false;
      token++;
      pending = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
      if (cardsObserver) { cardsObserver.disconnect(); cardsObserver = null; }
      if (unsubApp) { unsubApp(); unsubApp = null; }
      if (host) cardNotes.clear(host);
      host = null;
      app.stop();
    }
    // DETECT
    function detect() {
      if (isCrimesHash()) { if (!on) initialize(); }
      else if (on) dispose();
    }

    window.addEventListener("hashchange", detect);
    detect();
  }

  // ------------------------------------------------------------------------------------- start

  // In Node (the tests) there is no document: the pure parts are handed out instead of booting.
  if (typeof document === "undefined") {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = {
        VERSION: VERSION, OC_WORKER_ORIGIN: OC_WORKER_ORIGIN, KEY_LINK: KEY_LINK, KEY_PATTERN: KEY_PATTERN, T: T,
        DISCLOSURE: DISCLOSURE, DISCLOSURE_FOOT: DISCLOSURE_FOOT, DISCLOSURE_VERSION: DISCLOSURE_VERSION,
        ROOMS: { key: ROOM_KEY, session: ROOM_SESSION, consent: ROOM_CONSENT, share: ROOM_SHARE, ui: ROOM_UI, block: ROOM_BLOCK, debug: ROOM_DEBUG },
        SHARE_EVERY_MS: SHARE_EVERY_MS, PLAN_MAX_AGE_MS: PLAN_MAX_AGE_MS, DELETE_ARM_MS: DELETE_ARM_MS, SESSION_MARGIN_MS: SESSION_MARGIN_MS,
        buildSubmission: buildSubmission, normRole: normRole, matchRoles: matchRoles, renderPlan: renderPlan, renderMyData: renderMyData, flagText: flagText,
        createStore: createStore, createApp: createApp, agoText: agoText, workerPost: workerPost,
      };
    }
    return;
  }
  boot();
})();
