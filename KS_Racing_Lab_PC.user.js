// ==UserScript==
// @name         KS Racing Lab
// @namespace    https://github.com/Hjunez/kingshade-leader-tools
// @version      0.7.1
// @description  Shows the value of each racing part for the car and track you choose, on the Parts & Modifications page of Torn. Display only on the page. Two optional switches, both off until you switch them on: share your own races and cars with Kingshade, and show real race results from the KS server on Change car.
// @author       Kingshade [4295791]
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Racing_Lab_PC.user.js
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Racing_Lab_PC.user.js
// @match        https://www.torn.com/page.php?sid=racing*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      racing.kingshadeprotocol.com
// ==/UserScript==
(function () {
'use strict';

// KS Racing Lab PC 0.1.0 - stage 1: the Parts panel on the Parts & Modifications page.
// Display only. It reads api.torn.com and the page you have open, and adds its own elements (class prefix ksrl-).
// It never clicks, buys, navigates or changes anything Torn or another script has drawn.
// 0.5.0: one optional function, OFF until the player switches it on: "Share my races and cars with Kingshade". It sends the player own Torn API
// answers (user/races, user/enlistedcars) to racing.kingshadeprotocol.com through GM_xmlhttpRequest (one place, block ksrl-share + boot), and nothing else.

const KSRL = (function () {
  var module = void 0;     // the engine below exports through module.exports when it finds one; here it must not
  var globalThis = {};     // and it falls back to globalThis.KSRL; here that is this private object, never the page window
/* ksrl-engine BEGIN — copied verbatim from KS-Racing-Lab.html v3D, do not edit */
/* KS Racing Lab engine — pure logic, no DOM. Runs in the page and in Node (see tests/). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KSRL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_PREFIX = 'ksRacingLab.v1.';
  const API_BASE = 'https://api.torn.com/v2/';
  const API_COMMENT = 'KSRacingLab';
  // Torn's documented limit across all keys. It may change without notice; keep it in this one constant.
  const TORN_RATE_LIMIT_PER_MINUTE = 100;
  const LOCAL_CALL_BUDGET_PER_MINUTE = Math.floor(TORN_RATE_LIMIT_PER_MINUTE / 5);
  const SELECTIONS = ['racing/cars', 'racing/carupgrades', 'racing/tracks', 'user/enlistedcars'];
  const RESPONSE_KEYS = {
    'racing/cars': 'cars',
    'racing/carupgrades': 'carupgrades',
    'racing/tracks': 'tracks',
    'user/enlistedcars': 'enlistedcars',
  };
  const STAT_KEYS = ['top_speed', 'acceleration', 'braking', 'handling', 'safety', 'tarmac', 'dirt'];
  const OBJECTIVE_BASE = ['top_speed', 'acceleration', 'braking', 'handling'];
  // Stage 3D: safety is ignored when options are compared and when builds are listed (the lap-time model has no safety weight).
  const DOMINANCE_KEYS = STAT_KEYS.filter(function (k) { return k !== 'safety'; });
  const CLASSES = ['A', 'B', 'C', 'D', 'E'];
  const CLASS_RANK = { E: 1, D: 2, C: 3, B: 4, A: 5 };
  const MAX_COMBINATIONS = 2000000;
  const KEY_FATAL_CODES = [2, 10, 13, 18];
  const RETRY_LATER_CODES = [5, 9, 17];
  const ACCESS_LEVEL_CODE = 16;

  // Stage 2A: race log. Two extra calls beside the four selections above.
  const RACE_SELECTIONS = ['user/basic', 'user/races'];
  const RACE_PAGE_LIMIT = 100;
  const STORE_RACE_LOG = STORAGE_PREFIX + 'raceLog';
  const STORE_SNAPSHOTS = STORAGE_PREFIX + 'carSnapshots';
  const STORE_DECLARED = STORAGE_PREFIX + 'ownerDeclared';
  const SECONDS_PER_DAY = 86400;
  // What Data sufficiency needs before stage 2B (the time model) may start.
  // Claude's threshold, 2026-10-06, change only on owner decision.
  const DATA_SUFFICIENCY = { MIN_USABLE_RACES: 20, MIN_DISTINCT_BUILDS: 3 };

  // Stage 2C: best car per track. One racing/{trackId}/records call per track and class, on request only.
  const STORE_RECORDS = STORAGE_PREFIX + 'trackRecords';
  const RECORDS_PER_TRACK = 5;
  const RECORDS_PARTIAL_MESSAGE = 'Track records partly loaded — press Load track records again in a minute';
  const REFRESH_PARTIAL_MESSAGE = 'Refresh partly done — press Refresh records for this class again in a minute';

  // ---------------------------------------------------------------- validation
  // A value that is missing or has the wrong type becomes null, which every
  // consumer treats as UNKNOWN. It is never replaced by 0.

  function intOrNull(v) { return Number.isInteger(v) ? v : null; }
  function strOrNull(v) { return typeof v === 'string' ? v : null; }
  function boolOrNull(v) { return typeof v === 'boolean' ? v : null; }
  function classOrNull(v) { return CLASSES.indexOf(v) >= 0 ? v : null; }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function readStats(src) {
    const out = {};
    for (const k of STAT_KEYS) out[k] = isObject(src) ? intOrNull(src[k]) : null;
    return out;
  }
  function statsComplete(stats) { return STAT_KEYS.every((k) => stats[k] !== null); }

  function normalizeCar(raw) {
    if (!isObject(raw)) return null;
    const car = {
      car_item_id: intOrNull(raw.car_item_id),
      car_item_name: strOrNull(raw.car_item_name),
      class: classOrNull(raw.class),
      stats: readStats(raw),
    };
    if (car.car_item_id === null) return null;
    car.complete = car.car_item_name !== null && car.class !== null && statsComplete(car.stats);
    return car;
  }

  function normalizeUpgrade(raw) {
    if (!isObject(raw)) return null;
    const up = {
      id: intOrNull(raw.id),
      name: strOrNull(raw.name),
      description: strOrNull(raw.description),
      category: strOrNull(raw.category),
      subcategory: strOrNull(raw.subcategory),
      class_required: classOrNull(raw.class_required),
      effects: readStats(raw.effects),
      cost: {
        cash: isObject(raw.cost) ? intOrNull(raw.cost.cash) : null,
        points: isObject(raw.cost) ? intOrNull(raw.cost.points) : null,
      },
    };
    if (up.id === null) return null;
    up.complete = up.name !== null && up.category !== null && up.subcategory !== null &&
      up.class_required !== null && statsComplete(up.effects) &&
      up.cost.cash !== null && up.cost.points !== null;
    return up;
  }

  function normalizeTrack(raw) {
    if (!isObject(raw)) return null;
    const t = { id: intOrNull(raw.id), title: strOrNull(raw.title), description: strOrNull(raw.description) };
    return t.id === null ? null : t;
  }

  function normalizeEnlisted(raw) {
    if (!isObject(raw)) return null;
    const parts = Array.isArray(raw.parts) && raw.parts.every(Number.isInteger) ? raw.parts.slice() : null;
    const car = {
      id: intOrNull(raw.id),
      car_item_id: intOrNull(raw.car_item_id),
      car_item_name: strOrNull(raw.car_item_name),
      car_name: strOrNull(raw.car_name),
      class: classOrNull(raw.class),
      stats: readStats(raw),
      worth: intOrNull(raw.worth),
      points_spent: intOrNull(raw.points_spent),
      races_entered: intOrNull(raw.races_entered),
      races_won: intOrNull(raw.races_won),
      is_removed: boolOrNull(raw.is_removed),
      parts: parts,
    };
    if (car.id === null) return null;
    car.complete = car.car_item_id !== null && parts !== null && statsComplete(car.stats);
    return car;
  }

  const NORMALIZERS = {
    'racing/cars': normalizeCar,
    'racing/carupgrades': normalizeUpgrade,
    'racing/tracks': normalizeTrack,
    'user/enlistedcars': normalizeEnlisted,
  };

  function validateDataset(selection, json) {
    const key = RESPONSE_KEYS[selection];
    if (!key) return { ok: false, items: [], issues: ['Unknown selection'] };
    if (!isObject(json) || !Array.isArray(json[key])) {
      return { ok: false, items: [], issues: ['Response has no "' + key + '" list'] };
    }
    const items = [];
    let dropped = 0;
    let incomplete = 0;
    for (const raw of json[key]) {
      const item = NORMALIZERS[selection](raw);
      if (item === null) { dropped++; continue; }
      if (item.complete === false) incomplete++;
      items.push(item);
    }
    const issues = [];
    if (dropped) issues.push(dropped + ' record(s) without a usable id were dropped');
    if (incomplete) issues.push(incomplete + ' record(s) have missing fields (shown as UNKNOWN)');
    return { ok: true, items: items, issues: issues };
  }

  // Builds the stored record for one selection. `value` is the raw API response.
  function makeDatasetRecord(selection, rawJson, fetchedAtIso) {
    const v = validateDataset(selection, rawJson);
    if (!v.ok) return null;
    return {
      source: selection,
      fetchedAt: fetchedAtIso,
      schemaVersion: SCHEMA_VERSION,
      value: rawJson,
      items: v.items,
      issues: v.issues,
    };
  }

  // Re-validates a record read back from storage. Anything unexpected is rejected.
  function restoreDatasetRecord(selection, stored) {
    if (!isObject(stored)) return null;
    if (stored.schemaVersion !== SCHEMA_VERSION || stored.source !== selection) return null;
    if (typeof stored.fetchedAt !== 'string' || Number.isNaN(Date.parse(stored.fetchedAt))) return null;
    return makeDatasetRecord(selection, stored.value, stored.fetchedAt);
  }

  // ---------------------------------------------------------------- stat model (HYPOTHESIS)

  // final stat = base stat + sum of fitted part effects. null in, null out.
  function computeFinalStats(baseStats, parts) {
    const out = {};
    for (const k of STAT_KEYS) {
      let total = baseStats ? baseStats[k] : null;
      if (total !== null && total !== undefined) {
        for (const p of parts) {
          const e = p.effects[k];
          if (e === null || e === undefined) { total = null; break; }
          total += e;
        }
      } else {
        total = null;
      }
      out[k] = total;
    }
    return out;
  }

  function sumEffects(parts) {
    const zero = {};
    for (const k of STAT_KEYS) zero[k] = 0;
    return computeFinalStats(zero, parts);
  }

  function verifyModel(input) {
    const cars = input && input.cars;
    const upgrades = input && input.upgrades;
    const enlisted = input && input.enlisted;
    const missing = [];
    if (!cars) missing.push('racing/cars');
    if (!upgrades) missing.push('racing/carupgrades');
    if (!enlisted) missing.push('user/enlistedcars');
    if (missing.length) {
      return {
        state: 'UNVERIFIED',
        text: 'Stat model UNVERIFIED — not loaded: ' + missing.join(', '),
        exclusivityFailed: false,
        exclusivityText: 'Exclusivity assumption unchecked',
        cars: [], fittedCars: 0, verifiedCars: 0, mismatches: 0, unknowns: 0,
      };
    }
    const upgradeById = new Map();
    for (const u of upgrades) upgradeById.set(u.id, u);
    const carByItem = new Map();
    for (const c of cars) carByItem.set(c.car_item_id, c);

    const results = [];
    let fittedCars = 0;
    let verifiedCars = 0;
    let mismatches = 0;
    let unknowns = 0;
    let exclusivityFailed = false;

    for (const e of enlisted) {
      const base = carByItem.has(e.car_item_id) ? carByItem.get(e.car_item_id) : null;
      const partIds = e.parts;
      const parts = [];
      const unknownPartIds = [];
      if (partIds) {
        for (const id of partIds) {
          if (upgradeById.has(id)) parts.push(upgradeById.get(id));
          else unknownPartIds.push(id);
        }
      }
      const computable = base !== null && partIds !== null && unknownPartIds.length === 0;
      const computed = computable ? computeFinalStats(base.stats, parts) : null;
      const partsSum = computable ? sumEffects(parts) : null;
      const stats = {};
      let carMismatch = 0;
      let carUnknown = 0;
      for (const k of STAT_KEYS) {
        const c = computed ? computed[k] : null;
        const a = e.stats[k];
        let status;
        if (c === null || a === null) { status = 'UNKNOWN'; carUnknown++; }
        else if (c === a) status = 'MATCH';
        else { status = 'MISMATCH'; carMismatch++; }
        stats[k] = {
          base: base ? base.stats[k] : null,
          parts: partsSum ? partsSum[k] : null,
          computed: c,
          api: a,
          status: status,
        };
      }
      const bySub = new Map();
      for (const p of parts) {
        const sub = p.subcategory === null ? null : p.subcategory;
        if (sub === null) continue;
        if (!bySub.has(sub)) bySub.set(sub, []);
        bySub.get(sub).push(p);
      }
      const violations = [];
      for (const [sub, list] of bySub) {
        if (list.length > 1) violations.push({ subcategory: sub, parts: list });
      }
      if (violations.length) exclusivityFailed = true;
      const fitted = partIds !== null && partIds.length > 0;
      if (fitted) fittedCars++;
      const allMatch = carMismatch === 0 && carUnknown === 0;
      if (fitted && allMatch) verifiedCars++;
      mismatches += carMismatch;
      unknowns += carUnknown;
      results.push({
        id: e.id,
        car_item_id: e.car_item_id,
        car_item_name: e.car_item_name,
        car_name: e.car_name,
        class: e.class,
        is_removed: e.is_removed,
        baseFound: base !== null,
        partsKnown: partIds !== null,
        parts: parts,
        unknownPartIds: unknownPartIds,
        fitted: fitted,
        stats: stats,
        allMatch: allMatch,
        exclusivityViolations: violations,
      });
    }

    let state;
    let text;
    if (mismatches > 0) {
      state = 'NOT_VERIFIED';
      text = 'Stat model NOT verified — ' + mismatches + ' mismatches' +
        (unknowns ? ' (' + unknowns + ' values UNKNOWN)' : '');
    } else if (fittedCars === 0) {
      state = 'UNVERIFIED';
      text = 'Stat model UNVERIFIED — no fitted cars to check';
    } else if (unknowns > 0) {
      state = 'NOT_VERIFIED';
      text = 'Stat model NOT verified — 0 mismatches (' + unknowns + ' values UNKNOWN)';
    } else {
      state = 'VERIFIED';
      text = 'Stat model VERIFIED on ' + verifiedCars + ' of ' + fittedCars + ' cars';
    }
    let exclusivityText;
    if (exclusivityFailed) exclusivityText = 'Exclusivity assumption FAILED';
    else if (fittedCars > 0) exclusivityText = 'Exclusivity assumption not contradicted by ' + fittedCars + ' fitted car(s)';
    else exclusivityText = 'Exclusivity assumption unchecked';

    return {
      state: state, text: text,
      exclusivityFailed: exclusivityFailed, exclusivityText: exclusivityText,
      cars: results, fittedCars: fittedCars, verifiedCars: verifiedCars,
      mismatches: mismatches, unknowns: unknowns,
    };
  }

  // The explorer is fail-closed: it only produces values when both hypotheses hold.
  function explorerGate(verification) {
    if (!verification) return { allowed: false, reason: 'Stat model UNVERIFIED — no data loaded' };
    if (verification.state !== 'VERIFIED') return { allowed: false, reason: verification.text };
    if (verification.exclusivityFailed) return { allowed: false, reason: 'Exclusivity assumption FAILED' };
    return { allowed: true, reason: '' };
  }

  // ---------------------------------------------------------------- explorer

  function classAllows(requiredClass, selectedClass) {
    const r = CLASS_RANK[requiredClass];
    const s = CLASS_RANK[selectedClass];
    return r !== undefined && s !== undefined && r <= s;
  }

  function zeroStats() {
    const z = {};
    for (const k of STAT_KEYS) z[k] = 0;
    return z;
  }
  function noneOption() { return { part: null, effects: zeroStats(), cost: { cash: 0, points: 0 } }; }
  function partOption(p) { return { part: p, effects: p.effects, cost: p.cost }; }

  function atLeastAsGood(a, b) {
    for (const k of DOMINANCE_KEYS) if (a[k] < b[k]) return false;
    return true;
  }

  // Options for one subcategory: "no part" plus every usable part, minus the dominated ones.
  // X is dominated when another option is at least as good on all effects except safety (stage 3D: safety is ignored).
  // Cost plays no part in dominance; it only fixes which of several identical options is kept
  // (no part first, then lowest cash, lowest points, lowest id).
  function nonDominatedOptions(parts) {
    const ordered = parts.slice().sort(function (a, b) {
      return (a.cost.cash - b.cost.cash) || (a.cost.points - b.cost.points) || (a.id - b.id);
    });
    const cands = [noneOption()].concat(ordered.map(partOption));
    const kept = cands.filter(function (x, i) {
      return !cands.some(function (y, j) {
        if (i === j || !atLeastAsGood(y.effects, x.effects)) return false;
        return !atLeastAsGood(x.effects, y.effects) || j < i;
      });
    });
    // Stable presentation order: no part first, then by id.
    return kept.sort(function (a, b) { return (a.part ? a.part.id : -Infinity) - (b.part ? b.part.id : -Infinity); });
  }

  function buildPlan(input) {
    const car = input.car;
    const selectedClass = input.selectedClass;
    const locks = input.locks || {};
    const issues = [];
    const excluded = [];
    const bySub = new Map();
    for (const u of input.upgrades) {
      if (!u.complete) { excluded.push(u); continue; }
      if (!classAllows(u.class_required, selectedClass)) continue;
      if (!bySub.has(u.subcategory)) {
        bySub.set(u.subcategory, { category: u.category, subcategory: u.subcategory, allowedParts: [] });
      }
      bySub.get(u.subcategory).allowedParts.push(u);
    }
    const groups = Array.from(bySub.values()).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory);
    });
    let combinations = 1n;
    for (const g of groups) {
      g.allowedParts.sort(function (a, b) { return a.id - b.id; });
      const free = nonDominatedOptions(g.allowedParts);
      g.nonDominatedCount = free.length;
      g.lock = null;
      g.options = free;
      if (Object.prototype.hasOwnProperty.call(locks, g.subcategory)) {
        const lock = locks[g.subcategory];
        if (lock === 'none') {
          g.lock = 'none';
          g.options = [noneOption()];
        } else {
          const part = g.allowedParts.find(function (p) { return p.id === lock; });
          if (part) { g.lock = part.id; g.options = [partOption(part)]; }
          else issues.push('Lock ignored for ' + g.subcategory + ': part not usable in class ' + selectedClass);
        }
      }
      combinations *= BigInt(g.options.length);
    }
    return {
      car: car,
      selectedClass: selectedClass,
      groups: groups,
      excluded: excluded,
      issues: issues,
      combinations: combinations,
      tooMany: combinations > BigInt(MAX_COMBINATIONS),
    };
  }

  function materializeBuild(plan, chosen) {
    const parts = [];
    let cash = 0;
    let points = 0;
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = plan.car.stats[k];
    for (let i = 0; i < plan.groups.length; i++) {
      const opt = chosen[i];
      if (opt.part) parts.push(opt.part);
      cash += opt.cost.cash;
      points += opt.cost.points;
      for (const k of STAT_KEYS) if (stats[k] !== null) stats[k] += opt.effects[k];
    }
    return { stats: stats, cash: cash, points: points, parts: parts };
  }

  // Enumerates every combination of the plan's options and keeps the Pareto front over
  // top_speed, acceleration, braking, handling and the chosen surface stat.
  // Work is done in step() slices so the caller can yield between them.
  function createEnumerator(plan, surface) {
    if (surface !== 'tarmac' && surface !== 'dirt') throw new Error('Surface must be tarmac or dirt');
    if (plan.tooMany) throw new Error('Too many combinations');
    const objectives = OBJECTIVE_BASE.concat([surface]);
    const N = objectives.length;
    const freeIdx = [];
    plan.groups.forEach(function (g, i) { if (g.options.length > 1) freeIdx.push(i); });
    const L = freeIdx.length;
    const sizes = freeIdx.map(function (i) { return plan.groups[i].options.length; });
    const vecs = freeIdx.map(function (i) {
      return plan.groups[i].options.map(function (o) { return objectives.map(function (k) { return o.effects[k]; }); });
    });
    const digits = new Array(L).fill(0);
    const zero = new Array(N).fill(0);
    const pre = [];
    for (let l = 0; l < L; l++) pre.push(new Array(N).fill(0));
    const total = Number(plan.combinations);
    let front = [];
    let dirtyFrom = 0;
    let processed = 0;
    let done = false;

    function insert(vec) {
      for (let i = 0; i < front.length; i++) {
        const f = front[i].o;
        let ge = true;
        let gt = false;
        for (let k = 0; k < N; k++) {
          if (f[k] < vec[k]) { ge = false; break; }
          if (f[k] > vec[k]) gt = true;
        }
        if (ge && gt) return;
      }
      let w = 0;
      for (let i = 0; i < front.length; i++) {
        const f = front[i].o;
        let ge = true;
        let gt = false;
        for (let k = 0; k < N; k++) {
          if (vec[k] < f[k]) { ge = false; break; }
          if (vec[k] > f[k]) gt = true;
        }
        if (!(ge && gt)) front[w++] = front[i];
      }
      front.length = w;
      front.push({ o: vec.slice(), d: digits.slice() });
    }

    function step(maxCount) {
      let n = 0;
      while (!done && n < maxCount) {
        for (let l = dirtyFrom; l < L; l++) {
          const v = vecs[l][digits[l]];
          const p = l > 0 ? pre[l - 1] : zero;
          const t = pre[l];
          for (let k = 0; k < N; k++) t[k] = p[k] + v[k];
        }
        insert(L > 0 ? pre[L - 1] : zero);
        processed++;
        n++;
        let l = L - 1;
        while (l >= 0) {
          digits[l]++;
          if (digits[l] < sizes[l]) break;
          digits[l] = 0;
          l--;
        }
        if (l < 0) done = true;
        else dirtyFrom = l;
      }
      return { done: done, processed: processed, total: total, frontSize: front.length };
    }

    function result() {
      if (!done) throw new Error('Enumeration not finished');
      return front.map(function (entry) {
        const chosen = plan.groups.map(function (g) { return g.options[0]; });
        for (let l = 0; l < L; l++) chosen[freeIdx[l]] = plan.groups[freeIdx[l]].options[entry.d[l]];
        return materializeBuild(plan, chosen);
      });
    }

    return { step: step, result: result, total: total, objectives: objectives };
  }

  function startExploration(input) {
    const gate = explorerGate(input.verification);
    if (!gate.allowed) return { state: 'UNKNOWN', reason: gate.reason };
    const plan = input.plan;
    if (!plan || !plan.car || !plan.car.complete) return { state: 'UNKNOWN', reason: 'Car base stats are incomplete' };
    if (plan.tooMany) return { state: 'TOO_MANY', combinations: plan.combinations };
    return { state: 'READY', enumerator: createEnumerator(plan, input.surface) };
  }

  // Synchronous convenience wrapper around startExploration (used by the tests).
  function runExplorer(input) {
    const start = startExploration(input);
    if (start.state !== 'READY') return { state: start.state, reason: start.reason, combinations: start.combinations, builds: null };
    let r;
    do { r = start.enumerator.step(50000); } while (!r.done);
    return { state: 'OK', builds: start.enumerator.result(), processed: r.processed };
  }

  function buildSortValue(build, key) {
    if (key === 'cash') return build.cash;
    if (key === 'points') return build.points;
    if (key === 'parts') return build.parts.length;
    // Stage 2D: estimate columns (build.est is set by attachBuildEstimates; null sorts last).
    if (key === 'estLap') return build.est ? build.est.lap : null;
    if (key === 'vsBest') return build.est ? build.est.vsBestPct : null;
    if (key === 'within') return build.est && build.est.within !== null ? (build.est.within ? 1 : 0) : null;
    return build.stats[key];
  }

  function sortBuilds(builds, key, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    return builds.slice().sort(function (a, b) {
      const x = buildSortValue(a, key);
      const y = buildSortValue(b, key);
      if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : 1;
      if (y === null || y === undefined) return -1;
      return (x - y) * sign;
    });
  }

  // ---------------------------------------------------------------- CSV

  function csvCell(v) {
    if (v === null || v === undefined) return 'UNKNOWN';
    if (typeof v === 'number') return String(v);
    let s = String(v);
    // Text from the API must not be read as a formula by a spreadsheet.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildsToCsv(builds, meta) {
    // Stage 2D: with meta.estimate the three estimate columns sit after the cost columns, as in the table.
    const withEstimate = !!meta.estimate;
    // Stage 2D-2: "class" is the car's class; parts_up_to_class follows it (meta.carClass / meta.partsClass).
    const carClass = meta.carClass !== undefined ? meta.carClass : meta.selectedClass;
    const partsClass = meta.partsClass !== undefined && meta.partsClass !== null ? meta.partsClass : carClass;
    const header = ['car', 'class', 'parts_up_to_class', 'surface'].concat(DOMINANCE_KEYS, ['cost_cash', 'cost_points'],
      withEstimate ? ['est_lap', 'vs_best_build_pct', 'within_accuracy'] : [], ['parts_count', 'parts']);
    const lines = [header.join(',')];
    for (const b of builds) {
      const row = [meta.carName, carClass, partsClass, meta.surface];
      for (const k of DOMINANCE_KEYS) row.push(b.stats[k]);
      row.push(b.cash, b.points);
      if (withEstimate) {
        const e = b.est || null;
        row.push(e && e.lap !== null ? Number(e.lap.toFixed(2)) : null,
          e && e.vsBestPct !== null ? Number(e.vsBestPct.toFixed(2)) : null,
          e && e.within !== null ? (e.within ? 'Yes' : 'No') : null);
      }
      row.push(b.parts.length);
      row.push(b.parts.map(function (p) { return p.name; }).join('; '));
      lines.push(row.map(csvCell).join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- stage 2A: race log, snapshots, build status
  // Stored shapes are validated when they come from the API and again when they come back from storage.

  function finiteOrNull(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
  function stampOk(v) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)); }
  function numericAsc(a, b) { return a - b; }

  // The user's own row of results[]. All fields are kept; anything odd becomes null (UNKNOWN).
  function normalizeOwnRow(raw) {
    if (!isObject(raw)) return null;
    return {
      driver_id: intOrNull(raw.driver_id),
      position: intOrNull(raw.position),
      car_id: intOrNull(raw.car_id),
      car_item_id: intOrNull(raw.car_item_id),
      car_item_name: strOrNull(raw.car_item_name),
      car_class: classOrNull(raw.car_class),
      has_crashed: boolOrNull(raw.has_crashed),
      best_lap_time: finiteOrNull(raw.best_lap_time),
      race_time: finiteOrNull(raw.race_time),
      time_ended: intOrNull(raw.time_ended),
    };
  }

  // The reduced race that is stored. Only finished races are ever stored.
  function normalizeReducedRace(r) {
    if (!isObject(r)) return null;
    const id = intOrNull(r.id);
    const start = intOrNull(r.start);
    if (id === null || start === null || r.status !== 'finished') return null;
    return {
      id: id,
      status: 'finished',
      track_id: intOrNull(r.track_id),
      title: strOrNull(r.title),
      laps: intOrNull(r.laps),
      is_official: boolOrNull(r.is_official),
      car_class_required: classOrNull(r.car_class_required),
      requires_stock_car: boolOrNull(r.requires_stock_car),
      participants_current: intOrNull(r.participants_current),
      start: start,
      end: intOrNull(r.end),
      skill_gain: finiteOrNull(r.skill_gain),
      own: r.own === null || r.own === undefined ? null : normalizeOwnRow(r.own),
    };
  }

  // One race as returned by user/races. Other drivers' rows are dropped here.
  // kind: 'finished' (race is the reduced record), 'unfinished' (open / in_progress) or 'invalid'.
  function reduceApiRace(raw, ownId) {
    if (!isObject(raw)) return { kind: 'invalid' };
    const id = intOrNull(raw.id);
    if (id === null) return { kind: 'invalid' };
    if (raw.status === 'open' || raw.status === 'in_progress') return { kind: 'unfinished', id: id };
    if (raw.status !== 'finished') return { kind: 'invalid' };
    const sched = isObject(raw.schedule) ? raw.schedule : {};
    const part = isObject(raw.participants) ? raw.participants : {};
    const req = isObject(raw.requirements) ? raw.requirements : {};
    let own = null;
    if (Array.isArray(raw.results)) {
      const mine = raw.results.filter(function (row) { return isObject(row) && row.driver_id === ownId; });
      if (mine.length === 1) own = normalizeOwnRow(mine[0]);
    }
    const race = normalizeReducedRace({
      id: id, status: 'finished', track_id: raw.track_id, title: raw.title, laps: raw.laps,
      is_official: raw.is_official, car_class_required: req.car_class, requires_stock_car: req.requires_stock_car,
      participants_current: part.current, start: sched.start, end: sched.end, skill_gain: raw.skill_gain, own: own,
    });
    return race ? { kind: 'finished', race: race } : { kind: 'invalid' };
  }

  // Duplicates are decided on race id; the race already stored wins.
  function mergeRaces(existing, incoming) {
    const byId = new Map();
    for (const r of existing) byId.set(r.id, r);
    let added = 0;
    for (const r of incoming) if (!byId.has(r.id)) { byId.set(r.id, r); added++; }
    const races = Array.from(byId.values()).sort(function (a, b) { return (a.start - b.start) || (a.id - b.id); });
    return { races: races, added: added };
  }

  function maxStart(races) {
    let m = null;
    for (const r of races) if (m === null || r.start > m) m = r.start;
    return m;
  }

  function makeRaceLogStore(userId, races, fetchedAtIso) {
    return { source: 'user/races', fetchedAt: fetchedAtIso, schemaVersion: SCHEMA_VERSION, userId: userId, races: races };
  }

  // Anything unexpected rejects the whole store; the races can be fetched again.
  function restoreRaceLogStore(stored) {
    if (!isObject(stored) || stored.schemaVersion !== SCHEMA_VERSION || stored.source !== 'user/races') return null;
    if (!stampOk(stored.fetchedAt) || !Array.isArray(stored.races)) return null;
    const races = [];
    const seen = new Set();
    for (const raw of stored.races) {
      const r = normalizeReducedRace(raw);
      if (r === null || seen.has(r.id)) return null;
      seen.add(r.id);
      races.push(r);
    }
    races.sort(function (a, b) { return (a.start - b.start) || (a.id - b.id); });
    return makeRaceLogStore(intOrNull(stored.userId), races, stored.fetchedAt);
  }

  // ---- car snapshots. A snapshot is a new post only when parts or stats differ from the previous one.
  // `lastSeen` moves forward while the same build keeps being observed; it is what lets a build be
  // OBSERVED on both sides of a race without storing identical posts again.

  function emptySnapshotStore() { return { source: 'user/enlistedcars', schemaVersion: SCHEMA_VERSION, cars: {} }; }

  function sameBuild(a, b) {
    if (a.parts.length !== b.parts.length) return false;
    for (let i = 0; i < a.parts.length; i++) if (a.parts[i] !== b.parts[i]) return false;
    for (const k of STAT_KEYS) if (a.stats[k] !== b.stats[k]) return false;
    return true;
  }

  function normalizeSnapshot(s) {
    if (!isObject(s) || !stampOk(s.t) || !stampOk(s.lastSeen)) return null;
    if (Date.parse(s.lastSeen) < Date.parse(s.t)) return null;
    if (!Array.isArray(s.parts) || !s.parts.every(Number.isInteger)) return null;
    const stats = readStats(s.stats);
    if (!statsComplete(stats)) return null;
    return {
      t: s.t, lastSeen: s.lastSeen, source: 'user/enlistedcars', schemaVersion: SCHEMA_VERSION,
      parts: s.parts.slice().sort(numericAsc), stats: stats,
    };
  }

  // Invalid posts are dropped one by one — snapshots cannot be fetched again afterwards.
  function restoreSnapshotStore(stored) {
    if (!isObject(stored) || stored.schemaVersion !== SCHEMA_VERSION || stored.source !== 'user/enlistedcars' || !isObject(stored.cars)) return null;
    const store = emptySnapshotStore();
    let dropped = 0;
    for (const id of Object.keys(stored.cars)) {
      const raw = stored.cars[id];
      if (!/^\d+$/.test(id) || !Array.isArray(raw)) { dropped++; continue; }
      const list = [];
      for (const s of raw) {
        const n = normalizeSnapshot(s);
        if (n === null) dropped++; else list.push(n);
      }
      list.sort(function (a, b) { return Date.parse(a.t) - Date.parse(b.t); });
      if (list.length) store.cars[id] = list;
    }
    return { store: store, dropped: dropped };
  }

  // Takes the enlisted cars of a successful user/enlistedcars load. Returns a new store.
  function applySnapshots(store, enlistedItems, nowIso) {
    const next = JSON.parse(JSON.stringify(store));
    let added = 0;
    let refreshed = 0;
    let skipped = 0;
    for (const e of enlistedItems) {
      if (!e.complete) { skipped++; continue; }
      const build = { parts: e.parts.slice().sort(numericAsc), stats: readStats(e.stats) };
      const list = next.cars[String(e.id)] || (next.cars[String(e.id)] = []);
      const last = list.length ? list[list.length - 1] : null;
      if (last && Date.parse(nowIso) < Date.parse(last.lastSeen)) { skipped++; continue; }
      if (last && sameBuild(last, build)) {
        if (nowIso !== last.lastSeen) { last.lastSeen = nowIso; refreshed++; }
        continue;
      }
      list.push({ t: nowIso, lastSeen: nowIso, source: 'user/enlistedcars', schemaVersion: SCHEMA_VERSION, parts: build.parts, stats: build.stats });
      added++;
    }
    for (const id of Object.keys(next.cars)) if (!next.cars[id].length) delete next.cars[id];
    return { store: next, added: added, refreshed: refreshed, skipped: skipped };
  }

  // ---- owner declaration: "parts unchanged since <date, TCT>", per enlisted car.

  function emptyDeclaredStore() { return { source: 'owner', schemaVersion: SCHEMA_VERSION, cars: {} }; }

  function isValidDeclaredDate(text, nowMs) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const ms = Date.parse(text + 'T00:00:00Z');
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== text) return false;
    return ms <= nowMs;
  }

  function setDeclared(store, carId, dateText, nowIso) {
    if (!Number.isInteger(carId)) return { ok: false, message: 'Unknown car.', store: store };
    if (!isValidDeclaredDate(dateText, Date.parse(nowIso))) {
      return { ok: false, message: 'Enter a date (TCT) that is not in the future.', store: store };
    }
    const next = JSON.parse(JSON.stringify(store));
    next.cars[String(carId)] = { value: dateText, savedAt: nowIso, source: 'owner', schemaVersion: SCHEMA_VERSION };
    return { ok: true, message: '', store: next };
  }

  function clearDeclared(store, carId) {
    const next = JSON.parse(JSON.stringify(store));
    delete next.cars[String(carId)];
    return next;
  }

  function restoreDeclaredStore(stored) {
    if (!isObject(stored) || stored.schemaVersion !== SCHEMA_VERSION || stored.source !== 'owner' || !isObject(stored.cars)) return null;
    const store = emptyDeclaredStore();
    for (const id of Object.keys(stored.cars)) {
      const e = stored.cars[id];
      if (!/^\d+$/.test(id) || !isObject(e) || e.schemaVersion !== SCHEMA_VERSION || e.source !== 'owner') continue;
      if (!stampOk(e.savedAt) || !isValidDeclaredDate(e.value, Date.parse(e.savedAt))) continue;
      store.cars[id] = { value: e.value, savedAt: e.savedAt, source: 'owner', schemaVersion: SCHEMA_VERSION };
    }
    return store;
  }

  // A race counts after the whole declared day has passed.
  function declaredCutoffMs(dateText) { return Date.parse(dateText + 'T00:00:00Z') + SECONDS_PER_DAY * 1000; }

  // ---- build status per race (fail-closed): OBSERVED, DECLARED or UNKNOWN.

  function unknownBuild(reason) { return { status: 'UNKNOWN', build: null, reason: reason }; }

  function evaluateBuild(race, snapshotList, declaredEntry, enlistedIds) {
    const own = race.own;
    if (!own) return unknownBuild('Own row not found in the race results');
    if (own.car_id === null) return unknownBuild('car_id missing in own row');
    const list = (snapshotList || []).slice().sort(function (a, b) { return Date.parse(a.t) - Date.parse(b.t); });
    if (!list.length) return unknownBuild('No snapshot of this car');

    // Observations: a snapshot was seen at `t` and again at `lastSeen`.
    const obs = [];
    for (const s of list) {
      obs.push({ t: Date.parse(s.t), s: s });
      const last = Date.parse(s.lastSeen);
      if (last > Date.parse(s.t)) obs.push({ t: last, s: s });
    }
    obs.sort(function (a, b) { return a.t - b.t; });

    let reason = 'No snapshot on both sides of the race and no owner declaration';
    if (race.end !== null) {
      const start = race.start * 1000;
      const end = race.end * 1000;
      let before = null;
      let after = null;
      const between = [];
      for (const o of obs) {
        if (o.t < start) before = o;
        else if (o.t > end) { if (after === null) after = o; }
        else between.push(o);
      }
      if (before && after) {
        if (!sameBuild(before.s, after.s)) reason = 'The build differs between the snapshots before and after the race';
        else if (between.some(function (o) { return !sameBuild(o.s, before.s); })) reason = 'A snapshot taken during the race differs';
        else return { status: 'OBSERVED', build: { stats: before.s.stats, parts: before.s.parts }, reason: '' };
      }
    } else {
      reason = 'Race end time missing';
    }

    if (declaredEntry) {
      const cutoff = declaredCutoffMs(declaredEntry.value);
      const current = list[list.length - 1];
      if (enlistedIds === null || enlistedIds === undefined) reason = 'user/enlistedcars not loaded';
      else if (!enlistedIds.has(own.car_id)) reason = 'Car not found in user/enlistedcars';
      else if (race.start * 1000 < cutoff) reason = 'Race is not after the declared date';
      else if (obs.some(function (o) { return o.t >= cutoff && !sameBuild(o.s, current); })) {
        reason = 'The declaration is contradicted by a snapshot taken after the declared date';
      } else return { status: 'DECLARED', build: { stats: current.stats, parts: current.parts }, reason: '' };
    }
    return unknownBuild(reason);
  }

  function formatTct(unixSeconds) {
    return unixSeconds === null || unixSeconds === undefined ? null : new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace('T', ' ');
  }

  function usableRace(row) {
    return row.own !== null && row.crashed === false && row.bestLap !== null && row.bestLap > 0 &&
      (row.status === 'OBSERVED' || row.status === 'DECLARED') && row.trackId !== null && row.carClass !== null;
  }

  // One row per stored race, with its build status. `enlistedIds` is a Set, or null when
  // user/enlistedcars is not loaded; `tracks` is the racing/tracks item list or null.
  function buildRaceRows(input) {
    const races = input.races || [];
    const snaps = input.snapshots || emptySnapshotStore();
    const declared = input.declared || emptyDeclaredStore();
    const titles = new Map();
    for (const t of input.tracks || []) if (t.title !== null) titles.set(t.id, t.title);
    return races.map(function (r) {
      const own = r.own;
      const carId = own ? own.car_id : null;
      const key = carId === null ? null : String(carId);
      const ev = evaluateBuild(r, key !== null ? snaps.cars[key] : null, key !== null ? declared.cars[key] : null, input.enlistedIds || null);
      const row = {
        id: r.id, start: r.start, end: r.end, trackId: r.track_id,
        trackTitle: r.track_id !== null && titles.has(r.track_id) ? titles.get(r.track_id) : null,
        isOfficial: r.is_official, laps: r.laps, drivers: r.participants_current,
        carId: carId, carName: own ? own.car_item_name : null, carClass: own ? own.car_class : null,
        position: own ? own.position : null, crashed: own ? own.has_crashed : null,
        bestLap: own ? own.best_lap_time : null, raceTime: own ? own.race_time : null,
        skillGain: r.skill_gain, own: own, status: ev.status, build: ev.build, buildReason: ev.reason,
      };
      row.usable = usableRace(row);
      return row;
    });
  }

  const ROW_SORT_VALUE = {
    date: function (r) { return r.start; },
    track: function (r) { return r.trackTitle !== null ? r.trackTitle : (r.trackId !== null ? 'Track #' + String(r.trackId).padStart(6, '0') : null); },
    type: function (r) { return r.isOfficial === null ? null : (r.isOfficial ? 'Official' : 'Custom'); },
    class: function (r) { return r.carClass; },
    laps: function (r) { return r.laps; },
    drivers: function (r) { return r.drivers; },
    car: function (r) { return r.carName; },
    build: function (r) { return r.status; },
    position: function (r) { return r.position; },
    crashed: function (r) { return r.crashed === null ? null : (r.crashed ? 1 : 0); },
    bestLap: function (r) { return r.bestLap; },
    raceTime: function (r) { return r.raceTime; },
    skillGain: function (r) { return r.skillGain; },
  };

  function sortRaceRows(rows, key, dir) {
    const get = ROW_SORT_VALUE[key] || ROW_SORT_VALUE.date;
    const sign = dir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      const x = get(a);
      const y = get(b);
      if (x === null || x === undefined) return (y === null || y === undefined) ? (b.start - a.start) : 1;
      if (y === null || y === undefined) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c !== 0 ? c * sign : (b.start - a.start);
    });
  }

  function raceLogSummary(rows) {
    if (!rows.length) return 'No races loaded.';
    let oldest = rows[0].start;
    let newest = rows[0].start;
    for (const r of rows) { if (r.start < oldest) oldest = r.start; if (r.start > newest) newest = r.start; }
    return rows.length + ' races loaded, oldest ' + formatTct(oldest) + ' TCT, newest ' + formatTct(newest) + ' TCT';
  }

  // ---- Data sufficiency: what stage 2B (the time model) is waiting for.

  function computeSufficiency(rows) {
    const groups = new Map();
    for (const r of rows) {
      if (r.own === null || r.trackId === null) continue;
      const key = r.trackId + '|' + (r.carClass === null ? 'UNKNOWN' : r.carClass);
      if (!groups.has(key)) groups.set(key, { trackId: r.trackId, trackTitle: r.trackTitle, cls: r.carClass, races: 0, usableRows: [] });
      const g = groups.get(key);
      g.races++;
      if (r.usable) g.usableRows.push(r);
    }
    const out = [];
    for (const g of groups.values()) {
      const vectors = new Set();
      const spread = {};
      for (const k of STAT_KEYS) spread[k] = null;
      for (const r of g.usableRows) {
        vectors.add(STAT_KEYS.map(function (k) { return r.build.stats[k]; }).join(','));
        for (const k of STAT_KEYS) {
          const v = r.build.stats[k];
          if (spread[k] === null) spread[k] = { min: v, max: v };
          else { if (v < spread[k].min) spread[k].min = v; if (v > spread[k].max) spread[k].max = v; }
        }
      }
      const usable = g.usableRows.length;
      const ready = usable >= DATA_SUFFICIENCY.MIN_USABLE_RACES && vectors.size >= DATA_SUFFICIENCY.MIN_DISTINCT_BUILDS;
      const spreadOut = {};
      for (const k of STAT_KEYS) spreadOut[k] = spread[k] === null ? null : spread[k].max - spread[k].min;
      out.push({
        trackId: g.trackId, trackTitle: g.trackTitle, cls: g.cls, races: g.races,
        usable: usable, distinctBuilds: vectors.size, spread: spreadOut, ready: ready,
        status: ready ? 'READY for model'
          : 'NOT ENOUGH DATA (need ' + DATA_SUFFICIENCY.MIN_USABLE_RACES + ' races / ' + DATA_SUFFICIENCY.MIN_DISTINCT_BUILDS + ' builds)',
      });
    }
    out.sort(function (a, b) {
      return (a.trackId - b.trackId) || String(a.cls).localeCompare(String(b.cls));
    });
    const readyCount = out.filter(function (g) { return g.ready; }).length;
    return { groups: out, readyCount: readyCount, total: out.length, summary: readyCount + ' of ' + out.length + ' track/class combinations READY' };
  }

  // ---- "Checks on real data": the assumptions the first real run has to settle. They only report.

  function computeChecks(input) {
    const store = input.raceLog;
    const races = store ? store.races : [];
    const lines = [];
    const total = races.length;
    if (!total) {
      return { total: 0, lines: [{ id: 'a', kind: 'unknown', text: 'No races loaded yet — nothing to check.' }] };
    }

    const withOwn = races.filter(function (r) { return r.own !== null; });
    const missing = total - withOwn.length;
    lines.push({
      id: 'a', kind: missing ? 'bad' : 'ok',
      text: 'a) Own row found in ' + withOwn.length + ' of ' + total + ' races (via user/basic ID).' +
        (missing ? ' Own row MISSING in ' + missing + ' races — those races are UNKNOWN.' : ''),
    });

    if (input.enlistedIds === null || input.enlistedIds === undefined) {
      lines.push({ id: 'b', kind: 'unknown', text: 'b) car_id in own row vs enlisted cars: UNKNOWN — user/enlistedcars is not loaded.' });
    } else {
      const matched = withOwn.filter(function (r) { return r.own.car_id !== null && input.enlistedIds.has(r.own.car_id); }).length;
      lines.push({
        id: 'b', kind: matched === withOwn.length ? 'ok' : 'bad',
        text: 'b) car_id in own row matches an enlisted car id in ' + matched + ' of ' + withOwn.length + ' races.',
      });
    }

    function range(values) {
      if (!values.length) return null;
      let lo = values[0];
      let hi = values[0];
      for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
      return { lo: lo, hi: hi, n: values.length };
    }
    const best = range(withOwn.map(function (r) { return r.own.best_lap_time; }).filter(function (v) { return v !== null; }));
    const rtime = range(withOwn.map(function (r) { return r.own.race_time; }).filter(function (v) { return v !== null; }));
    lines.push({
      id: 'c', kind: 'info',
      text: 'c) Time units — best_lap_time: ' + (best ? 'min ' + best.lo + ', max ' + best.hi + ' (' + best.n + ' races)' : 'UNKNOWN (no values)') +
        ' · race_time: ' + (rtime ? 'min ' + rtime.lo + ', max ' + rtime.hi + ' (' + rtime.n + ' races)' : 'UNKNOWN (no values)') +
        '. The page assumes no unit — compare with a lap time you see in the game.',
    });

    const comparable = withOwn.filter(function (r) { return r.own.best_lap_time !== null && r.own.race_time !== null && r.laps !== null; });
    const odd = comparable.filter(function (r) { return r.own.race_time < r.own.best_lap_time * r.laps; }).length;
    lines.push({
      id: 'd', kind: odd ? 'bad' : 'ok',
      text: 'd) Plausibility: race_time < best_lap_time × laps in ' + odd + ' of ' + comparable.length +
        ' races (expected 0 if both use the same unit and race_time is the total time).',
    });

    const withSkill = races.filter(function (r) { return r.skill_gain !== null; });
    let sum = 0;
    for (const r of withSkill) sum += r.skill_gain;
    lines.push({
      id: 'e', kind: 'info',
      text: 'e) skill_gain: value in ' + withSkill.length + ' races, null in ' + (total - withSkill.length) + ' races, sum ' + (Math.round(sum * 10000) / 10000) + '.',
    });
    return { total: total, lines: lines };
  }

  // ---------------------------------------------------------------- stage 2C: track records, best car per track
  // Only the car model and the lap time of each record are kept. Driver names and ids are dropped on arrival
  // and again when a stored post is read back.

  function recordsUrl(trackId, cls) {
    return API_BASE + 'racing/' + trackId + '/records?cat=' + cls + '&comment=' + API_COMMENT;
  }

  function lapOrNull(v) { return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null; }

  function normalizeRecord(raw) {
    if (!isObject(raw)) return null;
    return { car_item_id: intOrNull(raw.car_item_id), car_item_name: strOrNull(raw.car_item_name), lap_time: lapOrNull(raw.lap_time) };
  }

  // Fastest first; a record without a lap time sorts last.
  function sortRecords(list) {
    return list.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      const x = a.r.lap_time === null ? Infinity : a.r.lap_time;
      const y = b.r.lap_time === null ? Infinity : b.r.lap_time;
      return x === y ? a.i - b.i : x - y;
    }).map(function (e) { return e.r; });
  }

  // The records of one racing/{trackId}/records response, or null when the response has the wrong shape.
  function reduceRecordsResponse(json) {
    if (!isObject(json) || !Array.isArray(json.records)) return null;
    const list = [];
    for (const raw of json.records) { const r = normalizeRecord(raw); if (r) list.push(r); }
    return sortRecords(list).slice(0, RECORDS_PER_TRACK);
  }

  function emptyRecordsStore() { return { source: 'racing/records', schemaVersion: SCHEMA_VERSION, classes: {} }; }

  // Anything unexpected rejects the whole store (it can be fetched again). A post for one track that is
  // not valid is dropped on its own, and that track is fetched again next time.
  function restoreRecordsStore(stored) {
    if (!isObject(stored) || stored.schemaVersion !== SCHEMA_VERSION || stored.source !== 'racing/records' || !isObject(stored.classes)) return null;
    const store = emptyRecordsStore();
    let dropped = 0;
    for (const cls of Object.keys(stored.classes)) {
      const entry = stored.classes[cls];
      if (CLASSES.indexOf(cls) < 0 || !isObject(entry) || !stampOk(entry.fetchedAt) || !isObject(entry.tracks)) { dropped++; continue; }
      const tracks = {};
      for (const id of Object.keys(entry.tracks)) {
        const t = entry.tracks[id];
        let ok = /^\d+$/.test(id) && isObject(t) && stampOk(t.fetchedAt) && Array.isArray(t.records) && t.records.length <= RECORDS_PER_TRACK;
        const records = [];
        if (ok) {
          for (const raw of t.records) {
            const r = normalizeRecord(raw);
            const clean = r && (raw.car_item_id === null || Number.isInteger(raw.car_item_id)) &&
              (raw.car_item_name === null || typeof raw.car_item_name === 'string') &&
              (raw.lap_time === null || lapOrNull(raw.lap_time) !== null);
            if (!clean) { ok = false; break; }
            records.push(r);
          }
        }
        if (ok) tracks[id] = { fetchedAt: t.fetchedAt, records: records }; else dropped++;
      }
      if (Object.keys(tracks).length) store.classes[cls] = { fetchedAt: entry.fetchedAt, tracks: tracks };
    }
    return { store: store, dropped: dropped };
  }

  function applyTrackRecords(store, cls, trackId, records, nowIso) {
    const next = JSON.parse(JSON.stringify(store));
    if (!next.classes[cls]) next.classes[cls] = { fetchedAt: nowIso, tracks: {} };
    next.classes[cls].fetchedAt = nowIso;
    next.classes[cls].tracks[String(trackId)] = { fetchedAt: nowIso, records: records.map(function (r) {
      return { car_item_id: r.car_item_id, car_item_name: r.car_item_name, lap_time: r.lap_time };
    }) };
    return next;
  }

  function storedRecordTrackIds(store, cls) {
    const out = new Set();
    const entry = store && store.classes ? store.classes[cls] : null;
    if (entry) for (const id of Object.keys(entry.tracks)) out.add(Number(id));
    return out;
  }

  // Car model ids the user owns: enlisted cars that are not removed. null when user/enlistedcars is not loaded.
  function ownedCarItemIds(enlistedItems) {
    if (!enlistedItems) return null;
    const out = new Set();
    for (const e of enlistedItems) if (e.is_removed !== true && e.car_item_id !== null) out.add(e.car_item_id);
    return out;
  }

  // "Show builds" is possible only for a record car that racing/cars lists in the selected class.
  function showBuildsTarget(cls, recordCarId, cars) {
    const title = 'Car not in class ' + cls + ' in racing/cars';
    if (!Number.isInteger(recordCarId) || !cars) return { enabled: false, carId: null, title: title };
    const car = cars.find(function (c) { return c.car_item_id === recordCarId && c.class === cls; });
    return car ? { enabled: true, carId: car.car_item_id, title: '' } : { enabled: false, carId: null, title: title };
  }

  // Own best lap per track in one class from the stored race log: races of that class where the user did
  // not crash. Races without a usable lap time are not counted. null when no race log is stored.
  function ownBestLaps(raceLogStore, cls) {
    if (!raceLogStore) return null;
    const out = new Map();
    for (const r of raceLogStore.races) {
      const o = r.own;
      if (!o || o.car_class !== cls || o.has_crashed === true || r.track_id === null) continue;
      const lap = lapOrNull(o.best_lap_time);
      if (lap === null) continue;
      const cur = out.get(r.track_id);
      if (!cur) out.set(r.track_id, { lap: lap, car: o.car_item_name, races: 1 });
      else {
        cur.races++;
        if (lap < cur.lap) { cur.lap = lap; cur.car = o.car_item_name; }
      }
    }
    return out;
  }

  // Own races per track and class from the stored race log, all classes, crashed races included:
  // Map trackId -> Map class ('UNKNOWN' when the class is missing) -> number of races. null when no race log is stored.
  function ownRacesByTrackAndClass(raceLogStore) {
    if (!raceLogStore) return null;
    const out = new Map();
    for (const r of raceLogStore.races) {
      if (!r.own || r.track_id === null) continue;
      const cls = r.own.car_class === null || r.own.car_class === undefined ? 'UNKNOWN' : r.own.car_class;
      if (!out.has(r.track_id)) out.set(r.track_id, new Map());
      const m = out.get(r.track_id);
      m.set(cls, (m.get(cls) || 0) + 1);
    }
    return out;
  }

  // The selected class first (even with 0 races, as soon as the track has any race), the others by number of races.
  function racesHereList(byClass, cls) {
    if (!byClass || !byClass.size) return [];
    const others = Array.from(byClass.entries()).filter(function (e) { return e[0] !== cls; })
      .sort(function (a, b) { return (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])); });
    return [{ cls: cls, count: byClass.get(cls) || 0, selected: true }].concat(others.map(function (e) { return { cls: e[0], count: e[1], selected: false }; }));
  }

  // One row per track for the selected class, plus the figures for the summary lines above the table.
  // input: {cls, tracks (racing/tracks items), store (records store), raceLog (store or null), enlisted (items or null),
  //         cars (racing/cars items or null), errors ({trackId: text})}
  function computeBestCarTable(input) {
    const cls = input.cls;
    const entry = input.store && input.store.classes ? input.store.classes[cls] : null;
    const own = ownBestLaps(input.raceLog, cls);
    const allRaces = ownRacesByTrackAndClass(input.raceLog);
    const owned = ownedCarItemIds(input.enlisted);
    const errors = input.errors || {};
    const tracks = (input.tracks || []).slice().sort(function (a, b) { return a.id - b.id; });
    const rows = [];
    const models = new Map();
    for (const t of tracks) {
      const stored = entry ? entry.tracks[String(t.id)] : null;
      const row = {
        trackId: t.id, trackTitle: t.title, fetchedAt: stored ? stored.fetchedAt : null,
        state: stored ? (stored.records.length ? 'LOADED' : 'EMPTY') : (errors[t.id] ? 'ERROR' : 'NOT_LOADED'),
        error: stored ? null : (errors[t.id] || null),
        recordCarId: null, recordCar: null, recordLap: null, fifthLap: null,
        ownKnown: own !== null, own: null, racesHere: allRaces === null ? null : racesHereList(allRaces.get(t.id), cls), gapPct: null, ownsRecordCar: 'UNKNOWN',
        showBuilds: showBuildsTarget(cls, null, input.cars),
      };
      if (own !== null && own.has(t.id)) row.own = own.get(t.id);
      if (row.state === 'LOADED') {
        const top = stored.records[0];
        row.recordCarId = top.car_item_id;
        row.recordCar = top.car_item_name;
        row.recordLap = top.lap_time;
        row.fifthLap = stored.records.length >= RECORDS_PER_TRACK ? stored.records[RECORDS_PER_TRACK - 1].lap_time : null;
        if (row.own && row.recordLap !== null) row.gapPct = (row.own.lap / row.recordLap - 1) * 100;
        if (owned !== null && row.recordCarId !== null) row.ownsRecordCar = owned.has(row.recordCarId) ? 'Yes' : 'No';
        row.showBuilds = showBuildsTarget(cls, row.recordCarId, input.cars);
        const mk = row.recordCarId !== null ? 'id:' + row.recordCarId : 'name:' + row.recordCar;
        if (!models.has(mk)) models.set(mk, { id: row.recordCarId, name: row.recordCar, tracks: 0 });
        models.get(mk).tracks++;
      }
      rows.push(row);
    }
    const recordCars = Array.from(models.values()).sort(function (a, b) {
      return (b.tracks - a.tracks) || String(a.name).localeCompare(String(b.name));
    });
    let oldest = null;
    let newest = null;
    for (const r of rows) {
      if (r.fetchedAt === null) continue;
      if (oldest === null || Date.parse(r.fetchedAt) < Date.parse(oldest)) oldest = r.fetchedAt;
      if (newest === null || Date.parse(r.fetchedAt) > Date.parse(newest)) newest = r.fetchedAt;
    }
    const ownedKnown = owned !== null && recordCars.every(function (m) { return m.id !== null; });
    return {
      rows: rows,
      loaded: rows.filter(function (r) { return r.state === 'LOADED' || r.state === 'EMPTY'; }).length,
      oldestFetched: oldest,
      newestFetched: newest,
      recordCars: recordCars,
      modelsTotal: recordCars.length,
      modelsOwned: ownedKnown ? recordCars.filter(function (m) { return owned.has(m.id); }).length : null,
    };
  }

  // ---------------------------------------------------------------- stage 2D: lap-time estimate (EXPERIMENTAL)
  // Fixed weights, fitted outside the page on 2026-10-07 to Torn's track records (analys/lap-model-2026-10-07.json,
  // copied word for word — never edit the numbers here; a new fit means a new model file and a new page).
  // Per track: 1 / lap time = c + sum(w[k] * stat[k]) with the car's best build for that track. Nothing is fitted in the page.
  // No API call is ever made by anything in this section: it only reads data that is already loaded and stored.
  const LAP_MODEL = {
   "schemaVersion": 1,
   "kind": "KSRacingLabLapModel",
   "form": "1/lap = c + sum(w*stat)",
   "fittedAt": "2026-10-07",
   "source": "analys/refit.py on analys/KS-Racing-Lab-data-2026-10-07.txt (export 2026-10-07T09:47:14Z, records fetched 2026-10-07)",
   "minTolerancePct": 1.0,
   "unknownAbovePct": 5.0,
   "tracks": {
    "6": {
     "title": "Uptown",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.010429963681845842,
     "w": {
      "top_speed": 1.0895367250304935e-05,
      "acceleration": 9.715441058262118e-06,
      "braking": 7.4593958552981285e-06,
      "handling": 9.552209914834222e-06,
      "tarmac": 1.2560883249849932e-07
     },
     "validatedErrorPct": {
      "A": -0.26,
      "B": -0.12,
      "C": 0.41,
      "D": 1.29,
      "E": -1.9
     },
     "fittedRecordLap": {
      "A": 71.59,
      "B": 75.36,
      "C": 79.53,
      "D": 84.66,
      "E": 90.89
     }
    },
    "7": {
     "title": "Withdrawal",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.006649696803848224,
     "w": {
      "top_speed": 6.783809011729982e-06,
      "acceleration": 5.521510085075503e-06,
      "braking": 5.612442321061019e-06,
      "handling": 7.091281926891136e-06,
      "tarmac": 2.1164998515663968e-20
     },
     "validatedErrorPct": {
      "A": -0.03,
      "B": -0.08,
      "C": 0.18,
      "D": 1.03,
      "E": -1.33
     },
     "fittedRecordLap": {
      "A": 111.88,
      "B": 117.76,
      "C": 124.65,
      "D": 132.75,
      "E": 142.4
     }
    },
    "8": {
     "title": "Underdog",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.008569813430668118,
     "w": {
      "top_speed": 8.902051396076787e-19,
      "acceleration": 6.335855186188439e-06,
      "braking": 1.4972227521066469e-05,
      "handling": 1.4866645106514475e-05,
      "tarmac": 3.351974976344607e-06
     },
     "validatedErrorPct": {
      "A": -0.33,
      "B": 0.31,
      "C": 0.5,
      "D": 1.4,
      "E": -1.58
     },
     "fittedRecordLap": {
      "A": 84.9,
      "B": 89.58,
      "C": 94.83,
      "D": 100.77,
      "E": 108.63
     }
    },
    "9": {
     "title": "Parkland",
     "unknown": false,
     "surface": "dirt",
     "c": 0.003193115715434856,
     "w": {
      "top_speed": 8.154754315462266e-19,
      "acceleration": 3.246879925770828e-06,
      "braking": 5.6483221040172095e-06,
      "handling": 1.1471546604200625e-05,
      "dirt": 4.3562541019191877e-05
     },
     "validatedErrorPct": {
      "A": -0.1,
      "B": -1.43,
      "C": 0.31,
      "D": 0.23,
      "E": -3.5
     },
     "fittedRecordLap": {
      "A": 149.1,
      "B": 152.53,
      "C": 178.64,
      "D": 210.98,
      "E": 262.06
     }
    },
    "10": {
     "title": "Docks",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.004577602017102299,
     "w": {
      "top_speed": 2.9371421767805357e-06,
      "acceleration": 1.6282833132168754e-06,
      "braking": 6.775720766489953e-06,
      "handling": 8.496299811224795e-06,
      "tarmac": 2.982683161843969e-18
     },
     "validatedErrorPct": {
      "A": -0.15,
      "B": 0.2,
      "C": 1.43,
      "D": 1.26,
      "E": -1.32
     },
     "fittedRecordLap": {
      "A": 159.96,
      "B": 168.33,
      "C": 178.41,
      "D": 190.28,
      "E": 204.78
     }
    },
    "11": {
     "title": "Commerce",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.014431773990045431,
     "w": {
      "top_speed": 1.6372906048589496e-18,
      "acceleration": 1.039769290759509e-06,
      "braking": 3.7418015790510365e-05,
      "handling": 3.544845331853651e-05,
      "tarmac": 4.855449853073696e-19
     },
     "validatedErrorPct": {
      "A": -0.19,
      "B": -0.13,
      "C": 0.09,
      "D": 0.42,
      "E": -0.25
     },
     "fittedRecordLap": {
      "A": 49.25,
      "B": 52.18,
      "C": 55.31,
      "D": 59.28,
      "E": 63.73
     }
    },
    "12": {
     "title": "Two Islands",
     "unknown": false,
     "surface": "dirt",
     "c": 0.005705719022696918,
     "w": {
      "top_speed": 4.7235784351858464e-06,
      "acceleration": 7.107852108737105e-06,
      "braking": 7.544613935016029e-06,
      "handling": 9.382459326013174e-06,
      "dirt": 4.497739507927851e-05
     },
     "validatedErrorPct": {
      "A": 2.12,
      "B": -1.63,
      "C": 1.17,
      "D": 0.19,
      "E": -0.2
     },
     "fittedRecordLap": {
      "A": 98.64,
      "B": 102.03,
      "C": 114.91,
      "D": 131.75,
      "E": 155.22
     }
    },
    "15": {
     "title": "Industrial",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.00935124531006856,
     "w": {
      "top_speed": 3.5878417942744074e-19,
      "acceleration": 1.6640536390478747e-07,
      "braking": 2.194040469040342e-05,
      "handling": 2.240090075396779e-05,
      "tarmac": 2.728322182858502e-06
     },
     "validatedErrorPct": {
      "A": -0.0,
      "B": 0.22,
      "C": -0.15,
      "D": 1.25,
      "E": -0.42
     },
     "fittedRecordLap": {
      "A": 76.64,
      "B": 81.13,
      "C": 86.15,
      "D": 91.42,
      "E": 98.58
     }
    },
    "16": {
     "title": "Vector",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.01214838486006128,
     "w": {
      "top_speed": 9.61719093414276e-21,
      "acceleration": 7.4610405405497366e-06,
      "braking": 2.2139381365117768e-05,
      "handling": 2.04623317375521e-05,
      "tarmac": 5.902359821342805e-06
     },
     "validatedErrorPct": {
      "A": -0.18,
      "B": 0.29,
      "C": 0.01,
      "D": 0.98,
      "E": -1.14
     },
     "fittedRecordLap": {
      "A": 60.13,
      "B": 63.43,
      "C": 67.16,
      "D": 71.44,
      "E": 76.62
     }
    },
    "17": {
     "title": "Mudpit",
     "unknown": true,
     "reason": "Records do not fit the model: the class B record is faster than the class A record.",
     "fittedRecordLap": {
      "A": 39.93,
      "B": 35.42,
      "C": 54.64,
      "D": 81.35,
      "E": 128.31
     }
    },
    "18": {
     "title": "Hammerhead",
     "unknown": false,
     "surface": "dirt",
     "c": 0.009396766381441676,
     "w": {
      "top_speed": 9.083694944007926e-06,
      "acceleration": 4.21153736579822e-06,
      "braking": 1.7052758285991898e-05,
      "handling": 2.1367438410923373e-05,
      "dirt": 0.00010796537914055973
     },
     "validatedErrorPct": {
      "A": 1.78,
      "B": -0.97,
      "C": 0.35,
      "D": 0.72,
      "E": -0.3
     },
     "fittedRecordLap": {
      "A": 54.72,
      "B": 56.21,
      "C": 64.92,
      "D": 75.23,
      "E": 91.92
     }
    },
    "19": {
     "title": "Sewage",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.007608624724658071,
     "w": {
      "top_speed": 2.3000812885541016e-19,
      "acceleration": 1.379610044833728e-32,
      "braking": 2.1977318600866423e-05,
      "handling": 1.6836642824692584e-05,
      "tarmac": 2.389567331330362e-08
     },
     "validatedErrorPct": {
      "A": 0.43,
      "B": 0.14,
      "C": -0.54,
      "D": 1.32,
      "E": -0.01
     },
     "fittedRecordLap": {
      "A": 93.29,
      "B": 98.96,
      "C": 105.59,
      "D": 112.11,
      "E": 120.69
     }
    },
    "20": {
     "title": "Meltdown",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.012633002539339484,
     "w": {
      "top_speed": 9.0893749192676e-20,
      "acceleration": 1.6935765990653635e-15,
      "braking": 2.9591058716377885e-05,
      "handling": 3.1602802835252054e-05,
      "tarmac": 3.6931782839500243e-06
     },
     "validatedErrorPct": {
      "A": -0.05,
      "B": 0.17,
      "C": 0.06,
      "D": 0.79,
      "E": -0.55
     },
     "fittedRecordLap": {
      "A": 56.47,
      "B": 59.85,
      "C": 63.48,
      "D": 67.73,
      "E": 72.97
     }
    },
    "21": {
     "title": "Speedway",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.029813858052476928,
     "w": {
      "top_speed": 3.151365963636489e-05,
      "acceleration": 2.2074791862794295e-05,
      "braking": 7.297485386910281e-06,
      "handling": 2.28371138979388e-05,
      "tarmac": 1.549496429181561e-19
     },
     "validatedErrorPct": {
      "A": 0.55,
      "B": -0.41,
      "C": 0.29,
      "D": 1.07,
      "E": -2.11
     },
     "fittedRecordLap": {
      "A": 26.19,
      "B": 27.5,
      "C": 28.81,
      "D": 30.31,
      "E": 32.14
     }
    },
    "23": {
     "title": "Stone Park",
     "unknown": false,
     "surface": "dirt",
     "c": 0.008291042544849985,
     "w": {
      "top_speed": 6.152153813620033e-06,
      "acceleration": 8.039742247115872e-06,
      "braking": 1.1253436152359252e-05,
      "handling": 1.0805990068309542e-05,
      "dirt": 6.0359969308490416e-05
     },
     "validatedErrorPct": {
      "A": 4.36,
      "B": -1.79,
      "C": 0.9,
      "D": 2.19,
      "E": -2.24
     },
     "fittedRecordLap": {
      "A": 71.46,
      "B": 73.8,
      "C": 82.01,
      "D": 92.53,
      "E": 108.51
     }
    },
    "24": {
     "title": "Convict",
     "unknown": false,
     "surface": "tarmac",
     "c": 0.012764834800982356,
     "w": {
      "top_speed": 1.1807088324418862e-05,
      "acceleration": 1.1807088324409083e-05,
      "braking": 7.795591096888954e-06,
      "handling": 7.901920927746321e-06,
      "tarmac": 6.287412876004796e-06
     },
     "validatedErrorPct": {
      "A": 0.09,
      "B": -0.22,
      "C": 0.1,
      "D": 1.55,
      "E": -1.86
     },
     "fittedRecordLap": {
      "A": 59.1,
      "B": 62.24,
      "C": 65.72,
      "D": 69.69,
      "E": 74.5
     }
    }
   }
  };

  // The estimate is called STALE when a stored track record differs from the one the model was fitted on by more than
  // this many percent. Claude's threshold, 2026-10-07, change only on owner decision.
  const STALE_THRESHOLD_PCT = 0.5;
  // Subcategories shown as "Key parts", in this order.
  const KEY_PART_SUBCATEGORIES = ['Gearbox', 'Turbo', 'Springs', 'Tyres'];
  const NO_MODEL_REASON = 'No model for this track';
  const SURFACE_LABELS = { tarmac: 'Tarmac', dirt: 'Dirt' };

  function finiteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function codeUnitCompare(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function modelTrack(model, trackId) {
    if (!isObject(model) || !isObject(model.tracks)) return null;
    const t = model.tracks[String(trackId)];
    return isObject(t) ? t : null;
  }

  // Status of the model for one track and car class (section 1.2). state: OK | LOW_CONFIDENCE | UNKNOWN.
  // validatedErrorPct is |e|; tolerancePct = max(minTolerancePct, |e|).
  function estimateStatus(model, trackId, cls) {
    const out = { state: 'UNKNOWN', reason: '', validatedErrorPct: null, tolerancePct: null, surface: null };
    const t = modelTrack(model, trackId);
    if (!t) { out.reason = NO_MODEL_REASON; return out; }
    if (t.unknown === true) {
      out.reason = typeof t.reason === 'string' && t.reason !== '' ? t.reason : NO_MODEL_REASON;
      return out;
    }
    if (t.surface === 'tarmac' || t.surface === 'dirt') out.surface = t.surface;
    if (CLASSES.indexOf(cls) < 0) { out.reason = 'Unknown car class'; return out; }
    const ve = isObject(t.validatedErrorPct) ? t.validatedErrorPct[cls] : undefined;
    if (!finiteNum(ve) || !finiteNum(model.minTolerancePct) || !finiteNum(model.unknownAbovePct)) {
      out.reason = 'No validated error for car class ' + cls + ' on this track';
      return out;
    }
    const e = Math.abs(ve);
    out.validatedErrorPct = e;
    out.tolerancePct = Math.max(model.minTolerancePct, e);
    if (e > model.unknownAbovePct) out.reason = 'Validated error ' + e + ' % is above ' + model.unknownAbovePct + ' %';
    else out.state = e <= model.minTolerancePct ? 'OK' : 'LOW_CONFIDENCE';
    return out;
  }

  function unknownEstimate(status, reason, stats) {
    return {
      state: 'UNKNOWN', reason: reason, lap: null, stats: stats || null,
      validatedErrorPct: status.validatedErrorPct, tolerancePct: status.tolerancePct, surface: status.surface,
    };
  }

  // 1 / (c + sum w*stat) over the weights of the track. Returns {lap} or {reason}.
  function lapFromStats(t, stats) {
    if (!isObject(t.w) || !finiteNum(t.c)) return { reason: 'Model data incomplete' };
    let sc = 0;
    for (const k of Object.keys(t.w)) {
      const w = t.w[k];
      if (!finiteNum(w) || !isObject(stats) || !finiteNum(stats[k])) return { reason: 'Stat ' + k + ' missing' };
      sc += w * stats[k];
    }
    const denom = t.c + sc;
    if (!(denom > 0)) return { reason: 'The model gives no positive speed for these stats' };
    const lap = 1 / denom;
    if (!Number.isFinite(lap)) return { reason: 'The model gives no finite lap time' };
    return { lap: lap };
  }

  // Lap estimate for given final stats (own cars, explorer builds). Any of the seven stats missing -> UNKNOWN.
  function estimateFromStats(model, trackId, cls, stats) {
    const st = estimateStatus(model, trackId, cls);
    if (st.state === 'UNKNOWN') return unknownEstimate(st, st.reason, null);
    if (!isObject(stats)) return unknownEstimate(st, 'Stats missing', null);
    const copy = {};
    for (const k of STAT_KEYS) {
      if (!finiteNum(stats[k])) return unknownEstimate(st, 'Stat ' + k + ' missing', null);
      copy[k] = stats[k];
    }
    const r = lapFromStats(modelTrack(model, trackId), copy);
    if (r.lap === undefined) return unknownEstimate(st, r.reason, copy);
    return {
      state: st.state, reason: '', lap: r.lap, stats: copy,
      validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface,
    };
  }

  // Stage 2D-2: the class that limits the parts is the driver's, not the car's. It is read from the parts on the
  // enlisted cars: the highest class_required among them. Removed cars do not count; a part id that is not in the
  // (complete) upgrade list does not count. cls is null when nothing can be said, with the reason in words.
  function partsClassFromEnlisted(enlisted, upgrades) {
    if (!Array.isArray(enlisted)) return { cls: null, reason: 'Your enlisted cars are not loaded' };
    if (!Array.isArray(upgrades)) return { cls: null, reason: 'The upgrade list is not loaded' };
    const byId = new Map();
    for (const u of upgrades) if (isObject(u) && u.complete === true) byId.set(u.id, u);
    let best = null;
    let found = 0;
    for (const e of enlisted) {
      if (!isObject(e) || e.is_removed === true || !Array.isArray(e.parts)) continue;
      for (const id of e.parts) {
        const u = byId.get(id);
        if (!u || CLASS_RANK[u.class_required] === undefined) continue;
        found++;
        if (best === null || CLASS_RANK[u.class_required] > CLASS_RANK[best]) best = u.class_required;
      }
    }
    if (best === null) return { cls: null, reason: 'No fitted part from the upgrade list was found on your enlisted cars' };
    return { cls: best, reason: 'The highest class required by ' + found + ' fitted part(s) on your enlisted cars' };
  }

  // The enlisted car that carries a part above its own class, with the biggest step (first one on a tie), or null.
  // Only used for the explanation under "Parts up to class".
  function partAboveOwnClass(enlisted, upgrades) {
    if (!Array.isArray(enlisted) || !Array.isArray(upgrades)) return null;
    const byId = new Map();
    for (const u of upgrades) if (isObject(u) && u.complete === true) byId.set(u.id, u);
    let best = null;
    for (const e of enlisted) {
      if (!isObject(e) || e.is_removed === true || !Array.isArray(e.parts) || CLASS_RANK[e.class] === undefined) continue;
      for (const id of e.parts) {
        const u = byId.get(id);
        if (!u || CLASS_RANK[u.class_required] === undefined) continue;
        const step = CLASS_RANK[u.class_required] - CLASS_RANK[e.class];
        if (step > 0 && (best === null || step > best.step)) best = { carClass: e.class, partClass: u.class_required, step: step };
      }
    }
    return best === null ? null : { carClass: best.carClass, partClass: best.partClass };
  }

  // The best build of a car for a track under the model (section 1.3): per subcategory the part with the strictly
  // highest sum of weight * effect, or no part. Must give exactly what analys/gen_ref.py (est_js) gives.
  // Stage 2D-2: partsClass (optional) is the class that limits the parts; missing or not a class = the car's own class
  // (exactly the 2D behaviour). The status and the tolerance still come from the CAR's class.
  function estimateBestBuild(model, trackId, car, upgrades, partsClass) {
    const used = CLASSES.indexOf(partsClass) >= 0 ? partsClass
      : (isObject(car) && CLASSES.indexOf(car.class) >= 0 ? car.class : null);
    const blank = { state: 'UNKNOWN', reason: '', lap: null, parts: null, stats: null, validatedErrorPct: null, tolerancePct: null, surface: null, partsClass: used };
    if (!isObject(car) || car.complete !== true || CLASSES.indexOf(car.class) < 0 || !isObject(car.stats)) {
      return Object.assign(blank, { reason: 'Car data incomplete' });
    }
    if (!Array.isArray(upgrades)) return Object.assign(blank, { reason: 'Upgrade data not loaded' });
    const st = estimateStatus(model, trackId, car.class);
    if (st.state === 'UNKNOWN') {
      return Object.assign(blank, { reason: st.reason, validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface });
    }
    const t = modelTrack(model, trackId);
    if (!isObject(t.w) || !finiteNum(t.c)) return Object.assign(blank, { reason: 'Model data incomplete', validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface });
    const keys = Object.keys(t.w);
    const groups = new Map();
    for (const u of upgrades) {
      if (!isObject(u) || u.complete !== true || !classAllows(u.class_required, used)) continue;
      if (!groups.has(u.subcategory)) groups.set(u.subcategory, []);
      groups.get(u.subcategory).push(u);
    }
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = car.stats[k];
    const parts = [];
    for (const sub of Array.from(groups.keys()).sort(codeUnitCompare)) {
      const list = groups.get(sub).slice().sort(function (a, b) {
        return (a.cost.points - b.cost.points) || (a.cost.cash - b.cost.cash) || (a.id - b.id);
      });
      let bestScore = 0;
      let best = null;
      for (const u of list) {
        let s = 0;
        for (const k of keys) s += t.w[k] * u.effects[k];
        if (s > bestScore) { bestScore = s; best = u; }
      }
      if (best) {
        parts.push(best);
        for (const k of STAT_KEYS) stats[k] += best.effects[k];
      }
    }
    const r = lapFromStats(t, stats);
    if (r.lap === undefined) return Object.assign(blank, { reason: r.reason, stats: stats, validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface });
    return {
      state: st.state, reason: '', lap: r.lap, parts: parts, stats: stats,
      validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface, partsClass: used,
    };
  }

  // ---- STALE: the model against the stored records (never against new calls).
  // state: NO_RECORDS (nothing stored for track and class) | UNCHECKED (the model has no fitted lap) | CURRENT | STALE.
  function storedTrackRecords(store, cls, trackId) {
    const entry = store && store.classes ? store.classes[cls] : null;
    const t = entry && entry.tracks ? entry.tracks[String(trackId)] : null;
    return t && Array.isArray(t.records) ? t.records : null;
  }

  function staleCheck(model, store, trackId, cls) {
    const records = storedTrackRecords(store, cls, trackId);
    const top = records && records.length ? records[0] : null;
    const r = top && finiteNum(top.lap_time) && top.lap_time > 0 ? top.lap_time : null;
    if (r === null) {
      return {
        state: 'NO_RECORDS', recordLap: null, fittedLap: null, deviationPct: null,
        text: 'Records for car class ' + cls + ' on this track are not stored — the page cannot check whether the model is still current. Load them under Best car per track.',
      };
    }
    const t = modelTrack(model, trackId);
    const f = t && isObject(t.fittedRecordLap) ? t.fittedRecordLap[cls] : null;
    if (!finiteNum(f) || f <= 0) {
      return { state: 'UNCHECKED', recordLap: r, fittedLap: null, deviationPct: null,
        text: 'The model has no fitted record lap for car class ' + cls + ' on this track — the page cannot check whether it is still current.' };
    }
    const dev = (r / f - 1) * 100;
    if (Math.abs(dev) > STALE_THRESHOLD_PCT) {
      return { state: 'STALE', recordLap: r, fittedLap: f, deviationPct: dev,
        text: 'STALE — the record is now ' + r.toFixed(2) + ' s, the model was fitted on ' + f.toFixed(2) + ' s. Estimates may be off.' };
    }
    return { state: 'CURRENT', recordLap: r, fittedLap: f, deviationPct: dev, text: '' };
  }

  // Everything the status area of the section and of the explorer says for one track and class.
  function describeEstimate(model, store, trackId, cls) {
    const st = estimateStatus(model, trackId, cls);
    const out = {
      state: st.state, reason: st.reason, kind: 'bad', headline: '', text: '', errorLine: null, surfaceLine: null, infoLine: null,
      showTimes: st.state !== 'UNKNOWN', validatedErrorPct: st.validatedErrorPct, tolerancePct: st.tolerancePct, surface: st.surface, stale: null,
    };
    if (st.state === 'OK') { out.kind = 'ok'; out.headline = 'Estimate OK'; }
    else if (st.state === 'LOW_CONFIDENCE') { out.kind = 'warn'; out.headline = 'LOW CONFIDENCE'; }
    else out.headline = 'UNKNOWN — ' + st.reason;
    out.text = out.headline;
    if (st.validatedErrorPct !== null) {
      out.errorLine = 'Validated error on this track for car class ' + cls + ': ±' + st.validatedErrorPct.toFixed(2) + ' % · equal within ±' + st.tolerancePct.toFixed(2) + ' %';
    }
    if (st.surface !== null) out.surfaceLine = 'Surface used by the model on this track: ' + SURFACE_LABELS[st.surface];
    if (st.state !== 'UNKNOWN') {
      const stale = staleCheck(model, store, trackId, cls);
      out.stale = stale;
      if (stale.state === 'STALE') {
        out.kind = 'warn';
        out.text = out.headline + ' · ' + stale.text;
      } else if (stale.state === 'NO_RECORDS' || stale.state === 'UNCHECKED') out.infoLine = stale.text;
    }
    return out;
  }

  // Name of the part chosen in each key subcategory, or "no <subcategory>".
  function keyPartsText(parts) {
    return KEY_PART_SUBCATEGORIES.map(function (sub) {
      const p = (parts || []).find(function (x) { return x.subcategory === sub; });
      return p ? p.name : 'no ' + sub;
    }).join(' · ');
  }

  // The car's best stored record lap on one track and class (records are matched on the car model), or null.
  function storedRecordLapForCar(store, cls, trackId, carItemId) {
    const records = storedTrackRecords(store, cls, trackId);
    if (!records) return null;
    let best = null;
    for (const r of records) {
      if (r.car_item_id === carItemId && finiteNum(r.lap_time) && r.lap_time > 0 && (best === null || r.lap_time < best)) best = r.lap_time;
    }
    return best;
  }

  function pctOver(a, b) { return finiteNum(a) && finiteNum(b) && b > 0 ? (a / b - 1) * 100 : null; }

  // Your own best lap on a track in one enlisted car (race log), crashed races and races without a lap time left out.
  function ownCarTrackLaps(raceLogStore, enlistedId, trackId) {
    if (!raceLogStore) return null;
    let lap = null;
    let races = 0;
    for (const r of raceLogStore.races) {
      const o = r.own;
      if (!o || o.car_id !== enlistedId || r.track_id !== trackId || o.has_crashed === true) continue;
      const t = o.best_lap_time;
      if (!finiteNum(t) || !(t > 0)) continue;
      races++;
      if (lap === null || t < lap) lap = t;
    }
    return { lap: lap, races: races };
  }

  function byLapThenName(a, b) {
    if (a.lap === null) return b.lap === null ? (a.sortName.localeCompare(b.sortName) || a.id - b.id) : 1;
    if (b.lap === null) return -1;
    return (a.lap - b.lap) || a.sortName.localeCompare(b.sortName) || (a.id - b.id);
  }

  // The two tables of the section. input: {model, store (track records), trackId, cls (the CAR class), cars (racing/cars items),
  // upgrades, enlisted (items or null), raceLog (store or null), partsClass (stage 2D-2, optional: the class that limits the
  // parts of every best build; missing or null = each car's own class)}.
  function computeEstimateTables(input) {
    const desc = describeEstimate(input.model, input.store, input.trackId, input.cls);
    const out = { desc: desc, rows: [], own: { known: input.enlisted !== null && input.enlisted !== undefined, raceLogKnown: !!input.raceLog, rows: [] } };
    if (!desc.showTimes) return out;
    const owned = ownedCarItemIds(input.enlisted);
    const carsOfClass = (input.cars || []).filter(function (c) { return c.complete && c.class === input.cls; });
    const rows = carsOfClass.map(function (c) {
      const est = estimateBestBuild(input.model, input.trackId, c, input.upgrades, input.partsClass);
      return {
        id: c.car_item_id, sortName: c.car_item_name, name: c.car_item_name, est: est, lap: est.lap,
        vsFastestPct: null, within: null,
        recordLap: storedRecordLapForCar(input.store, input.cls, input.trackId, c.car_item_id),
        owns: owned === null ? 'UNKNOWN' : (owned.has(c.car_item_id) ? 'Yes' : 'No'),
        keyParts: est.parts ? keyPartsText(est.parts) : null,
      };
    }).sort(byLapThenName);
    const fastest = rows.length && rows[0].lap !== null ? rows[0].lap : null;
    for (const r of rows) {
      if (r.lap === null || fastest === null) continue;
      r.vsFastestPct = (r.lap / fastest - 1) * 100;
      r.within = r.vsFastestPct <= desc.tolerancePct;
    }
    out.rows = rows;

    if (out.own.known) {
      const baseById = new Map();
      for (const c of input.cars || []) baseById.set(c.car_item_id, c);
      out.own.rows = input.enlisted.filter(function (e) { return e.is_removed !== true && e.complete && e.class === input.cls; }).map(function (e) {
        const cur = estimateFromStats(input.model, input.trackId, input.cls, e.stats);
        const base = baseById.get(e.car_item_id) || null;
        const best = base ? estimateBestBuild(input.model, input.trackId, base, input.upgrades, input.partsClass)
          : Object.assign(unknownEstimate(estimateStatus(input.model, input.trackId, input.cls), 'Car not found in racing/cars', null), { parts: null });
        const laps = ownCarTrackLaps(input.raceLog, e.id, input.trackId);
        const name = (e.car_item_name === null ? 'UNKNOWN' : e.car_item_name) + (e.car_name ? ' (' + e.car_name + ')' : '');
        return {
          id: e.id, sortName: name, name: name, lap: cur.lap, current: cur, best: best,
          buildVsBestPct: pctOver(cur.lap, best.lap),
          bestLap: laps === null ? null : laps.lap, races: laps === null ? null : laps.races,
          vsEstimatePct: laps === null || laps.lap === null ? null : pctOver(laps.lap, cur.lap),
        };
      }).sort(byLapThenName);
    }
    return out;
  }

  // Estimates for the builds of the explorer. Sets build.est on every build and returns the summary line figures.
  function attachBuildEstimates(model, trackId, cls, builds) {
    const status = estimateStatus(model, trackId, cls);
    const ests = builds.map(function (b) { return estimateFromStats(model, trackId, cls, b.stats); });
    let min = null;
    for (const e of ests) if (e.lap !== null && (min === null || e.lap < min)) min = e.lap;
    let within = 0;
    builds.forEach(function (b, i) {
      const e = ests[i];
      if (e.lap === null || min === null) { b.est = { lap: null, vsBestPct: null, within: null, reason: e.reason }; return; }
      const vs = (e.lap / min - 1) * 100;
      const w = vs <= status.tolerancePct;
      if (w) within++;
      b.est = { lap: e.lap, vsBestPct: vs, within: w, reason: '' };
    });
    return { status: status, total: builds.length, within: within, tolerancePct: status.tolerancePct };
  }

  // The explorer warns when its Surface is not the one the model uses for the track.
  function surfaceWarning(model, trackId, explorerSurface) {
    const t = modelTrack(model, trackId);
    if (!t || t.unknown === true || (t.surface !== 'tarmac' && t.surface !== 'dirt') || t.surface === explorerSurface) return null;
    const want = SURFACE_LABELS[t.surface];
    return "This track's estimate uses " + want + '. Switch Surface to ' + want + ' to see the builds the estimate prefers.';
  }

  // ---------------------------------------------------------------- stage 3B: the other drivers' rows, which car on which track
  // Stored per finished race: car model, car class, position, crash flag, race time and best lap of every driver except the user.
  // Names and ids are dropped on arrival. The calculation below is the one in analys/bil-per-bana-3b.py, rule for rule.

  const STORE_RACE_FIELDS = STORAGE_PREFIX + 'raceFields';
  const FIELD_MIN_START = 15;     // starts of a car model on a track (among the other drivers) before it is shown
  const MIN_SHARED_RACES = 5;     // races in which both are present before a comparison counts
  const MIN_OWN_RACES = 5;        // own races with a known build before one of your cars is judged
  const BOOT_B = 2000;
  const BOOT_SEED = 7;
  const DIRT_MARGIN_PCT = 10;     // on dirt a model is clearly slower only when the whole interval is beyond this
  const FIELD_CLASS_ORDER = ['A', 'B', 'C', 'D', 'E'];

  // [car_item_id, car_class, position, has_crashed, race_time, best_lap_time]. A row without a car model is of no use and is dropped.
  function fieldRowFromApi(raw) {
    if (!isObject(raw)) return null;
    const car = intOrNull(raw.car_item_id);
    if (car === null) return null;
    return [car, classOrNull(raw.car_class), intOrNull(raw.position), boolOrNull(raw.has_crashed), lapOrNull(raw.race_time), lapOrNull(raw.best_lap_time)];
  }

  // The other drivers' rows of one race of user/races, or null when the race is not finished or the user's own row is not
  // found exactly once (then nothing is stored for the race). The user's row, names and ids never get into the rows.
  function extractOpponentRows(raw, ownId) {
    if (!isObject(raw) || raw.status !== 'finished' || !Array.isArray(raw.results)) return null;
    let mine = 0;
    const rows = [];
    for (const row of raw.results) {
      if (isObject(row) && row.driver_id === ownId) { mine++; continue; }
      const r = fieldRowFromApi(row);
      if (r) rows.push(r);
    }
    return mine === 1 ? rows : null;
  }

  function validFieldRow(r) {
    return Array.isArray(r) && r.length === 6 && Number.isInteger(r[0]) &&
      (r[1] === null || CLASSES.indexOf(r[1]) >= 0) && (r[2] === null || Number.isInteger(r[2])) &&
      (r[3] === null || typeof r[3] === 'boolean') && (r[4] === null || lapOrNull(r[4]) !== null) && (r[5] === null || lapOrNull(r[5]) !== null);
  }

  function makeRaceFieldsStore(userId, races, fetchedAtIso) {
    return { source: 'user/races', schemaVersion: SCHEMA_VERSION, userId: userId, fetchedAt: fetchedAtIso, races: races };
  }

  // Anything unexpected rejects the whole store; the rows can be fetched again.
  function restoreRaceFieldsStore(stored) {
    if (!isObject(stored) || stored.schemaVersion !== SCHEMA_VERSION || stored.source !== 'user/races') return null;
    if (!Number.isInteger(stored.userId) || stored.userId <= 0 || !stampOk(stored.fetchedAt) || !isObject(stored.races)) return null;
    const races = {};
    for (const id of Object.keys(stored.races)) {
      const rows = stored.races[id];
      if (!/^\d+$/.test(id) || !Array.isArray(rows) || !rows.every(validFieldRow)) return null;
      races[id] = rows.map(function (r) { return r.slice(); });
    }
    return makeRaceFieldsStore(stored.userId, races, stored.fetchedAt);
  }

  // entries: [{id, rows}]. A race that is already stored keeps its rows.
  function mergeRaceFields(existing, entries) {
    const races = Object.assign({}, existing);
    let added = 0;
    for (const e of entries) {
      const k = String(e.id);
      if (!Object.prototype.hasOwnProperty.call(races, k)) { races[k] = e.rows; added++; }
    }
    return { races: races, added: added };
  }

  // The largest start among the races that have stored rows; null when there are none or one of them is not in the race log.
  function maxFieldStart(ids, logRaces) {
    if (!ids.length) return null;
    const startById = new Map();
    for (const r of logRaces) startById.set(r.id, r.start);
    let m = null;
    for (const id of ids) {
      const s = startById.get(id);
      if (s === undefined) return null;
      if (m === null || s > m) m = s;
    }
    return m;
  }

  // ---- numbers: the generator of the reference script, the median, the resampling

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function medianOf(values) {
    const s = Float64Array.from(values).sort();
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function nearestRank(sorted, p) { return sorted[Math.ceil(p * sorted.length) - 1]; }

  function flatten(groups) {
    const flat = [];
    for (const g of groups) for (const x of g) flat.push(x);
    return flat;
  }

  // groups = one array of ln-ratios per race. Median and 95 % interval (resampling whole races), in percent (100 * ln).
  function bootstrapMedian(groups) {
    const n = groups.length;
    const rng = mulberry32(BOOT_SEED);
    const out = new Float64Array(BOOT_B);
    for (let b = 0; b < BOOT_B; b++) {
      const flat = [];
      for (let i = 0; i < n; i++) { const g = groups[Math.floor(rng() * n)]; for (let j = 0; j < g.length; j++) flat.push(g[j]); }
      out[b] = medianOf(flat);
    }
    out.sort();
    return { medianPct: 100 * medianOf(flatten(groups)), loPct: 100 * nearestRank(out, 0.025), hiPct: 100 * nearestRank(out, 0.975) };
  }

  // median(a) - median(b); one generator per comparison: in every round first the races of a, then the races of b.
  function bootstrapDifference(ga, gb) {
    const na = ga.length;
    const nb = gb.length;
    const rng = mulberry32(BOOT_SEED);
    const out = new Float64Array(BOOT_B);
    for (let b = 0; b < BOOT_B; b++) {
      const fa = [];
      const fb = [];
      for (let i = 0; i < na; i++) { const g = ga[Math.floor(rng() * na)]; for (let j = 0; j < g.length; j++) fa.push(g[j]); }
      for (let i = 0; i < nb; i++) { const g = gb[Math.floor(rng() * nb)]; for (let j = 0; j < g.length; j++) fb.push(g[j]); }
      out[b] = medianOf(fa) - medianOf(fb);
    }
    out.sort();
    const d = medianOf(flatten(ga)) - medianOf(flatten(gb));
    return { medianPct: 100 * d, loPct: 100 * nearestRank(out, 0.025), hiPct: 100 * nearestRank(out, 0.975) };
  }

  // The class most of the other drivers drive; a tie goes to the class that comes first in A, B, C, D, E; null without any class.
  function fieldClassOf(rows) {
    const counts = {};
    for (const r of rows) if (r[1] !== null) counts[r[1]] = (counts[r[1]] || 0) + 1;
    let best = null;
    for (const c of FIELD_CLASS_ORDER) if (counts[c] && (best === null || counts[c] > counts[best])) best = c;
    return best;
  }

  // ln(time of a / time of b) for every pair (row of model a, row of model b) of one race; neither crashed, both with a time.
  // One array per race; a race without a pair is left out.
  function pairGroups(entries, a, b) {
    const out = [];
    for (const e of entries) {
      const A = [];
      const B = [];
      for (const r of e.rows) {
        if (r[3] === true || r[4] === null) continue;
        if (r[0] === a) A.push(r[4]);
        else if (r[0] === b) B.push(r[4]);
      }
      const x = [];
      for (const p of A) for (const q of B) x.push(Math.log(p / q));
      if (x.length) out.push(x);
    }
    return out;
  }

  function enlistedDisplayName(e) {
    return (e.car_item_name === null || e.car_item_name === undefined ? 'UNKNOWN' : e.car_item_name) + (e.car_name ? ' (' + e.car_name + ')' : '');
  }

  // Everything that does not depend on the track: the races of the class, and for each of them whether the build of the car is known
  // (OBSERVED or DECLARED by the existing evaluateBuild, and equal to the car's latest snapshot).
  // input: {raceLog (races or store), raceFields ({raceId: rows}), snapshots, declared, enlisted (items or null), cars, tracks, model, cls,
  //         estimateAllowed (false = the lap-time estimate is blocked)}
  function prepareTrackAnswer(input) {
    const cls = input.cls;
    const logRaces = Array.isArray(input.raceLog) ? input.raceLog : (input.raceLog && Array.isArray(input.raceLog.races) ? input.raceLog.races : []);
    const fields = isObject(input.raceFields) ? input.raceFields : {};
    const snaps = input.snapshots || emptySnapshotStore();
    const declared = input.declared || emptyDeclaredStore();
    const enlistedKnown = Array.isArray(input.enlisted);
    const cars = enlistedKnown ? input.enlisted.filter(function (e) { return e.is_removed !== true; }) : [];
    const enlistedIds = new Set(cars.map(function (e) { return e.id; }));
    const entries = [];
    const byTrack = new Map();
    const ownRaces = {};
    let known = 0;
    for (const r of logRaces) {
      if (r.is_official !== true || r.track_id === null) continue;
      const rows = fields[String(r.id)];
      if (!Array.isArray(rows) || fieldClassOf(rows) !== cls) continue;
      let buildKnown = false;
      const o = r.own;
      if (o && o.car_id !== null && enlistedIds.has(o.car_id) && snaps.cars[String(o.car_id)]) {
        const list = snaps.cars[String(o.car_id)].slice().sort(function (a, b) { return Date.parse(a.t) - Date.parse(b.t); });
        const ev = evaluateBuild(r, list, declared.cars[String(o.car_id)] || null, enlistedIds);
        if ((ev.status === 'OBSERVED' || ev.status === 'DECLARED') && list.length) buildKnown = sameBuild(ev.build, list[list.length - 1]);
      }
      if (buildKnown) known++;
      // Stage 3C: the races of the class per enlisted car (crashed races included), and those among them with the car's build known.
      if (o && o.car_id !== null && enlistedIds.has(o.car_id)) {
        const k = String(o.car_id);
        if (!ownRaces[k]) ownRaces[k] = { races: 0, buildKnown: 0 };
        ownRaces[k].races++;
        if (buildKnown) ownRaces[k].buildKnown++;
      }
      const entry = { race: r, rows: rows, buildKnown: buildKnown };
      entries.push(entry);
      if (!byTrack.has(r.track_id)) byTrack.set(r.track_id, []);
      byTrack.get(r.track_id).push(entry);
    }
    const carNames = new Map();
    for (const c of input.cars || []) carNames.set(c.car_item_id, c.car_item_name);
    const trackList = (input.tracks || []).slice().sort(function (a, b) {
      return String(a.title === null ? '' : a.title).localeCompare(String(b.title === null ? '' : b.title)) || (a.id - b.id);
    });
    return {
      cls: cls, model: input.model, estimateAllowed: input.estimateAllowed !== false, enlistedKnown: enlistedKnown, cars: cars,
      carNames: carNames, trackList: trackList, byTrack: byTrack, racesInClass: entries.length, racesWithKnownBuild: known, ownRaces: ownRaces,
    };
  }

  // Stage 3C: best first. The ids of a group sorted on their median against the reference (rising); an id without a median ("not compared")
  // goes last, in id order; the same median puts the lower id first.
  function orderByMedian(ids, vsRef) {
    const med = function (id) { return vsRef && vsRef[id] && finiteNum(vsRef[id].medianPct) ? vsRef[id].medianPct : null; };
    return ids.slice().sort(function (a, b) {
      const ma = med(a);
      const mb = med(b);
      if (ma === null && mb === null) return a - b;
      if (ma === null) return 1;
      if (mb === null) return -1;
      return (ma - mb) || (a - b);
    });
  }

  function answerSurface(ctx, track) {
    const mt = modelTrack(ctx.model, track.id);
    if (mt && (mt.surface === 'tarmac' || mt.surface === 'dirt')) return mt.surface;
    return track.title === 'Mudpit' ? 'dirt' : null;
  }

  // The answer for one track: how the car models of the other drivers compare ("field"), and which of your cars to race ("own").
  function answerForTrack(ctx, track) {
    const entries = ctx.byTrack.get(track.id) || [];
    const surface = answerSurface(ctx, track);
    const out = { id: track.id, title: track.title, surface: surface, races: entries.length, field: null, own: null };

    const starts = new Map();
    for (const e of entries) for (const r of e.rows) starts.set(r[0], (starts.get(r[0]) || 0) + 1);
    let top = 0;
    for (const v of starts.values()) if (v > top) top = v;
    let ref = null;
    for (const [k, v] of starts) if (v === top && (ref === null || k < ref)) ref = k;
    if (ref === null || top < FIELD_MIN_START) {
      out.field = { label: 'UNKNOWN', reason: 'Too few races' };
      out.own = { label: 'UNKNOWN', reason: 'Too few races' };
      return out;
    }
    const shown = Array.from(starts.keys()).filter(function (k) { return starts.get(k) >= FIELD_MIN_START; }).sort(numericAsc);
    const vs = new Map();
    for (const m of shown) {
      if (m === ref) { vs.set(m, { medianPct: 0, ref: true }); continue; }
      const g = pairGroups(entries, m, ref);
      if (g.length >= MIN_SHARED_RACES) vs.set(m, Object.assign(bootstrapMedian(g), { races: g.length }));
    }
    let best = null;
    for (const [m, v] of vs) if (best === null || v.medianPct < vs.get(best).medianPct || (v.medianPct === vs.get(best).medianPct && m < best)) best = m;
    const margin = surface === 'dirt' ? DIRT_MARGIN_PCT : 0;
    const group = [best];
    const direct = {};
    let marginDecided = false;
    for (const m of shown) {
      if (m === best) continue;
      const g = pairGroups(entries, best, m);
      if (g.length < MIN_SHARED_RACES) { group.push(m); direct[m] = { races: g.length, compared: false }; continue; }
      const d = bootstrapMedian(g);
      const clear = d.hiPct < -margin;
      // On dirt the margin decided when the interval is under zero (a clear difference on tarmac) but not beyond the margin.
      if (!clear && margin > 0 && d.hiPct < 0) marginDecided = true;
      direct[m] = { races: g.length, compared: true, medianPct: d.medianPct, loPct: d.loPct, hiPct: d.hiPct, clearlySlower: clear };
      if (!clear) group.push(m);
    }
    const fieldVs = {};
    for (const [m, v] of vs) fieldVs[m] = v;
    const startsOut = {};
    for (const k of Array.from(starts.keys()).sort(numericAsc)) startsOut[k] = starts.get(k);
    out.field = {
      label: shown.length === 1 ? 'ONLY_ONE' : (group.length === 1 ? 'Clear' : 'Close'),
      ref: ref, best: best, group: group.slice().sort(numericAsc), starts: startsOut, shown: shown, vsRef: fieldVs,
      notVsRef: shown.filter(function (m) { return !vs.has(m); }), direct: direct, margin: margin, marginDecided: marginDecided,
    };
    out.field.ordered = out.field.label === 'ONLY_ONE' ? shown.slice() : orderByMedian(out.field.group, fieldVs);

    // ---- your cars
    const own = new Map();
    for (const e of entries) {
      const o = e.race.own;
      if (!e.buildKnown || !o || o.has_crashed === true || lapOrNull(o.race_time) === null) continue;
      const x = [];
      for (const r of e.rows) if (r[0] === ref && r[3] !== true && r[4] !== null) x.push(Math.log(o.race_time / r[4]));
      if (!x.length) continue;
      if (!own.has(o.car_id)) own.set(o.car_id, []);
      own.get(o.car_id).push(x);
    }
    const racesPerCar = {};
    for (const id of Array.from(own.keys()).sort(numericAsc)) racesPerCar[id] = own.get(id).length;
    const qualified = Array.from(own.keys()).filter(function (id) { return own.get(id).length >= MIN_OWN_RACES; }).sort(numericAsc);
    const mine = { racesPerCar: racesPerCar, qualified: qualified };
    if (!ctx.enlistedKnown) {
      mine.label = 'UNKNOWN';
      mine.reason = 'user/enlistedcars is not loaded';
    } else if (qualified.length) {
      const meds = new Map();
      for (const id of qualified) meds.set(id, bootstrapMedian(own.get(id)));
      let b = null;
      for (const id of qualified) if (b === null || meds.get(id).medianPct < meds.get(b).medianPct) b = id;
      const g = [b];
      const diffs = {};
      for (const id of qualified) {
        if (id === b) continue;
        const d = bootstrapDifference(own.get(b), own.get(id));
        diffs[id] = { medianDiffPct: d.medianPct, loPct: d.loPct, hiPct: d.hiPct };
        if (!(d.hiPct < 0)) g.push(id);
      }
      const vsRefOwn = {};
      for (const id of qualified) vsRefOwn[id] = { medianPct: meds.get(id).medianPct, loPct: meds.get(id).loPct, hiPct: meds.get(id).hiPct, races: own.get(id).length };
      mine.label = qualified.length === 1 ? 'ONLY_ONE' : (g.length === 1 ? 'Clear' : 'Close');
      mine.best = b;
      mine.group = g.slice().sort(numericAsc);
      mine.vsRef = vsRefOwn;
      mine.ordered = mine.label === 'ONLY_ONE' ? [b] : orderByMedian(mine.group, vsRefOwn);
      if (Object.keys(diffs).length) mine.diffs = diffs;
    } else {
      mine.label = 'ESTIMATE_ONLY';
      const est = ctx.estimateAllowed ? estimateOwnCars(ctx, track.id) : null;
      if (est === null) { mine.label = 'UNKNOWN'; mine.reason = ctx.estimateAllowed ? 'No lap-time estimate for this track' : 'The lap-time estimate is blocked'; }
      else { mine.estimate = est; mine.ordered = est.cars; }
    }
    out.own = mine;
    return out;
  }

  // The lap-time estimate of each of your cars (current stats, this track, the chosen class); the fastest and all within the tolerance.
  // null when the estimate is UNKNOWN for the track or no car has one.
  function estimateOwnCars(ctx, trackId) {
    const st = estimateStatus(ctx.model, trackId, ctx.cls);
    if (st.state === 'UNKNOWN') return null;
    const laps = [];
    for (const e of ctx.cars) {
      const stats = isObject(e.stats) ? e.stats : readStats(e);
      const est = estimateFromStats(ctx.model, trackId, ctx.cls, stats);
      if (est.lap !== null) laps.push({ id: e.id, lap: est.lap, name: enlistedDisplayName(e) });
    }
    if (!laps.length) return null;
    laps.sort(function (a, b) { return (a.lap - b.lap) || a.name.localeCompare(b.name) || (a.id - b.id); });
    const fastest = laps[0].lap;
    const within = laps.filter(function (c) { return (c.lap / fastest - 1) * 100 <= st.tolerancePct; });
    return { tolerancePct: st.tolerancePct, cars: within.map(function (c) { return c.id; }), laps: laps };
  }

  function computeTrackAnswer(input) {
    const ctx = prepareTrackAnswer(input);
    const tracks = {};
    for (const t of ctx.trackList) tracks[t.id] = answerForTrack(ctx, t);
    return {
      cls: ctx.cls, racesInClass: ctx.racesInClass, racesWithKnownBuild: ctx.racesWithKnownBuild, ownRaces: ctx.ownRaces,
      order: ctx.trackList.map(function (t) { return t.id; }), tracks: tracks,
    };
  }

  // ---------------------------------------------------------------- stage 3C: My cars (only reads what stage 3B already calculates)

  const CAR_CLASS_ORDER = ['A', 'B', 'C', 'D', 'E'];

  // input: {enlisted (items or null), verification (verifyModel result), snapshots, declared, answer (computeTrackAnswer result or null),
  //         cars (racing/cars items), cls}
  // One card per enlisted car that is not removed: class A–E (unknown last), then display name, then id.
  function computeMyCars(input) {
    const cls = input.cls;
    if (!Array.isArray(input.enlisted)) return { cls: cls, state: 'NO_ENLISTED', removed: 0, cars: [] };
    const answer = input.answer || null;
    const snaps = input.snapshots || emptySnapshotStore();
    const declared = input.declared || emptyDeclaredStore();
    const verifyCards = new Map();
    if (input.verification && Array.isArray(input.verification.cars)) for (const c of input.verification.cars) verifyCards.set(c.id, c);
    const modelNames = new Map();
    for (const c of input.cars || []) modelNames.set(c.car_item_id, c.car_item_name);

    const removed = input.enlisted.filter(function (e) { return e.is_removed === true; }).length;
    const shownCars = input.enlisted.filter(function (e) { return e.is_removed !== true; });
    shownCars.sort(function (a, b) {
      const ra = CAR_CLASS_ORDER.indexOf(a.class);
      const rb = CAR_CLASS_ORDER.indexOf(b.class);
      return ((ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb)) || enlistedDisplayName(a).localeCompare(enlistedDisplayName(b)) || (a.id - b.id);
    });

    const cards = shownCars.map(function (e) {
      const v = verifyCards.get(e.id) || null;
      let statModel = 'MISMATCH_OR_UNKNOWN';
      if (v && v.fitted && v.allMatch) statModel = 'MATCH';
      else if (v && v.partsKnown && !v.fitted) statModel = 'NO_PARTS';
      const partsKnown = !!v && v.partsKnown && v.unknownPartIds.length === 0;
      const list = snaps.cars[String(e.id)];
      let seen = null;
      if (Array.isArray(list)) for (const s of list) if (seen === null || Date.parse(s.t) > Date.parse(seen)) seen = s.t;
      const decl = declared.cars[String(e.id)];
      const card = {
        id: e.id, name: enlistedDisplayName(e), carItemId: e.car_item_id,
        modelName: modelNames.has(e.car_item_id) && modelNames.get(e.car_item_id) !== null ? modelNames.get(e.car_item_id) : e.car_item_name,
        class: e.class, stats: readStats(e.stats), statModel: statModel,
        keyParts: partsKnown ? keyPartsText(v.parts) : null,
        partsCount: v && v.partsKnown ? v.parts.length + v.unknownPartIds.length : null,
        declared: decl ? decl.value : null, buildSeen: seen,
        torn: { entered: e.races_entered, won: e.races_won },
        racesInClass: null, racesBuildKnown: null, picks: null, modelBest: null,
      };
      if (answer === null) return card;
      const own = answer.ownRaces && answer.ownRaces[String(e.id)];
      card.racesInClass = own ? own.races : 0;
      card.racesBuildKnown = own ? own.buildKnown : 0;
      card.picks = { Clear: [], Close: [], ONLY_ONE: [], ESTIMATE_ONLY: [] };
      card.modelBest = { Clear: [], Close: [], ONLY_ONE: [] };
      const without = function (list2, x) { return list2.filter(function (y) { return y !== x; }); };
      for (const tid of answer.order) {
        const t = answer.tracks[tid];
        if (!t) continue;
        const o = t.own;
        const f = t.field;
        if (o && (o.label === 'Clear' || o.label === 'Close') && o.group.indexOf(e.id) >= 0) card.picks[o.label].push({ track: tid, with: without(o.ordered, e.id) });
        else if (o && o.label === 'ONLY_ONE' && o.best === e.id) card.picks.ONLY_ONE.push({ track: tid, with: [] });
        else if (o && o.label === 'ESTIMATE_ONLY' && o.estimate.cars.indexOf(e.id) >= 0) card.picks.ESTIMATE_ONLY.push({ track: tid, with: without(o.estimate.cars, e.id) });
        if (e.car_item_id !== null && f) {
          if ((f.label === 'Clear' || f.label === 'Close') && f.group.indexOf(e.car_item_id) >= 0) card.modelBest[f.label].push({ track: tid, with: without(f.ordered, e.car_item_id) });
          else if (f.label === 'ONLY_ONE' && f.shown.indexOf(e.car_item_id) >= 0) card.modelBest.ONLY_ONE.push({ track: tid, with: [] });
        }
      }
      return card;
    });
    return { cls: cls, state: 'OK', removed: removed, cars: cards };
  }

  // ---------------------------------------------------------------- logging

  // Silent unless enabled. Every line is prefixed [KSRL] and passed through redact().
  function createLogger(options) {
    const sink = options && options.sink ? options.sink : function () {};
    let enabled = false;
    const secrets = [];
    function redact(text) {
      let out = String(text);
      for (const s of secrets) out = out.split(s).join('[REDACTED]');
      out = out.replace(/ApiKey\s+[A-Za-z0-9]+/g, 'ApiKey [REDACTED]');
      out = out.replace(/([?&]key=)[^&\s"']*/gi, '$1[REDACTED]');
      return out;
    }
    function format(arg) {
      if (typeof arg === 'string') return arg;
      try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }
    return {
      setEnabled: function (on) { enabled = !!on; },
      addSecret: function (s) { if (typeof s === 'string' && s.length >= 4 && secrets.indexOf(s) < 0) secrets.push(s); },
      redact: redact,
      debug: function () {
        if (!enabled) return;
        const parts = [];
        for (let i = 0; i < arguments.length; i++) parts.push(format(arguments[i]));
        sink(redact('[KSRL] ' + parts.join(' ')));
      },
    };
  }

  // ---------------------------------------------------------------- API client

  function isValidKeyFormat(key) { return typeof key === 'string' && /^[A-Za-z0-9]{16}$/.test(key); }

  function classifyErrorCode(code) {
    if (KEY_FATAL_CODES.indexOf(code) >= 0) return 'KEY_FATAL';
    if (RETRY_LATER_CODES.indexOf(code) >= 0) return 'RETRY_LATER';
    if (code === ACCESS_LEVEL_CODE) return 'ACCESS_LEVEL';
    return 'OTHER';
  }

  function selectionUrl(selection) { return API_BASE + selection + '?comment=' + API_COMMENT; }

  function racesUrl(from) {
    return API_BASE + 'user/races?sort=ASC&limit=' + RACE_PAGE_LIMIT +
      (Number.isInteger(from) ? '&from=' + from : '') + '&comment=' + API_COMMENT;
  }

  const RACE_PARTIAL_MESSAGE = 'Race log partly loaded — press Load data again in a minute';
  const MAX_RACE_PAGES_PER_LOAD = 1000;

  // One request at a time. A new loadAll() aborts the running one, and a superseded run can
  // never deliver anything. With options.raceLog the four selections are followed by user/basic
  // (the user's own Torn ID) and user/races; _metadata.links is never read, and every page is
  // requested by building the URL here with `from`.
  function createApiClient(deps) {
    const fetchImpl = deps.fetchImpl;
    const logger = deps.logger || createLogger();
    const now = deps.now || function () { return Date.now(); };
    const Abort = deps.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);
    const budget = Number.isInteger(deps.budgetPerMinute) ? deps.budgetPerMinute : LOCAL_CALL_BUDGET_PER_MINUTE;
    let generation = 0;
    let controller = null;
    const blockedKeys = new Set();
    let callTimes = [];

    function budgetLeft() {
      const cutoff = now() - 60000;
      callTimes = callTimes.filter(function (t) { return t > cutoff; });
      return callTimes.length < budget;
    }

    // Aborts a running load without starting a new one.
    function cancel() {
      generation++;
      if (controller) { controller.abort(); controller = null; }
    }

    // One call. Returns {type}: JSON (with .json), STALE, BUDGET, ACCESS (note already made)
    // or STOP (run.result.outcome and the note already set). `run` is {result, stale, signal, note} of the running load.
    function makeRequester(key, run) {
      const result = run.result;
      const stale = run.stale;
      const signal = run.signal;
      const note = run.note;
      return async function request(selection, url) {
        if (stale()) return { type: 'STALE' };
        if (!budgetLeft()) return { type: 'BUDGET' };
        logger.debug('request', selection, url);
        callTimes.push(now());
        result.callsMade++;
        let res;
        let json = null;
        try {
          res = await fetchImpl(url, {
            method: 'GET',
            headers: { Authorization: 'ApiKey ' + key, Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: signal,
          });
          if (stale()) return { type: 'STALE' };
          try { json = await res.json(); } catch (e) { json = null; }
        } catch (err) {
          if (stale()) return { type: 'STALE' };
          logger.debug('network failure', selection, err && err.name ? err.name : 'error');
          result.outcome = 'ERROR';
          result.message = 'Network error — could not reach api.torn.com.';
          note(selection, 'err', result.message);
          return { type: 'STOP' };
        }
        if (stale()) return { type: 'STALE' };
  
        if (isObject(json) && isObject(json.error)) {
          const code = intOrNull(json.error.code);
          const apiText = strOrNull(json.error.error) || '';
          const kind = classifyErrorCode(code);
          logger.debug('api error', selection, 'code', code, kind);
          if (kind === 'KEY_FATAL') {
            blockedKeys.add(key);
            result.outcome = 'KEY_NOT_USABLE';
            result.errorCode = code;
            result.message = 'Key not usable (Torn error ' + code + (apiText ? ': ' + apiText : '') + '). No further calls will be made with this key.';
            note(selection, 'err', result.message);
            return { type: 'STOP' };
          }
          if (kind === 'RETRY_LATER') {
            result.outcome = 'TRY_AGAIN_LATER';
            result.errorCode = code;
            result.message = 'Try again later (Torn error ' + code + (apiText ? ': ' + apiText : '') + ').';
            note(selection, 'err', result.message);
            return { type: 'STOP' };
          }
          if (kind === 'ACCESS_LEVEL') {
            note(selection, 'err', 'Access level too low (Torn error 16). The key needs ' + selection.replace('/', ' → ') + '.');
            return { type: 'ACCESS' };
          }
          result.outcome = 'ERROR';
          result.errorCode = code;
          result.message = 'Torn API error ' + (code === null ? 'UNKNOWN' : code) + (apiText ? ': ' + apiText : '') + '.';
          note(selection, 'err', result.message);
          return { type: 'STOP' };
        }
        if (!res || !res.ok) {
          result.outcome = 'ERROR';
          result.message = 'Request failed (HTTP ' + (res && Number.isInteger(res.status) ? res.status : 'UNKNOWN') + ').';
          note(selection, 'err', result.message);
          return { type: 'STOP' };
        }
        return { type: 'JSON', json: json };
      };
    }

    async function loadAll(key, handlers, options) {
      const h = handlers || {};
      const onDataset = h.onDataset || function () {};
      const onSelection = h.onSelection || function () {};
      const onOwnId = h.onOwnId || function () {};
      const onRaces = h.onRaces || function () {};
      const onFields = h.onFields || function () {};
      const raceOpts = options && options.raceLog ? options.raceLog : null;
      const result = {
        outcome: 'OK', message: '', callsMade: 0, selections: {},
        raceLog: { state: raceOpts ? 'NOT_RUN' : 'NOT_REQUESTED', pages: 0, added: 0, fieldsAdded: 0, unfinished: 0, invalid: 0, message: '' },
      };
      if (!isValidKeyFormat(key)) {
        result.outcome = 'INVALID_KEY_FORMAT';
        result.message = 'Enter a 16-character Torn API key.';
        return result;
      }
      logger.addSecret(key);
      if (blockedKeys.has(key)) {
        result.outcome = 'KEY_NOT_USABLE';
        result.message = 'Key not usable — Torn rejected this key earlier. Enter a different key.';
        return result;
      }
      const myGen = ++generation;
      if (controller) controller.abort();
      controller = Abort ? new Abort() : null;
      const signal = controller ? controller.signal : undefined;
      const stale = function () { return myGen !== generation; };
      const note = function (selection, kind, text) {
        result.selections[selection] = { kind: kind, text: text };
        if (!stale()) onSelection(selection, { kind: kind, text: text });
      };

      const request = makeRequester(key, { result: result, stale: stale, signal: signal, note: note });

      for (const selection of SELECTIONS) {
        const r = await request(selection, selectionUrl(selection));
        if (r.type === 'STALE') { result.outcome = 'STALE'; return result; }
        if (r.type === 'BUDGET') {
          result.outcome = 'TRY_AGAIN_LATER';
          result.message = 'Try again later — local request budget reached (' + budget + ' calls per minute).';
          note(selection, 'err', result.message);
          return result;
        }
        if (r.type === 'STOP') return result;
        if (r.type === 'ACCESS') continue;
        const record = makeDatasetRecord(selection, r.json, new Date(now()).toISOString());
        if (!record) {
          note(selection, 'err', 'Unexpected response shape — dataset not used.');
          continue;
        }
        logger.debug('loaded', selection, record.items.length, 'records');
        if (stale()) { result.outcome = 'STALE'; return result; }
        onDataset(record);
        note(selection, 'ok', 'Loaded');
      }
      if (!raceOpts) return result;

      // ---- race log: own Torn ID first, then races from the stored cursor onwards.
      const rl = result.raceLog;
      const partial = function () {
        rl.state = 'PARTIAL';
        rl.message = RACE_PARTIAL_MESSAGE;
        note('user/races', 'warn', RACE_PARTIAL_MESSAGE);
      };

      const b = await request('user/basic', selectionUrl('user/basic'));
      if (b.type === 'STALE') { result.outcome = 'STALE'; return result; }
      if (b.type === 'BUDGET') { partial(); return result; }
      if (b.type === 'STOP') { rl.state = 'ERROR'; return result; }
      if (b.type === 'ACCESS') { rl.state = 'ERROR'; return result; }
      const ownId = isObject(b.json) && isObject(b.json.profile) ? intOrNull(b.json.profile.id) : null;
      if (ownId === null || ownId <= 0) {
        note('user/basic', 'err', 'Unexpected response shape — your Torn ID is missing, so the race log was not loaded.');
        rl.state = 'NO_ID';
        return result;
      }
      note('user/basic', 'ok', 'Loaded');
      // Races stored for another Torn ID are never mixed with this one's.
      const reset = Number.isInteger(raceOpts.userId) && raceOpts.userId !== ownId;
      // Stage 3B: with options.raceLog.fields ({userId, ids}) the other drivers' rows are fetched too. A race counts as new on a page
      // when it is missing in the race log or, if it has rows to store, in the stored rows. The cursor is the smaller of the two largest
      // starts; without stored rows (or with one that is not in the race log) the races are fetched from the beginning.
      const fieldsOn = !!raceOpts.fields;
      const fieldsReset = fieldsOn && Number.isInteger(raceOpts.fields.userId) && raceOpts.fields.userId !== ownId;
      onOwnId(ownId, { reset: reset, fieldsReset: fieldsReset });
      let all = reset ? [] : (raceOpts.stored || []).slice();
      const known = new Set(all.map(function (r) { return r.id; }));
      const knownFields = new Set(fieldsOn && !fieldsReset ? (raceOpts.fields.ids || []) : []);
      let cursor = maxStart(all);
      if (fieldsOn) {
        const fieldsMax = maxFieldStart(Array.from(knownFields), all);
        cursor = cursor === null || fieldsMax === null ? null : Math.min(cursor, fieldsMax);
      }

      for (let page = 0; page < MAX_RACE_PAGES_PER_LOAD; page++) {
        const r = await request('user/races', racesUrl(cursor));
        if (r.type === 'STALE') { result.outcome = 'STALE'; return result; }
        if (r.type === 'BUDGET') { partial(); return result; }
        if (r.type === 'STOP') { rl.state = result.outcome === 'TRY_AGAIN_LATER' ? 'PARTIAL' : 'ERROR'; return result; }
        if (r.type === 'ACCESS') { rl.state = 'ERROR'; return result; }
        const json = r.json;
        if (!isObject(json) || !Array.isArray(json.races)) {
          note('user/races', 'err', 'Unexpected response shape — race page not used.');
          rl.state = 'ERROR';
          return result;
        }
        rl.pages++;
        const fresh = [];
        const freshFields = [];
        let newOnPage = 0;
        let pageMax = null;
        for (const raw of json.races) {
          const red = reduceApiRace(raw, ownId);
          if (red.kind === 'finished') {
            if (pageMax === null || red.race.start > pageMax) pageMax = red.race.start;
            const newLog = !known.has(red.race.id);
            const rows = fieldsOn ? extractOpponentRows(raw, ownId) : null;
            const newFields = rows !== null && !knownFields.has(red.race.id);
            if (newLog) { known.add(red.race.id); fresh.push(red.race); }
            if (newFields) { knownFields.add(red.race.id); freshFields.push({ id: red.race.id, rows: rows }); }
            if (newLog || newFields) newOnPage++;
          } else if (red.kind === 'unfinished') rl.unfinished++;
          else rl.invalid++;
        }
        logger.debug('races page', rl.pages, 'returned', json.races.length, 'new', newOnPage);
        if (fresh.length) {
          all = all.concat(fresh);
          rl.added += fresh.length;
          onRaces(fresh, { ownId: ownId, page: rl.pages });
        }
        if (freshFields.length) {
          rl.fieldsAdded += freshFields.length;
          onFields(freshFields, { ownId: ownId, page: rl.pages });
        }
        if (json.races.length < RACE_PAGE_LIMIT || newOnPage === 0) { rl.state = 'COMPLETE'; break; }
        const next = pageMax === null ? null : (cursor === null ? pageMax : Math.max(cursor, pageMax));
        if (next === null || next === cursor) {
          rl.state = 'ERROR';
          rl.message = 'Race log may be incomplete — could not move past the last start time.';
          note('user/races', 'err', rl.message);
          return result;
        }
        cursor = next;
      }
      if (rl.state === 'NOT_RUN') {
        rl.state = 'PARTIAL';
        rl.message = RACE_PARTIAL_MESSAGE;
        note('user/races', 'warn', RACE_PARTIAL_MESSAGE);
        return result;
      }
      note('user/races', 'ok', 'Loaded');
      return result;
    }

    // Stage 2C. One racing/{trackId}/records call per track that is not stored yet for the class, one at a time,
    // through the same requester, key blocking and call budget as loadAll. haveIds is the set of track ids already
    // skipped (stored, or already refreshed in the running refresh). A track is delivered only when its answer is valid.
    // Nothing here runs unless the user pressed a button.
    async function loadRecords(key, cls, trackIds, haveIds, handlers, options) {
      const h = handlers || {};
      const partialMessage = options && options.partialMessage ? options.partialMessage : RECORDS_PARTIAL_MESSAGE;
      const onTrackRecords = h.onTrackRecords || function () {};
      const onTrackNote = h.onTrackNote || function () {};
      const result = { outcome: 'OK', message: '', callsMade: 0, loaded: 0, failed: 0, alreadyStored: 0, remaining: 0 };
      if (!isValidKeyFormat(key)) {
        result.outcome = 'INVALID_KEY_FORMAT';
        result.message = 'Enter a 16-character Torn API key.';
        return result;
      }
      if (CLASSES.indexOf(cls) < 0) {
        result.outcome = 'ERROR';
        result.message = 'Unknown class.';
        return result;
      }
      logger.addSecret(key);
      if (blockedKeys.has(key)) {
        result.outcome = 'KEY_NOT_USABLE';
        result.message = 'Key not usable — Torn rejected this key earlier. Enter a different key.';
        return result;
      }
      const myGen = ++generation;
      if (controller) controller.abort();
      controller = Abort ? new Abort() : null;
      const signal = controller ? controller.signal : undefined;
      const stale = function () { return myGen !== generation; };
      let current = null;
      const note = function (selection, kind, text) {
        if (current !== null && !stale()) onTrackNote(current, { kind: kind, text: text });
      };
      const request = makeRequester(key, { result: result, stale: stale, signal: signal, note: note });
      const have = haveIds || new Set();
      const todo = trackIds.filter(function (id) { return !have.has(id); });
      result.alreadyStored = trackIds.length - todo.length;
      for (let i = 0; i < todo.length; i++) {
        current = todo[i];
        const r = await request('racing/records', recordsUrl(current, cls));
        if (r.type === 'STALE') { result.outcome = 'STALE'; return result; }
        if (r.type === 'BUDGET') {
          result.outcome = 'PARTIAL';
          result.message = partialMessage;
          result.remaining = todo.length - i;
          return result;
        }
        if (r.type === 'STOP') { result.remaining = todo.length - i; return result; }
        if (r.type === 'ACCESS') { result.failed++; continue; }
        const records = reduceRecordsResponse(r.json);
        if (records === null) {
          note('racing/records', 'err', 'Unexpected response shape — records not used.');
          result.failed++;
          continue;
        }
        if (stale()) { result.outcome = 'STALE'; return result; }
        logger.debug('loaded records', cls, current, records.length);
        onTrackRecords(current, records, new Date(now()).toISOString());
        result.loaded++;
      }
      return result;
    }

    return { loadAll: loadAll, loadRecords: loadRecords, cancel: cancel, isBlocked: function (key) { return blockedKeys.has(key); } };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_PREFIX: STORAGE_PREFIX,
    API_BASE: API_BASE,
    TORN_RATE_LIMIT_PER_MINUTE: TORN_RATE_LIMIT_PER_MINUTE,
    LOCAL_CALL_BUDGET_PER_MINUTE: LOCAL_CALL_BUDGET_PER_MINUTE,
    SELECTIONS: SELECTIONS,
    STAT_KEYS: STAT_KEYS,
    OBJECTIVE_BASE: OBJECTIVE_BASE,
    DOMINANCE_KEYS: DOMINANCE_KEYS,
    CLASSES: CLASSES,
    MAX_COMBINATIONS: MAX_COMBINATIONS,
    validateDataset: validateDataset,
    makeDatasetRecord: makeDatasetRecord,
    restoreDatasetRecord: restoreDatasetRecord,
    computeFinalStats: computeFinalStats,
    verifyModel: verifyModel,
    explorerGate: explorerGate,
    classAllows: classAllows,
    nonDominatedOptions: nonDominatedOptions,
    buildPlan: buildPlan,
    createEnumerator: createEnumerator,
    startExploration: startExploration,
    runExplorer: runExplorer,
    sortBuilds: sortBuilds,
    csvCell: csvCell,
    buildsToCsv: buildsToCsv,
    createLogger: createLogger,
    isValidKeyFormat: isValidKeyFormat,
    classifyErrorCode: classifyErrorCode,
    selectionUrl: selectionUrl,
    createApiClient: createApiClient,
    // stage 2A
    RACE_SELECTIONS: RACE_SELECTIONS,
    RACE_PAGE_LIMIT: RACE_PAGE_LIMIT,
    RACE_PARTIAL_MESSAGE: RACE_PARTIAL_MESSAGE,
    STORE_RACE_LOG: STORE_RACE_LOG,
    STORE_SNAPSHOTS: STORE_SNAPSHOTS,
    STORE_DECLARED: STORE_DECLARED,
    DATA_SUFFICIENCY: DATA_SUFFICIENCY,
    racesUrl: racesUrl,
    reduceApiRace: reduceApiRace,
    mergeRaces: mergeRaces,
    makeRaceLogStore: makeRaceLogStore,
    restoreRaceLogStore: restoreRaceLogStore,
    emptySnapshotStore: emptySnapshotStore,
    restoreSnapshotStore: restoreSnapshotStore,
    applySnapshots: applySnapshots,
    emptyDeclaredStore: emptyDeclaredStore,
    restoreDeclaredStore: restoreDeclaredStore,
    isValidDeclaredDate: isValidDeclaredDate,
    setDeclared: setDeclared,
    clearDeclared: clearDeclared,
    evaluateBuild: evaluateBuild,
    buildRaceRows: buildRaceRows,
    sortRaceRows: sortRaceRows,
    raceLogSummary: raceLogSummary,
    formatTct: formatTct,
    computeSufficiency: computeSufficiency,
    computeChecks: computeChecks,
    // stage 3B
    STORE_RACE_FIELDS: STORE_RACE_FIELDS,
    FIELD_MIN_START: FIELD_MIN_START,
    MIN_SHARED_RACES: MIN_SHARED_RACES,
    MIN_OWN_RACES: MIN_OWN_RACES,
    BOOT_B: BOOT_B,
    BOOT_SEED: BOOT_SEED,
    DIRT_MARGIN_PCT: DIRT_MARGIN_PCT,
    extractOpponentRows: extractOpponentRows,
    makeRaceFieldsStore: makeRaceFieldsStore,
    restoreRaceFieldsStore: restoreRaceFieldsStore,
    mergeRaceFields: mergeRaceFields,
    mulberry32: mulberry32,
    fieldClassOf: fieldClassOf,
    enlistedDisplayName: enlistedDisplayName,
    prepareTrackAnswer: prepareTrackAnswer,
    answerForTrack: answerForTrack,
    computeTrackAnswer: computeTrackAnswer,
    // stage 3C
    computeMyCars: computeMyCars,
    orderByMedian: orderByMedian,
    // stage 2C
    STORE_RECORDS: STORE_RECORDS,
    RECORDS_PER_TRACK: RECORDS_PER_TRACK,
    RECORDS_PARTIAL_MESSAGE: RECORDS_PARTIAL_MESSAGE,
    REFRESH_PARTIAL_MESSAGE: REFRESH_PARTIAL_MESSAGE,
    recordsUrl: recordsUrl,
    reduceRecordsResponse: reduceRecordsResponse,
    emptyRecordsStore: emptyRecordsStore,
    restoreRecordsStore: restoreRecordsStore,
    applyTrackRecords: applyTrackRecords,
    storedRecordTrackIds: storedRecordTrackIds,
    ownedCarItemIds: ownedCarItemIds,
    showBuildsTarget: showBuildsTarget,
    ownBestLaps: ownBestLaps,
    ownRacesByTrackAndClass: ownRacesByTrackAndClass,
    computeBestCarTable: computeBestCarTable,
    // stage 2D
    LAP_MODEL: LAP_MODEL,
    STALE_THRESHOLD_PCT: STALE_THRESHOLD_PCT,
    estimateStatus: estimateStatus,
    estimateBestBuild: estimateBestBuild,
    partsClassFromEnlisted: partsClassFromEnlisted,
    partAboveOwnClass: partAboveOwnClass,
    estimateFromStats: estimateFromStats,
    staleCheck: staleCheck,
    describeEstimate: describeEstimate,
    keyPartsText: keyPartsText,
    computeEstimateTables: computeEstimateTables,
    attachBuildEstimates: attachBuildEstimates,
    surfaceWarning: surfaceWarning,
  };
});
/* ksrl-engine END */
  return globalThis.KSRL;
})();

/* ksrl-parts BEGIN - pure logic, no DOM, runs in Node the same way as the engine */
const SCRIPT_VERSION = '0.7.1';
// Claude choice 2026-11-09 (TUNE-LIMIT 2026-10-08: ratio/turbo differences of 0.2-0.5 % do not show in real races). Change only on owner decision.
const EQUAL_WITHIN_PCT = 0.5;
// 0.6.0: open for every member of faction 48039. Kingshade and Cheese are let in as before, with no extra call; anyone else is checked once with
// user -> faction (Public level, own key), cached 24 h (ksrl-api).
const ALWAYS_ALLOWED_IDS = [4295791, 3246916];   // Kingshade, Cheese
const FACTION_ID = 48039;
const STAT_KEYS = KSRL.STAT_KEYS;
const MODEL_MISMATCH_TEXT = 'Stat model does not match Torn for this car.';
const NO_CAR_TEXT = 'Could not read which car is open on this page.';

// 0.2.0: Group N Rally Suspension, Rally Tires (ids checked against racing/carupgrades in the export 2026-11-09). The model cannot weigh them on tarmac.
const DIRT_SURFACE_PARTS = [94, 47];
const TUNE_LEGEND = 'T/D = tarmac or dirt suspension and tires · S/L = short or long ratio gearbox · 2/3 = Stage Two or Stage Three turbo';
const GAP_NOTE = 'Differences under ' + EQUAL_WITHIN_PCT.toFixed(2) + ' % have not shown up in real races.';

// Three characters: surface (T tarmac / D dirt suspension and tires), gearbox ratio (S short / L long), turbo (3 Stage Three / 2 Stage Two); - when not fitted.
function tuneCode(partIds) {
  const has = function (id) { return partIds.indexOf(id) >= 0; };
  const surface = has(93) && has(46) ? 'T' : (has(94) && has(47) ? 'D' : '-');
  const ratio = has(85) || has(87) ? 'S' : (has(84) || has(86) ? 'L' : '-');
  const turbo = has(99) ? '3' : (has(81) ? '2' : '-');
  return surface + ratio + turbo;
}

// Counters for the category squares, per group (the page category number in the panel, the API category name in the tests):
// buy = BUY + NEXT_BUY + BUY_SURFACE + 1 per subcategory with BUY_EITHER, swap = SWAP + SWAP_SURFACE, next = holds the next buy. Never for Safety.
function categoryCounts(view, byId, groupOf) {
  const out = {};
  const seenSubs = new Set();
  const counted = ['BUY', 'NEXT_BUY', 'BUY_SURFACE', 'SWAP', 'SWAP_SURFACE', 'BUY_EITHER'];
  for (const id of Object.keys(view.labels).map(Number).sort(function (a, b) { return a - b; })) {
    const l = view.labels[id];
    const u = byId.get(id);
    if (!u || u.category === 'Safety') continue;
    if (counted.indexOf(l) < 0) continue;
    const g = groupOf(id, u);
    if (g === undefined || g === null) continue;
    const k = out[g] || (out[g] = { buy: 0, swap: 0, next: false });
    if (l === 'SWAP' || l === 'SWAP_SURFACE') k.swap++;
    else if (l === 'BUY_EITHER') { if (!seenSubs.has(u.subcategory)) { seenSubs.add(u.subcategory); k.buy++; } }
    else k.buy++;
    if (id === view.nextBuyId) k.next = true;
  }
  return out;
}

function partsById(upgrades) {
  const m = new Map();
  for (const u of upgrades) if (u && u.complete === true) m.set(u.id, u);
  return m;
}

function unknownPartsView(reason, extra) {
  return Object.assign({
    state: 'UNKNOWN', reason: reason, tolerancePct: null, surface: null, partsClass: null, statsMatchApi: null,
    currentLap: null, bestLap: null, bestPartIds: [], labels: {}, swapTo: {}, buyCandidates: [], nextBuyId: null,
    leftToFullBuild: { parts: 0, points: 0, cash: 0 }, gapPct: {}, surfaceSwapTo: {}, equalCount: 0, equalGapSumPct: 0,
    fittedTune: null, bestTune: null, buildDiffPct: null, wrongSurface: false, keepFitted: false, sameModelAlternatives: [], partNames: {},
  }, extra || {});
}

// Checks shared by every view: the fitted parts of the page are all known to the API, the parts class is known, and the stat model gives
// exactly the seven stats Torn shows for this car from the parts Torn lists for it. -> { fail: view } | { byId, fitted }
function prepareParts(input) {
  const car = input.car;
  const enl = input.enlisted;
  const byId = partsById(input.upgrades);
  const fitted = [];
  for (const id of input.fittedIds) {
    const u = byId.get(id);
    if (!u) return { fail: unknownPartsView('This page shows a part the Torn API does not list (id ' + id + ').') };
    fitted.push(u);
  }
  if (KSRL.CLASSES.indexOf(input.partsClass) < 0) return { fail: unknownPartsView('The class that limits the parts could not be read from your enlisted cars.') };
  const apiParts = [];
  for (const id of enl.parts) {
    const u = byId.get(id);
    if (!u) return { fail: unknownPartsView(MODEL_MISMATCH_TEXT, { statsMatchApi: false }) };
    apiParts.push(u);
  }
  const apiStats = KSRL.computeFinalStats(car.stats, apiParts);
  const statsMatchApi = STAT_KEYS.every(function (k) { return apiStats[k] !== null && apiStats[k] === enl.stats[k]; });
  if (!statsMatchApi) return { fail: unknownPartsView(MODEL_MISMATCH_TEXT, { statsMatchApi: false }) };
  return { byId: byId, fitted: fitted };
}

// 0.1.1: Mudpit is a dirt track (project decision 2D, 2026-10-07: fixed surface per track) but the lap model has no fit for it, because the
// class B record is faster than the class A record. No lap times there, but the parts are marked against the dirt build.
const TRACK_SURFACE_FIXED = { 17: 'dirt' };   // Mudpit. Source: KS Racing Lab status.md, 2D 2026-10-07.
function dirtReferenceTracks(model) {
  return Object.keys(model.tracks).filter(function (k) { const t = model.tracks[k]; return t.unknown !== true && t.surface === 'dirt'; })
    .map(Number).sort(function (a, b) { return a - b; });
}
const DIRT_REFERENCE_TRACKS = dirtReferenceTracks(KSRL.LAP_MODEL);
function isFixedDirtTrack(model, trackId) {
  const t = model.tracks[String(trackId)];
  return !!t && t.unknown === true && TRACK_SURFACE_FIXED[trackId] === 'dirt';
}

// The same input as computePartsView, for a track that isFixedDirtTrack. Parts are marked against the best builds of the reference dirt tracks:
// C = parts in all of them, D = parts in some but not all. No lap time, no gain, no NEXT BUY.
function computeDirtBuildView(input) {
  const model = input.model || KSRL.LAP_MODEL;
  const prep = prepareParts(input);
  if (prep.fail) return prep.fail;
  const refs = dirtReferenceTracks(model);
  const sets = [];
  for (const t of refs) {
    const b = KSRL.estimateBestBuild(model, t, input.car, input.upgrades, input.partsClass);
    if (b.state === 'UNKNOWN') return unknownPartsView(b.reason, { statsMatchApi: true });
    sets.push(new Set(b.parts.map(function (u) { return u.id; })));
  }
  const common = [];
  const either = new Set();
  const all = new Set();
  for (const s of sets) for (const id of s) all.add(id);
  for (const id of all) {
    if (sets.every(function (s) { return s.has(id); })) common.push(id); else either.add(id);
  }
  common.sort(function (a, b) { return a - b; });
  const C = new Set(common);
  const byId = prep.byId;
  const subC = new Map();
  for (const id of common) subC.set(byId.get(id).subcategory, id);
  const subD = new Map();
  for (const id of Array.from(either).sort(function (a, b) { return a - b; })) {
    const s = byId.get(id).subcategory;
    if (!subD.has(s)) subD.set(s, []);
    subD.get(s).push(id);
  }
  const fittedIds = new Set(prep.fitted.map(function (u) { return u.id; }));
  const labels = {};
  const swapTo = {};
  for (const f of prep.fitted.slice().sort(function (a, b) { return a.id - b.id; })) {
    const sub = f.subcategory;
    if (C.has(f.id)) labels[f.id] = 'KEEP';
    else if (either.has(f.id)) labels[f.id] = 'EQUAL';
    else if (subC.has(sub)) { labels[f.id] = 'SWAP'; swapTo[f.id] = [subC.get(sub)]; }
    else if (subD.has(sub)) { labels[f.id] = 'SWAP'; swapTo[f.id] = subD.get(sub).slice(); }
  }
  const left = [];
  for (const id of common) {
    if (fittedIds.has(id)) continue;
    labels[id] = 'BUY';
    left.push(id);
  }
  const subs = Array.from(subD.keys()).sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });
  for (const s of subs) {
    const opts = subD.get(s);
    if (opts.some(function (o) { return fittedIds.has(o); })) continue;
    for (const o of opts) labels[o] = 'BUY_EITHER';
    left.push(opts.slice().sort(function (a, b) {
      const ua = byId.get(a); const ub = byId.get(b);
      return (ua.cost.points - ub.cost.points) || (ua.cost.cash - ub.cost.cash) || (a - b);
    })[0]);
  }
  const partNames = {};
  for (const u of byId.values()) partNames[u.id] = u.name;
  return {
    state: 'DIRT', dirt: true, reason: '', surface: 'dirt', referenceTracks: refs, partsClass: input.partsClass, statsMatchApi: true,
    tolerancePct: null, currentLap: null, bestLap: null, bestPartIds: [], buyCandidates: [], nextBuyId: null,
    labels: labels, swapTo: swapTo, dirtBuildCommonIds: common, dirtBuildEitherBySub: Object.fromEntries(subD),
    leftToDirtBuild: {
      parts: left.length,
      points: left.reduce(function (s, id) { return s + byId.get(id).cost.points; }, 0),
      cash: left.reduce(function (s, id) { return s + byId.get(id).cost.cash; }, 0),
      ids: left,
    },
    gapPct: {}, surfaceSwapTo: {}, equalCount: 0, equalGapSumPct: 0, fittedTune: tuneCode(prep.fitted.map(function (u) { return u.id; })), bestTune: null,
    buildDiffPct: null, wrongSurface: false, keepFitted: false, sameModelAlternatives: [], partNames: partNames,
  };
}

// The view the panel shows for a chosen track: the dirt-build view for a fixed dirt track, else the lap-time view.
function computeViewForTrack(input) {
  const model = input.model || KSRL.LAP_MODEL;
  return isFixedDirtTrack(model, input.trackId) ? computeDirtBuildView(input) : computePartsView(input);
}

// input: { car: racing/cars item, enlisted: user/enlistedcars item (as the API gave it), fittedIds: part ids fitted according to the page,
//          upgrades: racing/carupgrades items, partsClass, trackId, model (optional) }
function computePartsView(input) {
  const model = input.model || KSRL.LAP_MODEL;
  const car = input.car;
  const enl = input.enlisted;
  const trackId = input.trackId;
  const cls = enl && KSRL.CLASSES.indexOf(enl.class) >= 0 ? enl.class : (car ? car.class : null);
  const status = KSRL.estimateStatus(model, trackId, cls);
  if (status.state === 'UNKNOWN') return unknownPartsView(status.reason, { surface: status.surface, tolerancePct: status.tolerancePct });
  const prep = prepareParts(input);
  if (prep.fail) return prep.fail;
  const byId = prep.byId;
  const fitted = prep.fitted;

  function lapOf(parts) {
    const e = KSRL.estimateFromStats(model, trackId, cls, KSRL.computeFinalStats(car.stats, parts));
    return e.state === 'UNKNOWN' ? { reason: e.reason } : { lap: e.lap };
  }
  const cur = lapOf(fitted);
  if (cur.lap === undefined) return unknownPartsView(cur.reason, { statsMatchApi: true });
  const best = KSRL.estimateBestBuild(model, trackId, car, input.upgrades, input.partsClass);
  if (best.state === 'UNKNOWN') return unknownPartsView(best.reason, { statsMatchApi: true });

  const bestSorted = best.parts.slice().sort(function (a, b) { return a.id - b.id; });
  const bestIds = new Set(bestSorted.map(function (u) { return u.id; }));
  const bestBySub = new Map();
  for (const u of bestSorted) bestBySub.set(u.subcategory, u);
  const fittedIds = new Set(fitted.map(function (u) { return u.id; }));
  const gainFrom = function (parts) {
    const r = lapOf(parts);
    return r.lap === undefined ? null : (cur.lap - r.lap) / cur.lap * 100;
  };
  const gainReplace = function (np) {
    return gainFrom(fitted.filter(function (p) { return p.subcategory !== np.subcategory; }).concat([np]));
  };
  const gainRemove = function (f) {
    return gainFrom(fitted.filter(function (p) { return p !== f; }));
  };

  const labels = {};
  const swapTo = {};
  const gapPct = {};
  const surfaceSwapTo = {};
  const surfaceBest = new Map();   // best part (not fitted) -> the wrong-surface part on the car it replaces
  const equalSubs = new Set();
  let equalCount = 0;
  let equalGapSumPct = 0;
  const onTarmac = status.surface === 'tarmac';
  const fittedSorted = fitted.slice().sort(function (a, b) { return a.id - b.id; });
  for (const f of fittedSorted) {
    if (bestIds.has(f.id)) { labels[f.id] = 'KEEP'; continue; }
    if (f.category === 'Safety') continue;   // 0.2.0: safety buys no time, so it is not shown at all
    const b = bestBySub.get(f.subcategory) || null;
    if (onTarmac && DIRT_SURFACE_PARTS.indexOf(f.id) >= 0) {
      // 0.2.0: on tarmac the model cannot weigh the surface of dirt parts (their gap would show as +0.00 %), so it is never shown as a number
      labels[f.id] = 'SWAP_SURFACE';
      surfaceSwapTo[f.id] = b ? b.id : null;
      if (b && !fittedIds.has(b.id)) surfaceBest.set(b.id, f.id);
      continue;
    }
    const g = b ? gainReplace(b) : gainRemove(f);
    if (g === null) return unknownPartsView('The model gives no lap time for these stats', { statsMatchApi: true });
    labels[f.id] = g < EQUAL_WITHIN_PCT ? 'EQUAL' : 'SWAP';
    swapTo[f.id] = b ? b.id : null;
    gapPct[f.id] = g;
    if (labels[f.id] === 'EQUAL') { equalSubs.add(f.subcategory); equalCount++; equalGapSumPct += g; }
  }
  const cands = [];
  for (const p of bestSorted) {
    if (fittedIds.has(p.id)) continue;
    const isSurface = surfaceBest.has(p.id);
    if (!isSurface && equalSubs.has(p.subcategory)) continue;
    const g = gainReplace(p);
    if (g === null) return unknownPartsView('The model gives no lap time for these stats', { statsMatchApi: true });
    cands.push({
      id: p.id, name: p.name, category: p.category, points: p.cost.points, cash: p.cost.cash, gainPct: g,
      gainPctPerPoint: p.cost.points > 0 ? g / p.cost.points : null,
    });
    labels[p.id] = isSurface ? 'BUY_SURFACE' : 'BUY';
  }
  let nextBuyId = null;
  const surfaceCands = cands.filter(function (c) { return labels[c.id] === 'BUY_SURFACE'; });
  const positive = cands.filter(function (c) { return c.gainPct > 0; });
  if (surfaceCands.length) {
    // 0.2.0: a part of the wrong surface is fixed first: the cheapest one (the label stays BUY_SURFACE, nextBuyId points it out)
    nextBuyId = surfaceCands.slice().sort(function (a, b) { return (a.points - b.points) || (a.cash - b.cash) || (a.id - b.id); })[0].id;
  } else if (positive.length) {
    positive.sort(function (a, b) {
      const pa = a.gainPctPerPoint === null ? Infinity : a.gainPctPerPoint;
      const pb = b.gainPctPerPoint === null ? Infinity : b.gainPctPerPoint;
      if (pa !== pb) return pa > pb ? -1 : 1;
      return (a.points - b.points) || (a.cash - b.cash) || (a.id - b.id);
    });
    nextBuyId = positive[0].id;
    labels[nextBuyId] = 'NEXT_BUY';
  }
  // 0.2.1: how far the fitted build is from the best one, whether it is worth keeping, and other cars of the same model that are already good enough
  const buildDiffPct = (cur.lap - best.lap) / cur.lap * 100;
  const wrongSurface = Object.keys(labels).some(function (id) { return labels[id] === 'SWAP_SURFACE'; });
  const keepFitted = buildDiffPct < EQUAL_WITHIN_PCT && !wrongSurface;
  const sameModelAlternatives = [];
  for (const o of input.allEnlisted || []) {
    if (!o || o.id === enl.id || o.is_removed === true || o.complete !== true || o.car_item_id !== enl.car_item_id) continue;
    if (onTarmac && o.parts.some(function (id) { return DIRT_SURFACE_PARTS.indexOf(id) >= 0; })) continue;
    const oe = KSRL.estimateFromStats(model, trackId, KSRL.CLASSES.indexOf(o.class) >= 0 ? o.class : cls, o.stats);
    if (oe.state === 'UNKNOWN') continue;
    const pct = (oe.lap - best.lap) / best.lap * 100;
    if (pct < EQUAL_WITHIN_PCT) sameModelAlternatives.push({ carId: o.id, model: o.car_item_name, name: o.car_name, tune: tuneCode(o.parts), pctVsBest: pct });
  }
  sameModelAlternatives.sort(function (a, b) { return (a.pctVsBest - b.pctVsBest) || (a.carId - b.carId); });
  const partNames = {};
  for (const u of byId.values()) partNames[u.id] = u.name;
  return {
    state: status.state, reason: '', tolerancePct: status.tolerancePct, surface: status.surface, partsClass: input.partsClass,
    statsMatchApi: true, currentLap: cur.lap, bestLap: best.lap, bestPartIds: bestSorted.map(function (u) { return u.id; }),
    labels: labels, swapTo: swapTo, buyCandidates: cands, nextBuyId: nextBuyId,
    leftToFullBuild: {
      parts: cands.length,
      points: cands.reduce(function (s, c) { return s + c.points; }, 0),
      cash: cands.reduce(function (s, c) { return s + c.cash; }, 0),
    },
    gapPct: gapPct, surfaceSwapTo: surfaceSwapTo, equalCount: equalCount, equalGapSumPct: equalGapSumPct,
    fittedTune: tuneCode(fitted.map(function (u) { return u.id; })), bestTune: tuneCode(bestSorted.map(function (u) { return u.id; })),
    buildDiffPct: buildDiffPct, wrongSurface: wrongSurface, keepFitted: keepFitted, sameModelAlternatives: sameModelAlternatives,
    partNames: partNames,
  };
}

// 0.4.1: every time in seconds is shown the way Torn shows a lap: round to hundredths (half up), then H:MM:SS.cc from one hour, MM:SS.cc from one minute,
// else S.cc s. Percentages and tolerances are not times and keep their own format.
function fmtTime(sec) {
  const cs = Math.floor(sec * 100 + 0.5);
  const pad = function (n, w) { return String(n).padStart(w, '0'); };
  if (cs >= 360000) {
    const rest = cs % 360000;
    return Math.floor(cs / 360000) + ':' + pad(Math.floor(rest / 6000), 2) + ':' + pad(Math.floor((rest % 6000) / 100), 2) + '.' + pad(rest % 100, 2);
  }
  if (cs >= 6000) return pad(Math.floor(cs / 6000), 2) + ':' + pad(Math.floor((cs % 6000) / 100), 2) + '.' + pad(cs % 100, 2);
  return Math.floor(cs / 100) + '.' + pad(cs % 100, 2) + ' s';
}
// 0.5.3: true when the time is shown as 0.00 (the same rounding as fmtTime, on the absolute value). Such a time has no sign and no colour.
function roundsToZero(x) { return Math.floor(Math.abs(x) * 100 + 0.5) === 0; }
function fmtTimeSigned(x) { return roundsToZero(x) ? fmtTime(0) : (x >= 0 ? '+' : '-') + fmtTime(Math.abs(x)); }
function fmtPct2(p) { return Math.abs(p).toFixed(2); }
function fmtSignedPct(p) { return Number(fmtPct2(p)) === 0 ? '0.00 %' : (p < 0 ? '−' : '+') + fmtPct2(p) + ' %'; }
function fmtGain(g) { return Number(fmtPct2(g)) === 0 ? '0.00 %' : (g >= 0 ? '−' : '+') + fmtPct2(g) + ' %'; }   // a gain is a shorter lap, shown as a minus
function fmtCash(n) { return '$' + n.toLocaleString('en-US'); }
function fmtTolerance(t) { const r = Math.round(t * 100) / 100; return Number.isInteger(r) ? r.toFixed(1) : String(r); }

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
function fmtPlus(g) { return '+' + Math.abs(g).toFixed(2) + ' %'; }

// The badge on one part, or null: { cls, text, title }.
function badgeFor(view, partId) {
  if (!view || view.state === 'UNKNOWN') return null;
  const label = view.labels[partId];
  if (!label) return null;
  const nameOf = function (id) { return id === null || id === undefined ? 'no part' : view.partNames[id]; };
  if (label === 'KEEP') return { cls: 'keep', text: 'KEEP', title: '' };
  if (view.dirt === true) {
    const n = view.referenceTracks.length;
    if (label === 'EQUAL') return { cls: 'equal', text: 'EITHER', title: 'The ' + (NUMBER_WORDS[n] || String(n)) + ' other dirt tracks disagree on this part.' };
    if (label === 'SWAP') return { cls: 'swap', text: 'SWAP → ' + view.swapTo[partId].map(nameOf).join(' or '), title: '' };
    if (label === 'BUY') return { cls: 'buy', text: 'BUY', title: '' };
    if (label === 'BUY_EITHER') return { cls: 'buy', text: 'BUY EITHER', title: '' };
    return null;
  }
  if (label === 'EQUAL') return { cls: 'equal', text: fmtPlus(view.gapPct[partId]), title: 'Best here: ' + nameOf(view.swapTo[partId]) + '. ' + GAP_NOTE };
  if (label === 'SWAP') return { cls: 'swap', text: 'SWAP → ' + nameOf(view.swapTo[partId]) + ' ' + fmtPlus(view.gapPct[partId]), title: '' };
  if (label === 'SWAP_SURFACE') return { cls: 'swap', text: 'SWAP → ' + nameOf(view.surfaceSwapTo[partId]) + ' · wrong surface', title: '' };
  if (label === 'BUY_SURFACE') {
    return partId === view.nextBuyId ? { cls: 'next', text: 'NEXT BUY · surface', title: '' } : { cls: 'buy', text: 'BUY · surface', title: '' };
  }
  const c = view.buyCandidates.find(function (x) { return x.id === partId; });
  if (!c) return null;
  return label === 'NEXT_BUY'
    ? { cls: 'next', text: 'NEXT BUY ' + fmtGain(c.gainPct), title: '' }
    : { cls: 'buy', text: 'BUY ' + fmtGain(c.gainPct), title: '' };
}

// 0.2.1: the Tune row. fittedTune is the code of the parts the page shows as fitted.
function tuneRowText(view, fittedTune) {
  let s = 'Tune: ' + fittedTune + ' fitted';
  if (!view || view.state === 'UNKNOWN' || view.dirt === true || !view.bestTune) return s;
  if (view.bestTune === fittedTune) return s + ' \u00b7 best here';
  s += ' \u00b7 ' + view.bestTune + ' best here';
  if (view.wrongSurface) return s + ' \u00b7 wrong surface (the model cannot size it on tarmac)';
  s += ' \u00b7 difference ' + fmtPlus(view.buildDiffPct);
  if (view.keepFitted) s += ' \u00b7 keep ' + fittedTune + ' \u2014 not worth new parts or a second build';
  return s;
}

function altName(a) { return a.model + ' (' + (a.name || a.tune) + ')'; }

// The "Already built" row for the best other car of the same model, or null.
function alreadyBuiltText(view) {
  if (!view || view.state === 'UNKNOWN' || view.dirt === true || !view.sameModelAlternatives || view.sameModelAlternatives.length === 0) return null;
  const a = view.sameModelAlternatives[0];
  return 'Already built: ' + altName(a) + ' #' + a.carId + ' is ' + fmtPlus(a.pctVsBest) + ' from the best build here \u2014 race that car instead of spending points on this one.';
}

// list: [{ title, buy, swap, next }] in the order of the squares -> "Categories: ..." or null when nothing is to buy or swap
function categoriesRowText(list) {
  const items = list.filter(function (c) { return c.buy > 0 || c.swap > 0; }).map(function (c) {
    const bits = [];
    if (c.buy > 0) bits.push(c.buy + ' buy');
    if (c.swap > 0) bits.push(c.swap + ' swap');
    return c.title + ' ' + bits.join(' \u00b7 ') + (c.next ? ' (next buy)' : '');
  });
  return items.length ? 'Categories: ' + items.join(', ') : null;
}

// The rows of the panel under the track selector, as {key, text}. ctx: { racingPoints: int | 'UNKNOWN' }.
function describeDirtView(view, ctx) {
  const rows = [];
  const title = ctx.trackTitle;
  const words = NUMBER_WORDS;
  const names = ctx.referenceTitles;
  rows.push({ key: 'estimate', text: 'Lap-time estimate (experimental): UNKNOWN — Torn records for ' + title + ' do not fit the model, so no lap times are shown.' });
  rows.push({
    key: 'dirt',
    text: title + ' is dirt: parts are marked from the dirt build the model picks on all ' + (words[names.length] || String(names.length)) +
      ' other dirt tracks (' + names.join(', ') + ').',
  });
  rows.push({ key: 'next', text: 'Next buy: not ranked on ' + title + ' (no lap times).' });
  rows.push({ key: 'points', text: 'Racing points on this page: ' + (Number.isInteger(ctx.racingPoints) ? String(ctx.racingPoints) : 'UNKNOWN') });
  const left = view.leftToDirtBuild;
  rows.push({
    key: 'left',
    text: left.parts === 0 ? 'Dirt build complete — nothing to buy.' : 'Left to dirt build: ' + left.parts + ' parts · ' + left.points + ' RP · ' + fmtCash(left.cash),
  });
  const swapIds = Object.keys(view.labels).filter(function (id) { return view.labels[id] === 'SWAP'; }).map(Number).sort(function (a, b) { return a - b; });
  if (swapIds.length) rows.push({ key: 'swap', text: 'Not in the dirt build: ' + swapIds.map(function (id) { return view.partNames[id]; }).join(', ') });
  return rows;
}

// ctx: { racingPoints, trackTitle, referenceTitles } (the last two only for the dirt view)
function describeView(view, ctx) {
  if (view.dirt === true) return describeDirtView(view, ctx);
  const rows = [];
  if (view.state === 'UNKNOWN') {
    rows.push({ key: 'estimate', text: 'Lap-time estimate (experimental): UNKNOWN — ' + view.reason });
    return rows;
  }
  rows.push({
    key: 'estimate',
    text: 'Lap-time estimate (experimental): ' + (view.state === 'OK' ? 'OK' : 'LOW CONFIDENCE') + ' ±' + fmtTolerance(view.tolerancePct) + ' %',
  });
  rows.push({
    key: 'build',
    text: 'This build: ' + fmtTime(view.currentLap) + ' · Best build: ' + fmtTime(view.bestLap) + ' (' +
      fmtSignedPct((view.bestLap - view.currentLap) / view.currentLap * 100) + ')',
  });
  const next = view.nextBuyId === null ? null : view.buyCandidates.find(function (c) { return c.id === view.nextBuyId; });
  const alt = view.sameModelAlternatives && view.sameModelAlternatives.length ? view.sameModelAlternatives[0] : null;
  if (alt) {
    rows.push({ key: 'next', text: 'Next buy: none needed \u2014 use your ' + altName(alt) + ' here.' });
  } else if (next) {
    rows.push({
      key: 'next',
      text: 'Next buy: ' + next.name + ' (' + next.category + ') · ' + next.points + ' RP · ' + fmtCash(next.cash) + ' · ' +
        (view.labels[next.id] === 'BUY_SURFACE' ? 'wrong surface on this car — fix this first' : fmtGain(next.gainPct) + ' lap'),
    });
  } else if (view.buyCandidates.length === 0) {
    rows.push({ key: 'next', text: 'Full build for this track — nothing to buy.' });
  } else {
    rows.push({ key: 'next', text: 'Next buy: none (no missing part makes the lap shorter)' });
  }
  const pts = ctx && Number.isInteger(ctx.racingPoints) ? String(ctx.racingPoints) : 'UNKNOWN';
  rows.push({
    key: 'points',
    text: 'Racing points on this page: ' + pts + (!alt && next && Number.isInteger(ctx && ctx.racingPoints) && next.points > ctx.racingPoints ? ' — not enough for the next buy' : ''),
  });
  const left = view.leftToFullBuild;
  rows.push({
    key: 'left',
    text: 'Left to full build: ' + left.parts + ' parts · ' + left.points + ' RP · ' + fmtCash(left.cash) +
      (view.equalCount > 0 ? ' · ' + view.equalCount + ' part(s) within ' + EQUAL_WITHIN_PCT.toFixed(2) + ' % kept (' + fmtPlus(view.equalGapSumPct) + ')' : ''),
  });
  const swapIds = Object.keys(view.labels).filter(function (id) { return view.labels[id] === 'SWAP' || view.labels[id] === 'SWAP_SURFACE'; }).map(Number).sort(function (a, b) { return a - b; });
  if (swapIds.length) {
    const have = swapIds.map(function (id) { return view.partNames[id]; });
    const want = swapIds.map(function (id) { return view.labels[id] === 'SWAP' ? view.swapTo[id] : view.surfaceSwapTo[id]; }).filter(function (id) { return id !== null && id !== undefined; })
      .map(function (id) { return view.partNames[id]; });
    rows.push({ key: 'swap', text: 'Not in the best build: ' + have.join(', ') + (want.length ? ' — best here: ' + want.join(', ') : '') });
  }
  return rows;
}
/* ksrl-parts END */

/* ksrl-page BEGIN - reads the Parts page (needs a DOM, touches nothing) */
function parseBuyHref(href) {
  if (typeof href !== 'string') return null;
  const q = href.indexOf('?');
  if (q < 0) return null;
  const p = new URLSearchParams(href.slice(q + 1));   // only ID and part are read; the link is never followed and rfcv is never read
  const id = p.get('ID');
  const part = p.get('part');
  if (id === null || part === null || !/^\d+$/.test(id) || !/^\d+$/.test(part)) return null;
  return { carId: Number(id), partId: Number(part) };
}

// -> { ok, reason, carId, fittedIds, parts: [{partId, li, bought}], racingPoints, modelName }
function readPartsPage(root) {
  const out = { ok: false, reason: '', carId: null, fittedIds: [], parts: [], racingPoints: 'UNKNOWN', modelName: null };
  const scope = root || document;
  const lis = scope.querySelectorAll('.pm-items-wrap ul.pm-items > li[data-part]');
  const carIds = new Set();
  let unreadableFitted = 0;
  for (const li of lis) {
    const a = li.querySelector('.messages-box a.buy[href]');
    const info = a ? parseBuyHref(a.getAttribute('href')) : null;
    const bought = li.classList.contains('bought');
    if (!info) { if (bought) unreadableFitted++; continue; }
    carIds.add(info.carId);
    out.parts.push({ partId: info.partId, li: li, bought: bought });
  }
  const pts = scope.querySelector('#racing-points');
  if (pts && /^\d+$/.test(pts.textContent.trim())) out.racingPoints = Number(pts.textContent.trim());
  const b = scope.querySelector('#racingAdditionalContainer .info-msg-cont .msg b');
  if (b) out.modelName = b.textContent.trim();
  if (carIds.size !== 1) { out.reason = NO_CAR_TEXT; return out; }
  if (unreadableFitted > 0) { out.reason = 'A part marked as fitted has no readable id on this page.'; return out; }
  out.carId = Array.from(carIds)[0];
  out.fittedIds = out.parts.filter(function (p) { return p.bought; }).map(function (p) { return p.partId; }).sort(function (a, b2) { return a - b2; });
  out.ok = true;
  return out;
}
/* ksrl-page END */

/* ksrl-race BEGIN - 0.3.1: race info from the leaderboard of the page you are viewing. Pure functions, no requests, nothing stored. */
const RACE_MIN_READ_MS = 250;
const RACE_MAX_SAMPLES = 20000;
const RACE_LEGEND = 'Gaps are split times: how long ago the driver ahead passed your Completion %, or how long ago you passed theirs. Trend = change over your last lap.';

// "26.19%" -> { pct }, "01:06.98" or "1:02:03.50" -> { sec } (finished), anything else -> null
function parseRaceTime(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  let m = /^(\d+(?:\.\d+)?)%$/.exec(s);
  if (m) return { pct: Number(m[1]) };
  m = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/.exec(s);
  if (m) return { sec: (m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + Number(m[3]) };
  return null;
}

// board: { raceId, track, laps, info, drivers: [{ id, name, status, timeText, lorder }] } -> { ok, drivers } or { ok: false, reason }
function parseRaceDrivers(board) {
  const out = [];
  for (const d of board.drivers) {
    const p = parseRaceTime(d.timeText);
    if (!p) { const tx = String(d.timeText).trim(); return { ok: false, reason: 'Torn shows ' + (tx === '' ? 'nothing' : tx) + ' for ' + d.name }; }
    out.push({ id: d.id, name: d.name, status: d.status, timeText: d.timeText.trim(), lorder: d.lorder, done: p.sec !== undefined, pct: p.sec !== undefined ? 100 : p.pct, timeSec: p.sec !== undefined ? p.sec : null });
  }
  return { ok: true, drivers: out };
}

function makeRaceSample(board, drivers, nowMs, tSecExact) {
  const byId = {};
  for (const d of drivers) byId[d.id] = d;
  return { tSec: Number.isFinite(tSecExact) ? tSecExact : nowMs / 1000, raceId: board.raceId, track: board.track, laps: board.laps, info: board.info, drivers: drivers, byId: byId };
}

// Keeps every live sample of the race in memory (never stored; at most 20000, the oldest go first). A new race id starts a new history, and a
// reading in which every text is as it was is not a new sample. The state it returns says what the panel shows:
// unreadable | none | finished (my own row shows a time) | notrunning (my row shows a percent but #infoSpot is not "Race started") | live.
function createRaceTracker(meId) {
  const tr = { meId: meId, samples: [], raceId: null };
  tr.ingest = function (board, nowMs, tSecExact) {   // tSecExact: only for tests that need a time with sub-millisecond digits
    if (board.raceId !== tr.raceId) { tr.samples = []; tr.raceId = board.raceId; }
    // 0.4.2: before the start every li.time is empty. That is not an error: one line, no sample, the history is left alone.
    if (board.drivers.length > 0 && board.drivers.every(function (d) { return String(d.timeText).trim() === ''; })) {
      if (!board.drivers.some(function (d) { return d.id === meId; })) return { kind: 'none', text: 'Race not readable (your row is missing)' };
      const n = board.drivers.length;
      return { kind: 'waiting', text: 'Waiting for the start (Torn shows: ' + (board.info === null ? 'nothing' : board.info) + ') \u00b7 ' + n + ' ' + (n === 1 ? 'driver' : 'drivers') };
    }
    const parsed = parseRaceDrivers(board);
    if (!parsed.ok) return { kind: 'unreadable', text: 'Race not readable (' + parsed.reason + ')' };
    const s = makeRaceSample(board, parsed.drivers, nowMs, tSecExact);
    const me = s.byId[meId];
    if (!me) return { kind: 'none', text: 'Race not readable (your row is missing)' };
    if (me.done) return { kind: 'finished', finish: computeFinishView(s, meId) };
    if (board.info !== 'Race started') return { kind: 'notrunning', text: 'Race not running (Torn shows: ' + (board.info === null ? 'nothing' : board.info) + ')' };
    const last = tr.samples.length ? tr.samples[tr.samples.length - 1] : null;
    if (last && last.drivers.length === s.drivers.length && s.drivers.every(function (d) { const o = last.byId[d.id]; return !!o && o.timeText === d.timeText; })) {
      return { kind: 'live', stored: false, sampleCount: tr.samples.length };
    }
    tr.samples.push(s);
    if (tr.samples.length > RACE_MAX_SAMPLES) tr.samples.shift();
    return { kind: 'live', stored: true, sampleCount: tr.samples.length };
  };
  return tr;
}

// The time when a driver reached Completion p: the newest pair of consecutive samples a, b (up to index upto) in which the driver shows a percent in both
// and pct_a < p <= pct_b, linear in between. Null when the history does not cover p.
function raceCross(samples, upto, id, p) {
  for (let b = upto; b >= 1; b--) {
    const sb = samples[b].byId[id];
    const sa = samples[b - 1].byId[id];
    if (!sb || !sa || sb.done || sa.done) continue;
    if (sa.pct < p && p <= sb.pct) return samples[b - 1].tSec + (p - sa.pct) / (sb.pct - sa.pct) * (samples[b].tSec - samples[b - 1].tSec);
  }
  return null;
}

// Split-time gaps of one sample. Ahead of me: now - the time THAT driver reached MY pct. Behind me: now - the time I reached THEIR pct.
function raceGapsAt(samples, i, meId) {
  const now = samples[i];
  const me = now.byId[meId];
  const gaps = [];
  if (!me || me.done) return gaps;
  for (const d of now.drivers) {
    if (d.id === meId || d.done) continue;
    if (d.pct >= me.pct) {
      const tc = raceCross(samples, i, d.id, me.pct);
      gaps.push({ id: d.id, side: 'ahead', gapSec: tc === null ? null : now.tSec - tc, trendSec: null });
    } else {
      const tc = raceCross(samples, i, meId, d.pct);
      gaps.push({ id: d.id, side: 'behind', gapSec: tc === null ? null : now.tSec - tc, trendSec: null });
    }
  }
  return gaps;
}

// The view of the LAST sample: gaps with trend over my last lap, and my pace per lap. samples = the stored live samples of one race, oldest first.
function computeRaceView(samples, meId) {
  const i = samples.length - 1;
  if (i < 0) return null;
  const now = samples[i];
  const me = now.byId[meId];
  if (!me || me.done) return null;
  const firstIdx = samples.findIndex(function (s) { return !!s.byId[meId] && !s.byId[meId].done; });
  const first = samples[firstIdx];
  const firstPct = first.byId[meId].pct;
  let lastLapSec = null;
  let avgLapSec = null;
  if (now.laps) {
    const lapPct = 100 / now.laps;
    if (me.pct - lapPct > firstPct) {
      const tl = raceCross(samples, i, meId, me.pct - lapPct);
      if (tl !== null) {
        lastLapSec = now.tSec - tl;
        avgLapSec = (now.tSec - first.tSec) / ((me.pct - firstPct) / lapPct);
      }
    }
  }
  const gaps = raceGapsAt(samples, i, meId);
  for (const g of gaps) {
    if (g.gapSec === null || lastLapSec === null) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (samples[j].tSec <= now.tSec - lastLapSec) {   // the newest sample from at least one lap ago
        const gj = raceGapsAt(samples, j, meId).find(function (x) { return x.id === g.id; });
        if (gj && gj.side === g.side && gj.gapSec !== null) g.trendSec = g.gapSec - gj.gapSec;
        break;
      }
    }
  }
  return { tSec: now.tSec, meId: meId, order: raceOrder(now), drivers: now.byId, gaps: gaps, lastLapSec: lastLapSec, avgLapSec: avgLapSec, laps: now.laps };
}

// Torn order: drivers that show a time first (by time), then by Completion; ties by lorder.
function raceOrder(sample) {
  return sample.drivers.map(function (d, i) { return { d: d, i: i }; })
    .sort(function (a, b) { return (b.d.pct - a.d.pct) || ((a.d.done ? a.d.timeSec : 0) - (b.d.done ? b.d.timeSec : 0)) || (a.d.lorder - b.d.lorder) || (a.i - b.i); })
    .map(function (x) { return x.d.id; });
}

// After the finish (my row shows a time): sort on finish time; drivers still racing come after me.
function computeFinishView(sample, meId) {
  const ranked = sample.drivers.filter(function (d) { return d.done; }).sort(function (a, b) { return (a.timeSec - b.timeSec) || (a.lorder - b.lorder); });
  const idx = ranked.findIndex(function (d) { return d.id === meId; });
  if (idx < 0) return { unreadable: true, byId: sample.byId };
  const win = ranked[0];
  const me = ranked[idx];
  const second = ranked.length > 1 && idx === 0 ? ranked[1] : null;
  return {
    position: idx + 1, myTime: me.timeSec, winnerId: win.id, behindWinnerSec: me.timeSec - win.timeSec, behindWinnerPct: (me.timeSec - win.timeSec) / win.timeSec * 100,
    avgLapSec: sample.laps ? me.timeSec / sample.laps : null, secondId: second ? second.id : null, aheadOfSecondSec: second ? second.timeSec - me.timeSec : null,
    byId: sample.byId,
  };
}

function raceF2(x) { return x.toFixed(2); }

// The rows shown while the race runs: the leader, up to 3 ahead of me, me, up to 3 behind me, then my pace. -> [{ text, trend: { text, tone } | null }]
function raceLiveRows(view) {
  const rows = [];
  const order = view.order;
  const iMe = order.indexOf(view.meId);
  const keep = new Set([order[0], view.meId]);
  for (let k = 1; k <= 3; k++) { if (iMe - k >= 0) keep.add(order[iMe - k]); if (iMe + k < order.length) keep.add(order[iMe + k]); }
  order.forEach(function (id, idx) {
    if (!keep.has(id)) return;
    const d = view.drivers[id];
    const k = idx + 1;
    if (id === view.meId) { rows.push({ text: 'P' + k + ' You (' + d.name + ') \u00b7 ' + raceF2(d.pct) + ' %', trend: null }); return; }
    if (d.done) { rows.push({ text: 'P' + k + ' ' + d.name + ' \u00b7 finished ' + d.timeText, trend: null }); return; }
    const g = view.gaps.find(function (x) { return x.id === id; });
    let text = 'P' + k + ' ' + d.name + ' \u00b7 ' + raceF2(d.pct) + ' % \u00b7 ';
    text += g.gapSec === null ? 'gap measuring' : fmtTime(g.gapSec) + ' ' + g.side;
    let trend = null;
    if (g.trendSec !== null) {
      // a gap ahead that grows, or a gap behind that shrinks, is bad for me (red); the opposite is good (green)
      const growing = g.trendSec > 0;
      const bad = g.side === 'ahead' ? growing : !growing;
      trend = { text: ' \u00b7 trend ' + fmtTimeSigned(g.trendSec), tone: roundsToZero(g.trendSec) ? 'none' : (bad ? 'red' : 'green') };
    }
    rows.push({ text: text, trend: trend });
  });
  rows.push({
    text: view.lastLapSec === null ? 'Your pace: measuring (needs one lap)' : 'Your pace: last lap ' + fmtTime(view.lastLapSec) + ' \u00b7 average ' + fmtTime(view.avgLapSec),
    trend: null,
  });
  return rows;
}

function raceFinishRow(fin) {
  if (!fin || fin.unreadable) return { text: 'Finished \u2014 Torn shows no finish time for you', trend: null };
  const nameOf = function (id) { return fin.byId[id].name; };
  const lap = fin.avgLapSec === null ? '' : ' \u00b7 your average lap ' + fmtTime(fin.avgLapSec);
  if (fin.position === 1) {
    return { text: 'Finished P1' + (fin.secondId === null ? '' : ' \u00b7 ' + fmtTime(fin.aheadOfSecondSec) + ' ahead of ' + nameOf(fin.secondId)) + lap, trend: null };
  }
  return { text: 'Finished P' + fin.position + ' \u00b7 +' + fmtTime(fin.behindWinnerSec) + ' behind ' + nameOf(fin.winnerId) + ' (+' + raceF2(fin.behindWinnerPct) + ' %)' + lap, trend: null };
}

// Reads the race leaderboard of the page (a DOM is needed; nothing is touched). -> { ok, reason, raceId, track, laps, info, drivers }
function readRaceBoard(root) {
  const scope = root || document;
  const out = { ok: false, reason: '', raceId: null, track: null, laps: null, info: null, drivers: [] };
  const lb = scope.querySelector('#leaderBoard');
  if (!lb) { out.reason = 'no leaderboard'; return out; }
  const infoEl = scope.querySelector('#infoSpot');
  out.info = infoEl ? infoEl.textContent.replace(/\s+/g, ' ').trim() : null;
  const head = scope.querySelector('.drivers-list .title-black');
  if (head) {
    const own = Array.from(head.childNodes).filter(function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join(' ').replace(/\s+/g, ' ').trim();
    const m = /^(.*?)\s*-\s*(\d+)\s+laps?\s*-$/.exec(own);
    if (m) { out.track = m[1]; out.laps = Number(m[2]); }
  }
  const raceIds = new Set();
  for (const li of lb.querySelectorAll(':scope > li[id^="lbr-"]')) {
    const id = li.id.slice(4);
    const dataId = li.getAttribute('data-id') || '';
    const dm = /^(\d+)-(\d+)$/.exec(dataId);
    const st = li.querySelector('.status');
    const nm = li.querySelector('li.name span');
    const tm = li.querySelector('li.time');
    const order = Number(li.getAttribute('lorder'));
    if (!/^\d+$/.test(id) || !dm || dm[2] !== id || !nm || !tm || !Number.isInteger(order)) { out.reason = 'a leaderboard row could not be read'; return out; }
    raceIds.add(dm[1]);
    const cls = st ? Array.from(st.classList).filter(function (c) { return c !== 'status'; })[0] : '';
    out.drivers.push({ id: id, name: nm.textContent.trim(), status: cls || '', timeText: tm.textContent.trim(), lorder: order });
  }
  if (raceIds.size !== 1 || out.drivers.length === 0) { out.reason = 'the leaderboard does not name one race'; return out; }
  out.raceId = Array.from(raceIds)[0];
  out.ok = true;
  return out;
}
/* ksrl-race END */

/* ksrl-cars BEGIN - 0.4.0: which of your cars to pick for a track. Ranking is pure; the reader needs a DOM and touches nothing. */
const CARS_TOP = 5;
const CARS_NOTE = 'Lap estimates come from a fitted model, not from Torn. Cars within the margin cannot be told apart by the model.';

// model + (car_name, else the tune code unless it is ---)
function carName(e) {
  const tune = tuneCode(e.parts || []);
  const n = e.car_name || (tune !== '---' ? tune : null);
  return e.car_item_name + (n ? ' (' + n + ')' : '');
}
function carsF2(x) { return x.toFixed(2); }

// The track of the Change car view: the text up to the first " - " must be exactly a title of racing/tracks. No guess.
function resolveCurrentTrack(text, tracks) {
  const s = String(text).replace(/\s+/g, ' ').trim();
  const i = s.indexOf(' - ');
  const name = i >= 0 ? s.slice(0, i) : s;
  return tracks.find(function (t) { return t.title === name; }) || null;
}

// A line is a list of segments { t: text, g: true when the text is shown green }; joined they are the line.
function segs() { return Array.prototype.slice.call(arguments); }
function segText(s) { return s.map(function (x) { return x.t; }).join(''); }
function carNameList(list, mark) {   // "Name #id, Name #id": the names green when mark(car) says so
  const out = [];
  list.forEach(function (e, k) {
    if (k > 0) out.push({ t: ', ' });
    out.push({ t: carName(e), g: !!(mark && mark(e)) });
    out.push({ t: ' #' + e.id });
  });
  return out;
}

// One track: every car of yours ranked by the model, or - when the model has no lap estimate (Mudpit) - the dirt builds. cars: user/enlistedcars items, not removed.
// 0.4.1: greenCarIds = the best car and the cars within the margin (Mudpit: the dirt builds); lineSegs / tableSegs mark those names green; lines = the same as text.
function rankCarsForTrack(cars, track, model) {
  const m = model || KSRL.LAP_MODEL;
  const tid = track.id;
  const tm = m.tracks[String(tid)];
  const fixedDirt = isFixedDirtTrack(m, tid);
  const surface = fixedDirt ? 'dirt' : (tm && (tm.surface === 'tarmac' || tm.surface === 'dirt') ? tm.surface : null);
  const sName = surface || 'unknown';
  const out = { trackId: tid, track: track.title, surface: surface, greenCarIds: [] };
  const byId = function (a, b) { return a.id - b.id; };
  if (fixedDirt || !tm || tm.unknown === true) {
    const dirt = fixedDirt ? cars.filter(function (e) { return tuneCode(e.parts || [])[0] === 'D'; }).sort(byId) : [];
    out.mode = 'noEstimate';
    out.dirtBuildIds = dirt.map(function (e) { return e.id; });
    out.greenCarIds = out.dirtBuildIds.slice();
    out.lineSegs = [segs({ t: 'Track: ' + track.title + ' (' + sName + ') \u00b7 the model has no lap estimate here' })];
    if (fixedDirt) out.lineSegs.push([{ t: 'Dirt builds (dirt tires and suspension): ' }].concat(dirt.length ? carNameList(dirt, function () { return true; }) : [{ t: 'none' }]));
    out.badges = {};
    for (const e of cars) out.badges[String(e.id)] = fixedDirt ? (tuneCode(e.parts || [])[0] === 'D' ? 'dirt build' : 'not a dirt build') : 'no estimate';
    out.lines = out.lineSegs.map(segText);
    return out;
  }
  const ranked = [];
  const wrong = [];
  const unknown = [];
  for (const e of cars) {
    if (surface === 'tarmac' && (e.parts || []).some(function (p) { return DIRT_SURFACE_PARTS.indexOf(p) >= 0; })) { wrong.push(e); continue; }
    const est = KSRL.CLASSES.indexOf(e.class) >= 0 ? KSRL.estimateFromStats(m, tid, e.class, e.stats) : { state: 'UNKNOWN' };
    if (est.state === 'UNKNOWN' || !(est.lap > 0)) { unknown.push(e); continue; }
    ranked.push({ car: e, lap: est.lap, id: e.id, state: est.state, tol: est.tolerancePct });
  }
  ranked.sort(function (a, b) { return (a.lap - b.lap) || (a.id - b.id); });
  wrong.sort(byId);
  unknown.sort(byId);
  out.mode = 'ranked';
  out.rows = [];
  out.badges = {};
  out.wrongSurfaceIds = wrong.map(function (e) { return e.id; });
  out.noEstimateIds = unknown.map(function (e) { return e.id; });
  const best = ranked.length ? ranked[0] : null;
  ranked.forEach(function (r, k) {
    const pct = (r.lap - best.lap) / best.lap * 100;
    const margin = Math.max(best.tol, r.tol);
    const within = k > 0 && pct < margin;
    out.rows.push({ carId: r.id, lapSec: r.lap, pctVsBest: pct, state: r.state, tolerancePct: r.tol, marginPct: margin, withinMargin: within });
    out.badges[String(r.id)] = k === 0 ? 'best here' : '+' + carsF2(pct) + ' %' + (pct < margin ? ' (within the margin)' : '');
    if (k === 0 || within) out.greenCarIds.push(r.id);
  });
  for (const e of wrong) out.badges[String(e.id)] = 'wrong surface';
  for (const e of unknown) out.badges[String(e.id)] = 'no estimate';
  const isGreen = function (id) { return out.greenCarIds.indexOf(id) >= 0; };
  const lineSegs = [];
  if (best) {
    lineSegs.push([{ t: 'Track: ' + track.title + ' (' + sName + ') \u00b7 best of your cars: ' }, { t: carName(best.car), g: true }, { t: ' #' + best.id }]);
    out.rows.slice(0, CARS_TOP).forEach(function (r, k) {
      const e = ranked[k].car;
      lineSegs.push([{ t: (k + 1) + '. ' }, { t: carName(e), g: isGreen(r.carId) },
        { t: ' #' + r.carId + ' \u00b7 ' + fmtTime(r.lapSec) + ' \u00b1' + carsF2(r.tolerancePct) + ' % \u00b7 ' + (k === 0 ? 'best' : '+' + carsF2(r.pctVsBest) + ' %' + (r.withinMargin ? ' (within the margin)' : '')) }]);
    });
  } else {
    lineSegs.push(segs({ t: 'Track: ' + track.title + ' (' + sName + ') \u00b7 none of your cars has a lap estimate here' }));
  }
  if (wrong.length) lineSegs.push([{ t: 'Wrong surface here (dirt tires or suspension): ' }].concat(carNameList(wrong)));
  if (unknown.length) lineSegs.push([{ t: 'No estimate: ' }].concat(carNameList(unknown)));
  out.lineSegs = lineSegs;
  out.lines = lineSegs.map(segText);
  return out;
}

function carTracksSorted(tracks) {
  return tracks.filter(function (t) { return t.title !== null; }).sort(function (a, b) { return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0); });
}

// The lines of the Change car view as segments, with " · in this race" on the row of the car that is entered (only when it is among the listed rows).
function carsChangeSegs(rank, inRaceCarId) {
  const lines = rank.lineSegs.map(function (l) { return l.slice(); });
  if (rank.mode === 'ranked' && inRaceCarId !== null) {
    const k = rank.rows.slice(0, CARS_TOP).findIndex(function (r) { return r.carId === inRaceCarId; });
    if (k >= 0) lines[1 + k].push({ t: ' \u00b7 in this race' });
  }
  return lines;
}
function carsChangeLines(rank, inRaceCarId) { return carsChangeSegs(rank, inRaceCarId).map(segText); }

// The colour of a badge: red for a wrong surface, green for the car the panel recommends (0.7.1: YOURS, the best of your cars here), grey for the rest.
function carBadgeKind(text, isGreen) {
  if (text === 'wrong surface' || / wrong parts for this track$/.test(text)) return 'bad';
  return isGreen ? 'good' : 'plain';
}

// The two car views of Torn: Your Cars (no Current race box) and Change car (a Current race box with "<track> - Official race").
// -> { ok, view: 'change' | 'list', wrap, anchor, trackText, cars: [{ id, li, info, inRace }] }
function readCarsPage(root) {
  const scope = root || document;
  const out = { ok: false, view: null, wrap: null, anchor: null, trackText: null, cars: [], playerClass: null };
  const wrap = scope.querySelector('#racingAdditionalContainer .enlist-wrap.enlisted-wrap');
  if (!wrap) return out;
  // 0.7.1: the class of the driver, from the banner "CLASS A" at the top of the racing page (a race lets in this class and the lower ones)
  const letter = scope.querySelector('.racing-main-wrap .banner .class-letter');
  const letterText = letter ? letter.textContent.trim().toUpperCase() : '';
  out.playerClass = KSRL.CLASSES.indexOf(letterText) >= 0 ? letterText : null;
  const list = wrap.querySelector('ul.enlist-list');
  if (!list || list.querySelector('a[step-value="selectParts"]')) return out;   // the car picker of the Parts tab is not a car view
  for (const li of list.querySelectorAll(':scope > li')) {
    const info = li.querySelector('.info-content');
    if (!info) continue;
    let id = null;
    for (const s of info.querySelectorAll('span')) {
      for (const c of s.classList) { const m = /^model-car-name-(\d+)$/.exec(c); if (m && id === null) id = Number(m[1]); }
    }
    if (id === null) continue;
    out.cars.push({ id: id, li: li, info: info, inRace: !!li.querySelector('i.icon-in-race') });
  }
  if (out.cars.length === 0) return out;
  out.wrap = wrap;
  // The Change car view starts with a title "Current race" and a box holding .enlisted-btn-wrap ("<track> - Official race"). Your Cars has no such title
  // (it has an .enlisted-btn-wrap too, with the button text "ENLIST ANOTHER CAR", so the button alone does not tell the views apart).
  const first = wrap.querySelector(':scope > .title-black');
  if (!first) return out;
  if (/^current race$/i.test(first.textContent.trim())) {
    const box = first.nextElementSibling;
    const btn = box && box.matches('.cont-black.enlist') ? box.querySelector('.enlisted-btn-wrap') : null;
    if (!btn) return out;
    out.view = 'change';
    out.anchor = box;
    out.trackText = btn.textContent.replace(/\s+/g, ' ').trim();
  } else {
    out.view = 'list';
    out.anchor = first;
  }
  out.ok = true;
  return out;
}
/* ksrl-cars END */

/* ksrl-api BEGIN - api.torn.com only, one call at a time, cached per selection */
const KEY_STORE = 'ksrl.v1.apiKey';
const TRACK_STORE = 'ksrl.v1.trackByCar';
const DEBUG_STORE = 'ksrl.v1.debug';
const CACHE_PREFIX = 'ksrl.v1.cache.';
const CACHE_SELECTIONS = ['user/basic', 'user/faction', 'user/enlistedcars', 'racing/cars', 'racing/carupgrades', 'racing/tracks'];
const HOUR = 3600 * 1000;
const CACHE_TTL_MS = {
  'user/basic': 24 * HOUR, 'user/faction': 24 * HOUR, 'racing/cars': 24 * HOUR, 'racing/carupgrades': 24 * HOUR, 'racing/tracks': 24 * HOUR,
  'user/enlistedcars': 5 * 60 * 1000,
};
const NOT_MEMBER_TEXT = 'KS Racing Lab is for members of faction ' + FACTION_ID + ' only.';
const GATE_ACCESS_TEXT = 'Your key is missing access to user → faction. Make a new key:';   // the link under it is SHARE_KEY_LINK (the one key link of the script)
const ENLISTED_REFETCH_MIN_AGE_MS = 60 * 1000;
const ACCESS_TEXT = 'Your key is missing access: user → basic, enlistedcars, faction; racing → cars, carupgrades, records, tracks';
const BUSY_TEXT = 'Torn API is busy — try again in a minute';

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function validateSelection(selection, json) {
  if (selection === 'user/basic') {
    return isPlainObject(json) && isPlainObject(json.profile) && Number.isInteger(json.profile.id) && json.profile.id > 0
      ? { ok: true, items: null, id: json.profile.id } : { ok: false };
  }
  const v = KSRL.validateDataset(selection, json);
  return v.ok ? { ok: true, items: v.items, id: null } : { ok: false };
}

function createStore(gm) {
  function read(selection, nowMs) {
    let rec = null;
    try { rec = gm.get(CACHE_PREFIX + selection, null); } catch (e) { rec = null; }
    if (rec === null || rec === undefined) return null;
    const t = isPlainObject(rec) && typeof rec.fetchedAt === 'string' ? Date.parse(rec.fetchedAt) : NaN;
    if (!isPlainObject(rec) || rec.schemaVersion !== 1 || rec.source !== selection || Number.isNaN(t)) {
      gm.del(CACHE_PREFIX + selection);                         // wrong schemaVersion or source: thrown away, fetched again
      return null;
    }
    const v = validateSelection(selection, rec.value);
    if (!v.ok) { gm.del(CACHE_PREFIX + selection); return null; }
    if (nowMs - t > CACHE_TTL_MS[selection] || t > nowMs + 60000) return null;
    return { value: rec.value, items: v.items, id: v.id, fetchedAtMs: t };
  }
  function write(selection, value, nowMs) {
    gm.set(CACHE_PREFIX + selection, { value: value, fetchedAt: new Date(nowMs).toISOString(), source: selection, schemaVersion: 1 });
  }
  // 0.3.0: the race panel only needs the own Torn ID that user/basic gave earlier. It never calls; an old record is fine, the ID does not change.
  function readOwnId() {
    let rec = null;
    try { rec = gm.get(CACHE_PREFIX + 'user/basic', null); } catch (e) { rec = null; }
    if (!isPlainObject(rec) || rec.schemaVersion !== 1 || rec.source !== 'user/basic') return null;
    const v = validateSelection('user/basic', rec.value);
    return v.ok ? v.id : null;
  }
  // 0.4.0: a record whatever its age (for the STALE line of the Cars panel); null when there is none or it is not valid.
  function peek(selection) {
    let rec = null;
    try { rec = gm.get(CACHE_PREFIX + selection, null); } catch (e) { rec = null; }
    const tm = isPlainObject(rec) && typeof rec.fetchedAt === 'string' ? Date.parse(rec.fetchedAt) : NaN;
    if (!isPlainObject(rec) || rec.schemaVersion !== 1 || rec.source !== selection || Number.isNaN(tm)) return null;
    return validateSelection(selection, rec.value).ok ? { fetchedAtMs: tm } : null;
  }
  // 0.6.0: the faction gate. The record keeps the answer of user -> faction as {playerId, factionId|null} next to the Torn ID it was asked for; same envelope as
  // the other records (value, fetchedAt, source, schemaVersion), 24 h. null when there is none, it is not valid, it is for another player or it has run out.
  function readGate(playerId, nowMs) {
    let rec = null;
    try { rec = gm.get(CACHE_PREFIX + 'user/faction', null); } catch (e) { rec = null; }
    if (rec === null || rec === undefined) return null;
    const t = isPlainObject(rec) && typeof rec.fetchedAt === 'string' ? Date.parse(rec.fetchedAt) : NaN;
    const v = isPlainObject(rec) ? rec.value : null;
    if (!isPlainObject(rec) || rec.schemaVersion !== 1 || rec.source !== 'user/faction' || Number.isNaN(t) || !isPlainObject(v)
      || !Number.isInteger(v.playerId) || !(v.factionId === null || (Number.isInteger(v.factionId) && v.factionId > 0))) {
      gm.del(CACHE_PREFIX + 'user/faction');
      return null;
    }
    if (v.playerId !== playerId || nowMs - t > CACHE_TTL_MS['user/faction'] || t > nowMs + 60000) return null;
    return { factionId: v.factionId, fetchedAtMs: t };
  }
  function writeGate(playerId, factionId, nowMs) {
    gm.set(CACHE_PREFIX + 'user/faction', { value: { playerId: playerId, factionId: factionId }, fetchedAt: new Date(nowMs).toISOString(), source: 'user/faction', schemaVersion: 1 });
  }
  // The race panel never calls Torn: it asks this. Kingshade and Cheese: yes. Anyone else: only with a valid cached answer that says faction 48039.
  function isAllowedCached(playerId, nowMs) {
    if (ALWAYS_ALLOWED_IDS.indexOf(playerId) >= 0) return true;
    const g = readGate(playerId, nowMs);
    return g !== null && g.factionId === FACTION_ID;
  }
  function clearUserData() { gm.del(CACHE_PREFIX + 'user/basic'); gm.del(CACHE_PREFIX + 'user/faction'); gm.del(CACHE_PREFIX + 'user/enlistedcars'); }
  function clearAll() {
    for (const s of CACHE_SELECTIONS) gm.del(CACHE_PREFIX + s);
    gm.del(TRACK_STORE);
  }
  function trackFor(carId) {
    const v = gm.get(TRACK_STORE, null);
    if (!isPlainObject(v) || v.schemaVersion !== 1 || !isPlainObject(v.cars)) return null;
    const t = v.cars[String(carId)];
    return Number.isInteger(t) ? t : null;
  }
  function setTrackFor(carId, trackId) {
    let v = gm.get(TRACK_STORE, null);
    if (!isPlainObject(v) || v.schemaVersion !== 1 || !isPlainObject(v.cars)) v = { schemaVersion: 1, cars: {} };
    if (trackId === null) delete v.cars[String(carId)]; else v.cars[String(carId)] = trackId;
    gm.set(TRACK_STORE, v);
  }
  return { read: read, write: write, peek: peek, readOwnId: readOwnId, readGate: readGate, writeGate: writeGate, isAllowedCached: isAllowedCached, clearUserData: clearUserData, clearAll: clearAll, trackFor: trackFor, setTrackFor: setTrackFor };
}

// One GET to api.torn.com. Returns {ok:true, json} or {ok:false, kind, code, text}.
function createRequester(fetchImpl, nowFn, logger) {
  let callTimes = [];
  return async function get(selection, key, signal) {
    const now = nowFn();
    callTimes = callTimes.filter(function (t) { return t > now - 60000; });
    if (callTimes.length >= KSRL.LOCAL_CALL_BUDGET_PER_MINUTE) return { ok: false, kind: 'BUDGET' };
    callTimes.push(now);
    logger.debug('request', selection);
    let res;
    let json = null;
    try {
      res = await fetchImpl(KSRL.selectionUrl(selection), {
        method: 'GET',
        headers: { Authorization: 'ApiKey ' + key, Accept: 'application/json' },
        mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal,
      });
      try { json = await res.json(); } catch (e) { json = null; }
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, kind: 'ABORT' };
      return { ok: false, kind: 'NETWORK' };
    }
    if (isPlainObject(json) && isPlainObject(json.error)) {
      const code = Number.isInteger(json.error.code) ? json.error.code : null;
      const text = typeof json.error.error === 'string' ? json.error.error : '';
      const c = KSRL.classifyErrorCode(code);
      logger.debug('api error', selection, code, c);
      if (c === 'KEY_FATAL') return { ok: false, kind: 'KEY_FATAL', code: code, text: text };
      if (c === 'RETRY_LATER') return { ok: false, kind: 'RETRY_LATER', code: code, text: text };
      if (c === 'ACCESS_LEVEL') return { ok: false, kind: 'ACCESS', code: code, text: text };
      return { ok: false, kind: 'OTHER', code: code, text: text };
    }
    if (!res || !res.ok) return { ok: false, kind: 'HTTP', code: res && Number.isInteger(res.status) ? res.status : null };
    return { ok: true, json: json };
  };
}

function errorText(err) {
  if (err.kind === 'KEY_FATAL') return 'Torn rejected the key (error ' + err.code + (err.text ? ': ' + err.text : '') + '). It was removed — enter a new key.';
  if (err.kind === 'RETRY_LATER' || err.kind === 'BUDGET') return BUSY_TEXT;
  if (err.kind === 'ACCESS') return ACCESS_TEXT;
  if (err.kind === 'NETWORK') return 'Network error — could not reach api.torn.com.';
  if (err.kind === 'HTTP') return 'Request failed (HTTP ' + (err.code === null ? 'UNKNOWN' : err.code) + ').';
  if (err.kind === 'SHAPE') return 'Unexpected answer from api.torn.com for ' + err.selection + ' — try again later.';
  return 'Torn API error ' + (err.code === null || err.code === undefined ? 'UNKNOWN' : err.code) + (err.text ? ': ' + err.text : '') + '.';
}

// Loads what the panel needs. -> {ok:true, data} | {ok:false, err} | {ok:false, privateUse:true} | {ok:false, gateAccess:true, err} | {ok:false, stale:true} | {ok:false, unknownReason}
// One selection: the cache when it is valid, else one call. -> { ok, items, id, fetchedAtMs } | { ok: false, stale } | { ok: false, err }
function makeLoader(deps, key, signal, stale) {
  const store = deps.store;
  const nowFn = deps.now;
  return async function load(selection, force) {
    if (!force) {
      const c = store.read(selection, nowFn());
      if (c) return { ok: true, items: c.items, id: c.id, fetchedAtMs: c.fetchedAtMs };
    }
    const r = await deps.requester(selection, key, signal);
    if (stale()) return { ok: false, stale: true };
    if (!r.ok) return { ok: false, err: r };
    const v = validateSelection(selection, r.json);
    if (!v.ok) return { ok: false, err: { kind: 'SHAPE', selection: selection } };
    const t = nowFn();
    store.write(selection, selection === 'user/basic' ? { profile: { id: v.id } } : r.json, t);
    return { ok: true, items: v.items, id: v.id, fetchedAtMs: t };
  };
}

// 0.6.0: the gate. -> {ok:true} | {ok:false, privateUse:true} (not in faction 48039) | {ok:false, gateAccess:true, err} (Torn error 16: the key lacks user -> faction)
// | {ok:false, err} (anything else Torn says or does not say: NOT let in, the reason is in err) | {ok:false, stale:true}.
// Kingshade and Cheese: let in with no call. Others: the cached answer when it is valid, else ONE call to user/faction with their own key (Public level).
async function checkMembership(deps, key, signal, stale, playerId) {
  if (ALWAYS_ALLOWED_IDS.indexOf(playerId) >= 0) return { ok: true };
  let g = deps.store.readGate(playerId, deps.now());
  if (g === null) {
    const r = await deps.requester('user/faction', key, signal);
    if (stale()) return { ok: false, stale: true };
    if (!r.ok) return r.kind === 'ACCESS' ? { ok: false, gateAccess: true, err: r } : { ok: false, err: r };
    const f = isPlainObject(r.json) && 'faction' in r.json ? r.json.faction : undefined;
    if (!(f === null || (isPlainObject(f) && Number.isInteger(f.id) && f.id > 0))) return { ok: false, err: { kind: 'SHAPE', selection: 'user/faction' } };
    g = { factionId: f === null ? null : f.id };
    deps.store.writeGate(playerId, g.factionId, deps.now());
  }
  return g.factionId === FACTION_ID ? { ok: true } : { ok: false, privateUse: true };
}

// 0.4.0: what the Cars panel needs: the tracks and your enlisted cars (the same selections and cache as the Parts panel). When the cars cannot be
// refreshed and an old record exists, staleAgeMs says how old it is (the panel then shows STALE and no ranking).
async function loadCarsData(deps, key, signal, stale) {
  const load = makeLoader(deps, key, signal, stale);
  const basic = await load('user/basic', false);
  if (!basic.ok) return basic;
  const gate = await checkMembership(deps, key, signal, stale, basic.id);
  if (!gate.ok) return gate;
  const tr = await load('racing/tracks', false);
  if (!tr.ok) return tr;
  const en = await load('user/enlistedcars', false);
  if (!en.ok) {
    const old = en.err ? deps.store.peek('user/enlistedcars') : null;
    return old ? Object.assign({}, en, { staleAgeMs: deps.now() - old.fetchedAtMs }) : en;
  }
  // 0.7.1: the car models and the parts of the Torn API (the same two selections and the same 24 h cache as the Parts panel), so the model can name the fastest build of
  // every car model. They are only a help: when they cannot be had the answer goes on without the model's builds.
  const rc = await load('racing/cars', false);
  if (!rc.ok && rc.stale) return rc;
  const ru = rc.ok ? await load('racing/carupgrades', false) : { ok: false };
  if (!ru.ok && ru.stale) return ru;
  const racingCars = rc.ok ? rc.items : null;
  const upgrades = ru.ok ? ru.items : null;
  const partsClass = upgrades ? KSRL.partsClassFromEnlisted(en.items, upgrades).cls : null;
  return {
    ok: true,
    data: {
      tracks: tr.items.filter(function (x) { return x.title !== null; }), cars: en.items.filter(function (e) { return e.is_removed !== true; }), fetchedAtMs: en.fetchedAtMs,
      racingCars: racingCars, upgrades: upgrades, partsClass: partsClass,
    },
  };
}

async function loadPanelData(deps, key, page, signal, stale) {
  const store = deps.store;
  const nowFn = deps.now;
  const load = makeLoader(deps, key, signal, stale);
  const basic = await load('user/basic', false);
  if (!basic.ok) return basic;
  const gate = await checkMembership(deps, key, signal, stale, basic.id);
  if (!gate.ok) return gate;
  const parts = {};
  for (const sel of ['racing/cars', 'racing/carupgrades', 'racing/tracks', 'user/enlistedcars']) {
    parts[sel] = await load(sel, false);
    if (!parts[sel].ok) return parts[sel];
  }
  let en = parts['user/enlistedcars'];
  const refetch = async function () {
    en = await load('user/enlistedcars', true);
    return en.ok;
  };
  const findCar = function () { return en.items.find(function (e) { return e.id === page.carId; }) || null; };
  const ageOk = function () { return nowFn() - en.fetchedAtMs >= ENLISTED_REFETCH_MIN_AGE_MS; };
  let enl = findCar();
  if (!enl && ageOk()) { if (!(await refetch())) return en; enl = findCar(); }
  if (!enl) return { ok: false, unknownReason: 'This car is not in your Torn API garage data.' };
  if (enl.complete !== true) return { ok: false, unknownReason: 'Your enlisted car data from the Torn API is incomplete.' };
  const diffCount = function () {
    const api = new Set(enl.parts);
    const pg = new Set(page.fittedIds);
    let n = 0;
    for (const id of pg) if (!api.has(id)) n++;
    for (const id of api) if (!pg.has(id)) n++;
    return n;
  };
  let pageNewer = diffCount();
  if (pageNewer > 0 && ageOk()) {
    if (!(await refetch())) return en;
    enl = findCar();
    if (!enl) return { ok: false, unknownReason: 'This car is not in your Torn API garage data.' };
    pageNewer = diffCount();
  }
  const car = parts['racing/cars'].items.find(function (c) { return c.car_item_id === enl.car_item_id; }) || null;
  if (!car || car.complete !== true) return { ok: false, unknownReason: 'This car model is not in the Torn API car list.' };
  const upgrades = parts['racing/carupgrades'].items;
  const tracks = parts['racing/tracks'].items.filter(function (t) { return t.title !== null; })
    .sort(function (a, b) { const x = a.title.toLowerCase(); const y = b.title.toLowerCase(); return x < y ? -1 : (x > y ? 1 : 0); });
  return {
    ok: true,
    data: {
      userId: basic.id, car: car, enlisted: enl, upgrades: upgrades, tracks: tracks, pageNewer: pageNewer,
      enlistedItems: en.items, partsClass: KSRL.partsClassFromEnlisted(en.items, upgrades).cls,
    },
  };
}

function trackSurfaceLabel(trackId) {
  const t = KSRL.LAP_MODEL.tracks[String(trackId)];
  if (t && t.unknown !== true && (t.surface === 'tarmac' || t.surface === 'dirt')) return t.surface;
  return TRACK_SURFACE_FIXED[trackId] || 'unknown';   // 0.1.1: Mudpit is dirt even though the model has no fit for it
}

// Names for the dirt-view row: the title of the chosen track and the reference dirt tracks (from racing/tracks, alphabetical).
function dirtContext(data, view, trackId, racingPoints) {
  const title = function (id) {
    const t = data.tracks.find(function (x) { return x.id === id; });
    const m = KSRL.LAP_MODEL.tracks[String(id)];
    return t ? t.title : (m && m.title) || ('track ' + id);
  };
  return {
    racingPoints: racingPoints, trackTitle: title(trackId),
    referenceTitles: view.referenceTracks.map(title).sort(function (a, b) { const x = a.toLowerCase(); const y = b.toLowerCase(); return x < y ? -1 : (x > y ? 1 : 0); }),
  };
}
/* ksrl-api END */

/* ksrl-share BEGIN - 0.5.0: share your own races and cars with Kingshade. OFF by default. No DOM and no globals here: the transports (Torn API, the KS racing
   server, the clock, the visibility of the page) are handed in, so the tests drive it in Node. It sends Torn API answers only (user/races, user/enlistedcars)
   exactly as Torn gave them - never page text. The Torn key goes to the KS server once per login (POST /session) and nowhere else on that server. */
const SHARE_STORE = 'ksrl.v1.share';
const SHARE_SESSION_STORE = 'ksrl.v1.shareSession';
const SHARE_WORKER_ORIGIN = 'https://racing.kingshadeprotocol.com';
const SHARE_PATHS = ['/session', '/share/submit', '/views/get'];  // the only three addresses on the server this script ever calls (0.7.0: /views/get is the third and last)
const SHARE_TORN_CALLS_PER_MINUTE = 10;                           // the most calls to api.torn.com that sharing makes in any minute
const SHARE_INTERVAL_MS = 15 * 60 * 1000;                         // at most one round per 15 minutes while a racing page is open and visible
const SHARE_OVERLAP_S = 7200;                                     // every round starts this long before the newest race that was sent
const SHARE_CARS_INTERVAL_MS = 24 * 3600 * 1000;                  // cars: at most once a day
const SHARE_MAX_PAYLOAD_BYTES = 500 * 1024;                       // a page over this is sent in two (the server takes 512 KiB)
const SHARE_BUDGET_WAIT_MS = 65 * 1000;
const SHARE_SESSION_MARGIN_MS = 30 * 1000;
const SHARE_MAX_PAGES_PER_RUN = 60;                               // a safety stop for one round (the whole history is about 15 pages)
const SHARE_MAX_WAIT_MS = 3600 * 1000;
const SHARE_RACE_PAGE = 100;
const SHARE_ONLY_TEXT = 'Sharing is not open for your account yet.';
const SHARE_KEY_LINK = 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=KSRacingLab&user=basic,enlistedcars,faction,races&racing=cars,carupgrades,records,tracks';
const SHARE_TITLE = 'Share my races and cars with Kingshade';
const SHARE_DISCLOSURE = [
  'Off until you switch it on. While it is off nothing is sent anywhere.',
  'What is sent when it is on: your own races from the Torn API (user/races: each race you took part in, with the place and the times of every driver) and your cars with their stats and parts (user/enlistedcars), exactly as Torn gives them. No page text, nothing else.',
  'Where to: racing.kingshadeprotocol.com, the KS Racing Lab server run by Kingshade. Who sees it: Kingshade sees everything you share. KS members who switch on "Show KS faction race data" see totals built from it: lap times per car model and track, and the parts and lap times of shared builds per track. No names or Torn IDs are shown, but a build only you have can still be recognised.',
  'How long: it is kept until further notice. Switching it off stops all sending; what was already sent stays there.',
  'Your Torn API key is used once per login to prove who you are. The server does not store it. It stays in this browser (Tampermonkey storage). Sharing uses access to user → basic, races, enlistedcars; the rest of the script also needs user → faction (to check that you are in faction 48039) and racing → cars, carupgrades, records, tracks.',
  'When: only while a Torn racing page is open and visible, when the page loads and then at most every 15 minutes; your cars at most once a day.',
];
// 0.5.2: the disclosure under the switch can be folded away. The player's own choice (open or folded) is kept here until the player changes it; without a choice the
// default is OPEN while sharing is off (the player can read what would be sent before switching it on) and FOLDED while it is on. Switching sharing off drops the choice.
const SHARE_DETAILS_STORE = 'ksrl.v1.shareDetails';
function shareDetailsOpen(gm, enabled) {
  const v = gm.get(SHARE_DETAILS_STORE, null);
  if (isPlainObject(v) && v.schemaVersion === 1 && typeof v.open === 'boolean') return v.open;
  return enabled !== true;
}
function shareDetailsChoose(gm, open) { gm.set(SHARE_DETAILS_STORE, { schemaVersion: 1, open: open === true }); }
function shareDetailsReset(gm) { gm.del(SHARE_DETAILS_STORE); }

function shareEmptyState() {
  return { schemaVersion: 1, enabled: false, cursor: null, recent: {}, carsSentAt: null, lastSentAt: null, races: 0, cars: 0, stop: null };
}
function shareNonNegInt(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function shareNumOrNull(v) { return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null; }

// Reads the stored state. Anything that does not look right is the default: OFF, nothing sent, no cursor (fail-closed: garbage never switches sharing on).
function shareReadState(gm) {
  let v = null;
  try { v = gm.get(SHARE_STORE, null); } catch (e) { v = null; }
  if (!isPlainObject(v) || v.schemaVersion !== 1) return shareEmptyState();
  const recent = {};
  if (isPlainObject(v.recent)) for (const id of Object.keys(v.recent)) if (Number.isInteger(v.recent[id]) && v.recent[id] > 0) recent[id] = v.recent[id];
  const stop = isPlainObject(v.stop) && typeof v.stop.text === 'string' ? { text: v.stop.text, code: Number.isInteger(v.stop.code) ? v.stop.code : null } : null;
  return {
    schemaVersion: 1, enabled: v.enabled === true, cursor: Number.isInteger(v.cursor) && v.cursor > 0 ? v.cursor : null, recent: recent,
    carsSentAt: shareNumOrNull(v.carsSentAt), lastSentAt: shareNumOrNull(v.lastSentAt), races: shareNonNegInt(v.races), cars: shareNonNegInt(v.cars), stop: stop,
  };
}

function shareReadSession(gm, nowMs) {
  let v = null;
  try { v = gm.get(SHARE_SESSION_STORE, null); } catch (e) { v = null; }
  if (!isPlainObject(v) || v.schemaVersion !== 1 || typeof v.token !== 'string' || v.token === '' || !Number.isFinite(v.expiresAt)) return null;
  return v.expiresAt - nowMs > SHARE_SESSION_MARGIN_MS ? v : null;
}

function shareFmtCount(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function shareAgoText(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'less than 1 min ago';
  if (min < 60) return min + ' min ago';
  const h2 = Math.floor(min / 60);
  return h2 < 48 ? h2 + ' h ago' : Math.floor(h2 / 24) + ' days ago';
}
function shareWaitText(ms) {
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? 'less than 1 min' : (min < 120 ? min + ' min' : Math.ceil(min / 60) + ' h');
}

// The bytes of a JSON text as the server counts them (UTF-8).
function shareBytes(text) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length; }

// Splits a list so that each part, as a payload {fetchedAt, <field>: part}, is at most the limit. -> array of parts, or null when one single item is over the limit.
function shareSplit(items, field, fetchedAt, limit) {
  const payload = {};
  payload.fetchedAt = fetchedAt;
  payload[field] = items;
  if (shareBytes(JSON.stringify(payload)) <= limit) return [items];
  if (items.length < 2) return null;
  const mid = Math.ceil(items.length / 2);
  const a = shareSplit(items.slice(0, mid), field, fetchedAt, limit);
  const b = shareSplit(items.slice(mid), field, fetchedAt, limit);
  return a === null || b === null ? null : a.concat(b);
}

// api.torn.com for sharing: its own budget (SHARE_TORN_CALLS_PER_MINUTE), the key only in the Authorization header, never a cache buster.
function createShareTorn(fetchImpl, nowFn) {
  let callTimes = [];
  return async function get(url, key) {
    const now = nowFn();
    callTimes = callTimes.filter(function (t) { return t > now - 60000; });
    if (callTimes.length >= SHARE_TORN_CALLS_PER_MINUTE) return { ok: false, kind: 'BUDGET' };
    callTimes.push(now);
    let res;
    let json = null;
    try {
      res = await fetchImpl(url, { method: 'GET', headers: { Authorization: 'ApiKey ' + key, Accept: 'application/json' }, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      try { json = await res.json(); } catch (e) { json = null; }
    } catch (err) {
      return { ok: false, kind: 'NETWORK' };
    }
    if (isPlainObject(json) && isPlainObject(json.error)) {
      const code = Number.isInteger(json.error.code) ? json.error.code : null;
      const c = KSRL.classifyErrorCode(code);
      return { ok: false, kind: c === 'KEY_FATAL' ? 'KEY_FATAL' : (c === 'RETRY_LATER' ? 'RETRY_LATER' : (c === 'ACCESS_LEVEL' ? 'ACCESS' : 'OTHER')), code: code };
    }
    if (!res || !res.ok) return { ok: false, kind: 'HTTP', code: res && Number.isInteger(res.status) ? res.status : null };
    return { ok: true, json: json };
  };
}

// 0.7.0: the KS server, as ONE object for both users of it (the sharing switch and the "Show KS faction race data" switch): the three addresses, the one
// login (POST /session with the Torn key, once per session) and the one stored session (SHARE_SESSION_STORE). Two callers at the same moment share one login.
// deps: gm {get,set,del}, now(), logger, workerPost(path, body) -> {status, json}
function createKsServer(deps) {
  const gm = deps.gm;
  const nowFn = deps.now;
  const logger = deps.logger;
  let inflight = null;
  async function post(path, body) {
    if (SHARE_PATHS.indexOf(path) < 0) throw new Error('not an allowed server address');
    return deps.workerPost(path, body);
  }
  async function login(key) {
    const r = await post('/session', { key: key });
    const j = isPlainObject(r.json) ? r.json : null;
    if (r.status === 200 && j && j.ok === true && typeof j.session === 'string' && j.session !== '') {
      logger.addSecret(j.session);
      const exp = Number.isFinite(j.expiresAt) ? j.expiresAt : nowFn() + 600000;
      gm.set(SHARE_SESSION_STORE, { schemaVersion: 1, token: j.session, expiresAt: exp });
      return { ok: true, token: j.session };
    }
    return { ok: false, r: r };
  }
  // -> { ok: true, token } | { ok: false, r } (r = the answer of the server to the login)
  async function ensureSession(key) {
    const have = shareReadSession(gm, nowFn());
    if (have) { logger.addSecret(have.token); return { ok: true, token: have.token }; }
    if (inflight) return inflight;
    inflight = login(key).then(function (x) { inflight = null; return x; }, function (e) { inflight = null; throw e; });
    return inflight;
  }
  function dropSession() { gm.del(SHARE_SESSION_STORE); }
  return { post: post, ensureSession: ensureSession, dropSession: dropSession };
}

// deps: gm {get,set,del}, now(), logger, getKey() -> string|null, tornGet(url, key), workerPost(path, body) -> {status, json}, visible(), captcha(), ks (optional: the shared createKsServer object)
function createSharer(deps) {
  const gm = deps.gm;
  const nowFn = deps.now;
  const logger = deps.logger;
  const ks = deps.ks || createKsServer(deps);
  const listeners = [];
  let gen = 0;
  let activeGen = -1;      // the generation of the round that is running now (-1: none)
  let nextAllowedMs = 0;
  let last = null;     // the result of the last round: { kind, text, link }

  function notify() { for (const f of listeners) { try { f(); } catch (e) { /* a broken listener never stops sharing */ } } }
  function state() { return shareReadState(gm); }
  function save(s) { gm.set(SHARE_STORE, s); }
  function setLast(out) { last = out; notify(); }
  function out(kind, text, delayMs, link) { return { kind: kind, text: text, delayMs: delayMs, link: link || null }; }

  function isEnabled() { return state().enabled; }

  function setEnabled(on) {
    const s = state();
    gen++;                               // a round in flight is dropped: its answers are not used
    s.enabled = on === true;
    if (on === true) { s.stop = null; nextAllowedMs = 0; }
    save(s);
    last = on === true ? null : out('OFF', 'Off. Nothing is sent.', SHARE_INTERVAL_MS);
    notify();
  }
  function cancel() { gen++; }
  // A new or removed key: a stop caused by the old key is lifted and the session (made with the old key) is dropped.
  function onKeyChanged() {
    const s = state();
    gen++;
    if (s.stop) { s.stop = null; save(s); }
    gm.del(SHARE_SESSION_STORE);
    nextAllowedMs = 0;
    last = null;
    notify();
  }
  function clearAll() { gen++; gm.del(SHARE_STORE); gm.del(SHARE_SESSION_STORE); shareDetailsReset(gm); nextAllowedMs = 0; last = null; notify(); }

  // The line under the switch. A state that is not known is UNKNOWN, never a success.
  function status() {
    const s = state();
    if (!s.enabled) return last && last.kind === 'NOT_ALLOWED' ? { kind: 'NOT_ALLOWED', text: last.text, link: null } : { kind: 'OFF', text: 'Off. Nothing is sent.', link: null };
    if (s.stop) return { kind: 'STOPPED', text: s.stop.text, link: null };
    if (last && last.kind !== 'OK' && last.kind !== 'IDLE') return { kind: last.kind, text: last.text + (s.lastSentAt ? ' · ' + shareSummary(s) : ''), link: last.link };
    if (s.lastSentAt === null && s.races === 0 && s.cars === 0) return { kind: last ? last.kind : 'WAITING', text: last && last.text ? last.text : 'On. Waiting for the first round.', link: null };
    return { kind: 'OK', text: shareSummary(s), link: null };
  }
  function shareSummary(s) {
    return 'Shared: ' + shareFmtCount(s.races) + ' race' + (s.races === 1 ? '' : 's') + ', ' + shareFmtCount(s.cars) + ' car' + (s.cars === 1 ? '' : 's') +
      (s.lastSentAt ? ' · last sent ' + shareAgoText(nowFn() - s.lastSentAt) : '');
  }

  // ---- the KS server (createKsServer, shared with the "Show KS faction race data" switch)
  const waitMs = function (j) {
    const sec = isPlainObject(j) && Number.isFinite(j.retryAfterSeconds) ? j.retryAfterSeconds : 900;
    return Math.min(SHARE_MAX_WAIT_MS, Math.max(1000, sec * 1000));
  };

  // -> { ok: true, token } | { ok: false, out }
  async function ensureSession(key) {
    const sess = await ks.ensureSession(key);
    return sess.ok ? sess : { ok: false, out: failFromServer(sess.r, 'login') };
  }

  // The answer of the server to a call that did not succeed -> the result of the round.
  function failFromServer(r, what) {
    const j = isPlainObject(r.json) ? r.json : null;
    const err = j && typeof j.error === 'string' ? j.error : '';
    if (r.status === 403 && err === 'not_allowed') {
      const s = state();
      s.enabled = false;
      save(s);
      gm.del(SHARE_SESSION_STORE);
      return out('NOT_ALLOWED', SHARE_ONLY_TEXT, SHARE_INTERVAL_MS);
    }
    if (r.status === 429 && err === 'share_rate_limited') {
      const ms = waitMs(j);
      return out('WAIT', 'Daily share limit reached. Next try in ' + shareWaitText(ms) + '.', ms);
    }
    if (r.status === 429) {
      const ms = waitMs(j);
      return out('WAIT', 'The server asks to wait. Next try in ' + shareWaitText(ms) + '.', ms);
    }
    if (r.status === 401 && err === 'key_rejected') {
      const code = Number.isInteger(j.tornErrorCode) ? j.tornErrorCode : null;
      if (code === 16) return out('ACCESS', 'Your key is missing access (Torn error 16). It needs user → basic, races, enlistedcars. Make a new key:', SHARE_INTERVAL_MS, SHARE_KEY_LINK);
      return shareStopOut(code);
    }
    if (r.status === 503 && err === 'key_rejected') return out('WAIT', 'Torn is busy right now. Will try again later.', SHARE_INTERVAL_MS);
    if (r.status === 400 && err === 'invalid_key') return out('ERROR', 'The key does not look like a Torn API key. Change it in this panel.', SHARE_INTERVAL_MS);
    if (r.status === 400) return out('ERROR', 'The server did not accept the data' + (j && typeof j.detail === 'string' ? ' (' + j.detail.slice(0, 40) + ')' : '') + '.', SHARE_INTERVAL_MS);
    if (r.status === 0) return out('UNKNOWN', 'UNKNOWN: could not reach the KS server. Will try again later.', SHARE_INTERVAL_MS);
    return out('UNKNOWN', 'UNKNOWN: the KS server answered ' + (what === 'login' ? 'the login' : 'the data') + ' in a way this script does not know (HTTP ' + r.status + ').', SHARE_INTERVAL_MS);
  }

  // Torn says the key is dead (2, 10, 13, 18): sharing stops and stays stopped until the key is changed or the switch is turned off and on.
  function shareStopOut(code) {
    const text = 'Torn rejected the key' + (code === null ? '' : ' (error ' + code + ')') + '. Sharing is stopped until you change the key.';
    const s = state();
    s.stop = { text: text, code: code };
    save(s);
    gm.del(SHARE_SESSION_STORE);
    return out('STOPPED', text, SHARE_INTERVAL_MS);
  }

  // One submit. -> { ok: true } | { ok: false, out }. A session the server refuses is replaced once.
  async function submit(key, kind, payload) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const sess = await ensureSession(key);
      if (!sess.ok) return sess;
      const r = await ks.post('/share/submit', { session: sess.token, kind: kind, payload: payload });
      if (r.status === 200 && isPlainObject(r.json) && r.json.ok === true) return { ok: true };
      if (r.status === 401) { gm.del(SHARE_SESSION_STORE); continue; }
      return { ok: false, out: failFromServer(r, 'data') };
    }
    return { ok: false, out: out('UNKNOWN', 'UNKNOWN: the server keeps refusing the login. Will try again later.', SHARE_INTERVAL_MS) };
  }

  // A Torn answer that is not a success -> the result of the round.
  function failFromTorn(r, what) {
    if (r.kind === 'BUDGET') return out('WAIT', 'Waiting for the next minute (at most ' + SHARE_TORN_CALLS_PER_MINUTE + ' Torn calls per minute).', SHARE_BUDGET_WAIT_MS);
    if (r.kind === 'KEY_FATAL') return shareStopOut(r.code);
    if (r.kind === 'ACCESS') return out('ACCESS', 'Your key is missing access to ' + what + ' (Torn error 16). It needs user → basic, races, enlistedcars. Make a new key:', SHARE_INTERVAL_MS, SHARE_KEY_LINK);
    if (r.kind === 'RETRY_LATER') return out('WAIT', 'Torn is busy right now (error ' + r.code + '). Will try again later.', SHARE_INTERVAL_MS);
    return out('UNKNOWN', 'UNKNOWN: could not read ' + what + ' from the Torn API. Will try again later.', SHARE_INTERVAL_MS);
  }

  // Races: from the cursor minus the overlap, page by page. Only finished races that were not sent yet. The cursor moves only after the server said ok.
  async function shareRaces(key, stale) {
    let s = state();
    let from = s.cursor === null ? null : Math.max(0, s.cursor - SHARE_OVERLAP_S);
    for (let page = 0; page < SHARE_MAX_PAGES_PER_RUN; page++) {
      if (stale()) return out('ABORT', '', SHARE_INTERVAL_MS);
      const r = await deps.tornGet(KSRL.racesUrl(from === null ? undefined : from), key);
      if (stale()) return out('ABORT', '', SHARE_INTERVAL_MS);
      if (!r.ok) return failFromTorn(r, 'races');
      const raws = isPlainObject(r.json) && Array.isArray(r.json.races) ? r.json.races : null;
      const good = raws !== null && raws.every(function (x) { return isPlainObject(x) && Number.isInteger(x.id) && isPlainObject(x.schedule) && Number.isInteger(x.schedule.start); });
      if (!good) return out('UNKNOWN', 'UNKNOWN: the races from the Torn API have an unexpected shape. Nothing was sent.', SHARE_INTERVAL_MS);
      s = state();
      const finished = raws.filter(function (x) { return x.status === 'finished'; });
      const fresh = finished.filter(function (x) { return !Object.prototype.hasOwnProperty.call(s.recent, String(x.id)); });
      let maxFinished = 0;
      for (const x of finished) if (x.schedule.start > maxFinished) maxFinished = x.schedule.start;
      let maxAny = 0;
      for (const x of raws) if (x.schedule.start > maxAny) maxAny = x.schedule.start;
      if (fresh.length > 0) {
        const fetchedAt = Math.floor(nowFn() / 1000);
        const parts = shareSplit(fresh, 'races', fetchedAt, SHARE_MAX_PAYLOAD_BYTES);
        if (parts === null) return out('ERROR', 'A single race is too large to send.', SHARE_INTERVAL_MS);
        for (const part of parts) {
          if (stale()) return out('ABORT', '', SHARE_INTERVAL_MS);
          const sub = await submit(key, 'races', { fetchedAt: fetchedAt, races: part });
          if (!sub.ok) return sub.out;
          s = state();
          for (const x of part) s.recent[String(x.id)] = x.schedule.start;      // these are on the server now (also if a later part of the page fails)
          s.races += part.length;
          s.lastSentAt = nowFn();
          save(s);
        }
      }
      if (finished.length > 0) {
        s = state();
        if (s.cursor === null || maxFinished > s.cursor) s.cursor = maxFinished;      // only here, after every part of the page was answered ok
        const keepFrom = s.cursor - 2 * SHARE_OVERLAP_S;
        for (const id of Object.keys(s.recent)) if (s.recent[id] < keepFrom) delete s.recent[id];
        save(s);
      }
      if (raws.length < SHARE_RACE_PAGE) return null;           // the last page: done
      const next = maxAny - 1;
      if (from !== null && next <= from) return out('UNKNOWN', 'UNKNOWN: the race list does not move on. Will try again later.', SHARE_INTERVAL_MS);
      from = next;
    }
    return out('WAIT', 'Reading the race history in steps ...', SHARE_BUDGET_WAIT_MS);
  }

  // Cars: user/enlistedcars at most once a day.
  async function shareCars(key, stale) {
    const s0 = state();
    if (s0.carsSentAt !== null && nowFn() - s0.carsSentAt < SHARE_CARS_INTERVAL_MS) return null;
    const r = await deps.tornGet(KSRL.selectionUrl('user/enlistedcars'), key);
    if (stale()) return out('ABORT', '', SHARE_INTERVAL_MS);
    if (!r.ok) return failFromTorn(r, 'enlistedcars');
    const cars = isPlainObject(r.json) && Array.isArray(r.json.enlistedcars) ? r.json.enlistedcars : null;
    if (cars === null) return out('UNKNOWN', 'UNKNOWN: the cars from the Torn API have an unexpected shape. Nothing was sent.', SHARE_INTERVAL_MS);
    const fetchedAt = Math.floor(nowFn() / 1000);
    const parts = shareSplit(cars, 'enlistedcars', fetchedAt, SHARE_MAX_PAYLOAD_BYTES);
    if (parts === null) return out('ERROR', 'A single car is too large to send.', SHARE_INTERVAL_MS);
    for (const part of parts) {
      if (stale()) return out('ABORT', '', SHARE_INTERVAL_MS);
      const sub = await submit(key, 'enlistedcars', { fetchedAt: fetchedAt, enlistedcars: part });
      if (!sub.ok) return sub.out;
    }
    const s = state();
    s.cars = cars.length;
    s.carsSentAt = nowFn();
    s.lastSentAt = nowFn();
    save(s);
    return null;
  }

  // One round. opts.force: the switch was just turned on, or the page just loaded (ignores the 15-minute wait).
  async function run(opts) {
    const force = !!(opts && opts.force);
    const s = state();
    if (!s.enabled) return out('OFF', 'Off. Nothing is sent.', SHARE_INTERVAL_MS);                        // switched off: not a single call
    if (s.stop) return out('STOPPED', s.stop.text, SHARE_INTERVAL_MS);
    if (activeGen === gen) return out('BUSY', '', SHARE_INTERVAL_MS);
    if (!deps.visible()) return out('HIDDEN', '', SHARE_INTERVAL_MS);                                      // the page is in the background: not a single call
    if (deps.captcha()) return out('CAPTCHA', '', SHARE_INTERVAL_MS);
    if (!force && nowFn() < nextAllowedMs) return out('THROTTLED', '', Math.max(1000, nextAllowedMs - nowFn()));
    const key = deps.getKey();
    if (typeof key !== 'string' || key === '') { const o = out('NOKEY', 'Add your Torn API key above to share.', SHARE_INTERVAL_MS); setLast(o); return o; }
    logger.addSecret(key);
    const myGen = ++gen;
    activeGen = myGen;
    const stale = function () { return myGen !== gen || !state().enabled; };
    let result;
    try {
      result = await shareRaces(key, stale);
      if (result === null) result = await shareCars(key, stale);
      if (result === null) result = out('OK', '', SHARE_INTERVAL_MS);
    } catch (e) {
      result = out('UNKNOWN', 'UNKNOWN: something went wrong while sharing. Will try again later.', SHARE_INTERVAL_MS);
    } finally {
      if (activeGen === myGen) activeGen = -1;
    }
    if (result.kind === 'ABORT') return result;
    nextAllowedMs = nowFn() + result.delayMs;
    setLast(result);
    return result;
  }

  return { run: run, status: status, isEnabled: isEnabled, setEnabled: setEnabled, cancel: cancel, onKeyChanged: onKeyChanged, clearAll: clearAll, onChange: function (f) { listeners.push(f); } };
}
/* ksrl-share END */

/* ksrl-views BEGIN - 0.7.0: real results per track from the KS server, on Change car. OFF by default (its own switch). No DOM and no globals here: the transports
   (the KS server object, the clock, the key, the visibility of the page) are handed in, so the tests drive it in Node. It sends the Torn key to the KS server once
   per login (the same login as the sharing switch, createKsServer) and nothing else; it reads three tables with POST /views/get. */
const VIEWS_SWITCH_STORE = 'ksrl.v1.viewsSwitch';
const VIEWS_CACHE_STORE = 'ksrl.v1.views';
const VIEWS_DETAILS_STORE = 'ksrl.v1.viewsDetails';
const SHARE_NOTICE_STORE = 'ksrl.v1.shareNotice';
const VIEW_NAMES = ['car_track_stats', 'track_models', 'faction_builds'];
const VIEWS_INTERVAL_MS = 15 * 60 * 1000;          // at most one read per 15 minutes while Change car is open and visible
const VIEWS_STALE_S = 43200;                       // a view older than 12 h is shown as STALE, in grey
const VIEWS_MAX_GROUPS = 5000;
const VIEWS_TITLE = 'Show KS faction race data';
const VIEWS_NOT_ALLOWED_TEXT = 'The KS server did not let your account in.';
const VIEWS_OFF_ROW = 'Switch on Show KS faction race data to see real results.';
const SHARE_NOTICE_TEXT = 'What KS members can see has changed. Read it below.';
const VIEWS_DISCLOSURE = [
  'Off until you switch it on. While it is off the script does not contact the KS server for this.',
  'What it does: logs in to racing.kingshadeprotocol.com (the KS Racing Lab server run by Kingshade) and reads three tables: your own race results per car and track, lap times per car model and track from all drivers in races that KS members shared (no names or IDs), and the parts and lap times of builds that KS members shared (no names or IDs).',
  'Your Torn API key is used once per login to prove who you are. The server does not store it. Nothing else is sent.',
  'When: only on the Change car page while it is open and visible, at most every 15 minutes.',
];

function viewsEmptySwitch() { return { schemaVersion: 1, enabled: false, stop: null }; }
// Anything that does not look right is the default: OFF (fail-closed: garbage never switches the reading on).
function viewsReadSwitch(gm) {
  let v = null;
  try { v = gm.get(VIEWS_SWITCH_STORE, null); } catch (e) { v = null; }
  if (!isPlainObject(v) || v.schemaVersion !== 1) return viewsEmptySwitch();
  const stop = isPlainObject(v.stop) && typeof v.stop.text === 'string' ? { text: v.stop.text, code: Number.isInteger(v.stop.code) ? v.stop.code : null } : null;
  return { schemaVersion: 1, stop: stop, enabled: v.enabled === true };
}

// The details under the views switch fold away like the ones under the sharing switch (own room): open to begin with while the switch is off, folded while it is on.
function viewsDetailsOpen(gm, enabled) {
  const v = gm.get(VIEWS_DETAILS_STORE, null);
  if (isPlainObject(v) && v.schemaVersion === 1 && typeof v.open === 'boolean') return v.open;
  return enabled === true ? false : true;
}
function viewsDetailsChoose(gm, open) { gm.set(VIEWS_DETAILS_STORE, { schemaVersion: 1, open: open === true }); }
function viewsDetailsReset(gm) { gm.del(VIEWS_DETAILS_STORE); }

// The notice for players who already share: shown once, until they press OK (the player who switches sharing on under the new text has read it: acknowledged then).
function shareNoticePending(gm, sharing) {
  if (sharing !== true) return false;
  let v = null;
  try { v = gm.get(SHARE_NOTICE_STORE, null); } catch (e) { v = null; }
  return !(isPlainObject(v) && v.schemaVersion === 1 && v.acked === true);
}
function shareNoticeAck(gm) { gm.set(SHARE_NOTICE_STORE, { schemaVersion: 1, acked: true }); }

// ---- what comes from the server is checked and cleaned before anything is shown (any doubt = the whole view is UNKNOWN, never a guess)
function viewsClean(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
function vInt(x) { return Number.isInteger(x) && x >= 0 && x <= 9007199254740991; }
function vPos(x) { return vInt(x) && x > 0; }
function vNum(x) { return typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1e7; }
function vNumOrNull(x) { return x === null || vNum(x); }
function vBin(x) { return x === 0 || x === 1; }
function vClass(x) { return typeof x === 'string' && KSRL.CLASSES.indexOf(x) >= 0; }

// -> { ok: true, groups, extra } | { ok: false, reason: 'schema' | 'shape' }
function viewsCheckPayload(name, p, ownId) {
  if (!isPlainObject(p)) return { ok: false, reason: 'shape' };
  if (p.schema !== 1) return { ok: false, reason: 'schema' };
  if (!Array.isArray(p.groups) || p.groups.length > VIEWS_MAX_GROUPS) return { ok: false, reason: 'shape' };
  const groups = [];
  if (name === 'car_track_stats') {
    if (p.tornId !== ownId) return { ok: false, reason: 'shape' };
    for (const g of p.groups) {
      if (!isPlainObject(g)) return { ok: false, reason: 'shape' };
      const nm = viewsClean(g.car_item_name, 60);
      if (!vPos(g.car_id) || nm === null || !(g.snap === null || vPos(g.snap)) || !vPos(g.track_id) || !vBin(g.official) || !vPos(g.laps) || !vPos(g.n) ||
        !vInt(g.n_crashed) || !vInt(g.n_timed) || !vNumOrNull(g.best) || !vNumOrNull(g.median) || !vInt(g.wins)) return { ok: false, reason: 'shape' };
      groups.push({ car_id: g.car_id, car_item_name: nm, snap: g.snap, track_id: g.track_id, official: g.official, laps: g.laps, n: g.n, n_crashed: g.n_crashed, n_timed: g.n_timed, best: g.best, median: g.median, wins: g.wins });
    }
    return { ok: true, payload: { schema: 1, tornId: ownId, groups: groups } };
  }
  if (name === 'track_models') {
    if (!Array.isArray(p.below_threshold) || p.below_threshold.length > VIEWS_MAX_GROUPS) return { ok: false, reason: 'shape' };
    for (const g of p.groups) {
      if (!isPlainObject(g)) return { ok: false, reason: 'shape' };
      const nm = viewsClean(g.car_item_name, 60);
      if (!vPos(g.track_id) || !vPos(g.laps) || !vClass(g.car_class) || !vPos(g.car_item_id) || nm === null || !vPos(g.n) || !vPos(g.drivers) ||
        !vNum(g.best) || !vNum(g.p10) || !vNum(g.median)) return { ok: false, reason: 'shape' };
      groups.push({ track_id: g.track_id, laps: g.laps, car_class: g.car_class, car_item_id: g.car_item_id, car_item_name: nm, n: g.n, drivers: g.drivers, best: g.best, p10: g.p10, median: g.median });
    }
    const below = [];
    for (const b of p.below_threshold) {
      if (!isPlainObject(b) || !vPos(b.track_id) || !vPos(b.laps) || !vClass(b.car_class) || !vPos(b.models)) return { ok: false, reason: 'shape' };
      below.push({ track_id: b.track_id, laps: b.laps, car_class: b.car_class, models: b.models });
    }
    return { ok: true, payload: { schema: 1, groups: groups, below_threshold: below } };
  }
  if (name === 'faction_builds') {
    for (const g of p.groups) {
      if (!isPlainObject(g)) return { ok: false, reason: 'shape' };
      const nm = viewsClean(g.car_item_name, 60);
      let stats = null;
      if (g.stats !== null && g.stats !== undefined) {
        if (!isPlainObject(g.stats)) return { ok: false, reason: 'shape' };
        stats = {};
        for (const k of ['top_speed', 'acceleration', 'braking', 'handling', 'safety']) {
          if (!(vInt(g.stats[k]))) { stats = null; break; }
          stats[k] = g.stats[k];
        }
      }
      if (!vPos(g.car_item_id) || nm === null || !Array.isArray(g.parts) || g.parts.length > 200 || !g.parts.every(vPos) || !vPos(g.track_id) || !vPos(g.laps) || !vBin(g.official) ||
        !vPos(g.n) || !vInt(g.n_crashed) || !vInt(g.n_timed) || !vNumOrNull(g.best) || !vNumOrNull(g.median) || !vInt(g.wins) || !vPos(g.owners)) return { ok: false, reason: 'shape' };
      groups.push({ car_item_id: g.car_item_id, car_item_name: nm, parts: g.parts.slice(), stats: stats, track_id: g.track_id, laps: g.laps, official: g.official, n: g.n, n_crashed: g.n_crashed, n_timed: g.n_timed, best: g.best, median: g.median, wins: g.wins, owners: g.owners });
    }
    return { ok: true, payload: { schema: 1, groups: groups } };
  }
  return { ok: false, reason: 'shape' };
}

// One view of the answer of /views/get -> { ok: true, view } | { ok: false, reason }
function viewsCheckView(name, v, ownId) {
  if (!isPlainObject(v) || v.name !== name) return { ok: false, reason: 'shape' };
  if (v.scope !== (name === 'car_track_stats' ? String(ownId) : 'shared')) return { ok: false, reason: 'shape' };
  if (!vPos(v.generatedAt) || !vPos(v.receivedAt) || !vInt(v.ageSeconds)) return { ok: false, reason: 'shape' };
  const c = viewsCheckPayload(name, v.payload, ownId);
  if (!c.ok) return c;
  return { ok: true, view: { name: name, scope: v.scope, generatedAt: v.generatedAt, receivedAt: v.receivedAt, ageSeconds: v.ageSeconds, payload: c.payload } };
}

// The answer of /views/get -> { ok: true, views: {name: view}, missing: {name: reason}, bad: {name: reason} } | { ok: false }
function viewsCheckAnswer(json, ownId) {
  if (!isPlainObject(json) || json.ok !== true || !isPlainObject(json.views) || !isPlainObject(json.missing)) return { ok: false };
  const out = { ok: true, views: {}, missing: {}, bad: {} };
  for (const name of VIEW_NAMES) {
    if (Object.prototype.hasOwnProperty.call(json.views, name)) {
      const c = viewsCheckView(name, json.views[name], ownId);
      if (c.ok) out.views[name] = c.view; else out.bad[name] = c.reason;
    } else if (Object.prototype.hasOwnProperty.call(json.missing, name)) out.missing[name] = viewsClean(json.missing[name], 40) || 'not_found';
    else out.bad[name] = 'shape';
  }
  return out;
}

// The stored copy of the last answer: bound to the Torn ID, every view checked again (what is in storage is not trusted). null = none or not valid (and then removed).
function viewsReadCache(gm, ownId, nowMs) {
  let rec = null;
  try { rec = gm.get(VIEWS_CACHE_STORE, null); } catch (e) { rec = null; }
  if (rec === null || rec === undefined) return null;
  const drop = function () { gm.del(VIEWS_CACHE_STORE); return null; };
  if (!isPlainObject(rec) || rec.schemaVersion !== 1 || rec.source !== 'views/get' || rec.tornId !== ownId || !Number.isFinite(rec.fetchedAt) || rec.fetchedAt > nowMs + 60000) return drop();
  if (!isPlainObject(rec.views) || !isPlainObject(rec.missing) || !isPlainObject(rec.bad)) return drop();
  const out = { fetchedAt: rec.fetchedAt, views: {}, missing: {}, bad: {} };
  for (const name of VIEW_NAMES) {
    const sv = rec.views[name];
    if (sv !== undefined) {
      if (!isPlainObject(sv) || sv.schemaVersion !== 1 || sv.source !== 'views/get' || !Number.isFinite(sv.fetchedAt) || sv.fetchedAt > nowMs + 60000) return drop();
      const c = viewsCheckView(name, sv, ownId);
      if (!c.ok) return drop();
      out.views[name] = Object.assign({}, c.view, { fetchedAt: sv.fetchedAt });
    } else if (typeof rec.missing[name] === 'string') out.missing[name] = rec.missing[name];
    else if (rec.bad[name] === 'schema' || rec.bad[name] === 'shape') out.bad[name] = rec.bad[name];
    else return drop();
  }
  return out;
}
function viewsWriteCache(gm, ownId, nowMs, answer, old) {
  const rec = { schemaVersion: 1, source: 'views/get', tornId: ownId, fetchedAt: nowMs, views: {}, missing: {}, bad: {} };
  for (const name of VIEW_NAMES) {
    const nw = answer.views[name];
    const was = old && old.views[name];
    // an older answer never writes over a newer one (generatedAt)
    const keep = nw && was && was.generatedAt > nw.generatedAt;
    if (keep) rec.views[name] = Object.assign({ schemaVersion: 1, source: 'views/get' }, was);
    else if (nw) rec.views[name] = Object.assign({ schemaVersion: 1, source: 'views/get', fetchedAt: nowMs }, nw);
    else if (answer.missing[name] !== undefined) rec.missing[name] = answer.missing[name];
    else rec.bad[name] = answer.bad[name] || 'shape';
  }
  gm.set(VIEWS_CACHE_STORE, rec);
}

// deps: gm, now(), logger, ks (createKsServer), getKey() -> string|null, getOwnId() -> integer|null, visible(), captcha()
function createViewsReader(deps) {
  const gm = deps.gm;
  const nowFn = deps.now;
  const logger = deps.logger;
  const ks = deps.ks;
  const listeners = [];
  let gen = 0;
  let activeGen = -1;
  let nextAllowedMs = 0;
  let last = null;       // the result of the last round that was not a success: { kind, text, link }

  function notify() { for (const f of listeners) { try { f(); } catch (e) { /* a broken listener never stops the reading */ } } }
  function out(kind, text, delayMs, link) { return { kind: kind, text: text, delayMs: delayMs, link: link || null }; }
  function sw() { return viewsReadSwitch(gm); }
  function isEnabled() { return sw().enabled; }
  function setLast(o) { last = o.kind === 'OK' ? null : o; notify(); }

  function setEnabled(on) {
    gen++;                                   // a round in flight is dropped: its answer is not used
    nextAllowedMs = 0;
    last = null;
    if (on === true) gm.set(VIEWS_SWITCH_STORE, { schemaVersion: 1, enabled: true, stop: null });
    else { gm.set(VIEWS_SWITCH_STORE, viewsEmptySwitch()); gm.del(VIEWS_CACHE_STORE); viewsDetailsReset(gm); }   // switched off: what was read is thrown away, the folding choice too
    notify();
  }
  function cancel() { gen++; }
  // A new key: what was read with the old one goes, a stop caused by the old key is lifted.
  function onKeyChanged() {
    gen++;
    const s = sw();
    if (s.stop) gm.set(VIEWS_SWITCH_STORE, { schemaVersion: 1, enabled: s.enabled, stop: null });
    gm.del(VIEWS_CACHE_STORE);
    nextAllowedMs = 0;
    last = null;
    notify();
  }
  function clearAll() { gen++; gm.del(VIEWS_SWITCH_STORE); gm.del(VIEWS_CACHE_STORE); viewsDetailsReset(gm); nextAllowedMs = 0; last = null; notify(); }

  // What the panel needs: the switch, whether a read is running, the last problem, and the stored answer (checked, bound to this player).
  function snapshot() {
    const s = sw();
    const own = deps.getOwnId();
    return { enabled: s.enabled, stop: s.stop, running: activeGen === gen && activeGen !== -1, last: last, cache: s.enabled && own !== null ? viewsReadCache(gm, own, nowFn()) : null, ownId: own };
  }

  const waitMs = function (j) {
    const sec = isPlainObject(j) && Number.isFinite(j.retryAfterSeconds) ? j.retryAfterSeconds : 900;
    return Math.min(3600 * 1000, Math.max(1000, sec * 1000));
  };
  function stopOut(code) {
    const text = 'Torn rejected the key' + (code === null ? '' : ' (error ' + code + ')') + '. Reading is stopped until you change the key.';
    const s = sw();
    gm.set(VIEWS_SWITCH_STORE, { schemaVersion: 1, enabled: s.enabled, stop: { text: text, code: code } });
    ks.dropSession();
    return out('STOPPED', text, VIEWS_INTERVAL_MS);
  }
  // The answer of the server to a call that did not succeed -> the result of the round.
  function failFromServer(r, what) {
    const j = isPlainObject(r.json) ? r.json : null;
    const err = j && typeof j.error === 'string' ? j.error : '';
    if (r.status === 403 && err === 'not_allowed') {
      gm.set(VIEWS_SWITCH_STORE, viewsEmptySwitch());
      gm.del(VIEWS_CACHE_STORE);
      ks.dropSession();
      return out('DENIED', VIEWS_NOT_ALLOWED_TEXT, VIEWS_INTERVAL_MS);
    }
    if (r.status === 429) { const ms = waitMs(j); return out('WAIT', 'The server asks to wait. Next try in ' + shareWaitText(ms) + '.', ms); }
    if (r.status === 401 && err === 'key_rejected') {
      const code = j && Number.isInteger(j.tornErrorCode) ? j.tornErrorCode : null;
      if (code === 16) return out('ACCESS', 'Your key is missing access (Torn error 16). Make a new key:', VIEWS_INTERVAL_MS, SHARE_KEY_LINK);
      return stopOut(code);
    }
    if (r.status === 503 && err === 'key_rejected') return out('WAIT', 'Torn is busy right now. Will try again later.', VIEWS_INTERVAL_MS);
    if (r.status === 400 && err === 'invalid_key') return out('ERROR', 'The key does not look like a Torn API key. Change it in the Parts panel.', VIEWS_INTERVAL_MS);
    if (r.status === 0) return out('OFFLINE', 'OFFLINE: could not reach the KS server. Will try again later.', VIEWS_INTERVAL_MS);
    return out('UNKNOWN', 'UNKNOWN: the KS server answered ' + (what === 'login' ? 'the login' : 'the read') + ' in a way this script does not know (HTTP ' + r.status + ').', VIEWS_INTERVAL_MS);
  }

  async function read(key, own, stale) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const sess = await ks.ensureSession(key);
      if (stale()) return out('ABORT', '', VIEWS_INTERVAL_MS);
      if (!sess.ok) return failFromServer(sess.r, 'login');
      const r = await ks.post('/views/get', { session: sess.token, names: VIEW_NAMES.slice() });
      if (stale()) return out('ABORT', '', VIEWS_INTERVAL_MS);
      if (r.status === 401) { ks.dropSession(); continue; }      // the session ran out: ONE new login, then one more try, no more
      if (r.status === 200) {
        const ans = viewsCheckAnswer(r.json, own);
        if (!ans.ok) return out('UNKNOWN', 'UNKNOWN: the KS server answered the read in a way this script does not know.', VIEWS_INTERVAL_MS);
        viewsWriteCache(gm, own, nowFn(), ans, viewsReadCache(gm, own, nowFn()));
        return out('OK', '', VIEWS_INTERVAL_MS);
      }
      return failFromServer(r, 'read');
    }
    return out('UNKNOWN', 'UNKNOWN: the server keeps refusing the login. Will try again later.', VIEWS_INTERVAL_MS);
  }

  // One round. opts.force: the switch was just turned on (ignores the 15-minute wait after a problem).
  async function run(opts) {
    const force = !!(opts && opts.force);
    const s = sw();
    if (!s.enabled) return out('OFF', '', VIEWS_INTERVAL_MS);                       // switched off: not a single call
    if (s.stop) return out('STOPPED', s.stop.text, VIEWS_INTERVAL_MS);
    if (activeGen === gen && activeGen !== -1) return out('BUSY', '', VIEWS_INTERVAL_MS);
    if (!deps.visible()) return out('HIDDEN', '', VIEWS_INTERVAL_MS);               // the page is in the background: not a single call
    if (deps.captcha()) return out('CAPTCHA', '', VIEWS_INTERVAL_MS);
    const key = deps.getKey();
    if (typeof key !== 'string' || key === '') return out('NOKEY', '', VIEWS_INTERVAL_MS);
    const own = deps.getOwnId();
    if (own === null) { const o = out('CHECKING', 'CHECKING: waiting for your Torn ID.', 5000); setLast(o); return o; }
    const cache = viewsReadCache(gm, own, nowFn());
    if (cache && nowFn() - cache.fetchedAt < VIEWS_INTERVAL_MS) return out('CACHED', '', VIEWS_INTERVAL_MS - (nowFn() - cache.fetchedAt));
    if (nowFn() < nextAllowedMs && !force) return out('THROTTLED', '', Math.max(1000, nextAllowedMs - nowFn()));
    logger.addSecret(key);
    const myGen = ++gen;
    activeGen = myGen;
    const stale = function () { return myGen !== gen || !sw().enabled; };
    notify();
    let result;
    try { result = await read(key, own, stale); }
    catch (e) { result = out('UNKNOWN', 'UNKNOWN: something went wrong while reading from the KS server. Will try again later.', VIEWS_INTERVAL_MS); }
    finally { if (activeGen === myGen) activeGen = -1; }
    if (result.kind === 'ABORT') { notify(); return result; }
    nextAllowedMs = nowFn() + result.delayMs;
    setLast(result);
    return result;
  }

  return { run: run, snapshot: snapshot, isEnabled: isEnabled, setEnabled: setEnabled, cancel: cancel, onKeyChanged: onKeyChanged, clearAll: clearAll, onChange: function (f) { listeners.push(f); } };
}

// ---- what is shown: rows of segments { t: text, g: green, d: grey }. Pure: the snapshot, the page and the clock in, rows out.
// ctx: { trackId, trackTitle, laps (integer|null), cars: [enlistedcars item of each car on the page, in page order] }
function viewsAgeMs(view, nowMs) { return view.ageSeconds * 1000 + Math.max(0, nowMs - view.fetchedAt); }
function viewsSource(view, nowMs) {
  const ms = viewsAgeMs(view, nowMs);
  return 'KS server, updated ' + shareAgoText(ms) + (ms > VIEWS_STALE_S * 1000 ? ' · STALE' : '');
}
function viewsPlural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
// 0.7.1: the words of the data part ("Show the data"): races, average lap (the median), top 10 % lap (p10), fastest lap (the best)
function viewsStatText(g) { return g.n_timed > 0 && g.median !== null && g.best !== null ? 'average lap ' + fmtTime(g.median) + ' · fastest lap ' + fmtTime(g.best) : 'no timed laps'; }

function realResultsRows(snap, ctx, nowMs) {
  const rows = [];
  const row = function (segs, cls) { rows.push({ cls: cls || 'ksrl-rr', segs: segs }); };
  const text = function (t, extra) { return Object.assign({ t: t }, extra || {}); };
  row([text('Real results on ' + ctx.trackTitle)], 'ksrl-rr ksrl-rr-head');
  if (!snap.enabled) { row([text(VIEWS_OFF_ROW)], 'ksrl-rr ksrl-rr-dim'); return rows; }
  if (snap.stop) row([text(snap.stop.text)], 'ksrl-rr ksrl-rr-warn');
  else if (snap.last && snap.last.kind !== 'OK') row([text(snap.last.text)], 'ksrl-rr ksrl-rr-warn');
  const cache = snap.cache;
  if (!cache) {
    if (snap.running || !snap.last) row([text('CHECKING: reading real results from the KS server …')], 'ksrl-rr ksrl-rr-dim');
    return rows;
  }
  const section = function (title, name, build) {
    row([text(title)], 'ksrl-rr ksrl-rr-sub');
    if (cache.missing[name] !== undefined) { row([text(title + ': not published yet')], 'ksrl-rr ksrl-rr-dim'); return; }
    if (cache.bad[name] !== undefined) { row([text('UNKNOWN: ' + (cache.bad[name] === 'schema' ? 'unknown schema' : 'unexpected shape') + ' in ' + title)], 'ksrl-rr ksrl-rr-warn'); return; }
    const view = cache.views[name];
    const stale = viewsAgeMs(view, nowMs) > VIEWS_STALE_S * 1000;
    const before = rows.length;
    build(view.payload, stale);
    row([text(viewsSource(view, nowMs), { d: true })], 'ksrl-rr ksrl-rr-dim');
    void before;
  };
  const mark = function (stale, segs) { return stale ? segs.map(function (s) { return { t: s.t, d: true }; }) : segs; };

  // a) your own cars on this track
  section('Your cars here', 'car_track_stats', function (p, stale) {
    const latest = {};
    for (const g of p.groups) if (g.snap !== null && (latest[g.car_id] === undefined || g.snap > latest[g.car_id])) latest[g.car_id] = g.snap;
    const none = [];
    let any = false;
    for (const e of ctx.cars) {
      const gs = p.groups.filter(function (g) { return g.car_id === e.id && g.track_id === ctx.trackId; })
        .sort(function (a, b) { return (b.official - a.official) || (a.laps - b.laps) || ((b.snap === null ? 0 : b.snap) - (a.snap === null ? 0 : a.snap)); });
      if (gs.length === 0) { none.push(e); continue; }
      any = true;
      for (const g of gs) {
        const build = g.snap === null ? 'build unknown' : (g.snap === latest[g.car_id] ? 'current build' : 'older build');
        row(mark(stale, [text(carName(e) + ' #' + e.id + ' · ' + (g.official === 1 ? 'official' : 'custom') + ' · ' + viewsPlural(g.laps, 'lap', 'laps') + ' · ' + viewsPlural(g.n, 'race', 'races') + ' · ' + viewsStatText(g) + ' · ' + viewsPlural(g.wins, 'win', 'wins') + ' · ' + build)]));
      }
    }
    if (!any) row(mark(stale, [text('No races here yet')]));
    else if (none.length > 0) row(mark(stale, [text('No races here yet: ' + none.map(function (e) { return carName(e) + ' #' + e.id; }).join(', '))]));
  });

  // b) the car models of all drivers on this track, in the class of the player
  section('Car models (all drivers)', 'track_models', function (p, stale) {
    let cls = null;
    for (const e of ctx.cars) if (KSRL.CLASSES.indexOf(e.class) >= 0 && (cls === null || KSRL.CLASSES.indexOf(e.class) < KSRL.CLASSES.indexOf(cls))) cls = e.class;
    if (cls === null) { row(mark(stale, [text('UNKNOWN: the class of your cars could not be read')]), 'ksrl-rr ksrl-rr-warn'); return; }
    const here = p.groups.filter(function (g) { return g.track_id === ctx.trackId && g.car_class === cls; });
    const lapsSum = {};
    for (const g of here) lapsSum[g.laps] = (lapsSum[g.laps] || 0) + g.n;
    for (const b of p.below_threshold) if (b.track_id === ctx.trackId && b.car_class === cls && lapsSum[b.laps] === undefined) lapsSum[b.laps] = 0;
    let laps = null;
    if (ctx.laps !== null && lapsSum[ctx.laps] !== undefined) laps = ctx.laps;
    else {
      for (const k of Object.keys(lapsSum).map(Number).sort(function (a, b) { return a - b; })) if (laps === null || lapsSum[k] > lapsSum[laps]) laps = k;
    }
    row(mark(stale, [text('class ' + cls + (laps === null ? '' : ' · ' + viewsPlural(laps, 'lap', 'laps')))]), 'ksrl-rr ksrl-rr-dim');
    const list = here.filter(function (g) { return g.laps === laps; })
      .sort(function (a, b) { return (a.p10 - b.p10) || (a.median - b.median) || (a.car_item_id - b.car_item_id); }).slice(0, 5);
    const mine = new Set(ctx.cars.map(function (e) { return e.car_item_id; }));
    if (list.length === 0) row(mark(stale, [text('No car model has enough data here yet')]));
    list.forEach(function (g, k) {
      const gap = k === 0 ? 0 : (g.p10 - list[0].p10) * 100 / list[0].p10;
      const tag = k === 0 ? ' · fastest' : (gap <= 1.0 ? ' · inside 1 % = coin flip' : '');
      const own = mine.has(g.car_item_id) && !stale;
      row(stale ? [text((k + 1) + '. ' + g.car_item_name + ' · top 10 % lap ' + fmtTime(g.p10) + ' · average lap ' + fmtTime(g.median) + ' · ' + viewsPlural(g.n, 'race', 'races') + ' · ' + viewsPlural(g.drivers, 'driver', 'drivers') + tag, { d: true })]
        : [text((k + 1) + '. '), text(g.car_item_name, own ? { g: true } : {}), text(' · top 10 % lap ' + fmtTime(g.p10) + ' · average lap ' + fmtTime(g.median) + ' · ' + viewsPlural(g.n, 'race', 'races') + ' · ' + viewsPlural(g.drivers, 'driver', 'drivers') + tag)]);
    });
    const bt = p.below_threshold.filter(function (b) { return b.track_id === ctx.trackId && b.car_class === cls && b.laps === laps; });
    const more = bt.reduce(function (sum, b) { return sum + b.models; }, 0);
    if (more > 0) row(mark(stale, [text(more + ' more ' + (more === 1 ? 'model' : 'models') + ' with too little data')]));
  });

  // c) builds that KS members shared, on this track
  section('Known builds (KS members)', 'faction_builds', function (p, stale) {
    const list = p.groups.filter(function (g) { return g.track_id === ctx.trackId; })
      .sort(function (a, b) { return (b.official - a.official) || ((a.median === null ? 1e12 : a.median) - (b.median === null ? 1e12 : b.median)) || (a.car_item_id - b.car_item_id) || (String(a.parts) < String(b.parts) ? -1 : (String(a.parts) > String(b.parts) ? 1 : 0)); }).slice(0, 5);
    if (list.length === 0) row(mark(stale, [text('No shared builds on this track yet')]));
    let usedStats = false;
    for (const g of list) {
      const tune = tuneCode(g.parts);
      let what;
      if (tune !== '---') what = tune;
      else if (g.stats) { what = 'stats ' + g.stats.top_speed + '/' + g.stats.acceleration + '/' + g.stats.braking + '/' + g.stats.handling + '/' + g.stats.safety; usedStats = true; }
      else what = 'code unknown';
      row(mark(stale, [text(g.car_item_name + ' · ' + (g.official === 1 ? 'official' : 'custom') + ' · ' + what + ' · ' + viewsStatText(g) + ' · ' + viewsPlural(g.n, 'race', 'races') + ' · ' + viewsPlural(g.owners, 'owner', 'owners') + (g.n < 3 ? ' · few races' : ''))]));
    }
    if (usedStats) row([text('stats = top speed / acceleration / braking / handling / safety', { d: true })], 'ksrl-rr ksrl-rr-dim');
  });
  return rows;
}
/* ksrl-views END */

/* ksrl-decide BEGIN - 0.7.1: ONE answer per track instead of raw data. Pure: the cars, the data and the clock go in, the decision comes out. No DOM, no requests, nothing stored
   except the one tick "Chase track records" (settings). Everything the KS server gave is used only when it is there and not STALE; the order of the sources is fixed. */
const SETTINGS_STORE = 'ksrl.v1.settings';
const CHASE_TITLE = 'Chase track records';
const CHASE_TEXT = 'For racers chasing track records: shows the exact fastest build down to gearbox and turbo, even when the difference is too small to show up in races.';
const CODE_LEGEND = 'T/D = tarmac or dirt parts · S/L = short or long gearbox · 2/3 = turbo stage';
const DECIDE_MIN_RACES = 15;       // a car model needs this many races ...
const DECIDE_MIN_DRIVERS = 5;      // ... by this many drivers before it can be the best car (the server filters the same way)
const DECIDE_OWN_MIN_RACES = 3;    // timed own races with the current build before they can overrule the model
const DECIDE_BUILD_MIN_RACES = 3;  // races of a build that KS members shared before its code is used
const DECIDE_REAL_DIFF_PCT = EQUAL_WITHIN_PCT;   // the medians of two own cars must differ by more than this before the races overrule the model
const DECIDE_KEEP_PCT = EQUAL_WITHIN_PCT;        // under this the difference has not shown up in real races: keep what you have
// Car models that cannot be bought: tournament prizes. 519 = Stormatti Casteon (Kingshade 2026-11-16; source: KS_Racing_Guide_v2.2, "a tournament prize you cannot buy").
const UNBUYABLE_CAR_ITEM_IDS = { 519: 'Stormatti Casteon' };
const BEST_UNKNOWN_OFF_TEXT = 'unknown without KS data — switch on ' + VIEWS_TITLE + '.';

// The tick: anything that does not look right is OFF (fail-closed: garbage never switches the chase on). Missing = OFF (migration from 0.7.0).
function settingsReadChase(gm) {
  let v = null;
  try { v = gm.get(SETTINGS_STORE, null); } catch (e) { v = null; }
  return isPlainObject(v) && v.schemaVersion === 1 && v.chase === true;
}
function settingsSetChase(gm, on) { gm.set(SETTINGS_STORE, { schemaVersion: 1, chase: on === true }); }

// The classes a race of class `cls` lets in: that class and every lower one (A is the highest).
function classesFrom(cls) { const i = KSRL.CLASSES.indexOf(cls); return i < 0 ? [] : KSRL.CLASSES.slice(i); }
function highestClass(cars) {
  let c = null;
  for (const e of cars || []) { const i = KSRL.CLASSES.indexOf(e && e.class); if (i >= 0 && (c === null || i < KSRL.CLASSES.indexOf(c))) c = e.class; }
  return c;
}

// What the decision may use of the KS server. snap = views.snapshot(). A view that is off, not loaded, missing, unreadable or older than 12 h (STALE) is NOT used;
// the reason says why (it goes into the "Why" row). Exactly 12 h is not STALE (as in the "Real results" rows).
function decisionData(snap, nowMs, base) {
  const out = { model: base.model || KSRL.LAP_MODEL, racing_cars: base.racingCars || null, upgrades: base.upgrades || null, partsClass: base.partsClass || null,
    records: base.records || null, track_models: null, faction_builds: null, car_track_stats: null, reasons: {} };
  for (const name of VIEW_NAMES) {
    let reason = null;
    const cache = snap && snap.enabled ? snap.cache : null;
    if (!snap || !snap.enabled) reason = 'KS faction data is off';
    else if (!cache) reason = snap.stop || (snap.last && snap.last.kind !== 'OK') ? 'KS faction data could not be read' : 'KS faction data is not loaded yet';
    else if (cache.missing[name] !== undefined) reason = 'KS faction data is not published yet';
    else if (cache.bad[name] !== undefined || !cache.views[name]) reason = 'KS faction data could not be read';
    else if (viewsAgeMs(cache.views[name], nowMs) > VIEWS_STALE_S * 1000) reason = 'KS faction data is too old (STALE)';
    else out[name] = cache.views[name].payload;
    out.reasons[name] = reason;
  }
  return out;
}

function decidePctText(p, chase) { return Math.max(0, p).toFixed(chase ? 2 : 1) + ' %'; }
// "x.x % slower"; under 0.5 % (and no chase) the difference has not shown up in races: "same speed in races"
function decideSlower(p, chase) {
  if (chase) return p < 0.005 ? 'same speed' : decidePctText(p, true) + ' slower';
  return p < DECIDE_KEEP_PCT ? 'same speed in races' : decidePctText(p, false) + ' slower';
}

// track: { id, title }. laps: the laps of the race, or null (then the official laps of the track: the group with the most races in track_models).
// allowedClasses: the classes the race lets in. myCars: your enlisted cars (user/enlistedcars items). data: decisionData(...) = { model, track_models, faction_builds,
// car_track_stats, records (the stored Torn records or null), racing_cars, upgrades, partsClass, reasons }. chase: the tick.
function decideTrack(track, laps, allowedClasses, myCars, data, chase) {
  const model = data.model || KSRL.LAP_MODEL;
  const tid = track.id;
  const title = track.title;
  const surface = trackSurfaceLabel(tid);
  const allowed = (allowedClasses || []).filter(function (c) { return KSRL.CLASSES.indexOf(c) >= 0; });
  const isChase = chase === true;
  const tm = data.track_models || null;
  const fb = data.faction_builds || null;
  const cts = data.car_track_stats || null;
  const reasons = data.reasons || {};
  const upgrades = Array.isArray(data.upgrades) ? data.upgrades : null;
  const out = {
    trackId: tid, trackTitle: title, surface: surface, allowed: allowed, chase: isChase, laps: null, best: null, yours: null, allWrong: false,
    have: false, gap: null, rec: null, swaps: [], why: '', badges: {}, badgeKinds: {}, rows: [],
  };

  // ---- laps and the races of all drivers on this track (car models of the allowed classes, enough races and drivers)
  const tmTrack = tm ? tm.groups.filter(function (g) { return g.track_id === tid && allowed.indexOf(g.car_class) >= 0 && g.n >= DECIDE_MIN_RACES && g.drivers >= DECIDE_MIN_DRIVERS; }) : [];
  let L = Number.isInteger(laps) && laps > 0 ? laps : null;
  if (L === null && tmTrack.length) {
    let g0 = null;
    for (const g of tmTrack) if (g0 === null || g.n > g0.n || (g.n === g0.n && g.laps < g0.laps)) g0 = g;
    L = g0.laps;
  }
  out.laps = L;
  const p10Of = new Map();
  for (const g of tmTrack) if (g.laps === L && (!p10Of.has(g.car_item_id) || g.p10 < p10Of.get(g.car_item_id).p10)) p10Of.set(g.car_item_id, g);

  // ---- the model: the exactly fastest build of a car model on this track
  const rcById = new Map();
  for (const c of Array.isArray(data.racing_cars) ? data.racing_cars : []) if (c && c.complete === true) rcById.set(c.car_item_id, c);
  const mbCache = new Map();
  function modelBest(id) {
    if (mbCache.has(id)) return mbCache.get(id);
    let r = null;
    const c = rcById.get(id);
    if (c && upgrades) {
      const est = KSRL.estimateBestBuild(model, tid, c, upgrades, data.partsClass);
      if (est.state !== 'UNKNOWN' && est.lap > 0 && Array.isArray(est.parts)) r = { lap: est.lap, parts: est.parts, code: tuneCode(est.parts.map(function (u) { return u.id; })) };
    }
    mbCache.set(id, r);
    return r;
  }

  // ---- 1a) BEST: the absolute best car model on this track among the allowed classes. First source that is enough: races, Torn record, model.
  // 0.7.1: car models that cannot be bought (tournament prizes; source: the guide) are skipped: BEST is the best car you can BUY. The faster prize car gets a line of its own.
  function pickBest(skip) {
  let best = null;
  const raceList = Array.from(p10Of.values()).filter(function (g) { return !skip[g.car_item_id]; }).sort(function (a, b) { return (a.p10 - b.p10) || (a.median - b.median) || (a.car_item_id - b.car_item_id); });
  if (raceList.length) {
    const g = raceList[0];
    best = { source: 'races', carItemId: g.car_item_id, name: g.car_item_name, cls: g.car_class, p10: g.p10, n: g.n, drivers: g.drivers };
  }
  if (best === null && data.records && isPlainObject(data.records.classes)) {
    let rb = null;
    for (const cls of allowed) {
      const en = data.records.classes[cls];
      const t = en && en.tracks ? en.tracks[String(tid)] : null;
      for (const r of t && Array.isArray(t.records) ? t.records : []) {
        if (r && Number.isInteger(r.car_item_id) && !skip[r.car_item_id] && typeof r.lap_time === 'number' && Number.isFinite(r.lap_time) && r.lap_time > 0 && (rb === null || r.lap_time < rb.lap_time)) rb = r;
      }
    }
    if (rb) {
      const c = rcById.get(rb.car_item_id);
      best = { source: 'track record', carItemId: rb.car_item_id, name: (c && c.car_item_name) || rb.car_item_name || ('car ' + rb.car_item_id), cls: c ? c.class : null };
    }
  }
  if (best === null) {
    let mbest = null;
    for (const c of rcById.values()) {
      if (allowed.indexOf(c.class) < 0 || skip[c.car_item_id]) continue;
      const mb = modelBest(c.car_item_id);
      if (mb && (mbest === null || mb.lap < mbest.lap || (mb.lap === mbest.lap && c.car_item_id < mbest.c.car_item_id))) mbest = { c: c, lap: mb.lap };
    }
    if (mbest) best = { source: 'model', carItemId: mbest.c.car_item_id, name: mbest.c.car_item_name, cls: mbest.c.class };
  }
  if (best) {
    if (best.p10 === undefined) { const g = p10Of.get(best.carItemId); best.p10 = g ? g.p10 : null; }
    const mb = modelBest(best.carItemId);
    best.lap = mb ? mb.lap : null;
    best.codeNote = null;
    if (mb) { best.code = mb.code; best.codeFrom = 'model'; }
    else {
      let bf = null;   // the fastest build that KS members shared for this model on this track (official races, the same laps)
      if (fb) for (const g of fb.groups) {
        if (g.car_item_id !== best.carItemId || g.track_id !== tid || g.official !== 1 || g.n < DECIDE_BUILD_MIN_RACES || g.median === null || (L !== null && g.laps !== L) || tuneCode(g.parts) === '---') continue;
        if (bf === null || g.median < bf.median) bf = g;
      }
      if (bf) { best.code = tuneCode(bf.parts); best.codeFrom = 'members'; }
      else if (surface === 'dirt' || surface === 'tarmac') { best.code = surface === 'dirt' ? 'D' : 'T'; best.codeFrom = 'surface'; best.codeNote = surface + ' parts'; }
      else { best.code = '?'; best.codeFrom = 'unknown'; }
    }
  }
  return best;
  }
  const anyBest = pickBest({});
  let best = anyBest;
  if (anyBest && UNBUYABLE_CAR_ITEM_IDS[anyBest.carItemId]) {
    best = pickBest(UNBUYABLE_CAR_ITEM_IDS);
    // how much faster the prize car is: from the same source for both (p10 of both models, else the model), else just "faster"
    let pct = null;
    if (best && anyBest.p10 !== null && best.p10 !== null) pct = (best.p10 / anyBest.p10 - 1) * 100;
    else if (best && anyBest.lap !== null && best.lap !== null) pct = (best.lap / anyBest.lap - 1) * 100;
    out.faster = { name: anyBest.name, pct: pct };
  }
  out.best = best;
  out.ksOff = reasons.track_models === 'KS faction data is off';

  // ---- 1b) YOURS: the best of your own cars in the allowed classes
  const mine = (myCars || []).filter(function (e) { return e && e.is_removed !== true; });
  const latest = {};
  if (cts) for (const g of cts.groups) if (g.snap !== null && (latest[g.car_id] === undefined || g.snap > latest[g.car_id])) latest[g.car_id] = g.snap;
  const rows = mine.map(function (e) {
    const parts = e.parts || [];
    const code = tuneCode(parts);
    let surf = 1;                                   // 0 = the surface of the track, 1 = neither, 2 = the other surface
    if (surface === 'tarmac') surf = parts.some(function (p) { return DIRT_SURFACE_PARTS.indexOf(p) >= 0; }) ? 2 : (code[0] === 'T' ? 0 : 1);
    else if (surface === 'dirt') surf = code[0] === 'D' ? 0 : (code[0] === 'T' ? 2 : 1);
    const inClass = allowed.indexOf(e.class) >= 0;
    let lap = null;
    if (inClass && !(surface === 'tarmac' && surf === 2)) {      // the model cannot weigh dirt parts on tarmac
      const est = KSRL.estimateFromStats(model, tid, e.class, e.stats);
      if (est.state !== 'UNKNOWN' && est.lap > 0) lap = est.lap;
    }
    let own = null;                                 // real races with the CURRENT build (the newest snapshot of the car), this track and these laps
    if (cts && L !== null && latest[e.id] !== undefined) {
      const g = cts.groups.find(function (x) { return x.car_id === e.id && x.track_id === tid && x.laps === L && x.official === 1 && x.snap === latest[e.id]; });
      if (g && g.n_timed >= DECIDE_OWN_MIN_RACES && g.median !== null) own = { median: g.median, n: g.n_timed };
    }
    const grp = p10Of.get(e.car_item_id) || null;
    return { car: e, id: e.id, carItemId: e.car_item_id, name: e.car_item_name, code: code, surf: surf, inClass: inClass, lap: lap, own: own, p10: grp ? grp.p10 : null };
  });
  out.rows = rows;
  const cands = rows.filter(function (r) { return r.inClass; });
  const hasModel = cands.some(function (r) { return r.lap !== null; });
  const surfaceFirst = surface === 'tarmac' || !hasModel;
  // a is better than b. Real races decide when both cars have enough of them with the current build and the medians differ by more than 0.5 %.
  function better(a, b) {
    if (surfaceFirst && a.surf !== b.surf) return a.surf < b.surf;
    if (a.own && b.own && Math.abs(a.own.median - b.own.median) / Math.min(a.own.median, b.own.median) * 100 > DECIDE_REAL_DIFF_PCT) return a.own.median < b.own.median;
    if (hasModel) {
      if (a.lap !== b.lap) { if (a.lap === null) return false; if (b.lap === null) return true; return a.lap < b.lap; }
    } else {
      if (a.own && b.own && a.own.median !== b.own.median) return a.own.median < b.own.median;
      if ((a.own !== null) !== (b.own !== null)) return a.own !== null;
      if (a.p10 !== b.p10) { if (a.p10 === null) return false; if (b.p10 === null) return true; return a.p10 < b.p10; }
    }
    return a.id < b.id;
  }
  let yours = null;
  for (const r of cands.slice().sort(function (a, b) { return ((a.lap === null ? 1 : 0) - (b.lap === null ? 1 : 0)) || ((a.lap || 0) - (b.lap || 0)) || (a.id - b.id); })) {
    if (yours === null || better(r, yours)) yours = r;
  }
  if (yours && surfaceFirst && yours.surf === 2) { out.allWrong = true; yours = null; }       // every car in the class has the other surface
  if (yours) out.yours = { id: yours.id, name: yours.name, carItemId: yours.carItemId, code: yours.code, surf: yours.surf, lap: yours.lap, p10: yours.p10, own: yours.own, car: yours.car };

  // ---- 1c) the gap between YOURS and BEST, in %, both from the same source: races (p10 of both models) or the model
  function gapBetween(y, ref) {
    if (y.carItemId === ref.carItemId && y.code === ref.code) return { pct: 0, source: null };
    if (y.carItemId !== ref.carItemId && y.p10 !== null && ref.p10 !== null) return { pct: (y.p10 - ref.p10) / ref.p10 * 100, source: 'races' };
    if (y.lap !== null && ref.lap !== null) return { pct: (y.lap - ref.lap) / ref.lap * 100, source: 'model' };
    return null;
  }
  const sameModel = !!(best && yours && yours.carItemId === best.carItemId);
  if (best && yours) {
    let gap = gapBetween(yours, { carItemId: best.carItemId, code: best.code, p10: best.p10, lap: best.lap });
    if (sameModel && best.codeFrom === 'surface' && yours.surf === 0) gap = { pct: 0, source: null };   // all that is known is the surface, and it is right
    out.gap = gap;
    out.have = gap !== null && gap.pct <= 0;
    // 0.7.1 (Kingshade): the same car model with the same surface and under 0.5 % apart counts as having it (no tick); with the tick the exact code is needed
    out.haveWithin = false;
    if (!out.have && !isChase && sameModel && gap !== null && gap.pct < DECIDE_KEEP_PCT && yours.code[0] === best.code[0]) { out.have = true; out.haveWithin = true; }
  }

  // ---- 1d) the recommendation
  const g = out.gap ? out.gap.pct : null;
  const src = out.gap && out.gap.source ? out.gap.source : 'model';
  if (best && yours && sameModel && !out.have) {      // which parts turn this car into the best build (gearbox, turbo, surface ...)
    const mb = modelBest(best.carItemId);
    if (mb && upgrades) {
      const byId = partsById(upgrades);
      const fitted = (yours.car.parts || []).map(function (id) { return byId.get(id); }).filter(function (u) { return !!u; });
      for (const bp of mb.parts) {
        if ((yours.car.parts || []).indexOf(bp.id) >= 0) continue;
        const was = fitted.find(function (f) { return f.subcategory === bp.subcategory; });
        out.swaps.push({ id: bp.id, name: bp.name, points: bp.cost.points, subcategory: bp.subcategory, replaces: was ? was.name : null });
      }
    }
  }
  if (best && yours) {
    if (isChase) {
      if (out.have) out.rec = { kind: 'chase-ok', text: 'This is the fastest build here: ' + yours.name + ' ' + yours.code + '.' };
      else if (g === null) out.rec = { kind: 'chase', text: 'The exact fastest build here is ' + best.code + '.' };
      else if (sameModel) {
        out.rec = { kind: 'chase', text: 'Your ' + yours.name + ' ' + yours.code + ' is ' + decideSlower(g, true) + ' (' + src + ').' +
          out.swaps.map(function (s) { return ' ' + (s.replaces ? 'Swap to ' : 'Buy ') + s.name + ': ' + s.points + ' RP.'; }).join('') };
      } else out.rec = { kind: 'chase', text: 'Your ' + yours.name + ' ' + yours.code + ' is ' + decideSlower(g, true) + ' than the ' + best.name + ' ' + best.code + ' (' + src + ').' };
    } else if (!out.have) {
      if (sameModel) {
        if (g !== null && g < DECIDE_KEEP_PCT) out.rec = { kind: 'keep', text: 'Keep it: your ' + yours.code + ' is as fast as ' + best.code + ' in races. A rebuild would be wasted points.' };
        else if (g !== null) out.rec = { kind: 'rebuild', text: 'Build ' + best.code + ' on this car to be ' + decidePctText(g, false) + ' faster. Parts & Modifications shows what to buy.' };
        else out.rec = { kind: 'build', text: 'The fastest build here is ' + best.code + '.' };
      } else if (g !== null && g < DECIDE_KEEP_PCT) out.rec = { kind: 'close', text: 'The ' + best.name + ' would be too little faster to show in races. Keep your car.' };
      else if (yours.surf !== 0 && (surface === 'dirt' || surface === 'tarmac')) out.rec = { kind: 'surface', text: 'Fit ' + surface + ' parts (' + (surface === 'dirt' ? 'D' : 'T') + ') on your ' + yours.name + ' to go faster here.' };
      else if (g !== null) out.rec = { kind: 'other', text: 'A ' + best.name + ' ' + best.code + ' would be ' + decidePctText(g, false) + ' faster than your ' + yours.name + '.' };
    }
  }

  // ---- why this is the answer, in words
  if (!best) out.why = 'No best car for ' + title + ' could be found: ' + (reasons.track_models || 'too few KS races') + ' and the model has no estimate here.';
  else if (best.source === 'races') out.why = 'Races of KS members: fastest car on ' + title + ' in ' + best.n + ' races by ' + best.drivers + ' drivers.';
  else out.why = (reasons.track_models || ('Too few KS races on ' + title)) + ' — based on the ' + (best.source === 'track record' ? 'Torn track record' : 'model') + '.';

  // ---- the badges on your cars in Torn's list
  const yref = yours ? { carItemId: yours.carItemId, code: yours.code, p10: yours.p10, lap: yours.lap } : null;
  for (const r of rows) {
    const key = String(r.id);
    if (yours && r.id === yours.id) { out.badges[key] = (isChase ? 'BEST FOR RECORDS' : 'BEST CAR HERE') + ' · ' + r.code; out.badgeKinds[key] = 'good'; }
    else if (!r.inClass) { out.badges[key] = r.code + ' · class too high for this race'; out.badgeKinds[key] = 'plain'; }
    else if (r.surf === 2) { out.badges[key] = r.code + ' · wrong parts for this track'; out.badgeKinds[key] = 'bad'; }
    else {
      const gp = yref ? gapBetween(r, yref) : null;
      out.badges[key] = r.code + ' · ' + (gp === null ? 'no estimate' : decideSlower(gp.pct, isChase));
      out.badgeKinds[key] = 'plain';
    }
  }
  return out;
}

// ---- what is shown. Lines of segments { t: text, g: true when green }; { cls, segs }. Pure.
function ansT(s, green) { return green ? { t: s, g: true } : { t: s }; }
function bestLabel(d) { return d.best ? d.best.name + ' ' + d.best.code : null; }

// Change car: the best car, whether you have it, why, and what would help
function changeAnswerRows(d, ctx) {
  const rows = [];
  const add = function (cls, segs) { rows.push({ cls: 'ksrl-ans ' + cls, segs: segs }); };
  if (!d.best) add('ksrl-ans-head', [ansT(d.ksOff ? 'Best car for ' + d.trackTitle + ': ' + BEST_UNKNOWN_OFF_TEXT : 'No best car known for ' + d.trackTitle + ' yet.')]);
  else add('ksrl-ans-head', [ansT('Best car for ' + d.trackTitle + ': ' + bestLabel(d) + (d.best.codeNote ? ' (' + d.best.codeNote + ')' : ''))]);
  if (d.best) {
    const y = d.yours;
    if (d.have) {
      const inRace = ctx && ctx.inRaceCarId === y.id;
      const within = d.haveWithin ? ' (as fast as ' + d.best.code + ' in races)' : '';
      add('ksrl-ans-line', [ansT('✔ You have it: ' + y.name + ' ' + y.code + ' #' + y.id + within + '. ' + (inRace ? 'It is already entered in this race.' : 'Click Change car on the green car below.'), true)]);
    } else if (y) {
      const phrase = d.gap ? ' — ' + decideSlower(d.gap.pct, d.chase) + ' (' + (d.gap.source || 'model') + ')' : '';
      add('ksrl-ans-line', [ansT('You do not have it. Use your ' + y.name + ' ' + y.code + ' (green below)' + phrase + '.')]);
    } else if (d.allWrong) add('ksrl-ans-line', [ansT('You do not have it. None of your cars has ' + d.surface + ' parts, which ' + d.trackTitle + ' needs.')]);
    else add('ksrl-ans-line', [ansT('You do not have it. None of your cars is in a class this race lets in.')]);
  }
  add('ksrl-ans-why', [ansT('Why: ' + d.why)]);
  const fl = fasterLine(d);
  if (fl) add('ksrl-ans-rec', [ansT(fl)]);
  if (d.rec) add('ksrl-ans-rec', [ansT(d.rec.text)]);
  return rows;
}

// 0.7.1: the prize car that cannot be bought is faster than the best car you can buy: one extra line (nothing when it is not faster)
function fasterLine(d) {
  if (!d.faster) return null;
  if (d.faster.pct === null) return d.faster.name + ' is faster but can only be won in racing events.';
  if (d.faster.pct < (d.chase ? 0.005 : 0.05)) return null;
  return d.faster.name + ' is ' + decidePctText(d.faster.pct, d.chase) + ' faster but can only be won in racing events.';
}

// Your Cars: one row per track
function listAnswerRows(decs) {
  return decs.map(function (d) {
    const y = d.yours;
    const head = d.trackTitle + ' (' + d.surface + ') · Best: ' + (d.best ? bestLabel(d) : (d.ksOff ? BEST_UNKNOWN_OFF_TEXT : 'unknown')) + ' · ';
    let segs;
    if (d.have) segs = [ansT(head), ansT('✔ Yours: ' + y.name + ' ' + y.code + (d.haveWithin ? ' (as fast as ' + d.best.code + ' in races)' : ''), true)];
    else if (y) segs = [ansT(head + 'Yours: ' + y.name + ' ' + y.code + (d.gap ? ', ' + decideSlower(d.gap.pct, d.chase) : ''))];
    else segs = [ansT(head + 'Yours: none')];
    return { cls: 'ksrl-ans ksrl-ans-track', segs: segs };
  });
}

// The sources behind each track of Your Cars, for "Show the data"
function listSourceLines(decs) {
  return decs.map(function (d) { return d.trackTitle + ': ' + d.why + (d.gap && d.gap.source ? ' Compared by ' + d.gap.source + '.' : '') + (fasterLine(d) ? ' ' + fasterLine(d) : ''); });
}

// Parts & Modifications: ONE sentence for the chosen car and track. view = computePartsView/computeDirtBuildView. ctx: { carName, fittedCode, trackTitle, chase, byId (partsById), fittedIds }
// -> { kind, text } | null (null = no sentence: the view is UNKNOWN)
function partsAnswer(view, ctx) {
  if (!view || view.state === 'UNKNOWN') return null;
  const who = ctx.carName + ' ' + ctx.fittedCode;
  const dec = ctx.chase ? 2 : 1;
  if (view.dirt === true) {
    const left = view.leftToDirtBuild;
    if (left.parts === 0) return { kind: 'built', text: 'Your ' + who + ' is fully built for dirt tracks. Nothing to buy.' };
    let pick = null;
    for (const id of left.ids) {
      const u = ctx.byId.get(id);
      if (u && (pick === null || u.cost.points < pick.cost.points || (u.cost.points === pick.cost.points && u.id < pick.id))) pick = u;
    }
    if (!pick) return { kind: 'none', text: 'Your ' + who + ' needs more parts for the dirt build of ' + ctx.trackTitle + '.' };
    return { kind: 'buy', text: 'Buy next: ' + pick.name + ' (' + pick.cost.points + ' RP) — part of the dirt build for ' + ctx.trackTitle + '.' };
  }
  const fitted = new Set(ctx.fittedIds || []);
  const surfaceWord = view.surface === 'dirt' ? 'dirt' : 'tarmac';
  const built = { kind: 'built', text: 'Your ' + who + ' is fully built for ' + surfaceWord + ' tracks. Nothing to buy.' };
  if (view.buyCandidates.length === 0 && view.bestPartIds.every(function (id) { return fitted.has(id); })) return built;
  const alt = view.sameModelAlternatives && view.sameModelAlternatives.length ? view.sameModelAlternatives[0] : null;
  if (!ctx.chase && alt) return { kind: 'alt', text: 'Use your ' + altName(alt) + ' #' + alt.carId + ' instead — it is already built for ' + ctx.trackTitle + '. Nothing to buy.' };
  if (!ctx.chase && view.keepFitted) {
    if (view.fittedTune === view.bestTune) return built;
    return { kind: 'aim', text: 'Aim for ' + view.bestTune + ' on this car: you have ' + view.fittedTune + '. Nothing to buy — ' + view.fittedTune + ' is just as fast.' };
  }
  const cand = view.nextBuyId === null ? null : view.buyCandidates.find(function (c) { return c.id === view.nextBuyId; });
  let pick = null;
  if (cand && (!ctx.chase || view.wrongSurface)) pick = { name: cand.name, points: cand.points, gain: cand.gainPct, id: cand.id };
  else if (ctx.chase) {       // the best swap per RP, even when the gain is too small to show in races
    const pool = [];
    for (const c of view.buyCandidates) if (c.gainPct > 0) pool.push({ name: c.name, points: c.points, gain: c.gainPct, id: c.id });
    for (const fid of Object.keys(view.labels)) {
      if (view.labels[fid] !== 'EQUAL') continue;
      const to = view.swapTo[fid];
      const u = to === null || to === undefined ? null : ctx.byId.get(to);
      const gn = view.gapPct[fid];
      if (u && gn > 0) pool.push({ name: u.name, points: u.cost.points, gain: gn, id: u.id });
    }
    const rate = function (p) { return p.points > 0 ? p.gain / p.points : Infinity; };
    pool.sort(function (a, b) { return (rate(b) === rate(a) ? 0 : (rate(b) > rate(a) ? 1 : -1)) || (a.points - b.points) || (a.id - b.id); });
    pick = pool.length ? pool[0] : null;
  }
  if (!pick) return { kind: 'none', text: 'Your ' + who + ' is as good as it gets for ' + ctx.trackTitle + '. Nothing to buy.' };
  return { kind: 'buy', text: 'Buy next: ' + pick.name + ' (' + pick.points + ' RP) — ' + Math.max(0, pick.gain).toFixed(dec) + ' % faster on ' + ctx.trackTitle + '.' };
}
/* ksrl-decide END */

/* ksrl-ui BEGIN - the panel, the badges, the page lifecycle */
const INSTANCE_KEY = '__ksrlPartsPanel';
const DEBOUNCE_MS = 300;
const CAPTCHA_SELECTOR = '[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i],iframe[src*="recaptcha" i]';

const CSS = [
  '.ksrl-panel{display:block;box-sizing:border-box;width:100%;margin:10px 0;border-radius:5px;overflow:hidden;font:13px/1.45 Arial,Helvetica,sans-serif;color:#e4e4e4;background:#2c2c2c;border:1px solid #111;text-align:left}',
  '.ksrl-head{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:linear-gradient(#4b4b4b,#262626);border-bottom:1px solid #111;color:#fff;font-weight:bold;font-size:13px}',
  '.ksrl-ver{font-weight:normal;color:#c4c4c4;font-size:12px}',
  '.ksrl-body{padding:8px 10px}',
  '.ksrl-row{margin:4px 0;font-size:13px;color:#e4e4e4}',
  '.ksrl-row.ksrl-warn{color:#ffcc66}',
  '.ksrl-row.ksrl-dim{color:#c4c4c4}',
  '.ksrl-btn{font:12px Arial,Helvetica,sans-serif;padding:3px 10px;margin:2px 6px 2px 0;border:1px solid #7ea6d6;border-radius:3px;background:#2f5f94;color:#fff;cursor:pointer}',
  '.ksrl-btn:hover{background:#3b73b3}',
  '.ksrl-select,.ksrl-input{font:12px Arial,Helvetica,sans-serif;padding:3px 6px;margin-left:6px;background:#1b1b1b;color:#f0f0f0;border:1px solid #888;border-radius:3px;min-width:210px}',
  '.ksrl-foot{margin-top:8px;padding-top:6px;border-top:1px solid #4a4a4a;font-size:12px;color:#c4c4c4}',
  '.ksrl-about{margin-top:6px;padding:6px 8px;background:#222;border:1px solid #4a4a4a;border-radius:3px;font-size:12px;color:#d6d6d6}',
  '.ksrl-about p{margin:4px 0}',
  '.ksrl-badge{display:block;clear:both;width:fit-content;max-width:95%;margin:4px 6px 6px;padding:2px 8px;border-radius:3px;font:bold 12px/1.4 Arial,Helvetica,sans-serif;color:#fff;text-align:left}',
  '.ksrl-b-keep{background:#2e7d32}',
  '.ksrl-b-equal{background:#6b6b6b}',
  '.ksrl-b-swap{background:#c62828}',
  '.ksrl-b-buy{background:#1565c0}',
  '.ksrl-b-next{background:#f2b705;color:#1a1a1a}',
  '.ksrl-race-panel{clear:both}',
  '.ksrl-cars-panel{clear:both}',
  '.ksrl-carbadge{display:inline-block;margin-left:8px;padding:0 6px;border-radius:3px;font:bold 12px/1.5 Arial,Helvetica,sans-serif;color:#fff;vertical-align:baseline}',
  '.ksrl-cb-good{background:#2e7d32}',
  '.ksrl-cb-bad{background:#c62828}',
  '.ksrl-cb-plain{background:#6b6b6b}',
  '.ksrl-green{color:#4caf50}',
  '.ksrl-trend-red{color:#ff7b7b;font-weight:bold}',
  '.ksrl-trend-green{color:#7be09a;font-weight:bold}',
  '.ksrl-row.ksrl-legend{color:#b8b8b8;font-size:12px}',
  '.ksrl-catcount{z-index:10;pointer-events:none}',
  '.ksrl-catcount.ksrl-cc-abs{position:absolute;top:3px;right:3px}',
  '.ksrl-catcount.ksrl-cc-flow{position:relative;display:block;height:0;width:100%}',
  '.ksrl-cc-pills{display:flex;flex-direction:column;align-items:flex-end;gap:2px}',
  '.ksrl-cc-flow .ksrl-cc-pills{position:absolute;bottom:0;right:3px}',
  '.ksrl-catcount span{display:block;padding:0 5px;border:2px solid transparent;border-radius:3px;font:bold 11px/1.5 Arial,Helvetica,sans-serif;color:#fff;white-space:nowrap}',
  '.ksrl-cc-buy{background:#1565c0}',
  '.ksrl-cc-swap{background:#c62828}',
  '.ksrl-catcount span.ksrl-cc-next{border-color:#f2b705}',
  '.ksrl-share{margin-top:8px;padding-top:6px;border-top:1px solid #4a4a4a;font-size:12px;color:#d6d6d6}',
  '.ksrl-share-switch{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:13px;font-weight:bold;color:#e4e4e4;cursor:pointer}',
  '.ksrl-share-switch input{margin:0;cursor:pointer}',
  '.ksrl-share-line{margin:3px 0;font-size:12px;color:#c4c4c4}',
  '.ksrl-share-details[hidden]{display:none !important}',
  '.ksrl-share-toggle{display:block;margin:2px 0 4px;padding:6px 8px 6px 0;min-height:28px;border:0;background:none;font:12px Arial,Helvetica,sans-serif;color:#7ea6d6;text-decoration:underline;text-align:left;cursor:pointer}',
  '.ksrl-share-status{margin:4px 0;font-size:13px;color:#e4e4e4}',
  '.ksrl-share-status.ksrl-share-bad{color:#ffcc66}',
  '.ksrl-share-link{color:#7ea6d6;text-decoration:underline;margin-left:6px}',
  '.ksrl-share-notice{margin:4px 0 6px;padding:6px 8px;border:1px solid #ffcc66;border-radius:3px;font-size:13px;color:#ffcc66}',
  '.ksrl-share-notice[hidden]{display:none !important}',
  '.ksrl-rr{margin:4px 0;font-size:13px;color:#e4e4e4}',
  '.ksrl-rr-head{margin-top:10px;padding-top:6px;border-top:1px solid #4a4a4a;font-weight:bold}',
  '.ksrl-rr-sub{margin-top:8px;font-weight:bold;color:#d6d6d6}',
  '.ksrl-rr-dim{font-size:12px;color:#c4c4c4}',
  '.ksrl-rr-warn{color:#ffcc66}',
  '.ksrl-grey{color:#8f8f8f}',
  '.ksrl-answer{margin:2px 0 6px}',
  '.ksrl-ans{margin:5px 0;font-size:14px;line-height:1.45;color:#e4e4e4}',
  '.ksrl-ans-head{font-size:15px;font-weight:bold;color:#fff}',
  '.ksrl-ans-why,.ksrl-ans-rec{font-size:13px;color:#d6d6d6}',
  '.ksrl-ans-warn{color:#ffcc66}',
  '.ksrl-ans-track{font-size:13px;margin:3px 0}',
  '.ksrl-ans-parts{font-size:14px;font-weight:bold;color:#fff}',
  '.ksrl-ans-note{margin:4px 0;font-size:12px;color:#b8b8b8}',
  '.ksrl-data-toggle{display:block;margin:2px 0 4px;padding:6px 8px 6px 0;min-height:28px;border:0;background:none;font:12px Arial,Helvetica,sans-serif;color:#7ea6d6;text-decoration:underline;text-align:left;cursor:pointer}',
  '.ksrl-data[hidden]{display:none !important}',
  '.ksrl-chase[hidden]{display:none !important}',
].join('\n');

const ABOUT_LINES = [
  'Purpose: shows the value of each racing part for the car and track you choose, on the Parts & Modifications page. On the page it only displays. It never clicks, buys or navigates.',
  'Stored in this browser (Tampermonkey storage): your Torn API key, cached answers from the Torn API, the track you chose for each car, and the settings of the sharing switch (on or off, whether its details are folded away, how far your races were sent), the settings of the "' + VIEWS_TITLE + '" switch (on or off, whether its details are folded away), the answers read from the KS server for it (at most 15 minutes old when used), the tick "' + CHASE_TITLE + '" (on or off), a short login to the KS server, and whether you have read what changed in the sharing text. The key is never shown again after you save it.',
  'Kept until you press Remove key, which deletes all of it. Cached answers are replaced when they expire: 5 minutes for your enlisted cars, 24 hours for the rest.',
  'Shared: nothing, unless you switch on "' + SHARE_TITLE + '" (off to begin with). The script talks to api.torn.com (your key goes there) and, only with a switch on, to racing.kingshadeprotocol.com. What the sharing switch sends is listed under that switch. "' + VIEWS_TITLE + '" (also off to begin with) only reads from the KS server and is listed in the Cars panel.',
  'Key level: Custom, with access to user → basic, enlistedcars, faction, races and racing → cars, carupgrades, records, tracks.',
  'Who can use it: members of faction ' + FACTION_ID + '. Kingshade and Cheese are let in directly. For everyone else the script asks the Torn API (user → faction, with your own key) which faction you are in, at most once a day, and keeps the answer in this browser. If you are not in the faction, or the check fails, the panels stay closed.',
  TUNE_LEGEND,
  'Race panel: reads only the race leaderboard on the page you are viewing. No requests, nothing stored.',
  'Cars panel: names the best car and build for the track and the best of your own cars (on Your Cars for every track, on Change car for the track of the race), from the lap-time model and the Torn API answers of the Parts panel, and with "' + VIEWS_TITLE + '" on also from real races read from the KS server. The ranking and the numbers are under "Show the data". It never clicks Change car, Remove or Save.',
  'Parts panel: one sentence for the car and track you chose (what to buy next, or that nothing is needed); the details are under "Show the data".',
  CHASE_TITLE + ': off to begin with. ' + CHASE_TEXT,
].concat(SHARE_DISCLOSURE.map(function (l, i) { return (i === 0 ? SHARE_TITLE + ': ' : '') + l; }), VIEWS_DISCLOSURE.map(function (l, i) { return (i === 0 ? VIEWS_TITLE + ': ' : '') + l; }));

function boot() {
  if (window[INSTANCE_KEY]) return;       // one instance per page
  window[INSTANCE_KEY] = SCRIPT_VERSION;

  const gm = {
    get: function (k, d) { return GM_getValue(k, d); },
    set: function (k, v) { GM_setValue(k, v); },
    del: function (k) { GM_deleteValue(k); },
  };
  let debugOn = false;
  try { debugOn = gm.get(DEBUG_STORE, false) === true; } catch (e) { debugOn = false; }
  const logger = KSRL.createLogger({ sink: function (s) { console.log('[KS Racing Lab]', s.replace(/^\[KSRL\] /, '')); } });
  logger.setEnabled(debugOn);

  const store = createStore(gm);
  const deps = { store: store, now: function () { return Date.now(); }, requester: createRequester(function () { return window.fetch.apply(window, arguments); }, function () { return Date.now(); }, logger) };

  // 0.5.0: sharing. The ONE place this script calls the KS server: GM_xmlhttpRequest, POST with a JSON body, only the three addresses of SHARE_PATHS (checked in createKsServer).
  function workerPost(path, body) {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (status, json) { if (!done) { done = true; resolve({ status: status, json: json }); } };
      try {
        GM_xmlhttpRequest({
          method: 'POST', url: SHARE_WORKER_ORIGIN + path, anonymous: true, timeout: 30000,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify(body),
          onload: function (r) { let j = null; try { j = JSON.parse(r.responseText); } catch (e) { j = null; } finish(r.status, j); },
          onerror: function () { finish(0, null); }, ontimeout: function () { finish(0, null); }, onabort: function () { finish(0, null); },
        });
      } catch (e) { finish(0, null); }
    });
  }
  const ks = createKsServer({ gm: gm, now: deps.now, logger: logger, workerPost: workerPost });      // 0.7.0: the one login and the one session, for both switches
  const share = createSharer({
    gm: gm, now: deps.now, logger: logger, ks: ks,
    getKey: function () { const k = gm.get(KEY_STORE, ''); return typeof k === 'string' && k !== '' ? k : null; },
    tornGet: createShareTorn(function () { return window.fetch.apply(window, arguments); }, deps.now),
    workerPost: workerPost,
    visible: function () { return document.visibilityState === 'visible'; },
    captcha: function () { return !!document.querySelector(CAPTCHA_SELECTOR); },
  });
  // 0.7.0: "Show KS faction race data": reads the real results from the KS server (POST /views/get), OFF until the player switches it on.
  const views = createViewsReader({
    gm: gm, now: deps.now, logger: logger, ks: ks,
    getKey: function () { const k = gm.get(KEY_STORE, ''); return typeof k === 'string' && k !== '' ? k : null; },
    getOwnId: function () { return store.readOwnId(); },
    visible: function () { return document.visibilityState === 'visible'; },
    captcha: function () { return !!document.querySelector(CAPTCHA_SELECTOR); },
  });

  const st = {
    share: { timer: null, waitVisible: false, statusEl: null, cbEl: null, detailsEl: null, toggleEl: null, noticeEl: null, wasEnabled: share.isEnabled() },
    gen: 0, sig: null, timer: null, abort: null, observer: null, observed: null, parentObserved: null,
    panel: null, style: null, hidden: false, waitVisible: false, tick: 0, counterBoxes: new Set(),
    cars: { panel: null, gen: 0, sig: null, abort: null, state: null, paused: false, waitVisible: false, badgeEls: new Set(), last: null, viewsDetailsEl: null, viewsToggleEl: null, dataOpen: false },
    race: { panel: null, boardEl: null, infoEl: null, boardObs: null, infoObs: null, timer: null, lastReadMs: 0, tracker: null, paused: false, waitVisible: false },
    ui: { kind: 'loading', message: '', notice: '', aboutOpen: false, changingKey: false, keyError: '', data: null, view: null, trackId: null, points: 'UNKNOWN', fittedIds: [] },
  };

  // ---- small DOM helpers (only ever used on our own elements)
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function insideOwn(n) {
    const el = n && n.nodeType === 1 ? n : (n ? n.parentElement : null);
    return !!(el && el.closest && el.closest('.ksrl-panel,.ksrl-badge,.ksrl-catcount,.ksrl-carbadge,#ksrl-style'));
  }
  function isOwnNode(n) { return insideOwn(n); }

  function setHidden(on) {
    st.hidden = on;
    const d = on ? 'none' : '';
    if (st.panel) st.panel.style.display = d;
    for (const b of document.querySelectorAll('.ksrl-badge,.ksrl-catcount')) b.style.display = d;
  }

  function removeBadges() {   // badges and category counters (the counters are also remembered, so ones inside a detached category list go too)
    for (const b of document.querySelectorAll('.ksrl-badge,.ksrl-catcount')) b.remove();
    for (const b of st.counterBoxes) b.remove();
    st.counterBoxes.clear();
  }

  function teardown() {
    st.gen++;
    if (st.abort) { st.abort.abort(); st.abort = null; }
    removeBadges();
    if (st.panel) { st.panel.remove(); st.panel = null; }
    dropStyleIfUnused();
    st.sig = null;
    st.hidden = false;
    st.ui.data = null;
    st.ui.view = null;
  }

  function ensureStyle() {
    if (!st.style || !st.style.isConnected) {
      st.style = h('style');
      st.style.id = 'ksrl-style';
      st.style.textContent = CSS;
      (document.head || document.documentElement).appendChild(st.style);
    }
  }
  function dropStyleIfUnused() {
    if (st.style && !st.panel && !st.race.panel && !st.cars.panel) { st.style.remove(); st.style = null; }
  }

  function ensurePanel() {
    ensureStyle();
    if (st.panel && st.panel.isConnected) return;
    const panel = h('div', 'ksrl-panel');
    panel.id = 'ksrl-panel';
    const info = document.querySelector('#racingAdditionalContainer > .info-msg-cont');
    if (info) info.insertAdjacentElement('afterend', panel);
    else {
      const wrap = document.querySelector('.pm-categories-wrap');
      if (!wrap || !wrap.parentNode) return;
      wrap.parentNode.insertBefore(panel, wrap);
    }
    st.panel = panel;
    st.ui.rendered = false;
  }

  // ---- panel rendering
  function row(text, cls) { return h('div', 'ksrl-row' + (cls ? ' ' + cls : ''), text); }
  function button(label, onClick) {
    const b = h('button', 'ksrl-btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function keyForm(body, canCancel) {
    const ui = st.ui;
    if (ui.notice) body.appendChild(row(ui.notice, 'ksrl-warn'));
    body.appendChild(row('Enter your Torn API key (Custom level: user → basic, enlistedcars, faction; racing → cars, carupgrades, records, tracks). See About for what is stored.'));
    const line = h('div', 'ksrl-row');
    line.appendChild(h('span', null, 'Torn API key:'));
    const input = h('input', 'ksrl-input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 64;
    line.appendChild(input);
    body.appendChild(line);
    if (ui.keyError) body.appendChild(row(ui.keyError, 'ksrl-warn'));
    const save = function () {
      const v = input.value.trim();
      input.value = '';
      if (!KSRL.isValidKeyFormat(v)) { st.ui.keyError = 'Enter a 16-character Torn API key.'; render(); return; }
      logger.addSecret(v);
      gm.set(KEY_STORE, v);
      store.clearUserData();                 // a new key may belong to another account
      share.onKeyChanged();                  // a sharing stop caused by the old key is lifted, the login made with it is dropped
      views.onKeyChanged();                  // 0.7.0: what was read with the old key goes
      if (share.isEnabled()) shareTick(true);
      st.ui.keyError = ''; st.ui.notice = ''; st.ui.changingKey = false;
      st.tick++;
      cycle();
    };
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') save(); });
    const actions = h('div', 'ksrl-row');
    actions.appendChild(button('Save key', save));
    if (canCancel) actions.appendChild(button('Cancel', function () { st.ui.changingKey = false; st.ui.keyError = ''; render(); }));
    body.appendChild(actions);
  }

  // ---- 0.5.0: the sharing switch, its disclosure and its status line (everything in own elements, class prefix ksrl-share)
  function fillShareStatus(el) {
    const s = share.status();
    el.className = 'ksrl-share-status' + (s.kind === 'OK' || s.kind === 'OFF' || s.kind === 'WAITING' ? '' : ' ksrl-share-bad');
    el.replaceChildren(document.createTextNode(s.text));
    if (s.link) {
      const a = h('a', 'ksrl-share-link', 'Make the key');
      a.href = s.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.appendChild(a);
    }
  }
  function refreshShareStatus() {
    const el = st.share.statusEl;
    if (el && el.isConnected) fillShareStatus(el);
    const cb = st.share.cbEl;
    if (cb && cb.isConnected && cb.checked !== share.isEnabled()) cb.checked = share.isEnabled();   // the server can switch it off (403)
    syncShareDetails();
  }
  // 0.5.2: the disclosure under the switch folds away. Only the display changes; the text stays in the page (hidden) and in About.
  function applyShareDetails() {
    const open = shareNoticePending(gm, share.isEnabled()) || shareDetailsOpen(gm, share.isEnabled());   // 0.7.0: while the notice is pending the text is open
    const d = st.share.detailsEl;
    const t = st.share.toggleEl;
    if (d) d.hidden = !open;
    if (t) {
      t.textContent = open ? 'Hide details ▾' : 'Show details ▸';
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }
  function syncShareDetails() {     // sharing went off (the player, or the server saying no): the choice of the player is dropped and the details are open again
    const en = share.isEnabled();
    if (st.share.wasEnabled && !en) shareDetailsReset(gm);
    st.share.wasEnabled = en;
    syncShareNotice();
    applyShareDetails();
  }
  // 0.7.0: for a player who already shares: one line above the switch until OK is pressed
  function syncShareNotice() {
    const n = st.share.noticeEl;
    if (n) n.hidden = !shareNoticePending(gm, share.isEnabled());
  }
  share.onChange(refreshShareStatus);

  function armShare(ms) {
    if (st.share.timer !== null) clearTimeout(st.share.timer);
    st.share.timer = setTimeout(function () { st.share.timer = null; shareTick(false); }, Math.max(1000, ms));
  }
  // One round of sharing (the switch is on, a racing page is open). Nothing happens when the switch is off.
  function shareTick(force) {
    if (st.share.timer !== null) { clearTimeout(st.share.timer); st.share.timer = null; }
    if (!share.isEnabled()) return;
    share.run({ force: force }).then(function (res) {
      if (res.kind === 'ABORT') return;
      st.share.waitVisible = res.kind === 'HIDDEN';
      if (share.isEnabled()) armShare(res.delayMs);
    }, function () { if (share.isEnabled()) armShare(SHARE_INTERVAL_MS); });
  }

  function shareSection(foot) {
    const box = h('div', 'ksrl-share');
    const notice = h('div', 'ksrl-share-notice');
    notice.appendChild(document.createTextNode(SHARE_NOTICE_TEXT + ' '));
    notice.appendChild(button('OK', function () { shareNoticeAck(gm); syncShareNotice(); applyShareDetails(); }));
    notice.hidden = !shareNoticePending(gm, share.isEnabled());
    st.share.noticeEl = notice;
    box.appendChild(notice);
    const label = h('label', 'ksrl-share-switch');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = share.isEnabled();
    st.share.cbEl = cb;
    cb.addEventListener('change', function () {
      if (cb.checked) shareNoticeAck(gm);        // switched on under the new text (open to read): nothing changed behind the player back
      share.setEnabled(cb.checked);
      if (cb.checked) shareTick(true);
      else if (st.share.timer !== null) { clearTimeout(st.share.timer); st.share.timer = null; }
    });
    label.appendChild(cb);
    label.appendChild(h('span', null, SHARE_TITLE));
    box.appendChild(label);
    const toggle = h('button', 'ksrl-share-toggle');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      shareDetailsChoose(gm, !shareDetailsOpen(gm, share.isEnabled()));
      applyShareDetails();
    });
    st.share.toggleEl = toggle;
    box.appendChild(toggle);
    const details = h('div', 'ksrl-share-details');
    for (const l of SHARE_DISCLOSURE) details.appendChild(h('div', 'ksrl-share-line', l));
    st.share.detailsEl = details;
    box.appendChild(details);
    const status = h('div', 'ksrl-share-status');
    fillShareStatus(status);
    st.share.statusEl = status;
    box.appendChild(status);
    applyShareDetails();
    foot.appendChild(box);
  }

  function footer(body, hasKey) {
    const foot = h('div', 'ksrl-foot');
    foot.appendChild(h('div', null, 'Estimates come from a fitted model, not from Torn. ' + GAP_NOTE));
    shareSection(foot);
    const actions = h('div', 'ksrl-row');
    actions.appendChild(button('About', function () { st.ui.aboutOpen = !st.ui.aboutOpen; render(); }));
    if (hasKey) {
      actions.appendChild(button('Change key', function () { st.ui.changingKey = true; st.ui.keyError = ''; render(); }));
      actions.appendChild(button('Remove key', removeKey));
    }
    foot.appendChild(actions);
    if (st.ui.aboutOpen) {
      const about = h('div', 'ksrl-about');
      for (const l of ABOUT_LINES) about.appendChild(h('p', null, l));
      foot.appendChild(about);
    }
    body.appendChild(foot);
  }

  function removeKey() {
    gm.del(KEY_STORE);
    store.clearAll();
    share.clearAll();                      // Remove key deletes the sharing switch, its cursor and its login too
    views.clearAll();                      // 0.7.0: and the "Show KS faction race data" switch with what it read
    gm.del(SHARE_NOTICE_STORE);
    gm.del(SETTINGS_STORE);                // 0.7.1: and the tick "Chase track records"
    if (st.share.timer !== null) { clearTimeout(st.share.timer); st.share.timer = null; }
    st.ui.notice = ''; st.ui.changingKey = false; st.ui.keyError = '';
    st.tick++;
    cycle();
  }

  function render() {
    if (!st.panel) return;
    const ui = st.ui;
    const head = h('div', 'ksrl-head');
    head.appendChild(h('span', null, 'KS Racing Lab · Parts'));
    head.appendChild(h('span', 'ksrl-ver', 'v' + SCRIPT_VERSION));
    const body = h('div', 'ksrl-body');
    const hasKey = typeof gm.get(KEY_STORE, '') === 'string' && gm.get(KEY_STORE, '') !== '';
    if (ui.kind === 'private') {
      body.appendChild(row(NOT_MEMBER_TEXT));
      body.appendChild(button('Remove key', removeKey));
    } else if (ui.kind === 'nokey' || ui.changingKey) {
      keyForm(body, ui.changingKey);
      footer(body, hasKey);
    } else if (ui.kind === 'loading') {
      body.appendChild(row('Loading from api.torn.com …', 'ksrl-dim'));
      footer(body, hasKey);
    } else if (ui.kind === 'error') {
      body.appendChild(row(ui.message, 'ksrl-warn'));
      if (ui.link) {
        const a = h('a', 'ksrl-share-link', 'Make the key');
        a.href = ui.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        body.lastChild.appendChild(a);
      }
      if (ui.retry) body.appendChild(button('Retry', function () { st.sig = null; st.tick++; cycle(); }));
      footer(body, hasKey);
    } else if (ui.kind === 'unknown') {
      body.appendChild(row('Lap-time estimate (experimental): UNKNOWN — ' + ui.message));
      footer(body, hasKey);
    } else if (ui.kind === 'ready') {
      const d = ui.data;
      // 0.7.1: ONE sentence for the car and track (what to buy next, or that nothing is needed). The rows below it move under "Show the data" (closed to begin with);
      // where no sentence can be made (no track chosen, the model has no estimate) the rows stay as they were.
      const tuneNow = tuneCode(ui.fittedIds);
      const chosen = ui.trackId === null ? null : d.tracks.find(function (x) { return x.id === ui.trackId; });
      const sentence = ui.trackId === null || !ui.view || !chosen ? null : partsAnswer(ui.view, { carName: d.car.car_item_name, fittedCode: tuneNow, trackTitle: chosen.title, chase: settingsReadChase(gm), byId: partsById(d.upgrades), fittedIds: ui.fittedIds });
      const dataRows = [];
      const dRow = function (text, cls) { const r = row(text, cls); dataRows.push(r); return r; };
      const carRow = dRow('Car: ' + d.car.car_item_name + ' (' + (d.enlisted.car_name || '—') + ') · class ' + d.enlisted.class + ' · #' + d.enlisted.id);
      const tuneRow = dRow(tuneRowText(ui.trackId === null ? null : ui.view, tuneNow));
      const built = ui.trackId === null ? null : alreadyBuiltText(ui.view);
      const builtRow = built ? dRow(built, 'ksrl-warn') : null;
      const legendRow = dRow(TUNE_LEGEND, 'ksrl-legend');
      const trackLine = h('div', 'ksrl-row');
      trackLine.appendChild(h('span', null, 'Track:'));
      const sel = h('select', 'ksrl-select');
      const none = h('option', null, 'Choose a track');
      none.value = '';
      sel.appendChild(none);
      for (const t of d.tracks) {
        const o = h('option', null, t.title + ' (' + trackSurfaceLabel(t.id) + ')');
        o.value = String(t.id);
        sel.appendChild(o);
      }
      sel.value = ui.trackId === null ? '' : String(ui.trackId);
      sel.addEventListener('change', function () {
        const v = sel.value === '' ? null : Number(sel.value);
        store.setTrackFor(d.enlisted.id, v);
        cycle();
      });
      trackLine.appendChild(sel);
      const tail = [];       // the rows under the track line, in their old order
      let newerRow = null;
      if (ui.trackId === null) tail.push(row('Choose a track to see the value of each part.', 'ksrl-dim'));
      else {
        const rows = describeView(ui.view, ui.view.dirt === true ? dirtContext(d, ui.view, ui.trackId, ui.points) : { racingPoints: ui.points });
        const first = rows.shift();
        tail.push(dRow(first.text));
        if (ui.view.state !== 'UNKNOWN' && d.pageNewer > 0) {
          newerRow = row('The page is newer than the API for ' + d.pageNewer + ' part(s) — using the page.', 'ksrl-warn');
          tail.push(newerRow);
        }
        for (const r of rows) tail.push(dRow(r.text));
        const av = activeView();
        const catText = av ? categoriesRowText(categoryList(av, readPartsPage(document))) : null;
        if (catText) tail.push(dRow(catText));
      }
      if (sentence) {
        // the sentence first, the track line to change it, then "Show the data" with everything else; the warning about the page stays in view
        body.appendChild(h('div', 'ksrl-ans ksrl-ans-parts', sentence.text));
        body.appendChild(trackLine);
        if (newerRow) body.appendChild(newerRow);
        const toggle = h('button', 'ksrl-data-toggle');
        toggle.type = 'button';
        const apply = function () {
          for (const r of dataRows) r.hidden = !ui.dataOpen;
          toggle.textContent = ui.dataOpen ? 'Hide the data ▾' : 'Show the data ▸';
          toggle.setAttribute('aria-expanded', ui.dataOpen ? 'true' : 'false');
        };
        toggle.addEventListener('click', function () { ui.dataOpen = !ui.dataOpen; apply(); });
        body.appendChild(toggle);
        for (const r of [carRow, tuneRow, builtRow, legendRow].concat(tail)) if (r && r !== newerRow) body.appendChild(r);
        apply();
      } else {
        for (const r of [carRow, tuneRow, builtRow, legendRow]) if (r) body.appendChild(r);
        body.appendChild(trackLine);
        for (const r of tail) body.appendChild(r);
      }
      footer(body, true);
    }
    st.panel.replaceChildren(head, body);
    if (st.hidden) st.panel.style.display = 'none';
    syncBadges();
  }

  // ---- badges and category counters
  function activeView() {
    const ui = st.ui;
    return ui.kind === 'ready' && !ui.changingKey && ui.trackId !== null && ui.view && ui.view.state !== 'UNKNOWN' ? ui.view : null;
  }

  function syncBadges() {
    const view = activeView();
    if (!view) { removeBadges(); return; }
    const page = readPartsPage(document);
    for (const p of page.parts) {
      const wrap = p.li.querySelector('.box-wrap .bg-wrap');
      if (!wrap) continue;
      let badge = null;
      for (const c of wrap.children) if (c.classList.contains('ksrl-badge')) badge = c;
      const want = badgeFor(view, p.partId);
      if (!want) { if (badge) badge.remove(); continue; }
      const cls = 'ksrl-badge ksrl-b-' + want.cls;
      if (!badge) { badge = h('div', cls, want.text); wrap.appendChild(badge); }
      else {
        if (badge.className !== cls) badge.className = cls;
        if (badge.textContent !== want.text) badge.textContent = want.text;
      }
      if (want.title) { if (badge.title !== want.title) badge.title = want.title; } else if (badge.hasAttribute('title')) badge.removeAttribute('title');
      badge.style.display = st.hidden ? 'none' : '';
    }
    syncCounters(view, page);
  }

  // The squares with something to buy or swap, in page order: [{ li, cat, title, buy, swap, next }]. The page category number joins a part to its
  // square; Safety is never counted.
  function categoryList(view, page) {
    const catOf = new Map();
    for (const p of page.parts) {
      const wrap = p.li.closest('.pm-items-wrap');
      if (wrap) catOf.set(p.partId, wrap.getAttribute('category'));
    }
    const counts = categoryCounts(view, partsById(st.ui.data.upgrades), function (id) { return catOf.has(id) ? catOf.get(id) : null; });
    const out = [];
    for (const li of document.querySelectorAll('.pm-categories > li[data-category]')) {
      const c = counts[li.getAttribute('data-category')] || { buy: 0, swap: 0, next: false };
      const ti = li.querySelector('.title');
      out.push({ li: li, cat: li.getAttribute('data-category'), title: ti ? ti.textContent.replace(/\s+/g, ' ').trim() : 'Category ' + li.getAttribute('data-category'), buy: c.buy, swap: c.swap, next: c.next });
    }
    return out;
  }

  // Own counters inside each square (last child of .icons .bg-hover, where the TornTools number also sits), because the square has a fixed height.
  // If .bg-hover is positioned the counter sits in its top right corner; if not, our own zero-height element is the positioned one and the
  // pills stand on the bottom edge of the icon area. No style is ever put on a Torn element.
  function syncCounters(view, page) {
    for (const c of categoryList(view, page)) {
      const host = c.li.querySelector('.icons .bg-hover');
      let box = null;
      for (const el of c.li.querySelectorAll('.ksrl-catcount')) { if (host && el.parentNode === host && !box) box = el; else el.remove(); }
      if (!host || (c.buy === 0 && c.swap === 0)) { if (box) box.remove(); continue; }
      const mode = window.getComputedStyle(host).position === 'static' ? 'flow' : 'abs';
      const sig = c.buy + '|' + c.swap + '|' + (c.next ? 1 : 0) + '|' + mode;
      if (!box) { box = h('div', 'ksrl-catcount'); host.appendChild(box); st.counterBoxes.add(box); }
      if (box.getAttribute('data-sig') !== sig) {
        box.setAttribute('data-sig', sig);
        box.className = 'ksrl-catcount ksrl-cc-' + mode;
        box.textContent = '';
        const pills = h('div', 'ksrl-cc-pills');
        if (c.buy > 0) pills.appendChild(h('span', 'ksrl-cc-buy' + (c.next ? ' ksrl-cc-next' : ''), c.buy + ' buy'));
        if (c.swap > 0) pills.appendChild(h('span', 'ksrl-cc-swap', c.swap + ' swap'));
        box.appendChild(pills);
      }
      box.style.display = st.hidden ? 'none' : '';
    }
  }

  // ---- the cars panel (0.4.0): which of your cars to pick, on Your Cars and on Change car. It never clicks, never touches the Change car / Remove / Save controls.
  function carsRemoveBadges() {
    for (const b of document.querySelectorAll('.ksrl-carbadge')) b.remove();
    for (const b of st.cars.badgeEls) b.remove();
    st.cars.badgeEls.clear();
  }

  function carsTeardown() {
    const c = st.cars;
    c.gen++;
    if (c.abort) { c.abort.abort(); c.abort = null; }
    carsRemoveBadges();
    if (c.panel) { c.panel.remove(); c.panel = null; }
    c.sig = null;
    c.state = null;
    c.last = null;
    c.paused = false;
    views.cancel();                       // 0.7.0: a read of the KS server that is on its way is dropped when the car view is left
    dropStyleIfUnused();
  }

  // 0.7.0: opts.real = rows of "Real results on <track>" (Change car only, below the ranking, in own elements ksrl-rr), opts.withSwitch = the "Show KS faction race data" switch in the foot
  // 0.7.1: opts.answer = the ONE answer (lines of segments, own elements ksrl-ans) shown first; everything else (the rows, the real results, the grey lines) goes under
  // "Show the data" (closed to begin with). opts.withSwitch also puts the tick "Chase track records" above the switch.
  function ansLine(r) {
    const el = h('div', r.cls);
    for (const sg of r.segs) { if (sg.g) el.appendChild(h('span', 'ksrl-green', sg.t)); else el.appendChild(document.createTextNode(sg.t)); }
    return el;
  }
  function carsRenderRows(rows, footers, opts) {
    const p = st.cars.panel;
    if (!p) return;
    const head = h('div', 'ksrl-head');
    head.appendChild(h('span', null, 'KS Racing Lab \u00b7 Cars'));
    head.appendChild(h('span', 'ksrl-ver', 'v' + SCRIPT_VERSION));
    const body = h('div', 'ksrl-body');
    const answer = opts && opts.answer ? opts.answer : null;
    let into = body;
    let data = null;
    if (answer) {
      const box = h('div', 'ksrl-answer');
      for (const r of answer) box.appendChild(ansLine(r));
      body.appendChild(box);
      const toggle = h('button', 'ksrl-data-toggle');
      toggle.type = 'button';
      data = h('div', 'ksrl-data');
      const apply = function () {
        data.hidden = !st.cars.dataOpen;
        toggle.textContent = st.cars.dataOpen ? 'Hide the data \u25be' : 'Show the data \u25b8';
        toggle.setAttribute('aria-expanded', st.cars.dataOpen ? 'true' : 'false');
      };
      toggle.addEventListener('click', function () { st.cars.dataOpen = !st.cars.dataOpen; apply(); });
      apply();
      body.appendChild(toggle);
      body.appendChild(data);
      data.appendChild(h('div', 'ksrl-ans-note', CODE_LEGEND));
      into = data;
    }
    for (const r of rows) {
      const el = h('div', 'ksrl-row');
      if (typeof r === 'string') el.textContent = r;
      else if (!Array.isArray(r)) {             // 0.6.0: text and a link (the key link)
        el.textContent = r.text;
        const a = h('a', 'ksrl-share-link', 'Make the key');
        a.href = r.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        el.appendChild(a);
      } else for (const s of r) { if (s.g) el.appendChild(h('span', 'ksrl-green', s.t)); else el.appendChild(document.createTextNode(s.t)); }
      into.appendChild(el);
    }
    if (opts && opts.real) for (const r of opts.real) {
      const el = h('div', r.cls);
      for (const sg of r.segs) {
        if (sg.g) el.appendChild(h('span', 'ksrl-green', sg.t));
        else if (sg.d) el.appendChild(h('span', 'ksrl-grey', sg.t));
        else el.appendChild(document.createTextNode(sg.t));
      }
      into.appendChild(el);
    }
    for (const r of footers || []) into.appendChild(h('div', 'ksrl-row ksrl-legend', r));
    if (opts && opts.withSwitch) { body.appendChild(chaseSection()); body.appendChild(viewsSection()); }
    p.replaceChildren(head, body);
  }

  // 0.7.1: the tick "Chase track records" (OFF to begin with, kept in ksrl.v1.settings). It only changes what the panels say; nothing is sent anywhere.
  function chaseSection() {
    const box = h('div', 'ksrl-share ksrl-chase');
    const label = h('label', 'ksrl-share-switch');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = settingsReadChase(gm);
    cb.addEventListener('change', function () {
      settingsSetChase(gm, cb.checked);
      carsRedraw();
      if (st.panel && st.ui.kind === 'ready') render();
    });
    label.appendChild(cb);
    label.appendChild(h('span', null, CHASE_TITLE));
    box.appendChild(label);
    box.appendChild(h('div', 'ksrl-share-line', CHASE_TEXT));
    return box;
  }

  // 0.7.0: the switch "Show KS faction race data" with its foldable text and its status line (same look as the sharing switch; own elements)
  function viewsStatusText() {
    const sn = views.snapshot();
    if (!sn.enabled) return sn.last && sn.last.kind === 'DENIED' ? { kind: 'DENIED', text: sn.last.text, link: null } : { kind: 'OFF', text: 'Off. The script does not contact the KS server for this.', link: null };
    if (sn.stop) return { kind: 'STOPPED', text: sn.stop.text, link: null };
    if (sn.last) return { kind: sn.last.kind, text: sn.last.text, link: sn.last.link };
    if (sn.running) return { kind: 'CHECKING', text: 'CHECKING: reading from the KS server …', link: null };
    if (sn.cache) return { kind: 'OK', text: 'On. Last read ' + shareAgoText(Math.max(0, deps.now() - sn.cache.fetchedAt)) + '.', link: null };
    return { kind: 'WAITING', text: 'On. Reads when Change car is open and visible.', link: null };
  }
  function viewsSection() {
    const box = h('div', 'ksrl-share ksrl-views');
    const label = h('label', 'ksrl-share-switch');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = views.isEnabled();
    cb.addEventListener('change', function () {
      views.setEnabled(cb.checked);
      if (cb.checked) viewsTick(true);
    });
    label.appendChild(cb);
    label.appendChild(h('span', null, VIEWS_TITLE));
    box.appendChild(label);
    const toggle = h('button', 'ksrl-share-toggle');
    toggle.type = 'button';
    const details = h('div', 'ksrl-share-details');
    for (const l of VIEWS_DISCLOSURE) details.appendChild(h('div', 'ksrl-share-line', l));
    const apply = function () {
      const open = viewsDetailsOpen(gm, views.isEnabled());
      details.hidden = !open;
      toggle.textContent = open ? 'Hide details ▾' : 'Show details ▸';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', function () { viewsDetailsChoose(gm, !viewsDetailsOpen(gm, views.isEnabled())); apply(); });
    box.appendChild(toggle);
    box.appendChild(details);
    const stt = viewsStatusText();
    const status = h('div', 'ksrl-share-status ksrl-views-status' + (stt.kind === 'OK' || stt.kind === 'OFF' || stt.kind === 'WAITING' || stt.kind === 'CHECKING' ? '' : ' ksrl-share-bad'), stt.text);
    if (stt.link) {
      const a = h('a', 'ksrl-share-link', 'Make the key');
      a.href = stt.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      status.appendChild(a);
    }
    box.appendChild(status);
    apply();
    return box;
  }
  // One read of the KS server for the Change car view (nothing happens while the switch is off).
  function viewsTick(force) {
    if (!views.isEnabled()) return;
    views.run({ force: force }).then(function () { /* the panel is redrawn by onChange */ }, function () { /* a read that failed is shown by its status line */ });
  }
  // The reader says something changed (a read started or ended, the switch moved): draw the panel again from the data it already has. Never starts a read.
  function carsRedraw() {
    const c = st.cars;
    if (!c.panel || !c.panel.isConnected || !c.last || c.paused) return;
    const page = readCarsPage(document);
    if (!page.ok) return;
    carsFinish(page, c.last.data, deps.now() - c.last.data.fetchedAtMs, true);
    carsSyncBadges();
  }
  views.onChange(carsRedraw);

  function carsAgeText(ms) {
    const n = Math.floor(ms / 60000);
    return n < 1 ? 'less than 1 min' : n + ' min';
  }

  // One badge (an own span, last in .info-content) per car; none when the state has no badges. Re-read from the page every time.
  function carsSyncBadges() {
    const c = st.cars;
    const page = readCarsPage(document);
    if (!c.state || !c.state.badges || !page.ok || page.view !== 'change') { carsRemoveBadges(); return; }
    for (const car of page.cars) {
      const text = c.state.badges[String(car.id)];
      const host = car.li.querySelector('.info-content');
      if (!host) continue;
      let b = null;
      for (const ch of host.children) if (ch.classList.contains('ksrl-carbadge')) b = ch;
      if (!text) { if (b) b.remove(); continue; }
      const cls = 'ksrl-carbadge ksrl-cb-' + carBadgeKind(text, !!c.state.green && c.state.green.has(car.id));
      if (!b) { b = h('span', cls, text); host.appendChild(b); c.badgeEls.add(b); }
      else {
        if (b.className !== cls) b.className = cls;
        if (b.textContent !== text) b.textContent = text;
      }
      if (host.lastElementChild !== b) host.appendChild(b);
      b.style.display = c.paused ? 'none' : '';
    }
  }

  function carsEnsurePanel(page) {
    const c = st.cars;
    const ok = c.panel && c.panel.isConnected && (page.view === 'change' ? c.panel.previousElementSibling === page.anchor : c.panel.nextElementSibling === page.anchor);
    if (ok) return;
    if (c.panel) c.panel.remove();
    const p = h('div', 'ksrl-panel ksrl-cars-panel');
    p.id = 'ksrl-cars-panel';
    page.anchor.insertAdjacentElement(page.view === 'change' ? 'afterend' : 'beforebegin', p);
    c.panel = p;
    c.state = null;
    c.last = null;
    c.sig = null;
    carsRenderRows(['Reading your cars \u2026'], []);
  }

  function carsFinish(page, data, ageMs, redrawOnly) {
    const c = st.cars;
    c.last = { data: data };
    const footers = [CARS_NOTE, 'Your cars: Torn API data from ' + carsAgeText(ageMs) + ' ago'];
    // 0.7.1: what the answers may use: the model, your cars, and the three KS views when the switch is on and they are there and not STALE
    const chase = settingsReadChase(gm);
    const dd = decisionData(views.snapshot(), deps.now(), { racingCars: data.racingCars, upgrades: data.upgrades, partsClass: data.partsClass });
    const allowed = classesFrom(page.playerClass || highestClass(data.cars));
    if (page.view === 'change') {
      const track = resolveCurrentTrack(page.trackText, data.tracks);
      if (!track) {
        c.state = { badges: null };
        carsRenderRows(['Could not read the track of the current race (Torn shows: ' + page.trackText + ')'], footers, { withSwitch: true });
        return;
      }
      const rank = rankCarsForTrack(data.cars, track);
      const inRace = page.cars.find(function (x) { return x.inRace; });
      c.state = { badges: rank.badges, green: new Set(rank.greenCarIds) };
      // 0.7.1: the ONE answer for this track (the ranking above and the real results below move under "Show the data"). A problem in it falls back to the ranking and its badges.
      let answer = null;
      if (allowed.length === 0) answer = [{ cls: 'ksrl-ans ksrl-ans-warn', segs: [{ t: 'UNKNOWN: your racing class could not be read, so no best car can be named.' }] }];
      else {
        try {
          const lapsM = /(\d+)\s+laps?\b/i.exec(page.trackText || '');
          const dec = decideTrack(track, lapsM ? Number(lapsM[1]) : null, allowed, data.cars, dd, chase);
          answer = changeAnswerRows(dec, { inRaceCarId: inRace ? inRace.id : null });
          c.state = { badges: dec.badges, green: new Set(dec.yours ? [dec.yours.id] : []) };
        } catch (e) { answer = [{ cls: 'ksrl-ans ksrl-ans-warn', segs: [{ t: 'UNKNOWN: the answer for this track could not be worked out.' }] }]; }
      }
      // 0.7.0: the real results of the track below the ranking. A problem here never changes the ranking or the badges above (they are made before).
      let real = null;
      try {
        const lm = /(\d+)\s+laps?\b/i.exec(page.trackText || '');
        const pageCars = page.cars.map(function (x) { return data.cars.find(function (e) { return e.id === x.id; }); }).filter(function (e) { return !!e; });
        real = realResultsRows(views.snapshot(), { trackId: track.id, trackTitle: track.title, laps: lm ? Number(lm[1]) : null, cars: pageCars }, deps.now());
      } catch (e) { real = [{ cls: 'ksrl-rr ksrl-rr-warn', segs: [{ t: 'UNKNOWN: the real results could not be shown.' }] }]; }
      carsRenderRows(carsChangeSegs(rank, inRace ? inRace.id : null), footers, { answer: answer, real: real, withSwitch: true });
      if (!redrawOnly) viewsTick(false);
    } else {
      c.state = { badges: null };
      // 0.7.1: one row per track (the best car and yours); the sources of each row are under "Show the data". The table with the "next:" row is gone.
      if (allowed.length === 0) { carsRenderRows(['UNKNOWN: your racing class could not be read, so no best car can be named.'], footers, { withSwitch: true }); return; }
      let decs = null;
      try { decs = carTracksSorted(data.tracks).map(function (tr) { return decideTrack(tr, null, allowed, data.cars, dd, chase); }); } catch (e) { decs = null; }
      if (decs === null) carsRenderRows(['UNKNOWN: the answers for the tracks could not be worked out.'], footers, { withSwitch: true });
      else carsRenderRows(listSourceLines(decs), footers, { answer: listAnswerRows(decs), withSwitch: true });
    }
  }

  async function carsRun(page) {
    const c = st.cars;
    const myGen = ++c.gen;
    if (c.abort) c.abort.abort();
    const ac = new AbortController();
    c.abort = ac;
    const stale = function () { return myGen !== c.gen; };
    c.last = null;
    const key = gm.get(KEY_STORE, '');
    if (typeof key !== 'string' || key === '') { c.state = { badges: null }; carsRenderRows(['Add your Torn API key on the Parts & Modifications tab to use this panel.'], []); carsSyncBadges(); return; }
    logger.addSecret(key);
    const r = await loadCarsData(deps, key, ac.signal, stale);
    if (stale()) return;
    if (!r.ok) {
      if (r.stale || (r.err && r.err.kind === 'ABORT')) return;
      c.state = { badges: null };
      if (r.privateUse) { carsRenderRows([NOT_MEMBER_TEXT], []); carsSyncBadges(); return; }
      if (r.gateAccess) { carsRenderRows([{ text: GATE_ACCESS_TEXT, href: SHARE_KEY_LINK }], []); carsSyncBadges(); return; }
      if (r.err && r.err.kind === 'KEY_FATAL') { gm.del(KEY_STORE); store.clearUserData(); st.tick++; }
      const rows = typeof r.staleAgeMs === 'number' ? ['Your cars: Torn API data from ' + carsAgeText(r.staleAgeMs) + ' ago \u00b7 STALE, no ranking shown', errorText(r.err)] : [errorText(r.err)];
      carsRenderRows(rows, [CARS_NOTE]);
      carsSyncBadges();
      return;
    }
    carsFinish(readCarsPage(document).ok ? readCarsPage(document) : page, r.data, deps.now() - r.data.fetchedAtMs);
    carsSyncBadges();
  }

  function carsCycle() {
    const c = st.cars;
    const page = readCarsPage(document);
    if (!page.ok) { if (c.panel) carsTeardown(); return; }
    if (document.querySelector(CAPTCHA_SELECTOR)) {   // a captcha: the panel and the badges step aside
      c.gen++;
      if (c.abort) { c.abort.abort(); c.abort = null; }
      c.sig = null;
      c.paused = true;
      if (c.panel) c.panel.style.display = 'none';
      for (const b of document.querySelectorAll('.ksrl-carbadge')) b.style.display = 'none';
      return;
    }
    ensureStyle();
    carsEnsurePanel(page);
    c.paused = false;
    c.panel.style.display = '';
    const inRace = page.cars.find(function (x) { return x.inRace; });
    const sig = [page.view, page.trackText || '', page.cars.map(function (x) { return x.id; }).join(','), inRace ? inRace.id : 0,
      gm.get(KEY_STORE, '') !== '' ? 1 : 0, st.tick, Math.floor(Date.now() / 60000)].join('|');
    if (sig === c.sig) { carsSyncBadges(); return; }
    if (document.visibilityState === 'hidden') { c.waitVisible = true; return; }   // no calls while the tab is in the background
    c.sig = sig;
    carsRun(page);
  }

  // ---- the race panel (0.3.0): reads the leaderboard of the race you are watching. No requests, nothing stored.
  function raceStopObservers() {
    if (st.race.boardObs) { st.race.boardObs.disconnect(); st.race.boardObs = null; }
    if (st.race.infoObs) { st.race.infoObs.disconnect(); st.race.infoObs = null; }
    st.race.boardEl = null;
    st.race.infoEl = null;
    if (st.race.timer !== null) { clearTimeout(st.race.timer); st.race.timer = null; }
  }

  function raceTeardown() {
    raceStopObservers();
    if (st.race.panel) { st.race.panel.remove(); st.race.panel = null; }
    st.race.tracker = null;
    st.race.paused = false;
    dropStyleIfUnused();
  }

  function raceRenderRows(rows, legend) {
    const p = st.race.panel;
    if (!p) return;
    const head = h('div', 'ksrl-head');
    head.appendChild(h('span', null, 'KS Racing Lab \u00b7 Race'));
    head.appendChild(h('span', 'ksrl-ver', 'v' + SCRIPT_VERSION));
    const body = h('div', 'ksrl-body');
    for (const r of rows) {
      const el = h('div', 'ksrl-row');
      el.appendChild(document.createTextNode(r.text));
      if (r.trend) {
        const tr = h('span', r.trend.tone === 'red' ? 'ksrl-trend-red' : (r.trend.tone === 'green' ? 'ksrl-trend-green' : null), r.trend.text);
        el.appendChild(tr);
      }
      body.appendChild(el);
    }
    if (legend) body.appendChild(h('div', 'ksrl-row ksrl-legend', RACE_LEGEND));
    p.replaceChildren(head, body);
  }

  function raceRead() {
    const r = st.race;
    r.timer = null;
    if (r.paused || !r.boardEl || !r.panel) return;
    if (document.visibilityState === 'hidden') { r.waitVisible = true; return; }
    const nowMs = Date.now();
    r.lastReadMs = nowMs;
    const own = store.readOwnId();
    const b = readRaceBoard(document);
    if (own === null || !b.ok) { raceRenderRows([{ text: 'Race not readable (' + (b.ok ? 'no own ID' : b.reason) + ')', trend: null }], false); return; }
    if (!r.tracker || r.tracker.meId !== String(own)) r.tracker = createRaceTracker(String(own));
    const res = r.tracker.ingest(b, nowMs);
    if (res.kind === 'unreadable' || res.kind === 'notrunning' || res.kind === 'waiting' || res.kind === 'none') { raceRenderRows([{ text: res.text, trend: null }], false); return; }
    if (res.kind === 'finished') { raceRenderRows([raceFinishRow(res.finish)], false); return; }
    const view = computeRaceView(r.tracker.samples, r.tracker.meId);
    raceRenderRows(raceLiveRows(view), true);
  }

  function scheduleRaceRead() {
    const r = st.race;
    if (r.timer !== null) return;
    r.timer = setTimeout(raceRead, Math.max(0, RACE_MIN_READ_MS - (Date.now() - r.lastReadMs)));   // at most one read per 250 ms
  }
  function onRaceBoard() { scheduleRaceRead(); }
  function onRaceInfo() { scheduleRaceRead(); }

  // Called from every cycle: mounts or removes the race panel and keeps the two observers on the leaderboard and on #infoSpot.
  function raceCycle() {
    const r = st.race;
    const board = document.getElementById('leaderBoard');
    const updates = document.getElementById('racingupdates');
    if (!board || !updates) { if (r.panel || r.boardObs) raceTeardown(); return; }
    if (document.querySelector(CAPTCHA_SELECTOR)) {          // a captcha: the panel steps aside, nothing is read
      raceStopObservers();
      r.paused = true;
      if (r.panel) r.panel.style.display = 'none';
      return;
    }
    const own = store.readOwnId();
    if (own === null || !store.isAllowedCached(own, deps.now()) || !board.querySelector('li[id="lbr-' + own + '"]')) { if (r.panel || r.boardObs) raceTeardown(); return; }
    r.paused = false;
    ensureStyle();
    if (!r.panel || !r.panel.isConnected || r.panel.previousElementSibling !== updates) {
      if (r.panel) r.panel.remove();
      const p = h('div', 'ksrl-panel ksrl-race-panel');
      p.id = 'ksrl-race-panel';
      updates.insertAdjacentElement('afterend', p);
      r.panel = p;
      raceRenderRows([{ text: 'Reading the leaderboard \u2026', trend: null }], false);
    }
    r.panel.style.display = '';
    const info = document.getElementById('infoSpot');
    if (r.boardEl !== board || r.infoEl !== info) {
      raceStopObservers();
      r.boardObs = new MutationObserver(onRaceBoard);
      r.boardObs.observe(board, { childList: true, subtree: true, characterData: true });
      r.boardEl = board;
      if (info) { r.infoObs = new MutationObserver(onRaceInfo); r.infoObs.observe(info, { childList: true, subtree: true, characterData: true }); }
      r.infoEl = info;
      scheduleRaceRead();
    }
  }

  // ---- the run: one per distinct (car, fitted parts, track, key) state
  function trackOf(carId, data) {
    const t = store.trackFor(carId);
    return t !== null && data.tracks.some(function (x) { return x.id === t; }) ? t : null;
  }

  async function run(sig, page) {
    st.sig = sig;
    const myGen = ++st.gen;
    if (st.abort) st.abort.abort();
    const ac = new AbortController();
    st.abort = ac;
    const stale = function () { return myGen !== st.gen; };
    const ui = st.ui;
    ui.points = page.racingPoints;
    ui.fittedIds = page.fittedIds;
    const key = gm.get(KEY_STORE, '');
    if (!page.ok) { ui.kind = 'unknown'; ui.message = page.reason; render(); return; }
    if (typeof key !== 'string' || key === '') { ui.kind = 'nokey'; ui.changingKey = false; render(); return; }
    logger.addSecret(key);
    if (ui.kind !== 'ready' || !ui.data || ui.data.enlisted.id !== page.carId) { ui.kind = 'loading'; ui.data = null; ui.view = null; render(); }
    const r = await loadPanelData(deps, key, page, ac.signal, stale);
    if (stale()) return;
    if (!r.ok) {
      if (r.stale || (r.err && r.err.kind === 'ABORT')) return;
      ui.data = null; ui.view = null;
      if (r.privateUse) { ui.kind = 'private'; render(); return; }
      if (r.gateAccess) { ui.kind = 'error'; ui.message = GATE_ACCESS_TEXT; ui.retry = false; ui.link = SHARE_KEY_LINK; render(); return; }
      if (r.unknownReason) { ui.kind = 'unknown'; ui.message = r.unknownReason; render(); return; }
      const err = r.err;
      if (err.kind === 'KEY_FATAL') {
        gm.del(KEY_STORE);
        store.clearUserData();
        ui.kind = 'nokey'; ui.notice = errorText(err); ui.changingKey = false;
        render();
        return;
      }
      ui.kind = 'error'; ui.message = errorText(err); ui.retry = err.kind !== 'ACCESS'; ui.link = null;
      render();
      return;
    }
    const d = r.data;
    ui.data = d;
    ui.notice = '';
    ui.kind = 'ready';
    ui.trackId = trackOf(d.enlisted.id, d);
    ui.view = ui.trackId === null ? null : computeViewForTrack({
      car: d.car, enlisted: d.enlisted, allEnlisted: d.enlistedItems, fittedIds: page.fittedIds, upgrades: d.upgrades, partsClass: d.partsClass, trackId: ui.trackId,
    });
    render();
  }

  function signature(page) {
    const hasKey = gm.get(KEY_STORE, '') !== '' ? 1 : 0;
    const t = page.ok ? store.trackFor(page.carId) : null;
    return [page.ok ? page.carId : 'x', page.fittedIds.join(','), page.racingPoints, t === null ? '-' : t, hasKey, st.tick].join('|');
  }

  function cycle() {
    st.timer = null;
    retarget();
    raceCycle();
    carsCycle();
    if (!document.querySelector('.pm-categories-wrap')) { if (st.panel || (st.style && !st.race.panel && !st.cars.panel)) teardown(); return; }
    if (document.querySelector(CAPTCHA_SELECTOR)) {
      // a captcha is on the page: our UI steps aside and nothing is called; the captcha itself is never touched
      st.gen++;
      if (st.abort) { st.abort.abort(); st.abort = null; }
      st.sig = null;
      setHidden(true);
      return;
    }
    ensurePanel();
    if (!st.panel) return;
    if (st.hidden) setHidden(false);
    const page = readPartsPage(document);
    const sig = signature(page);
    if (sig === st.sig) {
      if (!st.panel.firstChild || st.ui.rendered === false) render();
      else syncBadges();
      st.ui.rendered = true;
      return;
    }
    if (document.visibilityState === 'hidden') { st.waitVisible = true; return; }   // no calls while the tab is in the background
    st.ui.rendered = true;
    run(sig, page);
  }

  function schedule() {
    if (st.timer !== null) clearTimeout(st.timer);
    st.timer = setTimeout(cycle, DEBOUNCE_MS);
  }

  // ---- lifecycle: one observer, one visibilitychange listener, one pagehide listener, for the life of the page
  function onMutations(muts) {
    for (const m of muts) {
      if (insideOwn(m.target)) continue;
      const nodes = Array.prototype.slice.call(m.addedNodes).concat(Array.prototype.slice.call(m.removedNodes));
      if (m.type === 'childList' && nodes.length > 0 && nodes.every(isOwnNode)) continue;
      schedule();
      return;
    }
  }
  const OBS_OPTS = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true };

  function retarget() {
    const container = document.getElementById('racingMainContainer');
    const target = container || document.body;
    if (!target) return;
    if (st.observed === target && (!container || st.parentObserved === container.parentElement)) return;
    st.observer.disconnect();
    st.observer.observe(target, OBS_OPTS);
    st.observed = target;
    st.parentObserved = null;
    if (container && container.parentElement) {
      st.observer.observe(container.parentElement, { childList: true });   // the container itself being replaced
      st.parentObserved = container.parentElement;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && st.waitVisible) { st.waitVisible = false; schedule(); }
    if (document.visibilityState === 'visible' && st.cars.waitVisible) { st.cars.waitVisible = false; schedule(); }
    if (document.visibilityState === 'visible' && st.race.waitVisible) { st.race.waitVisible = false; scheduleRaceRead(); }
    if (document.visibilityState === 'visible' && st.share.waitVisible) { st.share.waitVisible = false; shareTick(false); }
  }

  function stopAll() {
    share.cancel();
    views.cancel();
    if (st.share.timer !== null) { clearTimeout(st.share.timer); st.share.timer = null; }
    raceStopObservers();
    st.cars.gen++;
    if (st.cars.abort) { st.cars.abort.abort(); st.cars.abort = null; }
    if (st.timer !== null) { clearTimeout(st.timer); st.timer = null; }
    st.observer.disconnect();
    st.gen++;
    if (st.abort) { st.abort.abort(); st.abort = null; }
  }

  st.observer = new MutationObserver(onMutations);
  window.addEventListener('pagehide', stopAll);
  document.addEventListener('visibilitychange', onVisibility);
  cycle();
  if (share.isEnabled()) shareTick(true);      // the page has loaded and the switch is on: one round now, then at most every 15 minutes
}
/* ksrl-ui END */

if (typeof document === 'undefined') {
  // Node (tests): hand out the pure parts. No DOM, no boot.
  module.exports = {
    KSRL: KSRL, SCRIPT_VERSION: SCRIPT_VERSION, EQUAL_WITHIN_PCT: EQUAL_WITHIN_PCT, ALWAYS_ALLOWED_IDS: ALWAYS_ALLOWED_IDS, FACTION_ID: FACTION_ID, NOT_MEMBER_TEXT: NOT_MEMBER_TEXT, GATE_ACCESS_TEXT: GATE_ACCESS_TEXT, checkMembership: checkMembership,
    carName: carName, resolveCurrentTrack: resolveCurrentTrack, rankCarsForTrack: rankCarsForTrack, carsChangeLines: carsChangeLines, carsChangeSegs: carsChangeSegs, fmtTime: fmtTime, fmtTimeSigned: fmtTimeSigned,
    carBadgeKind: carBadgeKind, CARS_NOTE: CARS_NOTE, loadCarsData: loadCarsData,
    parseRaceTime: parseRaceTime, createRaceTracker: createRaceTracker, computeRaceView: computeRaceView, computeFinishView: computeFinishView, RACE_MAX_SAMPLES: RACE_MAX_SAMPLES,
    raceLiveRows: raceLiveRows, raceFinishRow: raceFinishRow, RACE_LEGEND: RACE_LEGEND,
    computePartsView: computePartsView, tuneCode: tuneCode, tuneRowText: tuneRowText, alreadyBuiltText: alreadyBuiltText, categoriesRowText: categoriesRowText, categoryCounts: categoryCounts, partsById: partsById, DIRT_SURFACE_PARTS: DIRT_SURFACE_PARTS, TUNE_LEGEND: TUNE_LEGEND, GAP_NOTE: GAP_NOTE, computeDirtBuildView: computeDirtBuildView, computeViewForTrack: computeViewForTrack,
    isFixedDirtTrack: isFixedDirtTrack, trackSurfaceLabel: trackSurfaceLabel, dirtContext: dirtContext, TRACK_SURFACE_FIXED: TRACK_SURFACE_FIXED,
    DIRT_REFERENCE_TRACKS: DIRT_REFERENCE_TRACKS, describeView: describeView, badgeFor: badgeFor, parseBuyHref: parseBuyHref,
    createStore: createStore, createRequester: createRequester, loadPanelData: loadPanelData, errorText: errorText,
    createSharer: createSharer, createShareTorn: createShareTorn, shareReadState: shareReadState, shareSplit: shareSplit,
    SHARE_STORE: SHARE_STORE, SHARE_SESSION_STORE: SHARE_SESSION_STORE, SHARE_DETAILS_STORE: SHARE_DETAILS_STORE, shareDetailsOpen: shareDetailsOpen, shareDetailsChoose: shareDetailsChoose, shareDetailsReset: shareDetailsReset, SHARE_PATHS: SHARE_PATHS, SHARE_WORKER_ORIGIN: SHARE_WORKER_ORIGIN,
    SHARE_TORN_CALLS_PER_MINUTE: SHARE_TORN_CALLS_PER_MINUTE, SHARE_INTERVAL_MS: SHARE_INTERVAL_MS, SHARE_OVERLAP_S: SHARE_OVERLAP_S,
    SHARE_MAX_PAYLOAD_BYTES: SHARE_MAX_PAYLOAD_BYTES, SHARE_ONLY_TEXT: SHARE_ONLY_TEXT, SHARE_KEY_LINK: SHARE_KEY_LINK,
    SHARE_DISCLOSURE: SHARE_DISCLOSURE, SHARE_TITLE: SHARE_TITLE, SHARE_CARS_INTERVAL_MS: SHARE_CARS_INTERVAL_MS, SHARE_BUDGET_WAIT_MS: SHARE_BUDGET_WAIT_MS,
    createKsServer: createKsServer, createViewsReader: createViewsReader, realResultsRows: realResultsRows, viewsCheckAnswer: viewsCheckAnswer, viewsReadCache: viewsReadCache, viewsReadSwitch: viewsReadSwitch,
    viewsDetailsOpen: viewsDetailsOpen, shareNoticePending: shareNoticePending, shareNoticeAck: shareNoticeAck,
    VIEWS_SWITCH_STORE: VIEWS_SWITCH_STORE, VIEWS_CACHE_STORE: VIEWS_CACHE_STORE, VIEWS_DETAILS_STORE: VIEWS_DETAILS_STORE, SHARE_NOTICE_STORE: SHARE_NOTICE_STORE, VIEW_NAMES: VIEW_NAMES, VIEWS_INTERVAL_MS: VIEWS_INTERVAL_MS, VIEWS_STALE_S: VIEWS_STALE_S,
    VIEWS_TITLE: VIEWS_TITLE, VIEWS_DISCLOSURE: VIEWS_DISCLOSURE, VIEWS_NOT_ALLOWED_TEXT: VIEWS_NOT_ALLOWED_TEXT, VIEWS_OFF_ROW: VIEWS_OFF_ROW, SHARE_NOTICE_TEXT: SHARE_NOTICE_TEXT,
    decideTrack: decideTrack, decisionData: decisionData, classesFrom: classesFrom, highestClass: highestClass, settingsReadChase: settingsReadChase, settingsSetChase: settingsSetChase,
    changeAnswerRows: changeAnswerRows, listAnswerRows: listAnswerRows, listSourceLines: listSourceLines, partsAnswer: partsAnswer, SETTINGS_STORE: SETTINGS_STORE,
    CHASE_TITLE: CHASE_TITLE, CHASE_TEXT: CHASE_TEXT, CODE_LEGEND: CODE_LEGEND, decideSlower: decideSlower,
  };
} else {
  boot();
}
})();
