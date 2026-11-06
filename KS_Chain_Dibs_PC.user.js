// ==UserScript==
// @name         KS Chain Dibs PC
// @namespace    kingshade.torn.chaindibs
// @version      0.6.0
// @description  A small floating window with your faction chain: timer, the queue for the next hit, and the Im here rule so the chain does not break. Only the member who made the hit leaves the queue. When anybody may hit, FREE HIT links to a free target. Im here is locked when you cannot hit. Stand first without pressing Im here for 5 hits and you are removed as AFK. A bonus hit is announced. The minimized window still shows who is first and who is the hitter, and a yellow frame tells you when you hold the hit.
// @author       Kingshade
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Chain_Dibs_PC.user.js
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Chain_Dibs_PC.user.js
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @connect      api.torn.com
// @connect      ks-war-room-claims-staging.hans-viklund.workers.dev
// ==/UserScript==

/*
 * KS Chain Dibs PC 0.6.0
 *
 * 0.6.0  ADDED: minimized window shows who is first and who is the hitter.
 *        ADDED: "You are first/2nd in the queue". ADDED: a clear yellow frame
 *        and "YOU ARE THE HITTER" when you hold the hit, and "You are now first
 *        - press Im here" when you move up. The window opens itself for these.
 * 0.5.0  CHANGED: new times. Press Im here before 2:00, the hitter hits at 1:30
 *        (HIT NOW), FREE HIT with a target from 1:00. With no confirmed
 *        hitter FREE HIT starts at 1:30.
 *        ADDED: if you stand first in the queue and do not press Im here for 5
 *        hits in a row, you are removed from the queue as AFK.
 *        ADDED: "BONUS HIT next" when the next hit is a chain bonus hit.
 * 0.4.0  ADDED: Im here is locked when you cannot hit (energy under 25,
 *        hospital, jail, traveling or abroad). The window says why.
 * 0.3.0  CHANGED: everybody stays in the queue. Only the member who made
 *        the hit leaves it (the script reads your own attacks to see it).
 *        ADDED: "Rejoin after my hit" puts you last in the queue again.
 *        New key link (adds user attacks and bars). Updates now come from
 *        GitHub.
 * 0.2.0  ADDED: FREE HIT target. When anybody may hit, FREE HIT becomes a
 *        link to the first target on the faction list that is Okay.
 *        New key link (adds user basic).
 * 0.1.2  ADDED: reads Torn's own chain bar on the page you have open: a new
 *        hit is fetched at once, and the timer follows Torn's timer.
 * 0.1.1  FIXED: "No key saved" instead of OFFLINE when Watch is on without a key.
 *        FIXED: timer rounds down like Torn (was rounding up).
 *
 * What it does: shows your faction chain (hits, timer) in a small window and
 * keeps a queue of members for the next hit. The rule is "Im here": everybody
 * in the queue presses Im here, and 2:00 before the chain breaks the first
 * confirmed member gets the hit (GET READY, then HIT NOW at 1:30). From 1:00
 * anybody may hit; with nobody confirmed, from 1:30. Nobody is taken out of
 * the queue by the rule: only the member who made a hit leaves it, and his own
 * copy of this script tells the server so. The one other way out is AFK: a
 * member who stands first in the queue and has not pressed Im here at 5
 * decisions in a row is removed by the server. The KS server decides with its
 * own clock; this window only shows it. Minimized, the window still shows who
 * is first in the queue and who is the hitter. When you hold the hit its frame
 * turns yellow and pulses, and when you move up to first place it tells you to
 * press Im here. For these two the window opens itself if it was minimized (your
 * saved choice is not changed).
 *
 * Network (and nothing else):
 *  - api.torn.com, every 3 s while Watch is on and only from ONE open tab:
 *    /v2/faction/chain (20 calls a minute) and /v2/faction/members once per
 *    10 minutes. Your own key, sent only in the Authorization header.
 *  - the KS server (@connect above): sign-in once per 10 minutes and a state
 *    call every 3 s from the same tab, plus Join, Leave and Im here when you
 *    press them. The server never calls Torn and never stores your key.
 *  - No request to any torn.com page. No clicks, no navigation. The window is
 *    the only thing added to the page. The only thing read from the page is
 *    Torn's own chain bar in the side menu (hits and time left), read only, on
 *    the page you have open. It makes a new hit show up at once and lets the
 *    timer follow Torn's. Extra rounds for a new hit are limited to one a
 *    second and 18 in any 60 seconds, which keeps this tab at 40 Torn calls a
 *    minute or fewer (Torn allows 100).
 *  - api.torn.com /v2/user/ID/basic (public key), only from ONE open tab and
 *    only while Watch is on, to find a free target for FREE HIT. The faction
 *    list (up to 10 Torn IDs a leader typed in) is read from the KS server.
 *    Only when FREE HIT is close (70 seconds before the chain breaks, or 100
 *    seconds when nobody holds the hit) and the list is not empty: one check
 *    at once, then one every 20 seconds. A check asks the targets one at a
 *    time in list order and stops at the first one that is Okay, so at most 5
 *    calls a check and 15 calls in any 60 seconds. With the calls above this
 *    tab stays at about 55 Torn calls a minute or fewer (Torn allows 100).
 *    Error 5 pauses these calls for 30 seconds. Error 16 stops only these
 *    calls until a new key is saved. Neither ever stops Watch or removes the
 *    key.
 *  - The FREE HIT target is a plain link. YOU click it yourself; the script
 *    never clicks, never opens a page and never navigates.
 *  - api.torn.com /v2/user/attacks (your OWN outgoing attacks, limited key),
 *    only from ONE open tab, only while Watch is on and only when you stand
 *    in the queue: when the chain moves on one or more hits, the script looks
 *    at your last attacks to see whether YOU made that hit. If one of them
 *    has the new hit number, only that fact goes to the KS server (the chain
 *    ID, the hit number, when the attack ended, and your Rejoin choice). Your
 *    attacks are not stored or sent anywhere else. No hit found: it asks
 *    again after 2 seconds, at most 3 more times for that hit. One such call
 *    at a time, at most 10 in any 60 seconds. Error 5 pauses these calls for
 *    30 seconds, together with the other Torn calls. Error 16 stops only
 *    these calls until a new key is saved and shows the key link. Neither
 *    ever stops Watch or removes the key. With the calls above this tab stays
 *    at about 65 Torn calls a minute or fewer (Torn allows 100).
 *  - api.torn.com /v2/user/bars and /v2/user/basic (your OWN energy and your
 *    OWN status), only from ONE open tab, only while Watch is on and only when
 *    you stand in the queue, to see whether you can hit (energy of 25 or more
 *    and status Okay). The two calls are made as a pair: at once when you join
 *    the queue, every 20 seconds while you stand in it, at once when the turn
 *    comes within 2 minutes 30 seconds of the chain breaking, and at once after you press
 *    Im here. At most 8 such calls in any 60 seconds. If you cannot hit, Im
 *    here is locked and the window says why. If you had pressed Im here, or
 *    held the hit, when you could no longer hit, the script sends the KS server
 *    one request that only means "take back my Im here" (you stay in the queue).
 *    Your energy and your status are NOT sent anywhere and are not stored
 *    except in the shared state between your own open Torn tabs. If the check
 *    fails or is older than 60 seconds nothing is locked: the chain comes
 *    first, and the window says "Energy check unavailable". Error 5 pauses
 *    these calls for 30 seconds, together with the other Torn calls. Error 16
 *    stops only these calls until a new key is saved and shows the key link.
 *    Neither ever stops Watch or removes the key. With the calls above this
 *    tab stays at about 73 Torn calls a minute or fewer (Torn allows 100).
 *
 *  - AFK, the bonus hit warning and the 0.6.0 displays (first in the queue, the
 *    hitter, the frame, "You are now first") make no new call. Who was removed
 *    as AFK comes in the answers of the KS server. The bonus warning uses the
 *    hit count that was already read. There is NO sound, no notification, no
 *    change of the tab title or icon, no focus change, no new window and no
 *    vibration: it is all colour, frame and text inside this window, on the
 *    page you have open.
 *
 * Stored in Tampermonkey on this PC: your API key, the window position, Watch
 * on/off, your Rejoin choice, the faction member names (refreshed every 10
 * minutes) and the shared state between your open Torn tabs (with the FREE
 * HIT target: a Torn ID and a name). Nothing is shared with anybody else
 * except what the KS server shows the faction: the queue and the FREE HIT
 * list (Torn IDs). The list can only be changed by the Torn IDs the server
 * names (the Targets button).
 *
 * Key access level: Limited (custom key: user basic, attacks and bars, faction
 * chain and members). Watch turns itself off after
 * 15 minutes without an active chain. No sound in this version.
 */

(function () {
  'use strict';

  var INSTANCE_KEY = '__ksChainDibsPcV010';
  if (window[INSTANCE_KEY]) return;
  window[INSTANCE_KEY] = true;

  var VERSION = '0.6.0';

  // The ONE place the server address lives.
  var SERVER_BASE = 'https://ks-war-room-claims-staging.hans-viklund.workers.dev';

  var TORN_CHAIN_URL = 'https://api.torn.com/v2/faction/chain';
  var TORN_MEMBERS_URL = 'https://api.torn.com/v2/faction/members';
  var TORN_USER_URL = 'https://api.torn.com/v2/user/';
  var TORN_ATTACKS_URL = 'https://api.torn.com/v2/user/attacks';
  var TORN_BARS_URL = 'https://api.torn.com/v2/user/bars';
  var TORN_BASIC_URL = 'https://api.torn.com/v2/user/basic';
  var ATTACK_URL = 'https://www.torn.com/page.php?sid=attack&user2ID=';
  var COMMENT = 'KSChainDibs';
  var KEY_URL = 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=KS%20Chain%20Dibs&user=basic,attacks,bars&faction=chain,members';

  var STORE = 'ksChainDibs.v1.';
  var K_API = STORE + 'apiKey';
  var K_LEADER = STORE + 'leader';
  var K_SHARED = STORE + 'shared';
  var K_WATCH = STORE + 'watch';
  var K_POS = STORE + 'pos';
  var K_MIN = STORE + 'min';
  var K_NAMES = STORE + 'names';
  var K_DEBUG = STORE + 'debug';
  var K_KICK = STORE + 'kick';
  var K_REJOIN = STORE + 'rejoin';

  var POLL_MS = 3000;
  var HEARTBEAT_MS = 2000;
  var LEADER_STALE_MS = 6000;
  var WATCH_AUTO_OFF_MS = 15 * 60 * 1000;
  var NAMES_REFRESH_MS = 10 * 60 * 1000;
  var UI_TICK_MS = 250;
  var OFFLINE_AFTER_MS = 10000;
  var STALE_AFTER_MS = 10000;
  var REQUEST_TIMEOUT_MS = 8000;
  var LOGIN_MIN_GAP_MS = 2100;
  var TORN_PAUSE_MS = 30000;
  var CLOCK_SAMPLES = 10;
  var BLINK_MS = 500;
  var QUEUE_SHOWN = 3;
  var DEFAULT_LEFT = 12;
  var DEFAULT_TOP = 90;
  var BOX_WIDTH = 240;

  // Torn's own chain bar. The class names end in generated letters, so only
  // the start of each name is matched.
  var BAR_SELECTOR = '[class*="chain-bar___"]';
  var BAR_VALUE_SELECTOR = '[class*="bar-value___"]';
  var BAR_TIME_SELECTOR = '[class*="bar-timeleft___"]';
  var BAR_TIMER_TOLERANCE_S = 2;     // the window shows Torn's time when it is this close to its own
  var KICK_RETRY_MS = 1000;          // API still behind the page: ask again after this
  var KICK_MAX_RETRIES = 4;          // ... at most this many times per new count
  var EXTRA_MIN_GAP_MS = 1000;       // at most one extra round a second
  var EXTRA_WINDOW_MS = 60000;
  var EXTRA_WINDOW_MAX = 18;         // at most this many extra rounds in any 60 s: 20 normal + 18 extra + names = 40 or fewer

  // FREE HIT target (leader tab only). When the status of the targets is asked.
  var FREE_SOON_NO_OWNER_MS = 100000;  // turn decided, nobody holds the hit: from 1:40 (10 s before FREE HIT at 1:30)
  var FREE_SOON_OWNER_MS = 70000;      // somebody holds the hit: from 1:10 (10 s before FREE HIT at 1:00)
  var FREE_CHECK_EVERY_MS = 20000;     // one check, then one every 20 s on the same turn
  var FREE_MAX_PER_CHECK = 5;          // at most this many status calls in one check
  var STATUS_WINDOW_MS = 60000;
  var STATUS_WINDOW_MAX = 15;          // at most this many status calls in any 60 s: 20 chain + 18 extra + 15 status + names = 55 or fewer
  var FREE_MAX_AGE_MS = 60000;         // a target older than this is not shown (the leader tab is gone)
  var FREE_RETRY_MS = 1000;            // the 60 s window is full: look again after this
  var TARGETS_MAX = 10;

  // Who made the hit (leader tab only). The member's own attacks are read to see
  // whether he made the hit that moved the chain on.
  var HIT_LOOKBACK_S = 600;            // only attacks from the last 10 minutes
  var HIT_LIMIT = 10;                  // the last 10 outgoing attacks
  var HIT_RETRY_MS = 2000;             // no hit found: ask again after this
  var HIT_MAX_RETRIES = 3;             // ... at most this many more times for each new hit
  var HIT_BUSY_MS = 250;               // an older call is still on its way: look again after this
  var HIT_SEEN_FRESH_MS = 30000;       // a leader that takes over trusts the shared turn only if it is this fresh
  var HIT_WINDOW_MS = 60000;
  var HIT_WINDOW_MAX = 10;            // at most this many attacks calls in any 60 s: 20 chain + 18 extra + 15 status + 10 attacks + names = 65 or fewer

  // Can he hit? (leader tab only). His OWN energy and status are read to lock Im here.
  var ATTACK_ENERGY = 25;              // one attack costs this much energy - the ONE place the number lives
  var ABILITY_EVERY_MS = 20000;        // while he stands in the queue: one check every 20 s
  var ABILITY_MAX_AGE_MS = 60000;      // a result older than this is unknown (and unknown locks nothing)
  var ABILITY_CALLS = 2;               // one check = bars + basic
  var ABILITY_WINDOW_MS = 60000;
  var ABILITY_WINDOW_MAX = 8;          // at most this many calls in any 60 s: the 65 of 0.3.0 + 8 = 73 or fewer (Torn allows 100)
  var ABILITY_REASON_MAX = 20;         // the reason shown for a status is cut to this many characters

  // The same bands the server uses (seconds before the chain breaks).
  var CONFIRM_FROM_MS = 150000;
  var RESOLVE_AT_MS = 120000;
  var HIT_NOW_AT_MS = 90000;
  var FREE_HIT_AT_MS = 60000;

  // The hit numbers that are chain bonus hits - the ONE place the numbers live
  // (checked 2026-11-04 against three sources that are not Torn).
  var BONUS_HITS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  var BONUS_COLOR = '#d4a017';
  var BOX_BORDER = '1px solid #4a4f57';  // the frame of the window as it normally is
  var HITTER_COLOR = '#f1c40f';          // the yellow of the hitter: frame, banner, "Hitter:" row
  var HITTER_DARK = '#3a3f45';           // the dark half of the pulsing frame
  var HITTER_FRAME_PX = 3;
  var MOVED_COLOR = '#e67e22';           // "You are now first - press Im here"
  var MOVED_TEXT = 'You are now first - press Im here';
  var AFK_LIST_MAX = 50;               // afkRecent is cleaned to at most this many IDs
  var AFK_NAMES_SHOWN = 2;             // "removed as AFK" names two, then +N
  var AFK_SELF_TEXT = 'You were removed from the queue as AFK (5 hits without Im here).';

  var PHASE_STYLE = {
    waiting:      { bg: '#3a3f45', fg: '#e6e6e6' },
    confirm:      { bg: '#b8860b', fg: '#ffffff' },
    get_ready:    { bg: '#d9822b', fg: '#ffffff' },
    hit_now:      { bg: '#2e8b57', fg: '#ffffff' },
    no_confirmed: { bg: '#8e2b2b', fg: '#ffffff' },
    free_hit:     { bg: '#c0392b', fg: '#ffffff' },
    ended:        { bg: '#5a1f1f', fg: '#ffffff' },
    inactive:     { bg: '#3a3f45', fg: '#e6e6e6' },
    stale:        { bg: '#2b2b2b', fg: '#ffd84d' },
    offline:      { bg: '#2b2b2b', fg: '#ffd84d' },
    checking:     { bg: '#2b2b2b', fg: '#ffd84d' }
  };

  var TOS_ROWS = [
    ['Data Storage', 'The KS server keeps the chain queue (Torn IDs, join time, Im here, and how many hits in a row you stood first without pressing it) and the latest chain reading, deleted 12 hours after the last change, for one minute the Torn IDs of members it removed as AFK, and the free hit list (Torn IDs of targets set by the faction leader) until the leader changes it.'],
    ['Data Sharing', 'Faction members who use KS Chain Dibs see the queue, the free hit list and, for one minute, who was removed as AFK. Nobody outside the faction. Your own attacks are read only to see if you made the chain hit; only that fact is sent to the KS server. Your own energy and status are read only to see if you can hit; they are not sent anywhere.'],
    ['Purpose of Use', 'Coordinate who takes the next chain hit so the chain does not break, and point to a free target when anybody may hit.'],
    ['Key Storage & Sharing', 'Stored only in Tampermonkey on this PC. Sent to api.torn.com, and once per sign-in to the KS server to confirm your Torn ID and faction. The KS server never stores it.'],
    ['Key Access Level', 'Limited (custom key: user basic, attacks and bars, faction chain and members).']
  ];

  // ------------------------------------------------------------ state

  var tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var running = false;
  var watchOn = false;
  var watchSince = 0;
  var isLeader = false;
  var timers = { ui: null, leader: null, poll: null };
  var listenerIds = [];
  var shared = null;          // { v, snap, snapAt, offset, torn, auth, note, at }
  var names = {};             // tornId -> name
  var namesFetchedAt = 0;
  var session = null;         // { token, validUntil } - memory only
  var lastLoginAt = 0;
  var loginBusy = false;
  var loginWaiters = [];
  var loginBlockedUntil = 0;   // no sign-in before this time (429, or backing off after a failure)
  var loginFails = 0;
  var cycleBusy = false;
  var barNode = null;         // the chain bar element being watched
  var barObserver = null;
  var kickState = null;       // { count, tries }: a new hit seen on the page, waiting for the API
  var kickTimer = null;
  var extraTimer = null;
  var pendingExtra = false;
  var lastExtraAt = 0;
  var extraTimes = [];        // when the extra rounds were made (the last 60 s)
  var namesBusy = false;
  // FREE HIT target, leader tab only: which turn it looks at, whether a check is
  // running, when the next one is due, and which list the last check used.
  var freeCtl = { turn: null, gen: 0, busy: false, nextAt: 0, listSig: '', keyWasBad: false };
  var statusTimes = [];       // when the status calls were made (the last 60 s)
  // Can he hit? Leader tab only. gen = which round of watching this is (an answer
  // from an older round is not believed); busy = a check is on its way; force = a
  // check is due now; nextAt = the next regular check; wasInQueue / wasConfirmed =
  // what the last look saw (a change is a reason to check at once).
  var abilityCtl = { gen: 0, busy: false, force: false, nextAt: 0, wasInQueue: null, wasConfirmed: null, confirmTurn: null, keyWasBad: false, unconfirmBusy: false };
  var abilityTimes = [];      // when the bars/basic calls were made (the last 60 s, one entry per call)
  // Who made the hit, leader tab only. hitSeen = the newest turn this tab has
  // seen. hitCtl = the hit being looked for: { gen, chainId, low, high, tries,
  // inflight }. low..high are the hit numbers that moved the chain on.
  var hitSeen = null;
  var hitCtl = null;
  var hitGen = 0;
  var hitTimer = null;
  var attackTimes = [];       // when the attacks calls were made (the last 60 s)
  var targetsOpen = false;    // the Targets panel is unfolded
  var tornPausedUntil = 0;
  var samples = [];
  var inactiveSince = 0;
  var localMsg = '';
  var localMsgUntil = 0;
  var ui = {};
  var pos = { left: DEFAULT_LEFT, top: DEFAULT_TOP };
  var minimized = false;
  // 0.6.0: where he stood at the last answer (to see that he moved up to first),
  // the "now first" notice, and the event the window last opened itself for.
  var posTrack = null;        // { chainId, position, serverTime }
  var movedFirst = null;      // { key, shown }
  var movedSeq = 0;
  var lastAutoKey = null;

  // ------------------------------------------------------------ helpers

  function dbg() {
    var on = false;
    try { on = GM_getValue(K_DEBUG, false) === true; } catch (e) { on = false; }
    if (!on) return;
    var args = ['[KSChainDibs]'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    try { console.log.apply(console, args); } catch (e) { /* ignore */ }
  }

  function gmGet(key, fallback) {
    try { return GM_getValue(key, fallback); } catch (e) { return fallback; }
  }

  function gmSet(key, value) {
    try { GM_setValue(key, value); } catch (e) { dbg('storage write failed'); }
  }

  function gmDel(key) {
    try { GM_deleteValue(key); } catch (e) { /* ignore */ }
  }

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  function getKey() {
    var key = gmGet(K_API, '');
    return (typeof key === 'string' && /^[A-Za-z0-9]{16}$/.test(key)) ? key : '';
  }

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function css(node, text) { node.style.cssText = text; return node; }

  // Marks an element so it can be found again (tests and support).
  function mark(node, name) { node.setAttribute('data-ksc', name); return node; }

  function nameOf(id) {
    var n = names[id];
    return (typeof n === 'string' && n.length > 0) ? n : '#' + id;
  }

  function fmtTime(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // The same bands as the server. The upper end of each band is open.
  function phaseFor(remainingMs, hasOwner) {
    if (remainingMs <= 0) return 'ended';
    if (remainingMs > CONFIRM_FROM_MS) return 'waiting';
    if (remainingMs > RESOLVE_AT_MS) return 'confirm';
    if (remainingMs > HIT_NOW_AT_MS) return hasOwner ? 'get_ready' : 'no_confirmed';
    if (remainingMs > FREE_HIT_AT_MS) return hasOwner ? 'hit_now' : 'free_hit';
    return 'free_hit';
  }

  function setLocalMsg(text, ms) {
    localMsg = text;
    localMsgUntil = Date.now() + (ms || 6000);
    render();
  }

  // ------------------------------------------------------------ validation

  var STATUSES = { live: 1, stale: 1, inactive: 1, no_reading: 1 };
  var PHASES = { waiting: 1, confirm: 1, get_ready: 1, hit_now: 1, no_confirmed: 1, free_hit: 1, ended: 1 };
  var ACTIONS = { joined: 1, already_in_queue: 1, queue_full: 1, left: 1, not_in_queue: 1, confirmed: 1, already_confirmed: 1, turn_resolved: 1, no_turn: 1, targets_set: 1, hit_removed: 1, hit_rejoined: 1, hit_ignored: 1, unconfirmed: 1, owner_released: 1, not_confirmed: 1 };

  // Everything from the server is checked before it is shown. null = unusable.
  function cleanSnap(j) {
    if (!j || typeof j !== 'object') return null;
    if (!isInt(j.serverTime)) return null;
    if (!STATUSES.hasOwnProperty(j.status)) return null;
    var phase = null;
    if (j.phase !== null && j.phase !== undefined) {
      if (!PHASES.hasOwnProperty(j.phase)) return null;
      phase = j.phase;
    }
    var chain = null;
    if (j.chain !== null && j.chain !== undefined) {
      var c = j.chain;
      if (typeof c !== 'object' || !isInt(c.id) || !isInt(c.current) || !isInt(c.max) || !isInt(c.end) || !isInt(c.cooldown) || !isInt(c.readingAgeMs)) return null;
      chain = { id: c.id, current: c.current, max: c.max, end: c.end, cooldown: c.cooldown, readingAgeMs: c.readingAgeMs };
    }
    var turn = null;
    if (j.turn !== null && j.turn !== undefined) {
      var t = j.turn;
      if (typeof t !== 'object' || !isInt(t.chainId) || !isInt(t.current)) return null;
      if (typeof t.resolved !== 'boolean' || typeof t.noConfirmed !== 'boolean' || typeof t.ownerLeft !== 'boolean') return null;
      if (t.ownerId !== null && !(typeof t.ownerId === 'string' && /^[0-9]{1,12}$/.test(t.ownerId))) return null;
      turn = { chainId: t.chainId, current: t.current, resolved: t.resolved, ownerId: t.ownerId, noConfirmed: t.noConfirmed, ownerLeft: t.ownerLeft };
    }
    if (!Array.isArray(j.queue) || j.queue.length > 25) return null;
    var queue = [];
    for (var i = 0; i < j.queue.length; i++) {
      var q = j.queue[i];
      if (!q || typeof q !== 'object' || typeof q.tornId !== 'string' || !/^[0-9]{1,12}$/.test(q.tornId) || typeof q.confirmed !== 'boolean') return null;
      queue.push({ tornId: q.tornId, confirmed: q.confirmed });
    }
    var y = j.you;
    if (!y || typeof y !== 'object' || typeof y.inQueue !== 'boolean' || typeof y.confirmed !== 'boolean' || typeof y.isOwner !== 'boolean') return null;
    if (y.position !== null && !isInt(y.position)) return null;
    var action = (typeof j.action === 'string' && ACTIONS.hasOwnProperty(j.action)) ? j.action : null;
    // The FREE HIT list. A missing or wrongly shaped list never knocks out the
    // chain window: it is just no list, and nobody may edit.
    var targets = [];
    if (Array.isArray(j.targets) && j.targets.length <= TARGETS_MAX) {
      var okList = true;
      for (var k = 0; k < j.targets.length; k++) {
        if (typeof j.targets[k] !== 'string' || !/^[0-9]{1,12}$/.test(j.targets[k])) { okList = false; break; }
      }
      if (okList) targets = j.targets.slice();
    }
    var canEdit = y.canEditTargets === true;
    // AFK (0.5.0). A missing or wrongly shaped value is just "nobody" and "not me".
    var afkRecent = [];
    if (Array.isArray(j.afkRecent) && j.afkRecent.length <= AFK_LIST_MAX) {
      var okAfk = true;
      for (var a = 0; a < j.afkRecent.length; a++) {
        if (typeof j.afkRecent[a] !== 'string' || !/^[0-9]{1,12}$/.test(j.afkRecent[a])) { okAfk = false; break; }
      }
      if (okAfk) afkRecent = j.afkRecent.slice();
    }
    var afkRemovedAt = isInt(y.afkRemovedAt) ? y.afkRemovedAt : null;
    return {
      serverTime: j.serverTime,
      status: j.status,
      phase: phase,
      chain: chain,
      turn: turn,
      queue: queue,
      targets: targets,
      afkRecent: afkRecent,
      you: { inQueue: y.inQueue, position: y.position, confirmed: y.confirmed, isOwner: y.isOwner, canEditTargets: canEdit, afkRemovedAt: afkRemovedAt, tornId: (typeof y.tornId === 'string' && /^[0-9]{1,12}$/.test(y.tornId)) ? y.tornId : null },
      action: action
    };
  }

  function cleanName(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 30);
  }

  // ------------------------------------------------------------ shared state

  function publish(patch) {
    var cur = shared || {};
    // The FREE HIT target is written by the leader tab only. Another tab that
    // publishes carries the newest one it can see, so it never wipes it out.
    var freeHit = cur.freeHit || null;
    var stored = gmGet(K_SHARED, null);
    if (stored && typeof stored === 'object' && stored.freeHit && (!freeHit || stored.freeHit.checkedAt > freeHit.checkedAt)) {
      freeHit = stored.freeHit;
    }
    var next = {
      v: 1,
      snap: cur.snap || null,
      snapAt: cur.snapAt || 0,
      offset: cur.offset || 0,
      torn: cur.torn || { kind: 'ok' },
      auth: cur.auth || { kind: 'none' },
      note: cur.note || '',
      freeHit: freeHit,
      freeKeyBad: cur.freeKeyBad === true,
      hitKeyBad: cur.hitKeyBad === true,
      // Can he hit? ability = the last answer that could be read (or null),
      // abilityErr = when the newest check failed (0 = none has failed).
      ability: cur.ability || null,
      abilityErr: isInt(cur.abilityErr) ? cur.abilityErr : 0,
      abilityKeyBad: cur.abilityKeyBad === true,
      at: Date.now()
    };
    var keys = Object.keys(patch);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === 'snap') {
        // A newer answer is never replaced by an older one.
        if (cur.snap && patch.snap && patch.snap.serverTime < cur.snap.serverTime) continue;
      }
      next[k] = patch[k];
    }
    shared = next;
    gmSet(K_SHARED, next);
    render();
  }

  function onSharedChange(name, oldValue, newValue, remote) {
    if (!remote) return;
    if (newValue && typeof newValue === 'object' && newValue.v === 1) {
      shared = newValue;
      render();
    }
  }

  function loadShared() {
    var v = gmGet(K_SHARED, null);
    shared = (v && typeof v === 'object' && v.v === 1) ? v : null;
  }

  // ------------------------------------------------------------ watch

  function readWatch() {
    var w = gmGet(K_WATCH, null);
    if (w && typeof w === 'object' && w.on === true && isInt(w.since)) return { on: true, since: w.since };
    return { on: false, since: 0 };
  }

  function setWatch(on, note) {
    if (on) {
      gmSet(K_WATCH, { on: true, since: Date.now() });
    } else {
      gmSet(K_WATCH, { on: false, since: 0 });
    }
    if (note !== undefined) publish({ note: note });
    applyWatch();
  }

  // Starts or stops everything that makes network calls or runs timers.
  function applyWatch() {
    var w = readWatch();
    var was = watchOn;
    watchOn = w.on;
    watchSince = w.since;
    if (watchOn !== was) { posTrack = null; movedFirst = null; }
    if (watchOn && !was) {
      inactiveSince = 0;
      loadNames();
      startTimers();
      leaderTick();
    } else if (!watchOn && was) {
      stopTimers();
      freeAbort(true);
      abilityAbort(true);
      releaseLeadership();
      session = null;
    }
    render();
  }

  function onWatchChange(name, oldValue, newValue, remote) {
    if (!remote) return;
    applyWatch();
  }

  // ------------------------------------------------------------ leadership

  function readLeader() {
    var l = gmGet(K_LEADER, null);
    if (l && typeof l === 'object' && typeof l.tabId === 'string' && isInt(l.heartbeatAt)) return l;
    return null;
  }

  function setLeader(flag) {
    if (flag === isLeader) return;
    isLeader = flag;
    dbg(flag ? 'this tab is the leader' : 'this tab is a follower');
    if (flag) {
      // A leader that takes over carries on from the turn the shared state shows
      // (if that is fresh), so a hit made just before the switch is still noticed.
      var fresh = shared && shared.snapAt && Date.now() - shared.snapAt < HIT_SEEN_FRESH_MS;
      var seenTurn = (fresh && shared.snap && shared.snap.turn) ? shared.snap.turn : null;
      hitSeen = seenTurn ? { chainId: seenTurn.chainId, current: seenTurn.current } : null;
      startPoll();
    } else {
      stopPoll();
      hitSeen = null;
      freeAbort(false);
      abilityAbort(false);
    }
  }

  function leaderTick() {
    if (!watchOn || !running) return;
    var now = Date.now();
    var cur = readLeader();
    if (cur && cur.tabId === tabId) {
      gmSet(K_LEADER, { tabId: tabId, heartbeatAt: now });
      setLeader(true);
    } else if (!cur || now - cur.heartbeatAt > LEADER_STALE_MS) {
      gmSet(K_LEADER, { tabId: tabId, heartbeatAt: now });
      setLeader(true);
    } else {
      setLeader(false);
    }
  }

  function onLeaderChange(name, oldValue, newValue, remote) {
    if (!remote || !watchOn) return;
    if (!newValue) {
      // The leader let go (its tab closed): take over without waiting.
      leaderTick();
      return;
    }
    if (typeof newValue.tabId !== 'string' || newValue.tabId === tabId) return;
    if (isLeader) {
      // Two tabs claimed at the same moment. The smaller tab ID keeps the lead,
      // so both end up agreeing whatever order the writes arrived in.
      if (newValue.tabId < tabId) setLeader(false);
      else gmSet(K_LEADER, { tabId: tabId, heartbeatAt: Date.now() });
    }
  }

  function releaseLeadership() {
    var cur = readLeader();
    if (cur && cur.tabId === tabId) gmDel(K_LEADER);
    setLeader(false);
  }

  // ------------------------------------------------------------ timers

  function startTimers() {
    stopTimers();
    timers.ui = window.setInterval(uiTick, UI_TICK_MS);
    timers.leader = window.setInterval(leaderTick, HEARTBEAT_MS);
    ensureBar();
  }

  function uiTick() {
    ensureBar();
    freeTick();
    abilityTick();
    render();
  }

  function stopTimers() {
    if (timers.ui) { window.clearInterval(timers.ui); timers.ui = null; }
    if (timers.leader) { window.clearInterval(timers.leader); timers.leader = null; }
    stopPoll();
    hitSeen = null;
    detachBar();
  }

  function startPoll() {
    stopPoll();
    cycle();
    timers.poll = window.setInterval(cycle, POLL_MS);
  }

  function stopPoll() {
    if (timers.poll) { window.clearInterval(timers.poll); timers.poll = null; }
    if (kickTimer) { window.clearTimeout(kickTimer); kickTimer = null; }
    if (extraTimer) { window.clearTimeout(extraTimer); extraTimer = null; }
    kickState = null;
    pendingExtra = false;
    hitAbort();
  }

  // ------------------------------------------------------------ Torn's chain bar (read only)

  // "927/1k" and "04:56" in, { count: 927, secs: 296 } out. Anything else is
  // no reading at all - nothing is guessed.
  function parseBarText(valueText, timeText) {
    var c = /^\s*(\d{1,6})\s*\//.exec(String(valueText));
    var t = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(timeText));
    if (!c || !t) return null;
    var sec = parseInt(t[2], 10);
    if (sec > 59) return null;
    return { count: parseInt(c[1], 10), secs: parseInt(t[1], 10) * 60 + sec };
  }

  // Looks at the bar in the page you have open. Never changes it.
  function readBar(node) {
    var bar = node || document.querySelector(BAR_SELECTOR);
    if (!bar) return null;
    var value = bar.querySelector(BAR_VALUE_SELECTOR);
    var time = bar.querySelector(BAR_TIME_SELECTOR);
    if (!value || !time) return null;
    return parseBarText(value.textContent, time.textContent);
  }

  // One observer, on the bar that is there now. If the page draws the bar again
  // the old observer is let go and the new bar is watched - never two.
  function ensureBar() {
    if (!running || !watchOn) { detachBar(); return; }
    var node = document.querySelector(BAR_SELECTOR);
    if (node && node === barNode && barObserver) return;
    detachBar();
    if (!node || typeof MutationObserver !== 'function') return;
    barNode = node;
    barObserver = new MutationObserver(onBarMutation);
    barObserver.observe(node, { childList: true, subtree: true, characterData: true });
  }

  function detachBar() {
    if (barObserver) { try { barObserver.disconnect(); } catch (e) { /* ignore */ } }
    barObserver = null;
    barNode = null;
  }

  function onBarMutation() {
    if (!running || !watchOn) return;
    var bar = readBar(barNode);
    if (!bar) return;
    var shown = (shared && shared.snap && shared.snap.chain) ? shared.snap.chain.current : null;
    if (shown === null) return;
    if (bar.count <= shown) { kickState = null; return; }
    if (kickState && kickState.count === bar.count) return;   // already on it
    kickState = { count: bar.count, tries: 0 };
    if (isLeader) {
      extraCycle();
    } else {
      gmSet(K_KICK, { at: Date.now(), count: bar.count });
    }
  }

  // A follower tab saw a new hit on its page: the leader asks at once.
  function onKick(name, oldValue, newValue, remote) {
    if (!remote || !isLeader || !watchOn || !running) return;
    if (!newValue || !isInt(newValue.count) || newValue.count < 0) return;
    var shown = (shared && shared.snap && shared.snap.chain) ? shared.snap.chain.current : null;
    if (shown !== null && newValue.count <= shown) return;
    if (kickState && kickState.count === newValue.count) return;
    kickState = { count: newValue.count, tries: 0 };
    extraCycle();
  }

  function extrasInWindow() {
    var now = Date.now();
    while (extraTimes.length > 0 && extraTimes[0] <= now - EXTRA_WINDOW_MS) extraTimes.shift();
    return extraTimes.length;
  }

  // An extra round (Torn + server) outside the 3 s rhythm. At most one a
  // second, and at most 18 in any 60 seconds.
  function extraCycle() {
    if (!isLeader || !watchOn || !running) return;
    if (cycleBusy) { pendingExtra = true; return; }
    var wait = lastExtraAt + EXTRA_MIN_GAP_MS - Date.now();
    if (wait > 0) {
      if (!extraTimer) extraTimer = window.setTimeout(function () { extraTimer = null; extraCycle(); }, wait);
      return;
    }
    if (extrasInWindow() >= EXTRA_WINDOW_MAX) { kickState = null; return; }
    lastExtraAt = Date.now();
    extraTimes.push(lastExtraAt);
    cycle();
  }

  // After every round: has the API caught up with the page? If not, once more
  // in a second, at most four times for each new count.
  function afterCycle(snap) {
    if (kickState) {
      if (snap && snap.chain && snap.chain.current >= kickState.count) {
        kickState = null;
        if (kickTimer) { window.clearTimeout(kickTimer); kickTimer = null; }
      } else if (!kickTimer) {
        if (kickState.tries < KICK_MAX_RETRIES) {
          kickState.tries += 1;
          kickTimer = window.setTimeout(function () { kickTimer = null; extraCycle(); }, KICK_RETRY_MS);
        } else {
          kickState = null;
        }
      }
    }
    if (pendingExtra) {
      pendingExtra = false;
      extraCycle();
    }
  }

  // ------------------------------------------------------------ HTTP

  function http(method, url, headers, body, cb) {
    var done = false;
    var sentAt = Date.now();
    function finish(result) {
      if (done) return;
      done = true;
      result.sentAt = sentAt;
      result.recvAt = Date.now();
      cb(result);
    }
    try {
      GM_xmlhttpRequest({
        method: method,
        url: url,
        headers: headers,
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
        onload: function (res) { finish({ kind: 'http', status: res.status, text: res.responseText }); },
        onerror: function () { finish({ kind: 'error' }); },
        ontimeout: function () { finish({ kind: 'timeout' }); }
      });
    } catch (e) {
      finish({ kind: 'error' });
    }
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  // The key goes in the Authorization header and nowhere else.
  function tornGet(url, key, cb) {
    http('GET', url, { 'Authorization': 'ApiKey ' + key, 'Accept': 'application/json' }, undefined, cb);
  }

  function serverPost(path, body, cb) {
    http('POST', SERVER_BASE + path, { 'Content-Type': 'application/json' }, JSON.stringify(body), cb);
  }

  // ------------------------------------------------------------ session

  // Signs in with the saved key. Single flight. The same POST is never sent
  // again within 2 s (Torn PDA needs that, and it is polite to the server).
  function withSession(cb) {
    if (session && session.validUntil > Date.now()) { cb(session.token); return; }
    // After a refusal or a failure the server is left alone for a while.
    if (loginBlockedUntil > Date.now()) { cb(null); return; }
    loginWaiters.push(cb);
    if (loginBusy) return;
    loginBusy = true;
    var wait = Math.max(0, lastLoginAt + LOGIN_MIN_GAP_MS - Date.now());
    if (wait === 0) doLogin();
    else window.setTimeout(doLogin, wait);
  }

  function failWaiters() {
    var waiters = loginWaiters;
    loginWaiters = [];
    for (var i = 0; i < waiters.length; i++) waiters[i](null);
  }

  function doLogin() {
    var key = getKey();
    if (!key) { loginBusy = false; failWaiters(); return; }
    lastLoginAt = Date.now();
    serverPost('/session', { apiKey: key }, function (r) {
      loginBusy = false;
      var j = r.kind === 'http' ? parseJson(r.text) : null;
      if (r.kind === 'http' && r.status === 200 && j && j.ok === true && typeof j.session === 'string') {
        var ttl = (isInt(j.sessionTtlSeconds) ? j.sessionTtlSeconds : 600) * 1000;
        session = { token: j.session, validUntil: Date.now() + ttl - 30000 };
        loginFails = 0;
        loginBlockedUntil = 0;
        publish({ auth: { kind: 'ok' } });
        var waiters = loginWaiters;
        loginWaiters = [];
        for (var i = 0; i < waiters.length; i++) waiters[i](session.token);
        return;
      }
      session = null;
      handleLoginFailure(r, j);
      failWaiters();
    });
  }

  // 5 s, 10 s, 20 s, 40 s, then 60 s between failed sign-ins.
  function backOff() {
    loginFails += 1;
    loginBlockedUntil = Date.now() + Math.min(60000, 5000 * Math.pow(2, loginFails - 1));
  }

  function handleLoginFailure(r, j) {
    if (r.kind !== 'http' || !j) {
      backOff();
      publish({ auth: { kind: 'error', msg: 'KS server not reached' } });
      return;
    }
    if (r.status === 429) {
      var secs = isInt(j.retryAfterSeconds) ? j.retryAfterSeconds : 60;
      loginBlockedUntil = Date.now() + secs * 1000;
      publish({ auth: { kind: 'paused', until: loginBlockedUntil, msg: 'Sign-in paused' } });
      return;
    }
    if (r.status === 403 || j.error === 'not_a_member') {
      publish({ auth: { kind: 'member', msg: 'This key does not belong to the KS faction' } });
      stopForKey('This key does not belong to the KS faction.');
      return;
    }
    if ((r.status === 401 && j.error === 'key_rejected') || j.error === 'invalid_key') {
      publish({ auth: { kind: 'key', msg: 'Key rejected' } });
      stopForKey('The key was rejected. Create a new key and save it.');
      return;
    }
    backOff();
    publish({ auth: { kind: 'error', msg: 'Sign-in failed, trying again' } });
  }

  // A dead key is removed (Torn asks tools to stop using it) and Watch stops.
  function stopForKey(note) {
    gmDel(K_API);
    session = null;
    setWatch(false, note);
  }

  // ------------------------------------------------------------ chain calls

  // One call to a /chain route with a session, retried once after an
  // expired session.
  function chainCall(op, reading, cb, extra) {
    var attempt = 0;
    function go() {
      withSession(function (token) {
        if (!token) { cb(null); return; }
        var body = { session: token };
        if (op === 'state' && reading) body.reading = reading;
        if (extra) {
          var extraKeys = Object.keys(extra);
          for (var e = 0; e < extraKeys.length; e++) body[extraKeys[e]] = extra[extraKeys[e]];
        }
        serverPost('/chain/' + op, body, function (r) {
          var j = r.kind === 'http' ? parseJson(r.text) : null;
          if (r.kind === 'http' && r.status === 401 && j && j.error === 'unauthorized' && attempt === 0) {
            attempt = 1;
            session = null;
            go();
            return;
          }
          cb(r, j);
        });
      });
    }
    go();
  }

  function sampleClock(r, snap) {
    if (!snap) return;
    var rtt = r.recvAt - r.sentAt;
    samples.push({ rtt: rtt, offset: snap.serverTime - (r.sentAt + r.recvAt) / 2 });
    if (samples.length > CLOCK_SAMPLES) samples.shift();
  }

  function bestOffset() {
    if (samples.length === 0) return shared && shared.offset ? shared.offset : 0;
    var best = samples[0];
    for (var i = 1; i < samples.length; i++) if (samples[i].rtt < best.rtt) best = samples[i];
    return best.offset;
  }

  function takeAnswer(r, j, isPoll) {
    if (!r) { return null; }
    if (r.kind !== 'http') { dbg('server not reached', r.kind); return null; }
    var snap = cleanSnap(j);
    if (!snap) { dbg('unusable answer', r.status); return null; }
    var patch = { snap: snap, snapAt: r.recvAt, auth: { kind: 'ok' } };
    if (isPoll) {
      sampleClock(r, snap);
      patch.offset = bestOffset();
    }
    publish(patch);
    return snap;
  }

  // ------------------------------------------------------------ the 3 s cycle (leader only)

  function cycle() {
    if (!isLeader || !watchOn || !running) return;
    if (cycleBusy) return;
    var key = getKey();
    if (!key) { render(); return; }
    // Sign-in is paused or backing off: there is nobody to send a reading to, so Torn is not asked either.
    if (loginBlockedUntil > Date.now() && !(session && session.validUntil > Date.now())) { render(); return; }
    cycleBusy = true;
    fetchChain(key, function (reading) {
      chainCall('state', reading, function (r, j) {
        var snap = takeAnswer(r, j, true);
        if (snap) { afterSnap(snap); hitWatch(snap); }
        cycleBusy = false;
        maybeNames(key);
        afterCycle(snap);
      });
    });
  }

  function afterSnap(snap) {
    if (snap.status === 'inactive') {
      if (!inactiveSince) inactiveSince = Date.now();
      else if (Date.now() - inactiveSince >= WATCH_AUTO_OFF_MS) {
        inactiveSince = 0;
        setWatch(false, 'Watch turned off after 15 minutes without an active chain.');
      }
    } else {
      inactiveSince = 0;
    }
  }

  // Torn: /v2/faction/chain with the timestamp parameter (bypasses the cache).
  function fetchChain(key, cb) {
    if (Date.now() < tornPausedUntil) { cb(null); return; }
    var url = TORN_CHAIN_URL + '?timestamp=' + Math.floor(Date.now() / 1000) + '&comment=' + COMMENT;
    tornGet(url, key, function (r) {
      if (r.kind !== 'http') { dbg('torn not reached', r.kind); cb(null); return; }
      var j = parseJson(r.text);
      if (!j || typeof j !== 'object') { dbg('torn answer unreadable', r.status); cb(null); return; }
      if (j.error) {
        var code = (j.error && isInt(j.error.code)) ? j.error.code : 0;
        handleTornError(code);
        cb(null);
        return;
      }
      var c = j.chain;
      if (!c || typeof c !== 'object') { cb(null); return; }
      function num(v) { return (v === null || v === undefined) ? 0 : v; }
      var reading = { chainId: num(c.id), current: num(c.current), max: num(c.max), end: num(c.end), cooldown: num(c.cooldown), observedAtMs: r.recvAt };
      var keys = ['chainId', 'current', 'max', 'end', 'cooldown'];
      for (var i = 0; i < keys.length; i++) {
        if (!isInt(reading[keys[i]])) { dbg('torn chain field unusable', keys[i]); cb(null); return; }
      }
      // An answer that was already on its way must not wipe out a pause that began meanwhile.
      if (Date.now() >= tornPausedUntil) publish({ torn: { kind: 'ok' } });
      cb(reading);
    });
  }

  function handleTornError(code) {
    dbg('torn error', code);
    // 2, 10, 13, 16, 18: the key is dead or too weak - stop using it.
    if (code === 2 || code === 10 || code === 13 || code === 16 || code === 18) {
      publish({ torn: { kind: 'key', msg: 'Torn rejected the key' } });
      stopForKey('Torn rejected the key (error ' + code + '). Create a new key and save it.');
      return;
    }
    // 5: too many requests - wait 30 s.
    if (code === 5) {
      tornPausedUntil = Date.now() + TORN_PAUSE_MS;
      publish({ torn: { kind: 'paused', until: tornPausedUntil, msg: 'Torn asked us to wait' } });
      return;
    }
    publish({ torn: { kind: 'error', msg: 'Torn error ' + code } });
  }

  // ------------------------------------------------------------ bonus hit and AFK (display only)

  // Is the NEXT hit (the turn's count + 1) a chain bonus hit? The number, or null.
  function bonusNext(snap) {
    if (!snap) return null;
    var base = snap.turn ? snap.turn.current : (snap.chain ? snap.chain.current : null);
    if (base === null || !isInt(base)) return null;
    var next = base + 1;
    return BONUS_HITS.indexOf(next) >= 0 ? next : null;
  }

  // "Anna removed as AFK", "Anna, Bob removed as AFK", "Anna, Bob +1 removed as AFK".
  // The member himself is not in it: he gets a line of his own.
  function afkOthersText(snap) {
    var list = Array.isArray(snap.afkRecent) ? snap.afkRecent : [];
    var mine = snap.you.tornId;
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i] === 'string' && list[i] !== mine) ids.push(list[i]);
    }
    if (ids.length === 0) return '';
    var shown = [];
    for (var k = 0; k < ids.length && k < AFK_NAMES_SHOWN; k++) shown.push(cleanName(nameOf(ids[k])));
    var text = shown.join(', ');
    if (ids.length > AFK_NAMES_SHOWN) text += ' +' + (ids.length - AFK_NAMES_SHOWN);
    return text + ' removed as AFK';
  }

  // ------------------------------------------------------------ who is first, the hitter, moving up (display only)

  // He holds the hit and the window is in GET READY or HIT NOW.
  function hitterActive(d, snap) {
    if (!snap || !d.hasSnap || !d.showOwner) return false;
    if (d.phaseKey !== 'get_ready' && d.phaseKey !== 'hit_now') return false;
    return snap.you.isOwner === true;
  }

  // Watches where he stands at each new answer. Moving from behind to FIRST place
  // inside the same chain, unconfirmed, starts the "now first" notice. It ends when
  // he presses Im here, when he no longer stands first, or when the turn is
  // decided. The first answer after Watch is turned on is no move. Returns whether
  // the notice is to be shown now.
  function trackMovedFirst(snap, d) {
    if (!snap || !watchOn) return false;
    // An answer saved before Watch was turned on is old news: the first answer AFTER it is the one to compare from.
    if (!shared || !shared.snapAt || shared.snapAt < watchSince) return false;
    var chainId = snap.turn ? snap.turn.chainId : (snap.chain ? snap.chain.id : null);
    var pos = (snap.you.inQueue && isInt(snap.you.position)) ? snap.you.position : null;
    var decided = !!(snap.turn && snap.turn.resolved);
    var live = snap.status === 'live' && !!snap.turn && !decided;
    if (!posTrack || posTrack.serverTime !== snap.serverTime) {
      var prev = posTrack;
      posTrack = { chainId: chainId, position: pos, serverTime: snap.serverTime };
      if (prev === null || chainId === null || prev.chainId !== chainId) {
        movedFirst = null;   // the first answer, or another chain: nothing to compare with
      } else {
        if (prev.position !== null && prev.position > 1 && pos === 1 && snap.you.confirmed !== true) {
          movedSeq += 1;
          movedFirst = { key: 'F' + movedSeq, shown: false };
        }
        if (movedFirst) {
          if (pos !== 1 || snap.you.confirmed === true) movedFirst = null;
          else if (live) movedFirst.shown = true;
          else if (decided && movedFirst.shown) movedFirst = null;
        }
      }
    }
    return !!movedFirst && live && d.valid === true;
  }

  // The place in the queue as a line, for places 1 and 2 only. Not for the hitter.
  function placeText(snap) {
    if (!snap || !snap.you.inQueue || snap.you.isOwner === true || !isInt(snap.you.position)) return '';
    if (snap.you.position === 1) return 'You are first in the queue';
    if (snap.you.position === 2) return 'You are 2nd in the queue';
    return '';
  }

  // ------------------------------------------------------------ FREE HIT target (leader tab only)

  function snapTargets(snap) {
    return (snap && Array.isArray(snap.targets)) ? snap.targets : [];
  }

  function turnKeyOf(snap) {
    return (snap && snap.turn) ? snap.turn.chainId + ':' + snap.turn.current : null;
  }

  // The turn as this tab sees it right now, or null when it cannot be trusted:
  // no answer, offline, stale, no running chain, time up.
  function turnInfo() {
    var sh = shared;
    var snap = (sh && sh.snap) ? sh.snap : null;
    if (!snap || !snap.chain || !snap.turn || snap.status !== 'live') return null;
    var now = Date.now();
    var snapAt = sh.snapAt || 0;
    if (now - Math.max(snapAt, watchSince) > OFFLINE_AFTER_MS) return null;
    if (snap.chain.readingAgeMs + (now - snapAt) > STALE_AFTER_MS) return null;
    var remaining = snap.chain.end * 1000 - (now + (sh.offset || 0));
    if (remaining <= 0) return null;
    return {
      key: turnKeyOf(snap),
      remaining: remaining,
      resolved: snap.turn.resolved,
      hasOwner: snap.turn.ownerId !== null,
      targets: snapTargets(snap)
    };
  }

  function statusInWindow() {
    var now = Date.now();
    while (statusTimes.length > 0 && statusTimes[0] <= now - STATUS_WINDOW_MS) statusTimes.shift();
    return statusTimes.length;
  }

  // Forgets what this tab was doing. A check that is still on its way is not
  // believed when it answers. clear = the target is also taken out of the shared
  // state (the turn is over, the chain is quiet, Watch is off).
  function freeAbort(clear) {
    freeCtl.gen += 1;
    freeCtl.turn = null;
    freeCtl.busy = false;
    freeCtl.nextAt = 0;
    freeCtl.listSig = '';
    if (clear && shared && shared.freeHit) publish({ freeHit: null });
  }

  // Runs every 250 ms in every tab, does something in the leader tab only.
  function freeTick() {
    if (!isLeader || !watchOn || !running) return;
    if (getKey() === '') { freeAbort(true); return; }
    var info = turnInfo();
    if (!info) { freeAbort(true); return; }

    if (freeCtl.turn !== info.key) {
      // A new turn: the old target goes. A leader that just took over from
      // another tab carries on with the target that tab found for this turn.
      var prev = (shared && shared.freeHit) ? shared.freeHit : null;
      var adopt = freeCtl.turn === null && prev !== null && prev.turn === info.key && isInt(prev.checkedAt);
      freeAbort(!adopt);
      freeCtl.turn = info.key;
      if (adopt) {
        freeCtl.nextAt = prev.checkedAt + FREE_CHECK_EVERY_MS;
        freeCtl.listSig = info.targets.join(',');
      }
    }
    if (info.targets.length === 0) return;
    // A new key was saved after error 16: ask again at once.
    if (shared && shared.freeKeyBad) { freeCtl.keyWasBad = true; return; }
    if (freeCtl.keyWasBad) { freeCtl.keyWasBad = false; freeCtl.nextAt = 0; }

    var soon = info.remaining <= FREE_SOON_OWNER_MS ||
      (info.resolved && !info.hasOwner && info.remaining <= FREE_SOON_NO_OWNER_MS);
    if (!soon || freeCtl.busy) return;
    var sig = info.targets.join(',');
    if (sig !== freeCtl.listSig) freeCtl.nextAt = 0;   // the list was changed: ask again at once
    if (Date.now() < freeCtl.nextAt) return;
    if (Date.now() < tornPausedUntil) return;
    freeCheck(info.key, info.targets.slice(0, TARGETS_MAX), sig);
  }

  // One check: the targets one at a time in list order, the first one that is
  // Okay is the answer. At most 5 calls, and never more than 15 in 60 seconds.
  function freeCheck(turnKey, list, sig) {
    var key = getKey();
    if (!key) return;
    freeCtl.busy = true;
    freeCtl.listSig = sig;
    freeCtl.nextAt = Date.now() + FREE_CHECK_EVERY_MS;
    var gen = freeCtl.gen;
    var calls = 0;
    var sawNotOkay = false;

    // A result is shown only if the turn is still the one that was asked about.
    function finish(result) {
      if (gen !== freeCtl.gen) return;
      freeCtl.busy = false;
      if (result && turnKeyOf(shared && shared.snap ? shared.snap : null) !== turnKey) return;
      if (result) publish({ freeHit: result });
    }

    function next(i) {
      if (gen !== freeCtl.gen) return;
      if (i >= list.length || calls >= FREE_MAX_PER_CHECK) {
        finish({ turn: turnKey, id: null, reason: sawNotOkay ? 'none' : 'error', checkedAt: Date.now() });
        return;
      }
      if (Date.now() < tornPausedUntil) {
        freeCtl.nextAt = tornPausedUntil;
        finish(null);
        return;
      }
      if (statusInWindow() >= STATUS_WINDOW_MAX) {
        // The limit for the last 60 s is used up: no call now, look again shortly.
        freeCtl.nextAt = Date.now() + FREE_RETRY_MS;
        finish(null);
        return;
      }
      calls += 1;
      statusTimes.push(Date.now());
      var id = list[i];
      var url = TORN_USER_URL + id + '/basic?timestamp=' + Math.floor(Date.now() / 1000) + '&comment=' + COMMENT;
      tornGet(url, key, function (r) {
        if (gen !== freeCtl.gen) return;
        var j = (r.kind === 'http') ? parseJson(r.text) : null;
        if (!j || typeof j !== 'object') { next(i + 1); return; }
        if (j.error) {
          // These calls never stop Watch and never remove the key. 5 waits 30 s,
          // 16 means the key lacks the user part; anything else tries the next target.
          var code = (j.error && isInt(j.error.code)) ? j.error.code : 0;
          if (code === 5) {
            tornPausedUntil = Date.now() + TORN_PAUSE_MS;
            freeCtl.nextAt = tornPausedUntil;
            publish({ torn: { kind: 'paused', until: tornPausedUntil, msg: 'Torn asked us to wait' } });
            finish(null);
            return;
          }
          if (code === 16) {
            freeCtl.nextAt = 0;
            publish({ freeKeyBad: true });
            finish({ turn: turnKey, id: null, reason: 'key', checkedAt: Date.now() });
            return;
          }
          next(i + 1);
          return;
        }
        var p = j.profile;
        if (!p || typeof p !== 'object' || String(p.id) !== id || !p.status || typeof p.status !== 'object' || typeof p.status.state !== 'string') {
          next(i + 1);
          return;
        }
        if (p.status.state === 'Okay') {
          finish({ turn: turnKey, id: id, name: cleanName(p.name) || '#' + id, checkedAt: Date.now() });
          return;
        }
        sawNotOkay = true;
        next(i + 1);
      });
    }
    next(0);
  }

  // What the window shows for FREE HIT: a link to a target, or the news that
  // none on the list is free. Anything old, for another turn or not on the
  // current list is not shown.
  function freeHitFor(snap, sh, now) {
    var res = { link: null, none: false };
    var fh = (sh && sh.freeHit) ? sh.freeHit : null;
    var list = snapTargets(snap);
    if (!fh || !snap.turn || list.length === 0) return res;
    if (fh.turn !== turnKeyOf(snap)) return res;
    if (!isInt(fh.checkedAt) || now - fh.checkedAt > FREE_MAX_AGE_MS) return res;
    if (typeof fh.id === 'string' && /^[0-9]{1,12}$/.test(fh.id) && list.indexOf(fh.id) >= 0) {
      res.link = { id: fh.id, name: cleanName(fh.name) || '#' + fh.id };
    } else if (fh.id === null && fh.reason === 'none') {
      res.none = true;
    }
    return res;
  }

  // ------------------------------------------------------------ who made the hit (leader tab only)

  var attacksBusy = false;    // one attacks call at a time, whatever hit it belongs to

  function attacksInWindow() {
    var now = Date.now();
    while (attackTimes.length > 0 && attackTimes[0] <= now - HIT_WINDOW_MS) attackTimes.shift();
    return attackTimes.length;
  }

  function getRejoin() {
    return gmGet(K_REJOIN, false) === true;
  }

  // Forgets the hit being looked for. An answer that is still on its way is not
  // believed when it comes.
  function hitAbort() {
    hitGen += 1;
    hitCtl = null;
    if (hitTimer) { window.clearTimeout(hitTimer); hitTimer = null; }
  }

  // Called with every answer the 3 s rhythm gets. A new turn in the same chain
  // while this member stands in the queue: has HE made the hit that moved the
  // chain on? Nothing else is looked at.
  function hitWatch(snap) {
    // He is not in the queue (any more): nothing is looked for.
    if (!snap.you.inQueue && hitCtl) hitAbort();
    var turn = snap.turn;
    if (!turn) return;
    var seen = hitSeen;
    if (!seen || seen.chainId !== turn.chainId) {
      // The first look, or another chain: there is nothing to compare with.
      hitSeen = { chainId: turn.chainId, current: turn.current };
      if (seen) hitAbort();
      return;
    }
    if (turn.current <= seen.current) return;   // not a new turn (an older answer never moves it back)
    hitSeen = { chainId: turn.chainId, current: turn.current };
    if (!snap.you.inQueue || getKey() === '') return;
    hitNewTurn(turn.chainId, seen.current, turn.current);
  }

  // The hit numbers prev+1 .. cur moved the chain on. If an earlier hit of the
  // same chain is still being looked for, the search keeps its lowest number
  // and starts its tries again.
  function hitNewTurn(chainId, prev, cur) {
    if (hitTimer) { window.clearTimeout(hitTimer); hitTimer = null; }
    hitGen += 1;
    if (hitCtl && hitCtl.chainId === chainId) {
      hitCtl.high = cur;
      hitCtl.tries = 0;
      hitCtl.gen = hitGen;
    } else {
      hitCtl = { gen: hitGen, chainId: chainId, low: prev + 1, high: cur, tries: 0 };
    }
    hitTry();
  }

  // One look at the member's own last attacks. The first call goes at once, the
  // next ones 2 s apart, at most 3 more. At most 10 calls in any 60 s, one at a
  // time. A try that cannot be made (Torn asked us to wait, the 60 s limit is
  // used up) counts as a try.
  function hitTry() {
    hitTimer = null;
    var ctl = hitCtl;
    if (!ctl || !isLeader || !watchOn || !running) return;
    var key = getKey();
    if (!key || (shared && shared.hitKeyBad === true)) { hitCtl = null; return; }
    // He is not in the queue (he left by hand): no call, not even a retry.
    var seenSnap = (shared && shared.snap) ? shared.snap : null;
    if (seenSnap && !seenSnap.you.inQueue) { hitCtl = null; return; }
    if (attacksBusy) { hitTimer = window.setTimeout(hitTry, HIT_BUSY_MS); return; }
    ctl.tries += 1;
    var gen = ctl.gen;
    if (Date.now() < tornPausedUntil || attacksInWindow() >= HIT_WINDOW_MAX) { hitMiss(ctl); return; }

    attackTimes.push(Date.now());
    attacksBusy = true;
    var nowS = Math.floor(Date.now() / 1000);
    var url = TORN_ATTACKS_URL + '?filters=outgoing&sort=DESC&limit=' + HIT_LIMIT + '&from=' + (nowS - HIT_LOOKBACK_S) +
      '&timestamp=' + nowS + '&comment=' + COMMENT;
    tornGet(url, key, function (r) {
      attacksBusy = false;
      // An answer for a hit that has been replaced, or from a tab that is no longer the leader, is not believed.
      if (hitCtl !== ctl || ctl.gen !== gen || !isLeader || !watchOn || !running) return;
      var j = (r.kind === 'http') ? parseJson(r.text) : null;
      if (j && typeof j === 'object' && j.error) {
        // These calls never stop Watch and never remove the key. 5 waits 30 s,
        // 16 means the key lacks the attacks part; anything else is a miss.
        var code = (j.error && isInt(j.error.code)) ? j.error.code : 0;
        if (code === 5) {
          tornPausedUntil = Date.now() + TORN_PAUSE_MS;
          publish({ torn: { kind: 'paused', until: tornPausedUntil, msg: 'Torn asked us to wait' } });
        } else if (code === 16) {
          hitCtl = null;
          publish({ hitKeyBad: true });
          return;
        }
        hitMiss(ctl);
        return;
      }
      var found = (j && typeof j === 'object') ? findMyHit(j, ctl) : null;
      if (!found) { hitMiss(ctl); return; }
      hitCtl = null;
      reportHit(ctl.chainId, found);
    });
  }

  function hitMiss(ctl) {
    if (hitCtl !== ctl) return;
    if (ctl.tries > HIT_MAX_RETRIES) { hitCtl = null; return; }
    hitTimer = window.setTimeout(hitTry, HIT_RETRY_MS);
  }

  // The newest attack of the member's that carries a hit number from low to high.
  // Anything that is not a whole number is no hit at all.
  function findMyHit(j, ctl) {
    var list = Array.isArray(j.attacks) ? j.attacks : [];
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || typeof a !== 'object') continue;
      if (!isInt(a.chain) || a.chain < ctl.low || a.chain > ctl.high) continue;
      if (!isInt(a.ended) || a.ended <= 0) continue;
      if (best === null || a.chain > best.chain) best = { chain: a.chain, ended: a.ended };
    }
    return best;
  }

  // Tells the server "I made hit N". Only this fact goes; nothing else about the attack.
  function reportHit(chainId, hit) {
    chainCall('hit', null, function (r, j) {
      var snap = takeAnswer(r, j, false);
      if (!snap) { setLocalMsg('KS server not reached. Your hit was not reported.'); return; }
      if (snap.action && ACTION_TEXT[snap.action]) setLocalMsg(ACTION_TEXT[snap.action]);
    }, { hit: { chainId: chainId, current: hit.chain, endedAt: hit.ended }, rejoin: getRejoin() });
  }

  // ------------------------------------------------------------ can he hit? (leader tab only)

  function abilityInWindow() {
    var now = Date.now();
    while (abilityTimes.length > 0 && abilityTimes[0] <= now - ABILITY_WINDOW_MS) abilityTimes.shift();
    return abilityTimes.length;
  }

  // The name of a status, safe to show: no control characters, no angle brackets, cut short.
  function cleanReason(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, ABILITY_REASON_MAX);
  }

  // What the window knows about whether he can hit, from the shared state. Only
  // a result that could be read and is at most 60 s old counts. Anything else is
  // UNKNOWN, and unknown locks nothing (the chain comes first).
  function abilityFor(sh, now) {
    var res = { locked: false, reason: '', unknown: false };
    var a = (sh && sh.ability && typeof sh.ability === 'object') ? sh.ability : null;
    var fresh = !!a && isInt(a.at) && typeof a.can === 'boolean' && now - a.at <= ABILITY_MAX_AGE_MS;
    if (fresh) {
      if (a.can === false) {
        res.locked = true;
        res.reason = cleanReason(a.reason);
      }
      return res;
    }
    if (a || (sh && isInt(sh.abilityErr) && sh.abilityErr > 0)) res.unknown = true;
    return res;
  }

  // Forgets what this tab was doing. A check that is still on its way is not
  // believed when it answers. clear = the result is also taken out of the shared
  // state (he left the queue, Watch is off, the key is gone).
  function abilityAbort(clear) {
    abilityCtl.gen += 1;
    abilityCtl.busy = false;
    abilityCtl.force = false;
    abilityCtl.nextAt = 0;
    abilityCtl.wasInQueue = null;
    abilityCtl.wasConfirmed = null;
    abilityCtl.confirmTurn = null;
    if (clear && shared && (shared.ability || shared.abilityErr)) publish({ ability: null, abilityErr: 0 });
  }

  // Runs every 250 ms in every tab, does something in the leader tab only. While
  // he stands in the queue: a check when he joins, every 20 s, when the turn comes
  // within 2:30 of the end, and right after he pressed Im here.
  function abilityTick() {
    if (!isLeader || !watchOn || !running) return;
    if (getKey() === '') { abilityAbort(true); return; }
    var sh = shared;
    var snap = (sh && sh.snap) ? sh.snap : null;
    if (!snap) return;
    var now = Date.now();

    if (snap.you.inQueue !== true) {
      // Not in the queue: no call at all, and nothing from an earlier stay is kept.
      if (abilityCtl.wasInQueue !== false) { abilityAbort(true); abilityCtl.wasInQueue = false; }
      abilityCtl.wasConfirmed = false;
      return;
    }
    if (abilityCtl.wasInQueue !== true) abilityCtl.force = true;          // he just joined (or this tab just took over)
    abilityCtl.wasInQueue = true;
    var confirmed = snap.you.confirmed === true;
    if (abilityCtl.wasConfirmed === false && confirmed) abilityCtl.force = true;   // he just pressed Im here
    abilityCtl.wasConfirmed = confirmed;
    var info = turnInfo();
    if (info && info.remaining <= CONFIRM_FROM_MS && abilityCtl.confirmTurn !== info.key) {
      abilityCtl.confirmTurn = info.key;                                   // the turn is inside the confirm window
      abilityCtl.force = true;
    }

    // Error 16: no more checks until a new key is saved, then one at once.
    if (sh && sh.abilityKeyBad === true) { abilityCtl.keyWasBad = true; return; }
    if (abilityCtl.keyWasBad) { abilityCtl.keyWasBad = false; abilityCtl.force = true; }

    if (abilityCtl.busy) return;
    if (!abilityCtl.force && now < abilityCtl.nextAt) return;
    if (now < tornPausedUntil) return;
    // The 60 s limit is used up: no call now, the next tick looks again.
    if (abilityInWindow() + ABILITY_CALLS > ABILITY_WINDOW_MAX) return;
    abilityCheck();
  }

  // The two answers. { ok: true, value } or { ok: false, code } (code 0 = no answer at all).
  function abilityRead(which, r) {
    var j = (r.kind === 'http') ? parseJson(r.text) : null;
    if (!j || typeof j !== 'object') return { ok: false, code: 0 };
    if (j.error) {
      var code = (j.error && isInt(j.error.code)) ? j.error.code : 0;
      // Error 5 is the same 30 s pause for every Torn call, whatever tab or round.
      if (code === 5) {
        tornPausedUntil = Date.now() + TORN_PAUSE_MS;
        publish({ torn: { kind: 'paused', until: tornPausedUntil, msg: 'Torn asked us to wait' } });
      }
      return { ok: false, code: code };
    }
    if (which === 'bars') {
      var e = (j.bars && typeof j.bars === 'object' && j.bars.energy && typeof j.bars.energy === 'object') ? j.bars.energy.current : null;
      if (!isInt(e) || e < 0 || e > 1000000) return { ok: false, code: 0 };
      return { ok: true, value: e };
    }
    var p = (j.profile && typeof j.profile === 'object') ? j.profile : null;
    var state = (p && p.status && typeof p.status === 'object') ? cleanReason(p.status.state) : '';
    if (state === '') return { ok: false, code: 0 };
    return { ok: true, value: state };
  }

  // One check: bars and basic as a pair. Both are the member's OWN data and go
  // nowhere but into the shared state of his own tabs.
  function abilityCheck() {
    var key = getKey();
    if (!key) return;
    abilityCtl.busy = true;
    abilityCtl.force = false;
    abilityCtl.nextAt = Date.now() + ABILITY_EVERY_MS;
    var gen = abilityCtl.gen;
    var t0 = Date.now();
    for (var c = 0; c < ABILITY_CALLS; c++) abilityTimes.push(t0);
    var stamp = '?timestamp=' + Math.floor(t0 / 1000) + '&comment=' + COMMENT;
    var results = {};
    var waiting = ABILITY_CALLS;
    function got(which, value) {
      results[which] = value;
      waiting -= 1;
      if (waiting === 0) abilityDone(gen, results);
    }
    tornGet(TORN_BARS_URL + stamp, key, function (r) { got('bars', abilityRead('bars', r)); });
    tornGet(TORN_BASIC_URL + stamp, key, function (r) { got('basic', abilityRead('basic', r)); });
  }

  function abilityDone(gen, results) {
    if (gen !== abilityCtl.gen) return;      // an answer from an earlier round is not believed
    abilityCtl.busy = false;
    if (!isLeader || !watchOn || !running) return;
    var bars = results.bars;
    var basic = results.basic;
    // 16 = the key lacks the part. Only these checks stop, until a new key is saved.
    if ((!bars.ok && bars.code === 16) || (!basic.ok && basic.code === 16)) publish({ abilityKeyBad: true });
    var energy = bars.ok ? bars.value : null;
    var state = basic.ok ? basic.value : null;
    // What is KNOWN decides. Energy too low or a status that is not Okay is a
    // lock even if the other answer is missing; "can hit" needs both.
    var can = null;
    var reason = '';
    if (energy !== null && energy < ATTACK_ENERGY) { can = false; reason = 'energy ' + energy + ' (need ' + ATTACK_ENERGY + ')'; }
    else if (state !== null && state !== 'Okay') { can = false; reason = state; }
    else if (energy !== null && state !== null) { can = true; }
    var now = Date.now();
    if (can === null) {
      publish({ ability: null, abilityErr: now });
      return;
    }
    publish({ ability: { at: now, energy: energy, state: state, can: can, reason: reason }, abilityErr: 0 });
    if (!can) abilityUnconfirm();
  }

  // He cannot hit but is confirmed or holds the hit: ask the server to take his
  // Im here back. One call at a time. If it fails, the next check tries again.
  function abilityUnconfirm() {
    var snap = (shared && shared.snap) ? shared.snap : null;
    if (!snap || !snap.you.inQueue || !(snap.you.confirmed || snap.you.isOwner)) return;
    if (abilityCtl.unconfirmBusy) return;
    abilityCtl.unconfirmBusy = true;
    chainCall('unconfirm', null, function (r, j) {
      abilityCtl.unconfirmBusy = false;
      var answer = takeAnswer(r, j, false);
      if (!answer) return;
      if (answer.action === 'owner_released') setLocalMsg(ACTION_TEXT.owner_released);
    });
  }

  // ------------------------------------------------------------ names

  function loadNames() {
    var n = gmGet(K_NAMES, null);
    if (n && typeof n === 'object' && n.v === 1 && n.value && typeof n.value === 'object' && isInt(n.fetchedAt)) {
      names = n.value;
      namesFetchedAt = n.fetchedAt;
    }
  }

  function onNamesChange(name, oldValue, newValue, remote) {
    if (!remote) return;
    loadNames();
    render();
  }

  function maybeNames(key) {
    if (namesBusy || Date.now() - namesFetchedAt < NAMES_REFRESH_MS) return;
    if (Date.now() < tornPausedUntil) return;
    namesBusy = true;
    tornGet(TORN_MEMBERS_URL + '?comment=' + COMMENT, key, function (r) {
      namesBusy = false;
      var j = r.kind === 'http' ? parseJson(r.text) : null;
      if (!j || j.error || !Array.isArray(j.members)) {
        // Try again in a minute rather than after 10.
        namesFetchedAt = Date.now() - NAMES_REFRESH_MS + 60000;
        if (j && j.error && isInt(j.error.code)) handleTornError(j.error.code);
        return;
      }
      var map = {};
      for (var i = 0; i < j.members.length; i++) {
        var m = j.members[i];
        if (!m || typeof m !== 'object') continue;
        var id = isInt(m.id) ? String(m.id) : '';
        var nm = cleanName(m.name);
        if (/^[0-9]{1,12}$/.test(id) && nm) map[id] = nm;
      }
      names = map;
      namesFetchedAt = Date.now();
      gmSet(K_NAMES, { value: map, fetchedAt: namesFetchedAt, source: 'api', v: 1 });
      render();
    });
  }

  // ------------------------------------------------------------ buttons

  var ACTION_TEXT = {
    queue_full: 'The queue is full.',
    turn_resolved: 'Too late: this turn is already decided.',
    no_turn: 'No turn yet. Try again in a moment.',
    not_in_queue: 'Join the queue first.',
    hit_removed: 'You hit - you left the queue.',
    hit_rejoined: 'You hit - you are last in the queue again.',
    owner_released: 'You cannot hit - the hit was released.'
  };

  function press(op) {
    if (!watchOn) return;
    chainCall(op, null, function (r, j) {
      var snap = takeAnswer(r, j, false);
      if (!snap) { setLocalMsg('KS server not reached. Nothing was changed.'); return; }
      if (snap.action && ACTION_TEXT[snap.action]) setLocalMsg(ACTION_TEXT[snap.action]);
    });
  }

  // ------------------------------------------------------------ UI

  function buttonStyle(bg, fg) {
    return 'all:initial;box-sizing:border-box;display:block;width:100%;min-height:32px;margin:4px 0 0 0;padding:6px 8px;' +
      'background:' + bg + ';color:' + fg + ';border:1px solid rgba(255,255,255,0.35);border-radius:4px;' +
      'font:bold 13px/18px Arial,Helvetica,sans-serif;text-align:center;cursor:pointer;';
  }

  function makeButton(text, bg, fg, onClick) {
    var b = el('button', text);
    b.type = 'button';
    css(b, buttonStyle(bg, fg));
    b.addEventListener('click', onClick);
    b.__bg = bg;
    return b;
  }

  function clampPos() {
    var maxLeft = Math.max(0, window.innerWidth - BOX_WIDTH);
    var maxTop = Math.max(0, window.innerHeight - 40);
    pos.left = Math.min(Math.max(0, pos.left), maxLeft);
    pos.top = Math.min(Math.max(0, pos.top), maxTop);
  }

  function applyPos() {
    clampPos();
    ui.host.style.left = pos.left + 'px';
    ui.host.style.top = pos.top + 'px';
  }

  function buildUi() {
    var saved = gmGet(K_POS, null);
    if (saved && isInt(saved.left) && isInt(saved.top)) pos = { left: saved.left, top: saved.top };
    minimized = gmGet(K_MIN, false) === true;

    ui.host = el('div');
    ui.host.id = 'ks-chain-dibs-host';
    mark(ui.host, 'host');
    css(ui.host, 'all:initial;position:fixed;left:' + DEFAULT_LEFT + 'px;top:' + DEFAULT_TOP + 'px;z-index:2147483000;');
    var root = ui.host.attachShadow({ mode: 'open' });

    ui.box = el('div');
    mark(ui.box, 'box');
    css(ui.box, 'all:initial;display:block;box-sizing:border-box;width:' + BOX_WIDTH + 'px;background:#1b1d21;color:#e6e6e6;' +
      'border:' + BOX_BORDER + ';border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.6);font:13px/18px Arial,Helvetica,sans-serif;');

    // header: drag handle, title, mini timer, minimize
    ui.header = el('div');
    mark(ui.header, 'header');
    css(ui.header, 'all:initial;display:flex;box-sizing:border-box;align-items:center;justify-content:space-between;padding:5px 8px;' +
      'background:#262a30;border-radius:6px 6px 0 0;cursor:move;touch-action:none;color:#e6e6e6;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    ui.title = mark(el('span', 'KS Chain Dibs'), 'title');
    css(ui.title, 'all:initial;color:#e6e6e6;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    ui.mini = mark(el('span', ''), 'mini');
    css(ui.mini, 'all:initial;color:#bdbdbd;font:13px/18px Consolas,monospace;margin-left:auto;margin-right:8px;');
    ui.minBtn = mark(el('button', '-'), 'minbtn');
    ui.minBtn.type = 'button';
    ui.minBtn.title = 'Minimize';
    css(ui.minBtn, 'all:initial;box-sizing:border-box;min-width:24px;height:22px;padding:0 6px;background:#3a3f45;color:#ffffff;' +
      'border:1px solid #666b73;border-radius:3px;font:bold 14px/20px Arial,sans-serif;text-align:center;cursor:pointer;');
    ui.minBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      minimized = !minimized;
      gmSet(K_MIN, minimized);
      render();
    });
    ui.minBtn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
    ui.header.appendChild(ui.title);
    ui.header.appendChild(ui.mini);
    ui.header.appendChild(ui.minBtn);
    ui.box.appendChild(ui.header);

    // Minimized: two short rows under the header. Shown only with a usable answer.
    ui.miniInfo = mark(el('div'), 'miniinfo');
    css(ui.miniInfo, 'all:initial;display:none;box-sizing:border-box;padding:3px 8px 5px 8px;background:#1b1d21;border-radius:0 0 6px 6px;');
    ui.miniFirst = buildMiniRow('minifirst');
    ui.miniHitter = buildMiniRow('minihitter');
    ui.miniInfo.appendChild(ui.miniFirst.row);
    ui.miniInfo.appendChild(ui.miniHitter.row);
    ui.box.appendChild(ui.miniInfo);

    ui.body = mark(el('div'), 'body');
    css(ui.body, 'all:initial;display:block;box-sizing:border-box;padding:6px 8px 8px 8px;color:#e6e6e6;font:13px/18px Arial,Helvetica,sans-serif;');

    ui.chainLine = mark(el('div', ''), 'chain');
    css(ui.chainLine, 'all:initial;display:block;color:#bdbdbd;font:13px/18px Arial,Helvetica,sans-serif;');
    ui.timer = mark(el('div', '--:--'), 'timer');
    css(ui.timer, 'all:initial;display:block;color:#ffffff;font:bold 26px/32px Consolas,monospace;text-align:center;');
    ui.bonus = mark(el('div', ''), 'bonus');
    css(ui.bonus, 'all:initial;display:none;box-sizing:border-box;margin:2px 0 4px 0;padding:4px 6px;border-radius:4px;text-align:center;background:' + BONUS_COLOR + ';color:#000000;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    ui.phase = mark(el('div', ''), 'phase');
    css(ui.phase, 'all:initial;display:block;box-sizing:border-box;margin:2px 0 4px 0;padding:4px 6px;border-radius:4px;text-align:center;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    // The FREE HIT link replaces the phase row when a free target is known. It is
    // a plain link: the member clicks it himself, the script never does.
    ui.freeLink = mark(el('a', ''), 'freehit');
    ui.freeLink.target = '_blank';
    ui.freeLink.rel = 'noopener';
    css(ui.freeLink, 'all:initial;display:none;box-sizing:border-box;min-height:32px;margin:2px 0 4px 0;padding:6px 6px;background:#c0392b;color:#ffffff;' +
      'border:2px solid #ffffff;border-radius:4px;text-align:center;text-decoration:none;cursor:pointer;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    // 0.6.0: the hitter banner (top of the body), the place line and the now-first line (above the queue)
    ui.hitterBanner = mark(el('div', ''), 'hitterbanner');
    css(ui.hitterBanner, 'all:initial;display:none;box-sizing:border-box;min-height:28px;margin:0 0 4px 0;padding:5px 6px;border-radius:4px;text-align:center;background:' + HITTER_COLOR + ';color:#000000;font:bold 14px/18px Arial,Helvetica,sans-serif;');
    ui.movedFirst = mark(el('div', MOVED_TEXT), 'movedfirst');
    css(ui.movedFirst, 'all:initial;display:none;box-sizing:border-box;margin:2px 0 4px 0;padding:4px 6px;border-radius:4px;text-align:center;background:' + MOVED_COLOR + ';color:#ffffff;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    ui.place = mark(el('div', ''), 'place');
    css(ui.place, 'all:initial;display:none;box-sizing:border-box;margin:0 0 2px 0;color:#bfe3ff;font:bold 13px/18px Arial,Helvetica,sans-serif;');
    ui.queue = mark(el('div'), 'queue');
    css(ui.queue, 'all:initial;display:block;color:#e6e6e6;font:13px/18px Arial,Helvetica,sans-serif;');
    ui.msg = mark(el('div', ''), 'msg');
    css(ui.msg, 'all:initial;display:block;margin-top:4px;color:#ffd84d;font:12px/16px Arial,Helvetica,sans-serif;');

    ui.keyPanel = buildKeyPanel();

    ui.watchBtn = mark(makeButton('Watch', '#3b6fd8', '#ffffff', onWatchClick), 'watch');
    ui.joinBtn = mark(makeButton('Join queue', '#2e8b57', '#ffffff', function () { press('join'); }), 'join');
    ui.leaveBtn = mark(makeButton('Leave queue', '#7a7f87', '#ffffff', function () { press('leave'); }), 'leave');
    ui.hereBtn = mark(makeButton('Im here', '#e0a800', '#000000', function () { press('here'); }), 'here');
    ui.forgetBtn = mark(makeButton('Forget key', '#4a4f57', '#ffffff', function () {
      gmDel(K_API);
      session = null;
      setLocalMsg('Key removed.');
    }), 'forget');
    ui.rejoinBtn = mark(makeButton('Rejoin after my hit: OFF', '#4a4f57', '#ffffff', onRejoinClick), 'rejoin');
    ui.targetsBtn = mark(makeButton('Targets', '#6a4fb3', '#ffffff', onTargetsClick), 'targetsbtn');
    ui.targets = buildTargetsPanel();

    ui.body.appendChild(ui.hitterBanner);
    ui.body.appendChild(ui.chainLine);
    ui.body.appendChild(ui.timer);
    ui.body.appendChild(ui.bonus);
    ui.body.appendChild(ui.phase);
    ui.body.appendChild(ui.freeLink);
    ui.body.appendChild(ui.movedFirst);
    ui.body.appendChild(ui.place);
    ui.body.appendChild(ui.queue);
    ui.body.appendChild(ui.msg);
    ui.body.appendChild(ui.keyPanel.wrap);
    ui.body.appendChild(ui.watchBtn);
    ui.body.appendChild(ui.joinBtn);
    ui.body.appendChild(ui.leaveBtn);
    ui.body.appendChild(ui.rejoinBtn);
    ui.body.appendChild(ui.hereBtn);
    ui.body.appendChild(ui.forgetBtn);
    ui.body.appendChild(ui.targetsBtn);
    ui.body.appendChild(ui.targets.wrap);
    ui.box.appendChild(ui.body);
    root.appendChild(ui.box);

    attachDrag();
    document.body.appendChild(ui.host);
    applyPos();
    window.addEventListener('resize', onResize);
  }

  function onResize() { applyPos(); }

  // One minimized row: a label, a name that is cut with ... when it is long, and a suffix.
  function buildMiniRow(markName) {
    var row = mark(el('div'), markName);
    css(row, 'all:initial;display:flex;box-sizing:border-box;width:100%;color:#e6e6e6;font:12px/16px Arial,Helvetica,sans-serif;');
    var label = el('span', '');
    css(label, 'all:initial;flex:none;white-space:pre;color:#e6e6e6;font:12px/16px Arial,Helvetica,sans-serif;');
    var name = el('span', '');
    css(name, 'all:initial;display:block;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6e6e6;font:12px/16px Arial,Helvetica,sans-serif;');
    var suffix = el('span', '');
    css(suffix, 'all:initial;flex:none;white-space:pre;color:#e6e6e6;font:12px/16px Arial,Helvetica,sans-serif;');
    row.appendChild(label);
    row.appendChild(name);
    row.appendChild(suffix);
    return { row: row, label: label, name: name, suffix: suffix };
  }

  function setMiniRow(parts, label, name, suffix, color) {
    if (parts.label.textContent !== label) parts.label.textContent = label;
    if (parts.name.textContent !== name) parts.name.textContent = name;
    if (parts.suffix.textContent !== suffix) parts.suffix.textContent = suffix;
    parts.label.style.color = color;
    parts.name.style.color = color;
    parts.suffix.style.color = color;
  }

  function buildKeyPanel() {
    var wrap = mark(el('div'), 'keypanel');
    css(wrap, 'all:initial;display:none;margin-top:4px;color:#cfcfcf;font:11px/14px Arial,Helvetica,sans-serif;');
    var intro = el('div', 'Create a key (limited access), paste it here and save it. These are the terms of use:');
    css(intro, 'all:initial;display:block;margin-bottom:4px;color:#cfcfcf;font:11px/14px Arial,Helvetica,sans-serif;');
    wrap.appendChild(intro);

    var table = mark(el('table'), 'tos');
    css(table, 'all:initial;display:table;width:100%;border-collapse:collapse;margin-bottom:4px;');
    for (var i = 0; i < TOS_ROWS.length; i++) {
      var tr = el('tr');
      var th = el('th', TOS_ROWS[i][0]);
      css(th, 'all:initial;display:table-cell;vertical-align:top;width:70px;padding:2px 4px 2px 0;border-top:1px solid #3a3f45;color:#ffffff;font:bold 10px/13px Arial,Helvetica,sans-serif;text-align:left;');
      var td = el('td', TOS_ROWS[i][1]);
      css(td, 'all:initial;display:table-cell;vertical-align:top;padding:2px 0;border-top:1px solid #3a3f45;color:#cfcfcf;font:10px/13px Arial,Helvetica,sans-serif;');
      tr.appendChild(th);
      tr.appendChild(td);
      table.appendChild(tr);
    }
    wrap.appendChild(table);

    var link = mark(el('a', 'Create a key for KS Chain Dibs'), 'keylink');
    link.href = KEY_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    css(link, 'all:initial;display:block;margin-bottom:4px;color:#7fb3ff;text-decoration:underline;cursor:pointer;font:11px/14px Arial,Helvetica,sans-serif;');
    wrap.appendChild(link);

    var input = mark(el('input'), 'keyinput');
    input.type = 'password';
    input.placeholder = '16-character API key';
    input.autocomplete = 'off';
    css(input, 'all:initial;display:block;box-sizing:border-box;width:100%;height:28px;padding:2px 6px;background:#0f1013;color:#ffffff;border:1px solid #666b73;border-radius:4px;font:13px/22px Arial,sans-serif;');
    wrap.appendChild(input);

    var save = mark(makeButton('Save key', '#3b6fd8', '#ffffff', function () {
      var v = String(input.value || '').trim();
      if (!/^[A-Za-z0-9]{16}$/.test(v)) { setLocalMsg('A Torn API key is 16 letters and digits.'); return; }
      gmSet(K_API, v);
      loginFails = 0;
      loginBlockedUntil = 0;
      input.value = '';
      // A new key: the FREE HIT target, the hit lookup and the energy check may be asked for again.
      if (shared && shared.freeKeyBad) publish({ freeKeyBad: false });
      if (shared && shared.hitKeyBad) publish({ hitKeyBad: false });
      if (shared && shared.abilityKeyBad) publish({ abilityKeyBad: false });
      setLocalMsg('Key saved.');
      if (watchOn) { loadNames(); if (isLeader) cycle(); }
    }), 'keysave');
    wrap.appendChild(save);
    return { wrap: wrap, input: input, save: save };
  }

  // The faction FREE HIT list. Only built into view for the Torn IDs the server
  // names (you.canEditTargets).
  function buildTargetsPanel() {
    var wrap = mark(el('div'), 'targetspanel');
    css(wrap, 'all:initial;display:none;margin-top:4px;color:#cfcfcf;font:11px/14px Arial,Helvetica,sans-serif;');
    var intro = el('div', 'Torn IDs of free hit targets, separated by commas or spaces. Up to 10.');
    css(intro, 'all:initial;display:block;margin-bottom:4px;color:#cfcfcf;font:11px/14px Arial,Helvetica,sans-serif;');
    wrap.appendChild(intro);

    var input = mark(el('textarea'), 'targetsinput');
    input.rows = 3;
    input.spellcheck = false;
    input.autocomplete = 'off';
    css(input, 'all:initial;display:block;box-sizing:border-box;width:100%;height:58px;padding:4px 6px;background:#0f1013;color:#ffffff;border:1px solid #666b73;border-radius:4px;font:13px/18px Arial,sans-serif;overflow:auto;');
    wrap.appendChild(input);

    var count = mark(el('div', '0 targets on the list'), 'targetscount');
    css(count, 'all:initial;display:block;margin-top:4px;color:#cfcfcf;font:11px/14px Arial,Helvetica,sans-serif;');
    wrap.appendChild(count);

    var save = mark(makeButton('Save targets', '#3b6fd8', '#ffffff', onTargetsSave), 'targetssave');
    wrap.appendChild(save);
    return { wrap: wrap, input: input, count: count, save: save };
  }

  function onTargetsClick() {
    targetsOpen = !targetsOpen;
    if (targetsOpen) {
      // Filled in with the list as it is now, once, when the panel opens.
      var snap = (shared && shared.snap) ? shared.snap : null;
      ui.targets.input.value = snapTargets(snap).join(', ');
    }
    render();
  }

  var TARGETS_BAD_TEXT = 'Up to 10 Torn IDs, digits only.';

  function onTargetsSave() {
    var snap = (shared && shared.snap) ? shared.snap : null;
    if (!watchOn || !snap || !snap.you.canEditTargets) return;
    var tokens = String(ui.targets.input.value || '').split(/[\s,]+/);
    var list = [];
    var seen = {};
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (tok === '') continue;
      if (!/^[0-9]{1,12}$/.test(tok)) { setLocalMsg(TARGETS_BAD_TEXT); return; }
      if (!seen.hasOwnProperty(tok)) { seen[tok] = 1; list.push(tok); }
    }
    if (list.length > TARGETS_MAX) { setLocalMsg(TARGETS_BAD_TEXT); return; }
    chainCall('targets', null, function (r, j) {
      var answer = takeAnswer(r, j, false);
      if (answer && answer.action === 'targets_set') {
        ui.targets.input.value = answer.targets.join(', ');
        setLocalMsg('Saved ' + answer.targets.length + ' targets.');
        return;
      }
      if (r && r.kind === 'http' && j && j.error === 'targets_not_allowed') { setLocalMsg('You may not change the list.'); return; }
      if (r && r.kind === 'http' && j && j.error === 'bad_request') { setLocalMsg('The server did not accept the list.'); return; }
      setLocalMsg('KS server not reached. Nothing was changed.');
    }, { targets: list });
  }

  // The choice lives in Tampermonkey on this PC, not on the server.
  function onRejoinClick() {
    gmSet(K_REJOIN, !getRejoin());
    render();
  }

  function onWatchClick() {
    if (watchOn) setWatch(false, '');
    else { publish({ note: '' }); setWatch(true); }
  }

  function attachDrag() {
    var drag = null;
    ui.header.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      drag = { dx: ev.clientX - pos.left, dy: ev.clientY - pos.top };
      try { ui.header.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    });
    ui.header.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      pos.left = ev.clientX - drag.dx;
      pos.top = ev.clientY - drag.dy;
      applyPos();
    });
    function end(ev) {
      if (!drag) return;
      drag = null;
      try { ui.header.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      gmSet(K_POS, { left: Math.round(pos.left), top: Math.round(pos.top) });
    }
    ui.header.addEventListener('pointerup', end);
    ui.header.addEventListener('pointercancel', end);
  }

  // What the window should show right now. Pure: state in, description out.
  function describe() {
    var now = Date.now();
    var d = { phaseKey: 'checking', text: 'CHECKING', timer: '--:--', chainLine: '-- / --', showOwner: false, remaining: null, hasSnap: false, msg: '', link: null, locked: false, bonus: null, valid: false };
    // Watch is on but no key is saved: no request is made, so say that, not OFFLINE.
    if (watchOn && getKey() === '') {
      d.phaseKey = 'checking';
      d.text = 'No key saved - save your key below';
      return d;
    }
    var sh = shared;
    var snap = sh && sh.snap ? sh.snap : null;
    var snapAt = sh && sh.snapAt ? sh.snapAt : 0;
    var lastContact = Math.max(snapAt, watchSince);

    // Reasons the window cannot be trusted - shown as a line of text.
    var msgs = [];
    if (sh && sh.auth && sh.auth.kind === 'paused') {
      var left = Math.max(0, Math.ceil((sh.auth.until - now) / 1000));
      msgs.push('Sign-in paused: retry in ' + left + ' s');
    } else if (sh && sh.auth && (sh.auth.kind === 'error' || sh.auth.kind === 'member' || sh.auth.kind === 'key') && sh.auth.msg) {
      msgs.push(sh.auth.msg);
    }
    if (sh && sh.torn && sh.torn.kind === 'paused' && sh.torn.until > now) {
      msgs.push('Torn asked us to wait: ' + Math.ceil((sh.torn.until - now) / 1000) + ' s');
    } else if (sh && sh.torn && sh.torn.kind === 'error' && sh.torn.msg) {
      msgs.push(sh.torn.msg);
    }
    if (sh && sh.freeKeyBad === true) msgs.push('Free hit target needs a new key - use the key link');
    if (sh && sh.hitKeyBad === true) msgs.push('Queue needs a new key - use the key link');
    // Can he hit? Only said while he stands in the queue. A lock needs a result
    // that could be read and is at most 60 s old; anything else locks nothing.
    var inQueueNow = !!(snap && snap.you.inQueue);
    var ability = abilityFor(sh, now);
    d.locked = inQueueNow && ability.locked;
    if (inQueueNow) {
      if (sh && sh.abilityKeyBad === true) msgs.push('Energy check needs a new key - use the key link');
      if (ability.locked) msgs.push('Cannot hit now: ' + ability.reason);
      else if (ability.unknown && !(sh && sh.abilityKeyBad === true)) msgs.push('Energy check unavailable');
    }
    // AFK (0.5.0): said only from an answer that is fresh, so an old note never stays.
    if (snap && now - snapAt <= OFFLINE_AFTER_MS) {
      if (isInt(snap.you.afkRemovedAt)) msgs.push(AFK_SELF_TEXT);
      var afkText = afkOthersText(snap);
      if (afkText) msgs.push(afkText);
    }
    if (sh && sh.note) msgs.push(sh.note);
    if (localMsg && now < localMsgUntil) msgs.push(localMsg);
    d.msg = msgs.join(' ');

    if (!snap) {
      d.phaseKey = (now - lastContact > OFFLINE_AFTER_MS) ? 'offline' : 'checking';
      d.text = d.phaseKey === 'offline' ? 'OFFLINE - server not reached' : 'CHECKING';
      return d;
    }
    d.hasSnap = true;
    if (snap.chain) d.chainLine = snap.chain.current + ' / ' + snap.chain.max;

    if (now - lastContact > OFFLINE_AFTER_MS) {
      d.phaseKey = 'offline';
      d.text = 'OFFLINE - server not reached';
      return d;
    }
    if (snap.status === 'no_reading') {
      d.phaseKey = 'checking';
      d.text = 'CHECKING';
      return d;
    }
    var age = snap.chain ? snap.chain.readingAgeMs + (now - snapAt) : 0;
    if (snap.status === 'stale' || age > STALE_AFTER_MS) {
      d.phaseKey = 'stale';
      d.text = 'STALE - no fresh chain data';
      return d;
    }
    // From here the answer is fresh and has data: the minimized rows and the notices may speak.
    d.valid = true;
    if (snap.status === 'inactive') {
      d.phaseKey = 'inactive';
      d.text = 'No active chain';
      return d;
    }
    if (!snap.chain) {
      d.phaseKey = 'checking';
      d.text = 'CHECKING';
      return d;
    }

    // live: count the time here, with the clock offset to the server.
    var remaining = snap.chain.end * 1000 - (now + (sh.offset || 0));
    d.remaining = remaining;
    d.timer = fmtTime(remaining);
    // Same hit count as Torn's bar and a time within 2 s of ours: show Torn's.
    var bar = readBar();
    if (bar && bar.count === snap.chain.current && Math.abs(bar.secs - Math.floor(remaining / 1000)) <= BAR_TIMER_TOLERANCE_S) {
      d.timer = fmtTime(bar.secs * 1000);
    }
    var hasOwner = !!(snap.turn && snap.turn.ownerId !== null);
    if (remaining <= 0) {
      d.phaseKey = 'ended';
      d.text = 'Chain timer ran out';
      return d;
    }
    // The next hit is a bonus hit: said for the whole turn.
    d.bonus = bonusNext(snap);
    // The server decides at 2:00. Until its answer says so, say CHECKING.
    if (remaining <= RESOLVE_AT_MS && !(snap.turn && snap.turn.resolved)) {
      d.phaseKey = 'checking';
      d.text = 'CHECKING';
      return d;
    }
    var phase = phaseFor(remaining, hasOwner);
    d.phaseKey = phase;
    d.showOwner = true;
    var owner = hasOwner ? snap.turn.ownerId : null;
    if (phase === 'waiting') d.text = 'Waiting';
    else if (phase === 'confirm') d.text = (snap.you.inQueue && !snap.you.confirmed) ? 'Press Im here before 2:00' : 'Confirm window';
    else if (phase === 'get_ready') d.text = snap.you.isOwner ? 'GET READY' : nameOf(owner) + ' GET READY';
    else if (phase === 'hit_now') d.text = snap.you.isOwner ? 'HIT NOW' : nameOf(owner) + ' HIT NOW';
    else if (phase === 'no_confirmed') d.text = 'No confirmed hitter';
    else if (phase === 'free_hit') {
      d.text = 'FREE HIT';
      // A free target is a link; a list with nobody free says so. An empty
      // list, an error or an old answer leaves the plain FREE HIT row.
      var fh = freeHitFor(snap, sh, now);
      if (fh.link) d.link = fh.link;
      else if (fh.none) d.msg = (d.msg ? d.msg + ' ' : '') + 'No target on the list is free right now';
    }
    return d;
  }

  function renderQueue(d) {
    while (ui.queue.firstChild) ui.queue.removeChild(ui.queue.firstChild);
    var snap = shared && shared.snap ? shared.snap : null;
    if (!snap || snap.queue.length === 0) {
      var empty = mark(el('div', snap ? 'Queue is empty' : ''), 'qempty');
      css(empty, 'all:initial;display:block;color:#9aa0a6;font:13px/18px Arial,Helvetica,sans-serif;');
      ui.queue.appendChild(empty);
      return;
    }
    var ownerId = (d.showOwner && snap.turn) ? snap.turn.ownerId : null;
    var shown = Math.min(QUEUE_SHOWN, snap.queue.length);
    // One row: place, name, a green tick when confirmed. The hitter is yellow and bold.
    function addRow(index) {
      var q = snap.queue[index];
      var row = mark(el('div'), 'qrow');
      css(row, 'all:initial;display:flex;justify-content:space-between;color:#e6e6e6;font:13px/18px Arial,Helvetica,sans-serif;');
      var isOwner = ownerId !== null && q.tornId === ownerId;
      var label = mark(el('span', (index + 1) + '. ' + nameOf(q.tornId) + (isOwner ? ' (hitter)' : '')), 'qname');
      css(label, 'all:initial;color:' + (isOwner ? '#ffd84d' : '#e6e6e6') + ';font:' + (isOwner ? 'bold ' : '') + '13px/18px Arial,Helvetica,sans-serif;');
      var tick = el('span', q.confirmed ? '\u2713' : '');
      mark(tick, 'qtick');
      css(tick, 'all:initial;color:#3ddc84;font:bold 14px/18px Arial,Helvetica,sans-serif;');
      row.appendChild(label);
      row.appendChild(tick);
      ui.queue.appendChild(row);
    }
    for (var i = 0; i < shown; i++) addRow(i);
    // The hitter stands behind the first three (unconfirmed members ahead of him
    // stay in the queue): he gets a row of his own after them, and is not counted in "+N more".
    var hidden = snap.queue.length - shown;
    var ownerIndex = -1;
    if (ownerId !== null) {
      for (var k = shown; k < snap.queue.length; k++) {
        if (snap.queue[k].tornId === ownerId) { ownerIndex = k; break; }
      }
    }
    if (ownerIndex >= 0) {
      addRow(ownerIndex);
      hidden -= 1;
    }
    if (hidden > 0) {
      var more = hidden;
      var text = '+' + more + ' more';
      var myPlace = (snap.you.inQueue && snap.you.position !== null) ? snap.you.position : null;
      // "you" is only added when he is hidden himself and is not the hitter shown above.
      if (myPlace !== null && myPlace > shown && myPlace !== ownerIndex + 1) text += ' (you: #' + myPlace + ')';
      var m = mark(el('div', text), 'qmore');
      css(m, 'all:initial;display:block;color:#9aa0a6;font:12px/16px Arial,Helvetica,sans-serif;');
      ui.queue.appendChild(m);
    }
  }

  function show(node, visible) { node.style.display = visible ? 'block' : 'none'; }

  function render() {
    if (!ui.host) return;
    var d = describe();
    var snap = shared && shared.snap ? shared.snap : null;
    var hasKey = getKey() !== '';

    // 0.6.0: what is going on for HIM. Only with Watch on, a key and a usable answer.
    var usable = watchOn && hasKey && d.valid === true && !!snap;
    var hitterOn = usable && hitterActive(d, snap);
    var movedOn = watchOn && hasKey && trackMovedFirst(snap, d);
    // The window opens itself once for each such event. His saved choice stays as he made it.
    var evKey = hitterOn ? 'H:' + turnKeyOf(snap) : (movedOn ? movedFirst.key : null);
    if (evKey !== null && evKey !== lastAutoKey) {
      lastAutoKey = evKey;
      if (minimized) minimized = false;
    }
    // The frame: yellow and 3 px while he holds the hit, pulsing like the Im here button; otherwise as always.
    var frame = BOX_BORDER;
    if (hitterOn) {
      frame = HITTER_FRAME_PX + 'px solid ' + ((Math.floor(Date.now() / BLINK_MS) % 2 === 0) ? HITTER_COLOR : HITTER_DARK);
    }
    if (ui.frameApplied !== frame) {
      ui.frameApplied = frame;
      ui.box.style.border = frame;
    }
    ui.box.setAttribute('data-frame', hitterOn ? 'hitter' : '');

    // A bonus hit next: the small timer says BONUS in gold, nothing else changes when minimized.
    ui.mini.textContent = (watchOn && d.remaining !== null) ? ((d.bonus !== null ? 'BONUS ' : '') + d.timer) : '';
    ui.mini.style.color = (watchOn && d.bonus !== null) ? BONUS_COLOR : '#bdbdbd';
    ui.minBtn.textContent = minimized ? '+' : '-';
    ui.minBtn.title = minimized ? 'Restore' : 'Minimize';
    show(ui.body, !minimized);
    // Minimized: who is first and who is the hitter, two short rows.
    show(ui.miniInfo, minimized && usable);
    if (minimized && usable) {
      var firstId = snap.queue.length > 0 ? snap.queue[0].tornId : null;
      var youFirst = firstId !== null && snap.you.inQueue && snap.you.position === 1;
      setMiniRow(ui.miniFirst, 'First: ', firstId === null ? '-' : cleanName(nameOf(firstId)), youFirst ? ' (you)' : '', '#e6e6e6');
      var hitterId = (d.showOwner && snap.turn) ? snap.turn.ownerId : null;
      if (hitterId !== null) setMiniRow(ui.miniHitter, 'Hitter: ', cleanName(nameOf(hitterId)), '', HITTER_COLOR);
      else setMiniRow(ui.miniHitter, 'Hitter: ', 'none', '', '#9aa0a6');
    }
    if (minimized) return;

    ui.watchBtn.textContent = watchOn ? 'Stop' : 'Watch';

    if (!watchOn) {
      ui.chainLine.textContent = 'Watch is off. No requests are made.';
      show(ui.timer, false);
      show(ui.hitterBanner, false);
      show(ui.movedFirst, false);
      show(ui.place, false);
      show(ui.bonus, false);
      show(ui.phase, false);
      show(ui.queue, false);
      ui.msg.textContent = (shared && shared.note) ? shared.note : (localMsg && Date.now() < localMsgUntil ? localMsg : '');
      show(ui.msg, ui.msg.textContent !== '');
      show(ui.keyPanel.wrap, false);
      show(ui.joinBtn, false);
      show(ui.leaveBtn, false);
      show(ui.rejoinBtn, false);
      show(ui.hereBtn, false);
      show(ui.forgetBtn, hasKey);
      show(ui.freeLink, false);
      show(ui.targetsBtn, false);
      show(ui.targets.wrap, false);
      show(ui.watchBtn, true);
      return;
    }

    show(ui.timer, true);
    show(ui.phase, true);
    show(ui.queue, hasKey);
    ui.chainLine.textContent = d.chainLine;
    ui.timer.textContent = d.timer;
    if (d.bonus !== null) {
      var bonusText = 'BONUS HIT next: ' + d.bonus;
      if (ui.bonus.textContent !== bonusText) ui.bonus.textContent = bonusText;
      show(ui.bonus, true);
    } else {
      show(ui.bonus, false);
    }
    var st = PHASE_STYLE[d.phaseKey] || PHASE_STYLE.checking;
    ui.phase.textContent = d.text;
    ui.phase.style.background = st.bg;
    ui.phase.style.color = st.fg;
    ui.phase.setAttribute('data-phase', d.phaseKey);
    // A free target: the link takes the place of the phase row.
    if (d.link) {
      var href = ATTACK_URL + d.link.id;
      var label = 'FREE HIT - attack ' + d.link.name;
      if (ui.freeLink.getAttribute('href') !== href) ui.freeLink.setAttribute('href', href);
      if (ui.freeLink.textContent !== label) ui.freeLink.textContent = label;
      show(ui.freeLink, true);
      show(ui.phase, false);
    } else {
      show(ui.freeLink, false);
      ui.freeLink.removeAttribute('href');
    }
    // The banner, the place line and the now-first line.
    if (hitterOn) {
      var bannerText = d.phaseKey === 'hit_now' ? 'YOU ARE THE HITTER - HIT NOW' : 'YOU ARE THE HITTER - HIT AT ' + fmtTime(HIT_NOW_AT_MS);
      if (ui.hitterBanner.textContent !== bannerText) ui.hitterBanner.textContent = bannerText;
    }
    show(ui.hitterBanner, hitterOn);
    show(ui.movedFirst, movedOn);
    var place = usable ? placeText(snap) : '';
    if (ui.place.textContent !== place) ui.place.textContent = place;
    show(ui.place, place !== '');
    renderQueue(d);
    ui.msg.textContent = d.msg;
    show(ui.msg, d.msg !== '');

    // The key panel (with the key link) is also there when the free hit target
    // needs a new key.
    show(ui.keyPanel.wrap, !hasKey || (shared && (shared.freeKeyBad === true || shared.hitKeyBad === true || shared.abilityKeyBad === true)));
    show(ui.forgetBtn, false);
    show(ui.watchBtn, true);

    // Targets: only for the Torn IDs the server names.
    var canEdit = !!(snap && snap.you.canEditTargets === true);
    show(ui.targetsBtn, hasKey && canEdit);
    var panelOpen = hasKey && canEdit && targetsOpen;
    show(ui.targets.wrap, panelOpen);
    if (panelOpen) {
      var countText = snapTargets(snap).length + ' targets on the list';
      if (ui.targets.count.textContent !== countText) ui.targets.count.textContent = countText;
    }

    var connected = d.phaseKey !== 'offline';
    var inQ = !!(snap && snap.you.inQueue);
    show(ui.joinBtn, hasKey && !inQ);
    show(ui.leaveBtn, hasKey && inQ);
    ui.joinBtn.disabled = !connected;
    ui.leaveBtn.disabled = !connected;

    // Rejoin after my hit: a choice kept on this PC. Shown with a key and Watch on.
    show(ui.rejoinBtn, hasKey);
    if (hasKey) {
      var rejoinOn = getRejoin();
      var rejoinText = 'Rejoin after my hit: ' + (rejoinOn ? 'ON' : 'OFF');
      if (ui.rejoinBtn.textContent !== rejoinText) ui.rejoinBtn.textContent = rejoinText;
      ui.rejoinBtn.style.background = rejoinOn ? '#2e8b57' : '#4a4f57';
      ui.rejoinBtn.setAttribute('data-rejoin', rejoinOn ? 'on' : 'off');
    }

    // Im here: only for a member in the queue, and it blinks 2:30-2:00 for the
    // first one in the queue who has not pressed it.
    var showHere = hasKey && inQ;
    show(ui.hereBtn, showHere);
    if (showHere) {
      var confirmed = snap.you.confirmed;
      var decided = !!(snap.turn && snap.turn.resolved);
      // He cannot hit (energy, hospital, jail, travel): locked, and it does not blink.
      var locked = d.locked === true;
      ui.hereBtn.textContent = locked ? 'Im here (cannot hit)' : (confirmed ? 'Im here (done)' : 'Im here');
      ui.hereBtn.disabled = !connected || confirmed || decided || locked;
      var blink = !locked && !confirmed && ((d.phaseKey === 'confirm' && snap.you.position === 1) || movedOn);
      ui.hereBtn.setAttribute('data-blink', blink ? '1' : '0');
      var on = blink && (Math.floor(Date.now() / BLINK_MS) % 2 === 0);
      ui.hereBtn.style.background = on ? '#ffffff' : '#e0a800';
      ui.hereBtn.style.opacity = ui.hereBtn.disabled ? '0.5' : '1';
    }
  }

  // ------------------------------------------------------------ lifecycle

  function addListener(key, fn) {
    try {
      var id = GM_addValueChangeListener(key, fn);
      listenerIds.push(id);
    } catch (e) { dbg('listener failed', key); }
  }

  function start() {
    if (running) return;
    running = true;
    loadShared();
    loadNames();
    addListener(K_SHARED, onSharedChange);
    addListener(K_WATCH, onWatchChange);
    addListener(K_LEADER, onLeaderChange);
    addListener(K_NAMES, onNamesChange);
    addListener(K_KICK, onKick);
    applyWatch();
    render();
  }

  function stop() {
    if (!running) return;
    running = false;
    stopTimers();
    releaseLeadership();
    for (var i = 0; i < listenerIds.length; i++) {
      try { GM_removeValueChangeListener(listenerIds[i]); } catch (e) { /* ignore */ }
    }
    listenerIds = [];
    window.removeEventListener('resize', onResize);
    watchOn = false;
  }

  window.addEventListener('pagehide', function () {
    // The window is gone with the page; nothing keeps running and the lead is let go.
    stop();
  });

  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted && !running) {
      window.addEventListener('resize', onResize);
      start();
    }
  });

  buildUi();
  start();
})();
