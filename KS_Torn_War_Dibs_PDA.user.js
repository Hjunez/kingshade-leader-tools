// ==UserScript==
// @name         KS Torn War Dibs PDA
// @namespace    kingshade.torn
// @version      1.5.186
// @description  Roster-local PDA presentation with v1.5.145 authority and shared-claim safety.
// @author       Kingshade
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @grant        GM_xmlhttpRequest
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      ks-war-room-claims.hans-viklund.workers.dev
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * 1.5.186 (2026-10-05): DIBS moves to the KS War Room server.
 * CHANGED
 *   - The claim board, claim and release go to the KS War Room server
 *     (ks-war-room-claims.hans-viklund.workers.dev; POST only, JSON body)
 *     instead of FFScouter's claim endpoints, which are gone from this file
 *     together with their allowlist. FF/Est still come from FFScouter
 *     get-stats, unchanged. The war on the wire is Torn's ranked war id.
 *   - DIBS needs the Torn key, not the FFScouter key. Sign-in uses the Torn
 *     key the script already holds; the sign-in token lives in a module
 *     variable only. A refused key is never re-sent on its own: the next
 *     attempt needs the key saved again, or one tap on Sync.
 *   - The "War Room" link to FFScouter's own page is gone from the panel.
 * ADDED
 *   - Hospital report: a claimed target that is back in hospital is reported
 *     to the server, which releases the claim. Only on a Torn reading taken
 *     more than 45 s after the claim.
 *   - Claimer names from the key owner's own faction member list (Torn
 *     /v2/faction/members, at most once per 5 minutes, memory only).
 *   - The own record carries wireId: the war its claim was made on.
 * FIXED
 *   - An own record that two complete board reads in a row no longer find is
 *     dropped instead of blocking every target until it expires -- also
 *     after a page reload, when the record's wireId is the board's war.
 *   - A focused key field is never disabled: the lock acts on Save and says
 *     why. Save and Cancel are 44px. Without an own claim a stale ownership
 *     check no longer locks either key.
 * KNOWN ISSUES
 *   - An own record saved by 1.5.185 against FFScouter is not on the
 *     server's board and has no wireId: it blocks DIBS until it expires.
 * VERIFICATION
 *   - CANDIDATE. Node and Chromium against fake services only. Never run in
 *     Torn PDA or against the live server.
 * Clock, countdown tick, roster order, moved rows, FF keep, the FF 2.00-3.40
 * window, the low-life rule, the online rule, RW phase, the VIEW guard and
 * every storage name are unchanged from 1.5.185.
 * 1.5.185: one failed FFScouter read no longer wipes every FF value. Each
 * value keeps its own 6 min validity (fairFightMaxAgeMs) and is dropped by
 * scoutStatsForTarget() when it gets older, so a 502/429/network error no
 * longer turns every claimable row UNKNOWN until the next good read. A key
 * change or suspend still clears everything, as before.
 * 1.5.184: the hospital countdown changes its digits on Torn's second
 * boundary, every second, instead of whenever a free 1 s interval happened
 * to fire. Ported from PC scheduleDisplayTick (PC 1.0.32). Same work per
 * tick, same rate; only the moment inside the second moves.
 * 1.5.183: a row Torn only moves keeps its DIBS button. Torn re-sorts the
 * roster by moving the same li elements (remove + insert, measured on Torn
 * 2026-10-02); KS treated every move as a removal, retired the binding and
 * built a new one that showed "DIBS LOADING" until the next paint.
 * 1.5.182: the roster order follows Torn's own column headers. KS orders
 * the rows only while Status is the active sort column: Status down (Torn's
 * first tap) = Okay, Hospital shortest first, Hospital ?, Traveling/Abroad,
 * other; Status up = Hospital shortest first, Hospital ?, Okay, Traveling/
 * Abroad, other. Members, Level and Score sorts are Torn's again (1.5.181
 * pinned the order and every header tap did nothing). Unknown header shape =
 * no KS order, so Torn always wins when in doubt. KS never taps a header.
 * 1.5.181: the war roster is drawn in a fixed order: Okay, then Hospital
 * with the shortest time first, then Hospital with an unreadable time, then
 * Traveling/Abroad, then everything else. Rows are never moved in the DOM
 * (WSE re-sorts ul.members-list on every childList change and would undo it):
 * the list becomes a flex column and each row gets a CSS order. The order is
 * a pure function of Torn data plus a stable first-seen sequence, never of
 * DOM position, so it cannot start a sort loop with another script. Rows are
 * re-measured in the same frame, so a DIBS button always sits on its own row.
 * 1.5.180: hospital rows no longer fall to UNKNOWN for ~10 s of every
 * 40 s. The opponent/VIEW member list is refetched once it is older than
 * tornStatusPollMs (10 s), the same rule PC uses, so it never passes the
 * 30 s validity limit between two timer ticks. Validity limit unchanged.
 * 1.5.179: optional fresh profile life allows FF up to 4.50 at 20% life
 * or less, within the hospital gate. Serial, bounded reads stop on suspend;
 * claims above the normal FF ceiling require a new low-life confirmation.
 * Review fix (Claude 2026-09-28): that claim read no longer waits for the
 * 10 s per-target spacing, so a low-life DIBS is sent without delay.
 * 1.5.178: fresh Online opponents are free for all within the existing
 * hospital/FF gate. Idle, Offline and unreadable activity still require DIBS.
 * Own claims are auto-released once per claim when fresh activity is Online.
 * 1.5.177: DIBS uses the inclusive FF 2.00-3.40 window chosen by the
 * faction leader. Locked FF values use two decimals so the reason is clear.
 * KS Torn War Dibs PDA v1.5.150 PRESENTATION/PERFORMANCE TEST
 * FF / Est separator, Hospital countdown, FF 2.00-5.00 gate and shared DIBS retained.
 * Hospital countdown uses v1.5.135 FFScouter-aligned second-boundary semantics.
 * PREWAR remains locked until a fresh own-faction /v2/faction/wars response confirms LIVE.
 * TIME: Torn-synchronized getCurrentTimestamp() remains available for Torn-specific timing.
 * PARITY: Hospital epoch countdown uses FFScouter-compatible client clock plus FFScouter-aligned +1 second semantics.
 * Country gate removed in 1.5.157: PC never had one, and two clients with
 * different gates cannot say the same thing about the same target.
 * Auto-release added in 1.5.158, ported from PC 1.0.38: a claim is released by
 * the script once the target is back in hospital well above the claim gate.
 * 1.5.161 is 1.5.158 with a new version stamp. The FFScouter interference row
 * tried in 1.5.159/1.5.160 is gone: FFScouter's own userscript does not run in
 * Torn PDA, so there is nothing on the page to read. PDA gets FF and Est from
 * FFScouter's API and draws them itself, which is unaffected.
 * 1.5.162 adds DEMO: a preview of the finished war look on a foreign roster.
 * It changes nothing but pixels, is impossible on the owner's own war route,
 * and sends nothing anywhere.
 * 1.5.163: an unreadable hospital time now reads "Hosp ?" instead of "Hosp
 * 0:00". Zero means attack now; unknown must never be able to say that.
 * 1.5.164: the DIBS button lives on the Status cell and carries the hospital
 * countdown itself. MEASURED 2026-09-05: Torn PDA's roster has no Attack
 * column, its attack cell measures 0x0, and the button was never drawn at all.
 * 1.5.165: Torn's own status text no longer bleeds out from behind the button.
 * The native cell is hidden only while the button covers it, and restored the
 * moment it does not.
 * 1.5.166: the same rule for the Score cell. Est is shown alone when there is
 * an estimate to show; with no estimate the box goes and Torn's own score is
 * back, rather than two numbers stacked in one small cell.
 * 1.5.167: the same rule for the FF pill on the nameplate. It is KS's own
 * element, not a Torn cell, so it drew "FF -" over part of the member name on
 * every row that had no FF value yet (owner Demo-off screenshot 2026-09-05).
 * The pill is now blank and invisible until there is a real value to show.
 * 1.5.168: the panel's control row answers a tap on a phone. MEASURED
 * 2026-09-12 from the owner's PDA reading ("nothing happens on any of those
 * links", own RW PREWAR, Shared: syncing): while the shared key has no current
 * ownership proof, updatePanel() set the disabled property on all four
 * credential controls, and a disabled button dispatches no click at all -- so
 * the four actions that already knew how to explain the lock could never say
 * it. The lock itself is unchanged and still fail-closed: every action
 * re-checks it on entry and refuses. What changed is that the control is now
 * marked aria-disabled instead of disabled, so the tap arrives and the script
 * answers with the reason. The row is also a touch target now: 44px minimum
 * per control, wrapped, with a visible pressed state, instead of eight 9.8px
 * text links sharing one line. One delegated click handler on the panel
 * replaces eight per-control handlers, so the row keeps its tap path when
 * Torn re-renders the war card underneath it.
 * 1.5.169: a tap in the panel no longer folds Torn's own Ranked War section.
 * MEASURED 2026-09-12 from the owner's PDA reading on 1.5.168: "wherever you
 * press, the RW roster list just closes", panel and roster together, and both
 * back "directly" on the next tap. The panel is a sibling of the war card by
 * owner decision (2026-09-03), so it sits inside the section Torn collapses,
 * and a click inside an open shadow root keeps bubbling out through the host
 * and up into Torn's tree. Every tap therefore reached Torn's collapse handler.
 * The DIBS button has had this guard since it moved onto Torn's Status cell
 * (handleDibsClick); the panel never got it. Propagation is now stopped on the
 * panel host, which is KS's own element. No Torn node is touched, nothing calls
 * preventDefault, touchmove is left alone so the page still scrolls, and Torn's
 * own collapse still works everywhere outside the panel.
 * The blur-to-unmount theory raised for 1.5.169 is withdrawn, on the owner's
 * evidence: an unmounted panel has to be rebuilt and that reads as delayed,
 * and blur does not explain Torn's own roster folding. The lifecycle is
 * deliberately untouched here.
 * 1.5.170: PC's bound clock is ported to PDA and placed at the top of
 * getTornNowMs(). PDA's getTornNowMs() previously tried
 * window.getCurrentTimestamp(), then the median of measured offsets, then the
 * phone's own clock -- the method PC abandoned in 1.0.35 after 9.21% low
 * reads against 0 of 144,000 with the bound clock. A low read means PDA shows
 * less time left than there actually is, and someone walks into a hospital.
 * The median path (median(), tornClockOffsetsMs, CONFIG.tornClockMaxSamples)
 * is removed: PC does not have it, and two clients with different clocks
 * cannot say the same thing about the same target. PDA's existing fallbacks
 * (getCurrentTimestamp, then the phone's clock) stay under the bound clock,
 * in the same order PC already has them.
 * 1.5.172: the clock label gets its own always-visible panel row, derived
 * fresh on every updatePanel() instead of being frozen inside the Torn
 * row's message string. Root cause (measured 2026-09-15 via the 1.5.171
 * DIAG build, since discarded): tornStatusState.message is a saved string,
 * built once when a VIEW/own-RW fetch completes, with
 * `clock: ${tornClockSourceLabel()}` baked in at that moment.
 * tornClockSourceLabel() reads tornClockSource, which is set only as a side
 * effect inside getTornNowMs() -- so unless something had already called
 * getTornNowMs() after the clock samples came in and before that string was
 * built, the label stayed frozen at whatever it was on the first render
 * ("device clock — UNSYNCED"), even after the bound clock had real values.
 * The new Clock row calls getTornNowMs() once to freshen that side effect
 * immediately before reading tornClockSourceLabel(), every time it is
 * built. No clock logic changes: getTornNowMs, recordTornWholeSecondMs,
 * recordTornClockFromHeaders, recordTornClockOffset and tornDateHeaderMs
 * are untouched.
 * 1.5.173: the panel is slimmed to what the member actually needs. Owner
 * 2026-09-15: "I want to remove all the unnecessary buttons and other
 * things that show in the panel. It just confuses players and they might
 * press things they shouldn't." and "the width is fine but the height
 * feels unnecessarily large right now." Normal mode now shows only the
 * brand row, one fail-closed summary status row and a Settings button
 * (plus a key button if a key is missing). The four status rows, all
 * secondary controls, the LIVE note and the api-policy disclosure move
 * behind Settings, collapsed by default and never remembered -- a plain
 * class toggle, nothing persisted, no new observer or timer. Demo no
 * longer exists in the DOM at all outside VIEW, per the 2026-09-12
 * decision that it must never be able to be active in the owner's own
 * war. No decision logic changes: the clock, claim path, release path,
 * busy-retry, phase detection, auto-release and the DIBS buttons on the
 * roster rows are untouched -- this is presentation only.
 * 1.5.174: a short burst of extra Torn reads, run once when runtime becomes
 * active (resumeRuntime), purely to feed the bound clock. Owner-measured
 * 2026-09-15 in VIEW: the bound width went ±998ms -> ±758ms -> ±621ms over
 * about a minute, because VIEW polls Torn about once every 30s and each
 * fresh interval is ~1000ms + round trip wide -- narrowing only happens
 * where two intervals intersect, so sparse responses converge slowly. The
 * reading was never wrong (the low edge never reads less time than there
 * is, at any width), but a wide interval opens the DIBS gate up to N ms
 * later than it could, which matters in a claim race. The burst makes up
 * to 5 extra reads, 1200ms apart, stopping as soon as the bound width is
 * 250ms or less, using exactly the endpoint the current mode's own path
 * already reads (own war: SCRIPT.tornOwnWarsPath; VIEW: the same members
 * path fetchViewMembers uses) through the same tornApiRequest/
 * tornReadWithTransportRetry every other read goes through -- same gate,
 * same retry, same budget, no new endpoint, no cache-buster. Responses are
 * never written to ownWarsState/viewMembersState/opponentMembersState.
 * The clock label also gains sample/reset counts: M is how many calls to
 * recordTornWholeSecondMs actually wrote the bounds, R is how many of
 * those were the nextLow >= nextHigh branch throwing the intersection away
 * and starting over -- the only evidence available for why the width
 * sometimes widens again, not yet explained and not fixed here. Getting
 * these counts without touching the math itself: recordTornWholeSecondMs,
 * getTornNowMs, tornDateHeaderMs, tornResponseIsFresh and
 * recordTornClockOffset are byte-identical to 1.5.173. A snapshot-and-
 * classify wrapper (trackClockBoundsWrite) observes tornClockLowMs/
 * tornClockHighMs/tornClockBoundsAt before and after the real, untouched
 * call and works out which branch ran from that plus the same
 * startedAt/endedAt/secondStartMs and CONFIG.tornClockDriftPpm the call
 * already used -- recordTornClockFromHeaders (not on the byte-identical
 * list) wraps its own call inline; recordTornClockOffset's three existing
 * call sites are wrapped from the outside instead, since that function's
 * own source cannot change.
 * 1.5.175: CONFIG.tornClockDriftPpm 500 -> 50. Owner-measured 2026-09-15 in
 * VIEW, 1.5.174 with 0 resets throughout (recordTornWholeSecondMs never
 * threw the intersection away, so a contradicting response is ruled out as
 * the cause): the bound width went ±449ms -> ±558ms over 6 samples across
 * 120s. slack = age * CONFIG.tornClockDriftPpm / 1e6 relaxes the kept
 * bounds by that much each side before intersecting, so width grows by
 * 2*slack per input that does not happen to cut in -- at ~20s between
 * samples and 500 ppm that predicts 120ms of growth; measured was 109ms.
 * The margin was widening faster than sparse new evidence could narrow it.
 * 50 ppm is 4 seconds/day, well inside what a network-synced phone clock
 * actually drifts, and cuts that per-sample growth by ten. No function
 * changes: recordTornWholeSecondMs reads the same CONFIG.tornClockDriftPpm
 * it always has, just a smaller value.
 * 1.5.176: hotfix, key fields. A member reported 2026-09-26 (Torn PDA,
 * iPhone) that the keyboard would not come up in the key field. Since
 * 1.5.173 updatePanel() re-inserted the key button and editor into the
 * panel on every run, about once a second, and re-inserting a focused
 * input drops its focus. The relocate block in updatePanel() now only
 * moves a node that is not already in place. Nothing else changes: same
 * positions, same locks, same storage, same network calls, DIBS untouched.
 */

(() => {
  "use strict";

  const SCRIPT = Object.freeze({
    name: "KS Torn War Dibs",
    version: "1.5.186",
    instanceKey: "__ksTornWarDibsPdaV15186Test",
    layerId: "ks-twd-pda-layer",
    rowHostPrefix: "ks-twd-pda-row-",
    panelId: "ks-twd-pda-panel",
    ownClaimStorageKey: "ks_torn_war_dibs_bridge_own_claim_v1",
    claimQuarantineStorageKey: "ks_torn_war_dibs_bridge_claim_quarantine_v1",
    claimStorageProbeKey: "ks_torn_war_dibs_pda_claim_storage_probe_v1",
    secureVaultDbName: "KSTornWarDibsBridgeSecure",
    secureVaultStoreName: "vault",
    secureVaultCryptoKeyId: "sharedApiCryptoKey",
    secureVaultCipherId: "sharedApiCipher",
    secureVaultRollbackCipherId: "sharedApiRollbackCipherPdaV1",
    tornApiCipherId: "tornApiCipherV1",
    sharedApiChangeJournalKey: "ks_torn_war_dibs_pda_ff_change_journal_v1",
    ffscouterOrigin: "https://ffscouter.com",
    ffscouterTermsUrl: "https://ffscouter.com/",
    ffscouterPrivacyUrl: "https://ffscouter.com/privacy",
    tornApiOrigin: "https://api.torn.com",
    tornKeyInfoPath: "/v2/key/info",
    tornOwnWarsPath: "/v2/faction/wars",
    // The key owner's own faction member list, for claimer names only.
    tornOwnMembersPath: "/v2/faction/members",
    tornCustomKeyUrl: "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=KS%20Torn%20War%20Dibs%20PDA&faction=members,wars&user=basic,profile"
  });

  // KS War Room server (contract: 3C rapport avsnitt 10). POST only, JSON
  // body, the sign-in token in the body field "session", nothing secret in the
  // URL. The only thing in the URL is the war id on the wire -- see wireWarId().
  //
  // KS_SERVER_TEST_BUILD false: this is the sharp build. The war id on the
  // wire is Torn's ranked war id, unchanged, so the script reads and writes
  // the board of the real war on screen. (true is for a test build only.)
  const KS_SERVER_TEST_BUILD = false;
  const KS_SERVER = Object.freeze({
    origin: "https://ks-war-room-claims.hans-viklund.workers.dev",
    sessionPath: "/session",
    warOps: Object.freeze(["claims", "claim", "unclaim", "report"]),
    simPrefix: "sim-"
  });

  const CONFIG = Object.freeze({
    gateSeconds: 120,
    minFairFight: 2.0,
    maxFairFight: 3.4,
    lowHpLifeMaxRatio: 0.20,
    lowHpMaxFairFight: 4.5,
    lifeMaxAgeMs: 15000,
    lifeReadMinIntervalMs: 10000,
    lifeReadsPerMinuteMax: 30,
    tornCallsPerMinuteMax: 100,
    fairFightRefreshMs: 60000,
    fairFightMaxAgeMs: 360000,
    fairFightErrorBackoffMs: 60000,
    fairFightTransportRecoveryMs: 1800,
    fairFightInitialRequestTimeoutMs: 6000,
    fairFightInitialTransportRetryAttempts: 1,
    fairFightMaxTargets: 205,
    tornStatusPollMs: 10000,
    tornStatusMaxAgeMs: 30000,
    opponentMembersMaxAgeMs: 30000,
    ownWarsWriteMaxAgeMs: 5000,
    targetBasicWriteMaxAgeMs: 120000,
    tornStatusErrorBackoffMs: 15000,
    tornTransportRetryDelayMs: 450,
    tornTransportRetryAttempts: 2,
    tornTransportOfflineThreshold: 2,
    tornTransportRecoveryDelayMs: 1800,
    tornClockMaxRoundTripMs: 10000,
    tornClockDriftPpm: 50,
    // 1.5.174: the one-time post-start clock sync burst. Same transport
    // retry/backoff as every other read; this only bounds the series itself.
    tornClockSyncBurstMaxAttempts: 5,
    tornClockSyncBurstDelayMs: 1200,
    tornClockSyncBurstTargetWidthMs: 250,
    rowRefreshMs: 1000,
    sharedPollMs: 2500,
    sharedTransportRetryDelayMs: 450,
    sharedTransportRetryAttempts: 2,
    sharedTransportOfflineThreshold: 2,
    mountPrimeDelayMs: 250,
    mountPrimeRetryMs: 400,
    mountPrimeMaxAttempts: 10,
    routeHeartbeatMs: 1000,
    directInteractionIdleMs: 30000,
    requestTimeoutMs: 15000,
    ownClaimMissingReadThreshold: 2,
    ownClaimMissingGraceMs: 500,
    maxHospitalSeconds: 172800,
    // How long a write result stays on the panel before routine progress may
    // overwrite it. Without it the shared poll that runs straight after a write
    // replaces the message within about 100 ms and nobody sees what happened.
    sharedErrorHoldMs: 6000,
    // A claim can only be taken while the target has gateSeconds or less
    // left, and a hospital timer only grows when the target is put back
    // in. A fresh reading above this is therefore proof of a NEW
    // hospitalisation, not the one the claim was taken during. 180 leaves
    // 60 s of margin over the 120 s gate.
    autoReleaseHospitalSeconds: 180,
    // KS server. The session is renewed a minute before it expires, so a
    // claim or release almost never lands on an expired token. The one
    // re-sign-in on 401 "expired" in ksWarRoomRequest covers what this misses.
    ksSessionRenewMarginMs: 60000,
    // Sign-in guard. The server pauses EVERY new sign-in for 10 minutes after
    // 10 invalid-key answers from Torn in 120 s, and blocks one sender after 5
    // failures in 300 s. A client that re-sends a refused key on every poll
    // would shut the whole faction out, so a refusal is never retried on its
    // own and a transient failure waits 15 s, then 30 s, then 60 s.
    ksSignInBackoffMs: Object.freeze([15000, 30000, 60000]),
    ksSignInBlockedMinWaitMs: 60000,
    // Hospital report (server rule K5). The server releases a claim only when
    // the reported end time is more than 180 s above the stored one, and
    // refuses a reading older than 30 s. Reporting anything else is noise.
    ksReportMarginSeconds: 180,
    ksReportMaxAgeMs: 30000,
    // R1. A Torn reading taken before a claim says nothing about that claim:
    // it can still show the long hospital time the target had BEFORE medding
    // down, and the server would release a live claim on it. A reading counts
    // only when taken more than 45 s after the claim was made. 45 = Torn's
    // cache 30 s (server REPORT_MAX_AGE_SECONDS) + the server's clock skew
    // 15 s (REPORT_CLOCK_SKEW_SECONDS).
    ksReportMinSecondsAfterClaim: 45,
    // Own faction member names: at most one Torn call per 5 minutes.
    ksMemberNamesRefreshMs: 300000
  });

  const TARGET_STATE = Object.freeze({
    CLAIMED: "claimed",
    BLOCKED: "blocked",
    UNAVAILABLE: "unavailable",
    UNKNOWN: "unknown",
    LOCKED: "locked",
    READY: "ready",
    FREE: "free"
  });

  const RW_PHASE = Object.freeze({
    UNKNOWN: "unknown",
    PREWAR: "prewar",
    LIVE: "live"
  });

  const CLAIM_FLOW_STATE = Object.freeze({
    IDLE: "idle",
    CLAIMING: "claiming",
    RELEASING: "releasing",
    CLEANUP_REQUIRED: "cleanup-required"
  });

  const STATS_API = Object.freeze({ getStats: "/api/v1/get-stats" });

  if (window[SCRIPT.instanceKey]) return;
  window[SCRIPT.instanceKey] = true;

  let destroyed = false;
  let runtimeActive = false;
  let bridgeMounted = false;
  let runtimeGeneration = 0;
  let lastTrustedInteractionAt = 0;
  let windowFocused = false;

  let rowRefreshTimer = null;
  let sharedPollTimer = null;
  let fairFightTimer = null;
  let fairFightRetryTimer = null;
  let tornStatusTimer = null;
  let routeHeartbeatTimer = null;
  let sharedRetryTimer = null;
  let tornRetryTimer = null;
  let mountPrimeTimer = null;
  let bodyObserver = null;
  let observedRosterRoot = null;
  let routeObserver = null;
  let observerScanQueued = false;
  let routeReconcileQueued = false;
  const nativeHistoryPushState = history.pushState;
  const nativeHistoryReplaceState = history.replaceState;
  let wrappedHistoryPushState = null;
  let wrappedHistoryReplaceState = null;

  let sharedApiKey = "";
  let storedTornApiKey = "";
  let pdaTornApiKeyRejected = false;

  // KS server session. The token lives in this module variable only: never in
  // any storage, never in the console, never in a panel row or an error text,
  // and never across a page reload -- it is fetched again with the Torn key
  // the script already holds.
  let ksSessionToken = "";
  let ksSessionRenewAt = 0;
  let ksSessionKeyUsed = "";
  let ksSessionSignInPromise = null;
  // Sign-in guard state (see CONFIG.ksSignInBackoffMs).
  // ksSignInRefusedKey: the key the server refused outright. Never re-sent
  // automatically; cleared when the Torn key is saved again or forgotten.
  let ksSignInRefusedKey = "";
  let ksSignInRefusedWord = "";
  let ksSignInRetryAt = 0;
  let ksSignInFailureStreak = 0;
  let ksSignInManualAttempt = false;
  // Bumped when the Torn key is saved again or forgotten, so an answer that
  // was in flight for the old key is ignored.
  let ksSignInEpoch = 0;
  // The wire war id the claim snapshot in sharedClaims was read for.
  let sharedClaimsWireId = "";
  // Own faction member names (Torn id -> name). Memory only, never stored.
  let ksMemberNames = new Map();
  let ksMemberNamesAttemptAt = 0;
  let ksMemberNamesSyncing = false;
  // Hospital report: the end time last reported per target, so one
  // (target, end time) pair is reported at most once.
  const ksReportedHospitalUntil = new Map();
  let ksReportBusy = false;
  // True when the last board read was degraded: every target is unknown.
  let sharedClaimsDegraded = false;
  let sharedSyncing = false;
  let sharedWriteBusy = false;
  let sharedWriteOperationSerial = 0;
  let sharedAuthorityEpoch = 0;
  let sharedRequestSerial = 0;
  let sharedClaimsVerifiedAt = 0;
  let ambiguousOwnServerClaims = false;
  let sharedBackoffUntil = 0;
  let sharedTransportFailureStreak = 0;
  let sharedCredentialRejected = false;
  let sharedClaims = new Map();
  // Targets the shared server sent a claim for that could not be read.
  // We do not know whether they are taken, so they are never shown as free.
  let sharedClaimsUnreadable = new Set();
  let ffCredentialChangeSerial = 0;
  let ffCredentialMutationInProgress = false;
  let fairFightStats = new Map();
  let fairFightSyncing = false;
  let fairFightRequestSerial = 0;
  let fairFightLastFetchAt = 0;
  let fairFightBackoffUntil = 0;
  let tornStatusSyncing = false;
  let tornStatusBackoffUntil = 0;
  let selfPlayerId = "";
  let selfPlayerName = "";
  let selfFactionId = "";
  let opponentFactionId = "";
  let selfIdentitySyncing = false;
  let selfIdentityRequestSerial = 0;
  let tornUserBasicCapability = "unknown"; // unknown | supported | unsupported
  let selfIdentityLastAttemptAt = 0;
  let tornCredentialEpoch = 0;
  let tornCredentialObservationSerial = 0;
  let lastTornKeyValidityObservationSerial = 0;
  let lastTornCapabilityAuthoritySerial = 0;
  let tornCredentialChangeSerial = 0;
  let tornCredentialMutationInProgress = false;
  let storedTornCredentialRejected = false;
  let storedTornCapabilityRejected = false;
  let keyScopeReady = false;
  let apiKeyStorageReady = false;
  let ffCredentialStorageUnresolved = false;
  let tornCredentialStorageUnresolved = false;
  let claimAuthorityStorageUnresolved = false;
  let claimAuthorityEvidenceUnresolved = false;
  let tornTransportFailureStreak = 0;
  let tornStatusRequestSerial = 0;
  let opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
  // The merged members batch for the factions on a foreign war card. VIEW only.
  let viewMembersState = { factionIds: [], members: new Map(), fetchedAt: 0 };
  const lifeCache = new Map();
  const lifeReadAttempts = new Map();
  let lifeReadTimes = [];
  let tornRequestTimes = [];
  let lifeReadPending = null;
  let lifeReadController = null;
  let lifeClaimWaitCancel = null;
  let lifeQueueRunning = false;
  let lifeContextSerial = 0;
  let lifeCapabilityKey = "";
  let lifeProfileMissing = false;
  let lifeKeyFailureCode = null;
  let lifeRetryAfter = 0;
  let ownWarsState = {
    phase: RW_PHASE.UNKNOWN,
    live: false,
    start: 0,
    warId: "",
    opponentFactionId: "",
    selfFactionId: "",
    surfaceWarId: "",
    surfaceOpponentFactionId: "",
    surfaceSerial: 0,
    fetchedAt: 0
  };
  let ownWarsRequestSerial = 0;
  let currentWarSurface = null;
  let warSurfaceSerial = 0;
  let prewarObservation = null;
  const lockedPrewarWarIds = new Set();
  const publicBasicStatusCache = new Map();
  const publicBasicStatusPending = new Map();
  let publicBasicRequestSerial = 0;
  let lastPublicBasicFetchAt = 0;
  // Running intersection of every interval Torn's own responses allow the true
  // clock offset to lie in. Null until the first usable sample.
  let tornClockLowMs = null;
  let tornClockHighMs = null;
  let tornClockBoundsAt = 0;
  // 1.5.174: evidence only, never read by getTornNowMs. M = calls to
  // recordTornWholeSecondMs that actually wrote the bounds. R = how many of
  // those were the nextLow >= nextHigh branch discarding the intersection.
  let tornClockSampleCount = 0;
  let tornClockResetCount = 0;
  // The runtimeGeneration the clock sync burst has already run (or started)
  // for. -1 so generation 0 still runs once.
  let tornClockSyncBurstGeneration = -1;
  let pendingTargetId = "";
  let ownClaimLastConfirmedAt = 0;
  // Claim id the auto-release has already acted on. One attempt per claim:
  // a failed release must not turn into a request every second.
  let autoReleaseAttemptedClaimId = "";
  let sharedStatusHoldUntil = 0;
  let claimFlowState = CLAIM_FLOW_STATE.IDLE;
  let fairFightEverSucceeded = false;
  let quarantinedClaimAcknowledgement = null;

  let sharedStatus = { state: "loading-key", message: "War Room: CHECKING…", count: 0 };
  let tornStatusState = { state: "loading-key", message: "Torn: loading key…", count: 0 };


  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function validTargetId(value) {
    const text = String(value ?? "").trim();
    return /^\d{1,10}$/.test(text) && Number(text) > 0;
  }

  function isValidClaimId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value));
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isInt32(value, { positive = false, nonNegative = false } = {}) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) return false;
    if (positive && value <= 0) return false;
    if (nonNegative && value < 0) return false;
    return true;
  }

  function validateFfscouterKey(value) {
    const key = normalizeText(value);
    return /^[A-Za-z0-9]{16}$/.test(key) ? key : "";
  }

  function validateTornApiKey(value) {
    const key = normalizeText(value);
    return /^[A-Za-z0-9]{16}$/.test(key) ? key : "";
  }

  function rawInjectedPdaTornApiKey() {
    return "";
  }

  function injectedPdaTornApiKey() {
    return pdaTornApiKeyRejected ? "" : rawInjectedPdaTornApiKey();
  }

  function effectiveTornApiKey() {
    if (tornCredentialMutationInProgress) return "";
    return injectedPdaTornApiKey() || validateTornApiKey(storedTornApiKey);
  }

  // True once key storage has been read and there is no Torn key at all --
  // not while a key change is in flight, when the key is only held back.
  function tornApiKeyMissing() {
    return apiKeyStorageReady && !tornCredentialMutationInProgress && !effectiveTornApiKey();
  }

  function emptyOwnWarsState(fetchedAt = 0, surface = null) {
    return {
      phase: RW_PHASE.UNKNOWN,
      live: false,
      start: 0,
      warId: "",
      opponentFactionId: normalizeText(surface?.opponentFactionId),
      selfFactionId: normalizeText(surface?.selfFactionId),
      surfaceWarId: normalizeText(surface?.warId),
      surfaceOpponentFactionId: normalizeText(surface?.opponentFactionId),
      surfaceSerial: Number(surface?.surfaceSerial) || 0,
      fetchedAt: Number(fetchedAt) || 0
    };
  }

  function invalidateOwnWarsState() {
    ownWarsRequestSerial += 1;
    ownWarsState = emptyOwnWarsState();
  }

  function invalidateSharedReads() {
    sharedAuthorityEpoch += 1;
    sharedRequestSerial += 1;
    sharedSyncing = false;
    sharedClaimsVerifiedAt = 0;
  }

  function invalidateTornCredentialRequests() {
    resetLifeState();
    tornCredentialEpoch += 1;
    publicBasicRequestSerial += 1;
    selfIdentityRequestSerial += 1;
    tornStatusRequestSerial += 1;
    selfIdentitySyncing = false;
    tornStatusSyncing = false;
    invalidateOwnWarsState();
    keyScopeReady = false;
    selfPlayerId = "";
    selfPlayerName = "";
    selfFactionId = "";
    opponentFactionId = "";
    tornUserBasicCapability = "unknown";
    selfIdentityLastAttemptAt = 0;
    tornStatusBackoffUntil = 0;
    tornTransportFailureStreak = 0;
    opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
    currentWarSurface = null;
    prewarObservation = null;
    publicBasicStatusPending.clear();
    publicBasicStatusCache.clear();
  }

  function isPdaTornKeyRejectedError(body) {
    const code = Number(body?.error?.code ?? body?.code);
    const message = normalizeText(body?.error?.error ?? body?.error ?? "");
    return code === 2 || /^incorrect key$/i.test(message);
  }

  function isTornCapabilityRejectedError(body) {
    return Number(body?.error?.code ?? body?.code) === 16;
  }

  function nowMs() { return Date.now(); }
  function nowSeconds() { return Math.floor(getTornNowMs() / 1000); }
  function wait(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }

  // Torn's HTTP Date header is the server's own clock and comes back with every
  // response the script already makes. Sampling it here is what lets VIEW mode
  // -- which never fetches own wars -- run on Torn time instead of the PC's.
  function tornDateHeaderMs(headers) {
    const text = String(headers ?? "");
    if (!text) return null;
    const match = /^[ \t]*date[ \t]*:[ \t]*(.+?)[ \t]*$/im.exec(text);
    if (!match) return null;
    const parsed = Date.parse(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  // A reply replayed from a cache carries an old Date and would drag the offset
  // backwards, so anything with a non-zero Age is refused.
  function tornResponseIsFresh(headers) {
    const match = /^[ \t]*age[ \t]*:[ \t]*(\d+)[ \t]*$/im.exec(String(headers ?? ""));
    if (!match) return true;
    return Number(match[1]) === 0;
  }

  // A response that names a whole server second is not a guess about the clock,
  // it is a constraint on it. The second S was current at some instant inside
  // the round trip, so with offset = tornNow - pcNow:
  //
  //     offset  in  [ S - endedAt , S + 1000 - startedAt )
  //
  // Every response gives another such interval and the truth lies in all of
  // them, so the running intersection can only narrow and can never exclude the
  // real offset. There is no rounding step left to get wrong.
  function recordTornWholeSecondMs(secondStartMs, startedAt, endedAt) {
    if (!Number.isFinite(secondStartMs) || secondStartMs <= 0) return;
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return;
    if (endedAt < startedAt) return;
    // A round trip this long says almost nothing and may itself be stale.
    if (endedAt - startedAt > CONFIG.tornClockMaxRoundTripMs) return;

    const low = secondStartMs - endedAt;
    const high = secondStartMs + 1000 - startedAt;

    if (!Number.isFinite(tornClockLowMs) || !Number.isFinite(tornClockHighMs)) {
      tornClockLowMs = low;
      tornClockHighMs = high;
      tornClockBoundsAt = endedAt;
      return;
    }

    // Two crystals drift apart. Let the kept bounds relax by that much before
    // intersecting, so a long session does not slowly contradict itself.
    const age = Math.max(0, endedAt - tornClockBoundsAt);
    const slack = (age * CONFIG.tornClockDriftPpm) / 1e6;
    const nextLow = Math.max(low, tornClockLowMs - slack);
    const nextHigh = Math.min(high, tornClockHighMs + slack);

    if (nextLow >= nextHigh) {
      // Contradiction: the PC clock stepped, or an old reply slipped through.
      // The newest evidence wins outright rather than poisoning the running set.
      tornClockLowMs = low;
      tornClockHighMs = high;
      tornClockBoundsAt = endedAt;
      return;
    }

    tornClockLowMs = nextLow;
    tornClockHighMs = nextHigh;
    tornClockBoundsAt = endedAt;
  }

  // 1.5.174 observability only: classifies what a recordTornWholeSecondMs
  // call did, purely from tornClockLowMs/tornClockHighMs/tornClockBoundsAt
  // before and after the real, untouched call, plus the same
  // startedAt/endedAt/secondStartMs it was given and the same
  // CONFIG.tornClockDriftPpm slack formula recordTornWholeSecondMs documents
  // on itself. Never writes tornClockLowMs/tornClockHighMs -- read-only.
  // Must be kept in sync with recordTornWholeSecondMs's own
  // nextLow >= nextHigh condition if that function is ever revised.
  function trackClockBoundsWrite(secondStartMs, startedAt, endedAt, invoke) {
    const beforeLow = tornClockLowMs;
    const beforeHigh = tornClockHighMs;
    const beforeBoundsAt = tornClockBoundsAt;
    invoke();
    if (tornClockLowMs === beforeLow && tornClockHighMs === beforeHigh && tornClockBoundsAt === beforeBoundsAt) return;
    tornClockSampleCount += 1;
    if (!Number.isFinite(beforeLow) || !Number.isFinite(beforeHigh)) return;
    const rawLow = secondStartMs - endedAt;
    const rawHigh = secondStartMs + 1000 - startedAt;
    const age = Math.max(0, endedAt - beforeBoundsAt);
    const slack = (age * CONFIG.tornClockDriftPpm) / 1e6;
    const wouldBeLow = Math.max(rawLow, beforeLow - slack);
    const wouldBeHigh = Math.min(rawHigh, beforeHigh + slack);
    if (wouldBeLow >= wouldBeHigh) tornClockResetCount += 1;
  }

  // 1.5.174 observability only: wraps recordTornClockOffset (byte-identical,
  // untouched) so its writes are also tracked. recordTornClockOffset's own
  // source cannot change, so this wraps its three existing call sites plus
  // the clock sync burst's own-war call from the outside instead.
  function trackedRecordTornClockOffset(result, body) {
    trackClockBoundsWrite(
      Number(body?.timestamp) * 1000,
      Number(result?.startedAt),
      Number(result?.endedAt),
      () => recordTornClockOffset(result, body)
    );
  }

  function recordTornClockFromHeaders(result) {
    if (!result?.ok || !tornResponseIsFresh(result.headers)) return;
    const serverMs = tornDateHeaderMs(result.headers);
    if (serverMs === null) return;
    const startedAt = Number(result.startedAt);
    const endedAt = Number(result.endedAt);
    // Date is a whole second, so the value is that second's own start.
    trackClockBoundsWrite(serverMs, startedAt, endedAt, () => recordTornWholeSecondMs(serverMs, startedAt, endedAt));
  }

  // "bounded" = PC's bound-clock intersection, "pda" = Torn PDA's own clock,
  // "device" = the phone's clock with no correction at all. Shown in the panel.
  let tornClockSource = "device";

  // The low edge of the interval, never the middle. The middle is unbiased but
  // wrong in both directions, and one direction is unacceptable: a clock that
  // runs ahead makes the cell show less time than there is and somebody attacks
  // early. The low edge puts our clock as far behind Torn as the evidence
  // permits, so the remaining time reads as high as the evidence permits. The
  // cell can read high while the interval is still wide. It can never read low.
  function getTornNowMs() {
    if (Number.isFinite(tornClockLowMs)) { tornClockSource = "bounded"; return nowMs() + tornClockLowMs; }
    if (typeof window.getCurrentTimestamp === "function") {
      try {
        const value = window.getCurrentTimestamp();
        if (Number.isFinite(value)) { tornClockSource = "pda"; return value; }
      } catch {}
    }
    tornClockSource = "device";
    return nowMs();
  }

  function tornClockSourceLabel() {
    if (tornClockSource === "bounded") {
      const widthMs = Math.round(tornClockHighMs - tornClockLowMs);
      return `Torn bounded clock (±${widthMs} ms · ${tornClockSampleCount} samples · ${tornClockResetCount} resets)`;
    }
    if (tornClockSource === "pda") return "Torn PDA clock";
    return "device clock — UNSYNCED";
  }

  function formatCountdown(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function isPageVisible() {
    return !document.hidden && document.visibilityState === "visible";
  }

  function hasRecentTrustedInteraction() {
    return nowMs() - lastTrustedInteractionAt <= CONFIG.directInteractionIdleMs;
  }

  function initialFocusState() {
    if (!isPageVisible()) return false;
    try { if (typeof document.hasFocus === "function" && document.hasFocus()) return true; } catch {}
    try { return !!window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches; } catch { return false; }
  }

  function isRankedWarRoute(value = location.href) {
    try {
      const url = new URL(value, location.href);
      const hashPath = String(url.hash || "")
        .slice(1)
        .split("?", 1)[0]
        .replace(/\/+$/, "");
      return (
        /\/factions\.php$/i.test(url.pathname) &&
        url.searchParams.get("step") === "your" &&
        url.searchParams.get("type") === "1" &&
        hashPath === "/war/rank"
      );
    } catch { return false; }
  }

  // Another faction's Ranked War, reached from its public profile. Rendering is
  // allowed here so the column can be inspected without an own war -- which is
  // most of the time. Authority is not: viewOnlyMode() gates every write and
  // isViewModePermittedRequest gates every request at the transport.
  //
  // The public faction id of the profile Ranked War page currently open, or "".
  // Every VIEW request is pinned to this value, so VIEW can never be pointed at
  // a faction whose page the user is not actually looking at.
  function viewedFactionIdFromRoute(value = location.href) {
    try {
      const url = new URL(value, location.href);
      const hashPath = String(url.hash || "").slice(1).split("?", 1)[0].replace(/\/+$/, "");
      if (!/\/factions\.php$/i.test(url.pathname)) return "";
      if (url.searchParams.get("step") !== "profile" || hashPath !== "/war/rank") return "";
      const id = String(url.searchParams.get("ID") || "").trim();
      return validTargetId(id) ? String(Number(id)) : "";
    } catch { return ""; }
  }

  function isForeignRankedWarRoute(value = location.href) {
    return Boolean(viewedFactionIdFromRoute(value));
  }

  function isAnyRankedWarRoute(value = location.href) {
    return isRankedWarRoute(value) || isForeignRankedWarRoute(value);
  }

  // Fail closed. Anything that is not the owner's own Ranked War route is
  // read-only, including an unparseable or partially matching route.
  function viewOnlyMode() {
    return !isRankedWarRoute();
  }

  function isRuntimeContextEligible() {
    return !destroyed && isPageVisible() && windowFocused && isAnyRankedWarRoute();
  }

  function isRuntimeEligible() {
    return isRuntimeContextEligible() && Boolean(canonicalPdaRankedWarSurface());
  }

  function isWarPanelPresent() {
    return Boolean(canonicalPdaRankedWarSurface());
  }

  function registerTrustedInteraction(event = null) {
    if (event && event.isTrusted !== true) return;
    lastTrustedInteractionAt = nowMs();
    if (!windowFocused && initialFocusState() && hasRecentTrustedInteraction()) windowFocused = true;
    if (!runtimeActive) reconcileLifecycle({ structural: true });
  }

  // ---------------------------------------------------------------------------
  // Own claim persistence.
  // ---------------------------------------------------------------------------

  // 1.5.186. The war id on the wire an own record may carry: exactly what
  // ksServerPath() accepts in this build, anything else is "". A record
  // without one (saved by 1.5.185 or older) is still a valid record.
  function ownClaimWireId(value) {
    if (typeof value !== "string") return "";
    try { ksServerPath("claims", value); return value; } catch { return ""; }
  }

  function sanitizeOwnClaim(raw, { allowExpired = false } = {}) {
    const claimId = normalizeText(raw?.claimId);
    const targetId = String(raw?.targetId ?? "").trim();
    const claimerPlayerId = String(raw?.claimerPlayerId ?? "").trim();
    const claimerName = normalizeText(raw?.claimerName) || "You";
    const expiresAt = Number(raw?.expiresAt);
    const cleanupRequired = raw?.cleanupRequired === true;
    const createdLocalAt = Number(raw?.createdLocalAt) || 0;
    const wireId = ownClaimWireId(raw?.wireId);
    if (!isValidClaimId(claimId) || !validTargetId(targetId)) return null;
    if (claimerPlayerId && !/^\d+$/.test(claimerPlayerId)) return null;
    if (!Number.isFinite(expiresAt) || (!allowExpired && expiresAt <= nowSeconds())) return null;
    return { claimId, targetId, claimerPlayerId, claimerName, expiresAt, cleanupRequired, createdLocalAt, wireId };
  }

  function loadOwnClaimState() {
    try {
      const raw = localStorage.getItem(SCRIPT.ownClaimStorageKey);
      if (raw === null) return { ready: true, value: null };
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return { ready: false, value: null }; }
      const value = sanitizeOwnClaim(parsed);
      if (value) return { ready: true, value };
      const expired = sanitizeOwnClaim(parsed, { allowExpired: true });
      if (expired && typeof parsed?.expiresAt === "number" && expired.expiresAt <= nowSeconds()) {
        localStorage.removeItem(SCRIPT.ownClaimStorageKey);
        return {
          ready: localStorage.getItem(SCRIPT.ownClaimStorageKey) === null,
          value: null
        };
      }
      return { ready: false, value: null };
    } catch {
      return { ready: false, value: null };
    }
  }

  const ownClaimLoadState = loadOwnClaimState();
  let ownSharedClaim = ownClaimLoadState.value;

  function saveOwnClaim(value) {
    const explicitDelete = value === null;
    const nextClaim = explicitDelete ? null : sanitizeOwnClaim(value);
    if (!explicitDelete && !nextClaim) {
      claimAuthorityStorageUnresolved = true;
      claimAuthorityEvidenceUnresolved = true;
      enforceFfCredentialLock();
      return false;
    }
    ownSharedClaim = nextClaim;
    let persisted = false;
    try {
      if (ownSharedClaim) {
        const serialized = JSON.stringify(ownSharedClaim);
        localStorage.setItem(SCRIPT.ownClaimStorageKey, serialized);
        persisted = localStorage.getItem(SCRIPT.ownClaimStorageKey) === serialized;
      } else {
        localStorage.removeItem(SCRIPT.ownClaimStorageKey);
        persisted = localStorage.getItem(SCRIPT.ownClaimStorageKey) === null;
      }
    } catch {}
    if (!persisted) {
      claimAuthorityStorageUnresolved = true;
      claimAuthorityEvidenceUnresolved = true;
    }
    if (ownSharedClaim || claimAuthorityStorageUnresolved) enforceFfCredentialLock();
    return persisted;
  }

  function claimAuthorityStorageWritable() {
    const probe = `${nowMs()}:${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(SCRIPT.claimStorageProbeKey, probe);
      const written = localStorage.getItem(SCRIPT.claimStorageProbeKey) === probe;
      localStorage.removeItem(SCRIPT.claimStorageProbeKey);
      const writable = written && localStorage.getItem(SCRIPT.claimStorageProbeKey) === null;
      if (!writable) claimAuthorityStorageUnresolved = true;
      return writable;
    } catch {
      try { localStorage.removeItem(SCRIPT.claimStorageProbeKey); } catch {}
      claimAuthorityStorageUnresolved = true;
      return false;
    }
  }

  function currentOwnClaim() {
    if (!ownSharedClaim) return null;
    if (Number(ownSharedClaim.expiresAt) <= nowSeconds()) {
      saveOwnClaim(null);
      ownClaimLastConfirmedAt = 0;
      return null;
    }
    return ownSharedClaim;
  }

  function sanitizeClaimQuarantine(raw, { allowExpired = false } = {}) {
    const targetId = String(raw?.targetId ?? "").trim();
    const claimId = normalizeText(raw?.claimId);
    const expectedSelfPlayerId = String(raw?.expectedSelfPlayerId ?? "").trim();
    const expiresAt = raw?.expiresAt == null ? null : Number(raw.expiresAt);
    const createdLocalAt = Number(raw?.createdLocalAt) || 0;
    if (!validTargetId(targetId) || !validTargetId(expectedSelfPlayerId)) return null;
    if (claimId && !isValidClaimId(claimId)) return null;
    if (
      expiresAt !== null &&
      (!Number.isFinite(expiresAt) || (!allowExpired && expiresAt <= nowSeconds()))
    ) return null;
    return { targetId, claimId, expectedSelfPlayerId, expiresAt, createdLocalAt };
  }

  function loadClaimQuarantineState() {
    try {
      const raw = localStorage.getItem(SCRIPT.claimQuarantineStorageKey);
      if (raw === null) return { ready: true, value: null };
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return { ready: false, value: null }; }
      const value = sanitizeClaimQuarantine(parsed);
      if (value) return { ready: true, value };
      const expired = sanitizeClaimQuarantine(parsed, { allowExpired: true });
      if (expired && typeof parsed?.expiresAt === "number" && expired.expiresAt <= nowSeconds()) {
        localStorage.removeItem(SCRIPT.claimQuarantineStorageKey);
        return {
          ready: localStorage.getItem(SCRIPT.claimQuarantineStorageKey) === null,
          value: null
        };
      }
      return { ready: false, value: null };
    } catch {
      return { ready: false, value: null };
    }
  }

  function saveClaimQuarantine(value) {
    const explicitDelete = value === null;
    const nextQuarantine = explicitDelete ? null : sanitizeClaimQuarantine(value);
    if (!explicitDelete && !nextQuarantine) {
      claimAuthorityStorageUnresolved = true;
      claimAuthorityEvidenceUnresolved = true;
      enforceFfCredentialLock();
      return false;
    }
    quarantinedClaimAcknowledgement = nextQuarantine;
    let persisted = false;
    try {
      if (quarantinedClaimAcknowledgement) {
        const serialized = JSON.stringify(quarantinedClaimAcknowledgement);
        localStorage.setItem(SCRIPT.claimQuarantineStorageKey, serialized);
        persisted = localStorage.getItem(SCRIPT.claimQuarantineStorageKey) === serialized;
      } else {
        localStorage.removeItem(SCRIPT.claimQuarantineStorageKey);
        persisted = localStorage.getItem(SCRIPT.claimQuarantineStorageKey) === null;
      }
    } catch {}
    if (!persisted) {
      claimAuthorityStorageUnresolved = true;
      claimAuthorityEvidenceUnresolved = true;
    }
    if (quarantinedClaimAcknowledgement || claimAuthorityStorageUnresolved) enforceFfCredentialLock();
    return persisted;
  }

  function currentClaimQuarantine() {
    const value = quarantinedClaimAcknowledgement;
    if (!value) return null;
    if (
      typeof value.expiresAt === "number" &&
      Number.isFinite(value.expiresAt) &&
      value.expiresAt <= nowSeconds()
    ) {
      saveClaimQuarantine(null);
      return null;
    }
    return value;
  }

  function captureCredentialRecoveryEvidence() {
    const own = currentOwnClaim();
    const quarantine = currentClaimQuarantine();
    return {
      own: own ? {
        claimId: own.claimId,
        targetId: own.targetId,
        claimerPlayerId: own.claimerPlayerId,
        claimerName: own.claimerName,
        expiresAt: own.expiresAt,
        cleanupRequired: own.cleanupRequired,
        createdLocalAt: own.createdLocalAt
      } : null,
      quarantine: quarantine ? {
        targetId: quarantine.targetId,
        claimId: quarantine.claimId,
        expectedSelfPlayerId: quarantine.expectedSelfPlayerId,
        expiresAt: quarantine.expiresAt,
        createdLocalAt: quarantine.createdLocalAt
      } : null
    };
  }

  function credentialRecoveryEvidenceFingerprint(evidence = captureCredentialRecoveryEvidence()) {
    return JSON.stringify(evidence);
  }

  function credentialRecoveryEvidenceActive(evidence = captureCredentialRecoveryEvidence()) {
    return Boolean(evidence.own || evidence.quarantine);
  }

  function credentialRecoveryExpectedPlayerId(evidence) {
    const ids = [];
    if (evidence?.own) {
      if (!validTargetId(evidence.own.claimerPlayerId)) return null;
      ids.push(String(evidence.own.claimerPlayerId));
    }
    if (evidence?.quarantine) {
      if (!validTargetId(evidence.quarantine.expectedSelfPlayerId)) return null;
      ids.push(String(evidence.quarantine.expectedSelfPlayerId));
    }
    if (!ids.length) return "";
    return new Set(ids).size === 1 ? ids[0] : null;
  }

  function credentialRecoveryChangeAvailable() {
    const evidence = captureCredentialRecoveryEvidence();
    return Boolean(
      (evidence.own || evidence.quarantine) &&
      credentialRecoveryExpectedPlayerId(evidence) &&
      !claimAuthorityEvidenceUnresolved &&
      !sharedWriteBusy &&
      !ffCredentialMutationInProgress &&
      !tornCredentialMutationInProgress
    );
  }

  const claimQuarantineLoadState = loadClaimQuarantineState();
  quarantinedClaimAcknowledgement = claimQuarantineLoadState.value;
  claimAuthorityEvidenceUnresolved =
    !ownClaimLoadState.ready || !claimQuarantineLoadState.ready;
  claimAuthorityStorageUnresolved =
    claimAuthorityEvidenceUnresolved || !claimAuthorityStorageWritable();

  function ffCredentialChangeBusy() {
    return ffCredentialMutationInProgress;
  }

  function ffCredentialClaimLockActive() {
    return Boolean(currentOwnClaim()) || Boolean(currentClaimQuarantine()) ||
      claimAuthorityStorageUnresolved || ambiguousOwnServerClaims || sharedWriteBusy;
  }

  function ffCredentialOwnershipProofCurrent() {
    if (!sharedApiKey) return true;
    return validTargetId(selfPlayerId) && sharedClaimsVerifiedAt > 0 &&
      nowMs() - sharedClaimsVerifiedAt <= CONFIG.sharedPollMs * 2 &&
      activeSharedClaimsForClaimer(selfPlayerId).length === 0;
  }

  function newClaimStorageAuthorityReady() {
    return apiKeyStorageReady && !ffCredentialStorageUnresolved &&
      !tornCredentialStorageUnresolved && !claimAuthorityStorageUnresolved;
  }

  // Key-field lock. Cause, measured on the owner's phone 2026-09-22: once the
  // claim board is read with the Torn key, the FFScouter key field locked
  // (OWNERSHIP-PROOF-STALE) for as long as the Torn key was missing, and the
  // Torn key field locked (NO-FF-KEY) for as long as the FF key was missing. A
  // field that is disabled while it has focus loses it, and on a phone that
  // closes the keyboard, so a new member could set neither key.
  //
  // The two evaluations below return WHICH condition decided, so the line
  // under the field can say why. With no own claim and no quarantine record
  // there is no DIBS ownership to protect, so OWNERSHIP-PROOF-STALE on the FF
  // key and NO-FF-KEY on the Torn key do not apply; every other lock ground
  // is unchanged. No new way to take or release a claim.
  function lockVerdict(active, reason, evidence) {
    return { active, reason: active ? reason : "", evidence: evidence || null };
  }

  function evaluateFfCredentialExternalLock() {
    if (!apiKeyStorageReady) return lockVerdict(true, "STORAGE-NOT-READY");
    if (ffCredentialStorageUnresolved) return lockVerdict(true, "FF-STORAGE-UNRESOLVED");
    if (claimAuthorityStorageUnresolved) return lockVerdict(true, "CLAIM-STORAGE-UNRESOLVED");
    if (sharedWriteBusy) return lockVerdict(true, "WRITE-BUSY");
    if (ambiguousOwnServerClaims) return lockVerdict(true, "AMBIGUOUS-CLAIMS");
    if (tornCredentialMutationInProgress) return lockVerdict(true, "TORN-KEY-BUSY");
    const recoveryEvidence = captureCredentialRecoveryEvidence();
    if (credentialRecoveryEvidenceActive(recoveryEvidence)) return lockVerdict(true, "RECOVERY-ACTIVE", recoveryEvidence);
    if (!sharedApiKey || !credentialRecoveryEvidenceActive(recoveryEvidence)) return lockVerdict(false, "", recoveryEvidence);
    if (!sharedCredentialRejected && !ffCredentialOwnershipProofCurrent()) {
      return lockVerdict(true, "OWNERSHIP-PROOF-STALE", recoveryEvidence);
    }
    return lockVerdict(false, "", recoveryEvidence);
  }

  function ffCredentialExternalLockActive() {
    return evaluateFfCredentialExternalLock().active;
  }

  function evaluateTornCredentialExternalLock() {
    if (!apiKeyStorageReady) return lockVerdict(true, "STORAGE-NOT-READY");
    if (tornCredentialStorageUnresolved) return lockVerdict(true, "TORN-STORAGE-UNRESOLVED");
    if (sharedWriteBusy) return lockVerdict(true, "WRITE-BUSY");
    if (ffCredentialMutationInProgress) return lockVerdict(true, "FF-KEY-BUSY");
    if (claimAuthorityEvidenceUnresolved) return lockVerdict(true, "AUTH-EVIDENCE-UNRESOLVED");
    const recoveryEvidence = captureCredentialRecoveryEvidence();
    if (recoveryEvidence.own?.cleanupRequired === true) return lockVerdict(true, "CLEANUP-REQUIRED", recoveryEvidence);
    if (credentialRecoveryEvidenceActive(recoveryEvidence)) {
      return lockVerdict(!credentialRecoveryChangeAvailable(), "RECOVERY-ACTIVE", recoveryEvidence);
    }
    if (ffCredentialStorageUnresolved) return lockVerdict(true, "FF-STORAGE-UNRESOLVED", recoveryEvidence);
    if (claimAuthorityStorageUnresolved) return lockVerdict(true, "CLAIM-STORAGE-UNRESOLVED", recoveryEvidence);
    if (ambiguousOwnServerClaims) return lockVerdict(true, "AMBIGUOUS-CLAIMS", recoveryEvidence);
    const currentKey = effectiveTornApiKey();
    if (!currentKey) return lockVerdict(false, "", recoveryEvidence);
    const rejectedStoredKey =
      (storedTornCredentialRejected || storedTornCapabilityRejected) &&
      currentKey === validateTornApiKey(storedTornApiKey);
    if (rejectedStoredKey) return lockVerdict(false, "", recoveryEvidence);
    if (!sharedApiKey) return lockVerdict(credentialRecoveryEvidenceActive(recoveryEvidence), "NO-FF-KEY", recoveryEvidence);
    // R4. Without an own claim and without a quarantine record there is no
    // DIBS ownership to protect, so a stale ownership check does not lock the
    // Torn key. (With a record this point is never reached: see above.)
    return lockVerdict(
      credentialRecoveryEvidenceActive(recoveryEvidence) && !ffCredentialOwnershipProofCurrent(),
      "OWNERSHIP-PROOF-STALE",
      recoveryEvidence
    );
  }

  function tornCredentialExternalLockActive() {
    return evaluateTornCredentialExternalLock().active;
  }

  function ffCredentialForgetLockActive() {
    return ffCredentialExternalLockActive() || ffCredentialClaimLockActive() ||
      credentialRecoveryEvidenceActive();
  }

  function tornCredentialForgetLockActive() {
    return !apiKeyStorageReady || tornCredentialStorageUnresolved ||
      ffCredentialStorageUnresolved || claimAuthorityStorageUnresolved ||
      claimAuthorityEvidenceUnresolved || sharedWriteBusy ||
      ffCredentialMutationInProgress || tornCredentialMutationInProgress ||
      // R4. A stale ownership check locks only together with an own claim or a
      // quarantine record, and either of those already locks on its own here.
      ffCredentialClaimLockActive() || credentialRecoveryEvidenceActive();
  }

  // Key setup A: a focused key field is never disabled. The lock is applied
  // when the field loses focus by itself (handleCredentialInputFocusOut), and
  // it acts on Save, so a member can always type but not always save.
  function credentialInputHasFocus(input) {
    return input instanceof HTMLInputElement && input.getRootNode().activeElement === input;
  }

  function setCredentialInputDisabled(input, disabled) {
    if (!(input instanceof HTMLInputElement)) return;
    input.disabled = Boolean(disabled) && !credentialInputHasFocus(input);
  }

  function closeCredentialEditorUnlessFocused(role) {
    const editor = presentationShadow()?.querySelector("[data-role='" + role + "']");
    if (!credentialInputHasFocus(editor?.querySelector("input"))) editor?.classList.remove("open");
  }

  function handleCredentialInputFocusOut(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.role === "key-input") {
      setCredentialInputDisabled(input, ffCredentialExternalLockActive() || ffCredentialChangeBusy());
    } else if (input.dataset.role === "torn-key-input") {
      setCredentialInputDisabled(input, tornCredentialExternalLockActive() || tornCredentialMutationInProgress);
    }
  }

  function credentialLockMessage(verdict, busy = false) {
    if (!verdict.active) return busy ? "Please wait for the key change to finish." : "";
    switch (verdict.reason) {
      case "STORAGE-NOT-READY": return "Please wait while secure key storage opens.";
      case "FF-STORAGE-UNRESOLVED": return "The saved FFScouter key could not be read or secured. Please try again after secure storage is available.";
      case "TORN-STORAGE-UNRESOLVED": return "The saved Torn API key could not be read or secured. Please try again after secure storage is available.";
      case "CLAIM-STORAGE-UNRESOLVED": return "DIBS storage could not be read or secured. Please wait until it is available.";
      case "WRITE-BUSY": return "Please wait for the current DIBS change to finish.";
      case "AMBIGUOUS-CLAIMS": return "More than one DIBS claim may belong to you. Please resolve them before changing this key.";
      case "FF-KEY-BUSY": return "Please wait for the FFScouter key change to finish.";
      case "TORN-KEY-BUSY": return "Please wait for the Torn API key change to finish.";
      case "AUTH-EVIDENCE-UNRESOLVED": return "Your saved DIBS ownership could not be checked. Please wait until it can be checked safely.";
      case "CLEANUP-REQUIRED": return "Your previous DIBS claim needs to be resolved before this key can change.";
      case "RECOVERY-ACTIVE": return "A saved DIBS claim needs recovery. Please resolve it before changing this key.";
      case "NO-FF-KEY": return "Set an FFScouter key so your saved DIBS ownership can be checked.";
      case "OWNERSHIP-PROOF-STALE": return "Your DIBS ownership check is out of date. Please wait for a fresh check before changing this key.";
      default: return "This key cannot change safely yet. Please try again when the current operation has finished.";
    }
  }

  function renderCredentialLockMessage(node, verdict, busy) {
    if (!node) return;
    const message = credentialLockMessage(verdict, busy);
    if (node.textContent !== message) node.textContent = message;
    node.hidden = !message;
  }

  function closeFfCredentialEditor() {
    presentationShadow()?.querySelector("[data-role='key-editor']")?.classList.remove("open");
  }

  function enforceFfCredentialLock() {
    if (!ffCredentialExternalLockActive()) return false;
    closeCredentialEditorUnlessFocused("key-editor");
    updatePanel();
    return true;
  }

  function beginFfCredentialEdit() {
    registerTrustedInteraction();
    const editor = presentationShadow()?.querySelector("[data-role='key-editor']");
    editor?.classList.add("open");
    const input = editor?.querySelector("input");
    if (input instanceof HTMLInputElement) {
      input.disabled = false;
      input.focus();
    }
    updatePanel();
    return true;
  }

  function closeTornCredentialEditor() {
    presentationShadow()?.querySelector("[data-role='torn-key-editor']")?.classList.remove("open");
  }

  function beginTornCredentialEdit() {
    registerTrustedInteraction();
    if (injectedPdaTornApiKey()) {
      closeCredentialEditorUnlessFocused("torn-key-editor");
      return false;
    }
    const editor = presentationShadow()?.querySelector("[data-role='torn-key-editor']");
    editor?.classList.add("open");
    const input = editor?.querySelector("input");
    if (input instanceof HTMLInputElement) {
      input.disabled = false;
      input.focus();
    }
    updatePanel();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Secure key vault
  // ---------------------------------------------------------------------------

  function openSecureVault() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window) || !window.crypto?.subtle) return reject(new Error("Secure browser storage unavailable"));
      const request = indexedDB.open(SCRIPT.secureVaultDbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SCRIPT.secureVaultStoreName)) request.result.createObjectStore(SCRIPT.secureVaultStoreName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Secure storage open failed"));
      request.onblocked = () => reject(new Error("Secure storage upgrade blocked"));
    });
  }

  function vaultGet(db, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SCRIPT.secureVaultStoreName, "readonly");
      const req = tx.objectStore(SCRIPT.secureVaultStoreName).get(id);
      let value;
      req.onsuccess = () => { value = req.result; };
      req.onerror = () => reject(req.error || new Error("Secure storage read failed"));
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error || new Error("Secure storage aborted"));
    });
  }

  function vaultPut(db, id, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SCRIPT.secureVaultStoreName, "readwrite");
      try { tx.objectStore(SCRIPT.secureVaultStoreName).put(value, id); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Secure storage write failed"));
      tx.onabort = () => reject(tx.error || new Error("Secure storage aborted"));
    });
  }

  function vaultDelete(db, ids) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SCRIPT.secureVaultStoreName, "readwrite");
      const store = tx.objectStore(SCRIPT.secureVaultStoreName);
      try { for (const id of (Array.isArray(ids) ? ids : [ids])) store.delete(id); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("Secure storage delete failed"));
      tx.onabort = () => reject(tx.error || new Error("Secure storage aborted"));
    });
  }

  async function getOrCreateVaultCryptoKey(db) {
    const existing = await vaultGet(db, SCRIPT.secureVaultCryptoKeyId);
    if (typeof CryptoKey !== "undefined" && existing instanceof CryptoKey) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await vaultPut(db, SCRIPT.secureVaultCryptoKeyId, key);
    return key;
  }

  async function saveCipher(id, value) {
    let db = null;
    try {
      db = await openSecureVault();
      const cryptoKey = await getOrCreateVaultCryptoKey(db);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(value);
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
      await vaultPut(db, id, { v: 1, iv: Array.from(iv), ciphertext });
      return true;
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }

  async function loadCipher(id, validator) {
    let db = null;
    try {
      db = await openSecureVault();
      const payload = await vaultGet(db, id);
      const key = await vaultGet(db, SCRIPT.secureVaultCryptoKeyId);
      if (!payload || payload.v !== 1 || !Array.isArray(payload.iv) || !payload.ciphertext) return "";
      if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return "";
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(payload.iv) }, key, payload.ciphertext);
      return validator(new TextDecoder().decode(plaintext));
    } catch {
      return "";
    } finally {
      db?.close();
    }
  }

  async function loadCipherState(id, validator) {
    let db = null;
    try {
      db = await openSecureVault();
      const payload = await vaultGet(db, id);
      if (payload === undefined || payload === null) return { ready: true, key: "" };
      const cryptoKey = await vaultGet(db, SCRIPT.secureVaultCryptoKeyId);
      if (
        !payload || payload.v !== 1 || !Array.isArray(payload.iv) || !payload.ciphertext ||
        typeof CryptoKey === "undefined" || !(cryptoKey instanceof CryptoKey)
      ) return { ready: false, key: "" };
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
        cryptoKey,
        payload.ciphertext
      );
      const key = validator(new TextDecoder().decode(plaintext));
      return key ? { ready: true, key } : { ready: false, key: "" };
    } catch {
      return { ready: false, key: "" };
    } finally {
      db?.close();
    }
  }

  async function deleteCipher(id) {
    let db = null;
    try {
      db = await openSecureVault();
      return await vaultDelete(db, [id]);
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }

  const saveSecureApiKey = key => saveCipher(SCRIPT.secureVaultCipherId, validateFfscouterKey(key));
  const deleteSecureApiKey = () => deleteCipher(SCRIPT.secureVaultCipherId);
  const saveSecureApiKeyRollback = key => saveCipher(SCRIPT.secureVaultRollbackCipherId, validateFfscouterKey(key));
  const loadSecureApiKeyRollback = () => loadCipher(SCRIPT.secureVaultRollbackCipherId, validateFfscouterKey);
  const deleteSecureApiKeyRollback = () => deleteCipher(SCRIPT.secureVaultRollbackCipherId);

  function readSharedApiChangeJournal() {
    try {
      const raw = localStorage.getItem(SCRIPT.sharedApiChangeJournalKey);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && typeof parsed.oldPresent === "boolean") {
        return { valid: true, oldPresent: parsed.oldPresent };
      }
      return { valid: false, oldPresent: false };
    } catch {
      return { valid: false, oldPresent: false };
    }
  }

  function writeSharedApiChangeJournal(oldPresent) {
    try {
      const value = JSON.stringify({ version: 1, oldPresent: oldPresent === true });
      localStorage.setItem(SCRIPT.sharedApiChangeJournalKey, value);
      return localStorage.getItem(SCRIPT.sharedApiChangeJournalKey) === value;
    } catch {
      return false;
    }
  }

  function clearSharedApiChangeJournal() {
    try {
      localStorage.removeItem(SCRIPT.sharedApiChangeJournalKey);
      return localStorage.getItem(SCRIPT.sharedApiChangeJournalKey) === null;
    } catch {
      return false;
    }
  }

  async function prepareSharedApiChangeJournal(oldKey, isCurrent) {
    if (!isCurrent()) {
      const cleaned = await deleteSecureApiKeyRollback();
      if (!cleaned) ffCredentialStorageUnresolved = true;
      return false;
    }
    const rollbackReady = oldKey
      ? await saveSecureApiKeyRollback(oldKey)
      : await deleteSecureApiKeyRollback();
    if (!rollbackReady) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    if (!isCurrent()) {
      const cleaned = await deleteSecureApiKeyRollback();
      if (!cleaned) ffCredentialStorageUnresolved = true;
      return false;
    }
    const written = writeSharedApiChangeJournal(Boolean(oldKey));
    if (!written) {
      const cleaned = await deleteSecureApiKeyRollback();
      ffCredentialStorageUnresolved = true;
      if (!cleaned) enforceFfCredentialLock();
      return false;
    }
    return true;
  }

  async function restoreSharedApiChangeJournal() {
    const journal = readSharedApiChangeJournal();
    if (journal === null) {
      const cleaned = await deleteSecureApiKeyRollback();
      if (!cleaned) ffCredentialStorageUnresolved = true;
      return cleaned;
    }
    if (!journal.valid) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    if (journal.oldPresent) {
      const oldKey = await loadSecureApiKeyRollback();
      if (!oldKey || !(await saveSecureApiKey(oldKey))) {
        ffCredentialStorageUnresolved = true;
        return false;
      }
    } else if (!(await deleteSecureApiKey())) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    if (!clearSharedApiChangeJournal()) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    const cleaned = await deleteSecureApiKeyRollback();
    if (!cleaned) ffCredentialStorageUnresolved = true;
    return true;
  }

  async function restoreSharedApiChangeToKnownKey(oldKey) {
    const restored = oldKey
      ? await saveSecureApiKey(oldKey)
      : await deleteSecureApiKey();
    if (!restored) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    if (!clearSharedApiChangeJournal()) {
      ffCredentialStorageUnresolved = true;
      return false;
    }
    const cleaned = await deleteSecureApiKeyRollback();
    if (!cleaned) ffCredentialStorageUnresolved = true;
    return cleaned;
  }

  async function commitSharedApiChangeJournal() {
    if (!clearSharedApiChangeJournal()) return false;
    const cleaned = await deleteSecureApiKeyRollback();
    return cleaned;
  }

  async function loadSecureApiKey() {
    const journal = readSharedApiChangeJournal();
    if (journal === null) {
      const loaded = await loadCipherState(SCRIPT.secureVaultCipherId, validateFfscouterKey);
      if (!loaded.ready) return loaded;
      const cleaned = await deleteSecureApiKeyRollback();
      return { ready: cleaned, key: loaded.key };
    }
    if (!journal.valid) return { ready: false, key: "" };
    if (!journal.oldPresent) {
      if (!(await deleteSecureApiKey()) || !clearSharedApiChangeJournal()) {
        return { ready: false, key: "" };
      }
      const cleaned = await deleteSecureApiKeyRollback();
      return { ready: cleaned, key: "" };
    }
    const rollback = await loadCipherState(
      SCRIPT.secureVaultRollbackCipherId,
      validateFfscouterKey
    );
    if (!rollback.ready || !rollback.key) return { ready: false, key: "" };
    if (!(await saveSecureApiKey(rollback.key)) || !clearSharedApiChangeJournal()) {
      return { ready: false, key: rollback.key };
    }
    const cleaned = await deleteSecureApiKeyRollback();
    return { ready: cleaned, key: rollback.key };
  }

  const saveSecureTornApiKey = key => saveCipher(SCRIPT.tornApiCipherId, validateTornApiKey(key));
  const loadSecureTornApiKey = () => loadCipherState(SCRIPT.tornApiCipherId, validateTornApiKey);
  const deleteSecureTornApiKey = () => deleteCipher(SCRIPT.tornApiCipherId);

  // ---------------------------------------------------------------------------
  // Network transport / explicit allowlists
  // ---------------------------------------------------------------------------

  // VIEW mode allowlist. Fail closed: anything that is not exactly the members
  // endpoint for a faction rendered on the war card currently on screen is
  // refused. This sits at the transport, so it also covers any call that does
  // not go through tornApiRequest.
  function viewPermittedFactionIds() {
    const ids = new Set();
    const routeId = viewedFactionIdFromRoute();
    if (validTargetId(routeId)) ids.add(routeId);
    for (const id of canonicalPdaRankedWarSurface()?.factionIds || []) {
      if (validTargetId(id)) ids.add(String(Number(id)));
    }
    return [...ids];
  }

  function isViewModePermittedRequest(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ""));
      if (url.origin !== SCRIPT.tornApiOrigin) return false;
      return viewPermittedFactionIds().some(id => url.pathname === `/v2/faction/${id}/members`);
    } catch { return false; }
  }

  function gmXhr(options) {
    return new Promise(resolve => {
      let settled = false;
      let request = null;
      const signal = options?.signal;
      const startedAt = nowMs();
      // Single transport choke point. In VIEW everything is refused except the
      // members batch for a faction on the war card being looked at.
      if (viewOnlyMode() && !isViewModePermittedRequest(options?.url)) {
        resolve({ ok: false, status: 0, responseText: "", headers: "", startedAt, endedAt: nowMs(), viewOnlyBlocked: true });
        return;
      }
      const finish = result => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        resolve({ ...result, startedAt, endedAt: nowMs() });
      };
      const abort = () => {
        try { request?.abort(); } catch {}
        finish({ ok: false, status: 0, responseText: "", headers: "", aborted: true });
      };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      try {
        request = GM_xmlhttpRequest({
          method: options.method || "GET",
          url: options.url,
          headers: options.headers || {},
          data: options.data,
          timeout: Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : CONFIG.requestTimeoutMs,
          onload: response => finish({ ok: response.status >= 200 && response.status < 300, status: response.status, responseText: response.responseText || "", headers: response.responseHeaders || "" }),
          onerror: () => finish({ ok: false, status: 0, responseText: "", headers: "" }),
          ontimeout: () => finish({ ok: false, status: 0, responseText: "", headers: "" }),
          onabort: () => finish({ ok: false, status: 0, responseText: "", headers: "" })
        });
      } catch { finish({ ok: false, status: 0, responseText: "", headers: "" }); }
    });
  }

  function parseJsonSafe(text) {
    try { return JSON.parse(text || "{}"); } catch { return {}; }
  }

  // ---------------------------------------------------------------------------
  // KS War Room server transport (contract: 3C rapport avsnitt 10).
  // Allowlist: exactly POST /session and POST /war/<wire id>/(claims|claim|
  // unclaim|report). Nothing else, and no wipe. Always gmXhr
  // (GM_xmlhttpRequest), always POST, always a JSON body. The sign-in token
  // goes in the body field "session": never in a header, never in the URL.
  // ---------------------------------------------------------------------------

  // Torn's ranked war id for the war on screen: the id on the war card, which
  // is the value the script verifies against /v2/faction/wars. If the Torn API
  // has confirmed a different id for the own war, there is no id to use.
  function ksScreenTornWarId() {
    const surfaceId = String(canonicalPdaRankedWarSurface()?.warId ?? "");
    if (!viewOnlyMode()) {
      const confirmedId = String(ownWarsState.warId || "");
      if (confirmedId && confirmedId !== surfaceId) return "";
    }
    return surfaceId;
  }

  // The ONE place the war id on the wire is made. Digits only in; anything
  // else throws and nothing is sent. Same rule as the War Room page
  // (warroom-3d.html wireWarId): in a test build the id is "sim-" + Torn's
  // id, so the script and the page meet in the same test war and a test build
  // can never write to a real war's board.
  function wireWarId(tornWarId = ksScreenTornWarId()) {
    const raw = String(tornWarId ?? "").trim();
    if (!/^\d{1,10}$/.test(raw) || raw !== String(Number(raw)) || Number(raw) <= 0) {
      throw new Error("KS server: no Torn ranked war id");
    }
    const wire = KS_SERVER_TEST_BUILD ? `${KS_SERVER.simPrefix}${raw}` : raw;
    if (KS_SERVER_TEST_BUILD && !wire.startsWith(KS_SERVER.simPrefix)) {
      throw new Error("KS server: test build refuses a war id without sim-");
    }
    return wire;
  }

  function currentWireWarId() {
    try { return wireWarId(); } catch { return ""; }
  }

  // Second lock on the same door: every path is built here and nowhere else,
  // and a test build refuses any war id that does not carry sim-.
  function ksServerPath(op, wireId) {
    if (op === "session") return KS_SERVER.sessionPath;
    if (!KS_SERVER.warOps.includes(op)) throw new Error("Blocked non-allowlisted KS server endpoint");
    const id = String(wireId ?? "");
    const allowed = KS_SERVER_TEST_BUILD ? /^sim-[1-9]\d{0,9}$/ : /^[1-9]\d{0,9}$/;
    if (!allowed.test(id)) throw new Error("Blocked KS server war id");
    return `/war/${id}/${op}`;
  }

  // Returns { ok, status, body } and nothing else of the raw response. body is
  // null when the answer was not a JSON object (Cloudflare's own error page,
  // an empty reply, a transport failure) -- never an empty object that could
  // be mistaken for an answer.
  async function ksServerPost(op, wireId, body) {
    const path = ksServerPath(op, wireId);
    const result = await gmXhr({
      method: "POST",
      url: `${KS_SERVER.origin}${path}`,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      data: JSON.stringify(body || {})
    });
    let parsed = null;
    try {
      const value = JSON.parse(result.responseText || "");
      if (isPlainRecord(value)) parsed = value;
    } catch {}
    return { ok: result.ok === true, status: Number(result.status) || 0, body: parsed };
  }

  function ksSessionReady(apiKey) {
    return Boolean(ksSessionToken) && Boolean(apiKey) && ksSessionKeyUsed === apiKey && nowMs() < ksSessionRenewAt;
  }

  function ksDropSession() {
    ksSessionToken = "";
    ksSessionRenewAt = 0;
    ksSessionKeyUsed = "";
  }

  // Called when the Torn key is saved again or forgotten. A newly saved key is
  // a new question to the server; the old refusal says nothing about it.
  function ksResetSignInGuard() {
    ksSignInEpoch += 1;
    ksDropSession();
    ksSignInRefusedKey = "";
    ksSignInRefusedWord = "";
    ksSignInRetryAt = 0;
    ksSignInFailureStreak = 0;
    ksSignInManualAttempt = false;
  }

  // One tap on Sync buys ONE sign-in attempt with a key the server refused.
  // With no refusal standing there is nothing to buy, and no spare attempt is
  // kept for later.
  function ksAllowOneManualSignIn() {
    ksSignInManualAttempt = Boolean(ksSignInRefusedKey);
  }

  function ksSignInWait(word, retryAt = 0) {
    return { ok: false, word, retryAt };
  }

  // What the guard says about signing in right now, without sending anything.
  // null means a sign-in may be sent.
  function ksSignInGuardVerdict(apiKey) {
    if (!apiKey) return ksSignInWait("KEY REQUIRED");
    if (nowMs() < ksSignInRetryAt) return ksSignInWait("SERVER OFFLINE", ksSignInRetryAt);
    if (ksSignInRefusedKey && ksSignInRefusedKey === apiKey && !ksSignInManualAttempt) {
      return ksSignInWait(ksSignInRefusedWord || "KEY REJECTED");
    }
    return null;
  }

  // Reads a /session answer and updates the guard. The word is chosen on the
  // HTTP status and the error/retryable fields, never on the server's own
  // detail text (it is Swedish).
  //   400 invalid_key, 401 key_rejected (not retryable), 403 not_a_member
  //       -> refused: no automatic sign-in with the SAME key again
  //   429 -> wait retryAfterSeconds, 60 s when the field is missing
  //   anything else (401 retryable, 500, 502, 503, status 0, not JSON)
  //       -> wait 15 s, then 30 s, then 60 s
  function ksApplySignInResult(apiKey, result) {
    const status = Number(result?.status) || 0;
    const body = result?.body || null;
    const error = body ? normalizeText(body.error) : "";
    if (status === 200 && body?.ok === true && typeof body.session === "string" && body.session) {
      const ttlSeconds = Number(body.sessionTtlSeconds);
      const ttlMs = (Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 600) * 1000;
      ksSessionToken = body.session;
      ksSessionKeyUsed = apiKey;
      ksSessionRenewAt = nowMs() + Math.max(1000, ttlMs - CONFIG.ksSessionRenewMarginMs);
      ksSignInRefusedKey = "";
      ksSignInRefusedWord = "";
      ksSignInRetryAt = 0;
      ksSignInFailureStreak = 0;
      return { ok: true, word: "SIGNED IN", retryAt: 0 };
    }
    ksDropSession();
    const refusedWord =
      status === 400 && error === "invalid_key" ? "KEY REJECTED"
        : status === 401 && error === "key_rejected" && body?.retryable !== true ? "KEY REJECTED"
          : status === 403 && error === "not_a_member" ? "NOT A MEMBER"
            : "";
    if (refusedWord) {
      ksSignInRefusedKey = apiKey;
      ksSignInRefusedWord = refusedWord;
      return ksSignInWait(refusedWord);
    }
    if (status === 429) {
      const retryAfterSeconds = Number(body?.retryAfterSeconds);
      ksSignInRetryAt = nowMs() + (
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.ceil(retryAfterSeconds) * 1000
          : CONFIG.ksSignInBlockedMinWaitMs
      );
      return ksSignInWait("SERVER OFFLINE", ksSignInRetryAt);
    }
    const steps = CONFIG.ksSignInBackoffMs;
    ksSignInRetryAt = nowMs() + steps[Math.min(ksSignInFailureStreak, steps.length - 1)];
    ksSignInFailureStreak += 1;
    return ksSignInWait("SERVER OFFLINE", ksSignInRetryAt);
  }

  // One sign-in at a time: a concurrent caller shares the request in flight
  // instead of sending the Torn key twice. The key goes in the body of
  // POST /session and nowhere else.
  function ksSignIn(apiKey) {
    if (ksSessionSignInPromise) return ksSessionSignInPromise;
    ksSignInManualAttempt = false;
    const epoch = ksSignInEpoch;
    const pending = (async () => {
      let result = null;
      try { result = await ksServerPost("session", "", { apiKey }); } catch { result = null; }
      // The key was saved again or forgotten while this was in flight: the
      // answer belongs to a question nobody is asking any more.
      if (epoch !== ksSignInEpoch) return ksSignInWait("SERVER OFFLINE");
      return ksApplySignInResult(apiKey, result);
    })();
    ksSessionSignInPromise = pending;
    const clear = () => { if (ksSessionSignInPromise === pending) ksSessionSignInPromise = null; };
    pending.then(clear, clear);
    return pending;
  }

  // { ok:true } when there is a session for this key; otherwise the word the
  // panel should show. Sends at most one sign-in, and only when the guard
  // allows it.
  async function ksEnsureSession(apiKey) {
    if (ksSessionReady(apiKey)) return { ok: true, word: "SIGNED IN", retryAt: 0 };
    const verdict = ksSignInGuardVerdict(apiKey);
    if (verdict) return verdict;
    const outcome = await ksSignIn(apiKey);
    if (outcome.ok && !ksSessionReady(apiKey)) return ksSignInWait("SERVER OFFLINE");
    return outcome;
  }

  // Signs in if needed, sends ONE data request, and answers a 401 exactly
  // once -- never a loop:
  //   reason expired                  -> ONE new sign-in and ONE re-run
  //   reason malformed, bad_signature -> the token is dropped and ONE new
  //                                      sign-in is made; no re-run
  // Returns { ok, status, body }. signIn is set when no request could be sent
  // because there is no session; signIn.word says why.
  async function ksWarRoomRequest(op, wireId, extraBody, { isCurrent = () => true } = {}) {
    const apiKey = effectiveTornApiKey();
    const noSession = outcome => ({ ok: false, status: 0, body: null, signIn: outcome });
    const ensured = await ksEnsureSession(apiKey);
    if (!ensured.ok) return noSession(ensured);
    if (!isCurrent()) return { ok: false, status: 0, body: null };
    const sentToken = ksSessionToken;
    let result = await ksServerPost(op, wireId, { ...(extraBody || {}), session: sentToken });
    if (result.status !== 401 || normalizeText(result.body?.error) !== "unauthorized") return result;
    const reason = normalizeText(result.body?.reason);
    // R5. The 401 is about the token this request sent. If another caller has
    // signed in again meanwhile, the token held now is a newer one: dropping
    // it would cost a second sign-in for one expiry.
    if (ksSessionToken === sentToken) ksDropSession();
    if (!isCurrent()) return result;
    const renewed = await ksEnsureSession(apiKey);
    if (!renewed.ok) return noSession(renewed);
    if (reason !== "expired" || !isCurrent()) return result;
    result = await ksServerPost(op, wireId, { ...(extraBody || {}), session: ksSessionToken });
    return result;
  }

  // The War Room row for a request that did not give a usable answer. English,
  // chosen on status and error/reason fields only: no HTTP code, no error
  // code, no path and none of the server's own detail text.
  function ksFailureLine(result) {
    const signIn = result?.signIn;
    if (signIn?.word === "KEY REQUIRED") return "War Room: KEY REQUIRED — set your Torn API key";
    if (signIn?.word === "KEY REJECTED" || signIn?.word === "NOT A MEMBER") return `War Room: ${signIn.word}`;
    if (signIn && signIn.retryAt > nowMs()) {
      return `War Room: SERVER OFFLINE · retry in ${Math.max(1, Math.ceil((signIn.retryAt - nowMs()) / 1000))}s`;
    }
    return "War Room: SERVER OFFLINE";
  }

  function ksFailureState(result) {
    const word = result?.signIn?.word;
    if (word === "KEY REQUIRED") return "key-required";
    if (word === "KEY REJECTED" || word === "NOT A MEMBER") return "error";
    return "offline";
  }

  // A locally derived, stable claim id for a server claim, in the UUID-v4
  // shape sanitizeOwnClaim()/isValidClaimId() already require. Deterministic
  // on the wire war id, the target, the member and the server's EXACT
  // claimedAt in milliseconds, so one server claim gets the same id in the
  // answer to /claim and in every later read of the board. That is what lets
  // findSharedClaimById() recognise this device's own claim between polls and
  // lets a release pass the ownership proof. Correlation only; it is never
  // sent anywhere.
  function ksDeterministicClaimId(wireId, targetId, memberId, claimedAtMs) {
    const source = `ks-war-room:${wireId}:${targetId}:${memberId}:${claimedAtMs}`;
    const bytes = [];
    let seed = 2166136261;
    for (let round = 0; round < 4; round += 1) {
      let h = seed ^ Math.imul(round + 1, 0x9e3779b9);
      for (let i = 0; i < source.length; i += 1) {
        h = Math.imul(h ^ source.charCodeAt(i), 16777619) >>> 0;
      }
      seed = h;
      for (let shift = 24; shift >= 0; shift -= 8) bytes.push((h >>> shift) & 0xff);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // Who holds a claim, as members see it. The server knows Torn ids only, so
  // the name comes from the own faction member list; "#<Torn id>" until that
  // list has the member. The own claim reads as it always has.
  function ksClaimerDisplayName(memberId) {
    const id = String(memberId || "");
    if (id && id === String(selfPlayerId)) return selfPlayerName || "You";
    return ksMemberNames.get(id) || `#${id}`;
  }

  // THE one conversion point: a claim as the server sends it becomes the queue
  // entry the rest of this file works with. The server's claimedAt and
  // expiresAt are MILLISECONDS; every claim time in this file is SECONDS
  // (expiresAt is compared with nowSeconds()). No other place in the file sees
  // the server's milliseconds. hospitalUntil is Torn seconds already, or null
  // when the claim has no stored hospital time.
  // Used for a row of the board AND for the claim in the answer to /claim --
  // same function, same input, same claim id.
  // Returns null for anything that is not a claim the server could have sent.
  function ksQueueEntryFromServerClaim(wireId, raw) {
    if (!isPlainRecord(raw)) return null;
    const targetId = String(raw.targetId ?? "").trim();
    const memberId = String(raw.memberId ?? "").trim();
    const claimedAtMs = raw.claimedAt;
    const expiresAtMs = raw.expiresAt;
    if (
      targetId !== String(Number(targetId)) || !validTargetId(targetId) ||
      memberId !== String(Number(memberId)) || !validTargetId(memberId) ||
      !Number.isSafeInteger(claimedAtMs) || !Number.isSafeInteger(expiresAtMs) ||
      // A value this small is seconds, not milliseconds: not this contract.
      claimedAtMs < 1e12 || expiresAtMs <= claimedAtMs
    ) return null;
    return {
      targetId,
      entry: {
        claimId: ksDeterministicClaimId(wireId, targetId, memberId, claimedAtMs),
        position: 1,
        createdAt: Math.floor(claimedAtMs / 1000),
        expiresAt: Math.floor(expiresAtMs / 1000),
        hospitalUntil: Number.isSafeInteger(raw.hospitalUntil) && raw.hospitalUntil >= 0 ? raw.hospitalUntil : null,
        claimer: { playerId: memberId, name: ksClaimerDisplayName(memberId) }
      }
    };
  }

  // The server's board is single-owner: one claim per target, no queue. Each
  // target maps to a one-entry queue so the code written for a queue keeps
  // working unchanged.
  //
  // Fail closed, three ways:
  //   - one row in claims[] that cannot be read makes the WHOLE answer
  //     invalid (null): a partial board reads as "these targets are free";
  //   - every targetId in unreadable[] is unknown;
  //   - degraded:true makes every known target unknown.
  function normalizeKsWarRoomClaims(payload, wireId) {
    if (!isPlainRecord(payload) || payload.ok !== true || payload.warId !== wireId) return null;
    if (!Array.isArray(payload.claims) || !Array.isArray(payload.unreadable) || typeof payload.degraded !== "boolean") return null;
    const claims = new Map();
    const unreadable = new Set();
    for (const raw of payload.claims) {
      const converted = ksQueueEntryFromServerClaim(wireId, raw);
      if (!converted || claims.has(converted.targetId)) return null;
      claims.set(converted.targetId, [converted.entry]);
    }
    for (const raw of payload.unreadable) {
      const targetId = String((isPlainRecord(raw) ? raw.targetId : raw) ?? "").trim();
      if (validTargetId(targetId)) unreadable.add(String(Number(targetId)));
    }
    const degraded = payload.degraded === true || payload.unreadable.length > 0;
    if (degraded) {
      for (const id of knownOpponentTargetIds()) unreadable.add(id);
    }
    return { claims, unreadable, degraded, unreadableCount: Math.max(unreadable.size, payload.unreadable.length) };
  }

  // Claimer names. At most one Torn call per CONFIG.ksMemberNamesRefreshMs
  // while the script is active on an own war page, never in VIEW, kept in
  // memory and never stored. The path is the key owner's own faction.
  function normalizeOwnFactionMemberNames(payload) {
    if (!isPlainRecord(payload) || payload.error) return null;
    const source = payload.members;
    const entries = Array.isArray(source)
      ? source.map(member => ["", member])
      : (isPlainRecord(source) ? Object.entries(source) : null);
    if (!entries) return null;
    const names = new Map();
    for (const [key, member] of entries) {
      if (!isPlainRecord(member)) continue;
      const rawId = String(member.id ?? member.player_id ?? key ?? "").trim();
      const name = normalizeText(member.name);
      if (validTargetId(rawId) && name) names.set(String(Number(rawId)), name);
    }
    return names;
  }

  async function fetchOwnFactionMemberNames() {
    if (!runtimeActive || !isRuntimeEligible() || viewOnlyMode() || ksMemberNamesSyncing) return false;
    const key = effectiveTornApiKey();
    if (!key) return false;
    if (ksMemberNamesAttemptAt > 0 && nowMs() - ksMemberNamesAttemptAt < CONFIG.ksMemberNamesRefreshMs) return false;
    ksMemberNamesAttemptAt = nowMs();
    ksMemberNamesSyncing = true;
    const epoch = ksSignInEpoch;
    try {
      const result = await tornApiRequest(SCRIPT.tornOwnMembersPath, key, { trackCredentialState: false });
      if (epoch !== ksSignInEpoch || !result?.ok || result.body?.error) return false;
      const names = normalizeOwnFactionMemberNames(result.body);
      if (!names) return false;
      ksMemberNames = names;
      return true;
    } catch {
      return false;
    } finally {
      ksMemberNamesSyncing = false;
    }
  }

  // The Torn key changed: the old key's session, its refusal and its faction's
  // names all belong to somebody else now.
  function ksResetForTornKeyChange() {
    ksResetSignInGuard();
    ksMemberNames = new Map();
    ksMemberNamesAttemptAt = 0;
    ksReportedHospitalUntil.clear();
  }

  // Torn-synced time for a moment on the device clock, or null while the Torn
  // clock is not calibrated. Same clock getTornNowMs() reads.
  function tornSyncedMsAtLocal(localMs) {
    return Number.isFinite(tornClockLowMs) && Number.isFinite(localMs) ? localMs + tornClockLowMs : null;
  }

  // Hospital report (server rule K5): lets the server release a claim whose
  // target is back in hospital when the member holding it forgot to. Anyone
  // signed in may report, so this walks every claim on the board except this
  // device's own -- the own claim keeps its auto-release paths, which call
  // /unclaim. Each rule below is the server's own:
  //   - only when the fresh end time is more than 180 s above the claim's
  //     stored hospitalUntil (anything less the server answers "unchanged");
  //   - at most one report per (target, end time);
  //   - observedAt is Torn-synced time at the moment the Torn answer arrived,
  //     in seconds, never the device clock; no calibrated clock, no report;
  //   - no report on a reading older than 30 s by that same clock;
  //   - a report only on a reading taken more than 45 s after the claim was
  //     made (R1): an earlier one may describe the target before the claim;
  //   - never in VIEW.
  // No Torn call is made for this: it reads the opponent batch already polled.
  async function reportHospitalUpdatesToWarRoom() {
    if (ksReportBusy || viewOnlyMode() || !runtimeActive || !isRuntimeEligible() || sharedWriteBusy) return 0;
    if (!effectiveTornApiKey() || sharedClaims.size === 0 || sharedClaimsVerifiedAt <= 0) return 0;
    if (!validTargetId(opponentFactionId) || opponentMembersState.factionId !== opponentFactionId) return 0;
    const observedAtTornMs = tornSyncedMsAtLocal(Number(opponentMembersState.fetchedAt) || 0);
    if (observedAtTornMs === null || !(Number(opponentMembersState.fetchedAt) > 0)) return 0;
    if (getTornNowMs() - observedAtTornMs > CONFIG.ksReportMaxAgeMs) return 0;
    const observedAt = Math.floor(observedAtTornMs / 1000);
    const wireId = sharedClaimsWireId;
    if (!wireId || wireId !== currentWireWarId()) return 0;
    for (const id of [...ksReportedHospitalUntil.keys()]) {
      if (!sharedClaims.has(id)) ksReportedHospitalUntil.delete(id);
    }
    const ownTargetId = currentOwnClaim()?.targetId || "";
    let sent = 0;
    ksReportBusy = true;
    try {
      for (const [targetId, queue] of [...sharedClaims.entries()]) {
        if (viewOnlyMode() || !runtimeActive || !isRuntimeEligible()) break;
        const claim = Array.isArray(queue) ? queue[0] : null;
        if (!claim || targetId === ownTargetId || String(claim.claimer?.playerId || "") === String(selfPlayerId)) continue;
        if (!Number.isSafeInteger(claim.hospitalUntil)) continue;
        // R1. The reading must be newer than the claim by Torn's cache plus the
        // server's clock skew. Checked before the once-per-end-time mark below,
        // so a later reading of the same end time can still be reported.
        // createdAt is the claim time rounded DOWN to a whole second (the
        // server's milliseconds stop at the conversion point), so the reading
        // must be MORE than 45 whole seconds later to be 45 s after the claim
        // itself. The server holds the same rule on its exact time and answers
        // a report inside that second "before_claim" -- and this end time,
        // once marked as reported, would never be reported again.
        if (!Number.isFinite(claim.createdAt) || observedAt <= claim.createdAt + CONFIG.ksReportMinSecondsAfterClaim) continue;
        const status = opponentMembersState.members.get(targetId);
        if (!status) continue;
        const inHospital =
          isHospitalStatusValue(status.state) ||
          isHospitalStatusValue(status.description) ||
          isHospitalStatusValue(status.details);
        const freshUntil = Number(status.until);
        if (!inHospital || !Number.isSafeInteger(freshUntil)) continue;
        if (freshUntil <= claim.hospitalUntil + CONFIG.ksReportMarginSeconds) continue;
        if (ksReportedHospitalUntil.get(targetId) === freshUntil) continue;
        ksReportedHospitalUntil.set(targetId, freshUntil);
        sent += 1;
        try {
          await ksWarRoomRequest("report", wireId, { targetId, hospitalUntil: freshUntil, observedAt });
        } catch {}
      }
    } finally {
      ksReportBusy = false;
    }
    return sent;
  }

  async function fairFightStatsRequest(targetIds, { initial = false, isCurrent = () => true, apiKey = sharedApiKey } = {}) {
    const ids = [...new Set(targetIds.map(String).filter(validTargetId))]
      .sort((a, b) => Number(a) - Number(b))
      .slice(0, CONFIG.fairFightMaxTargets);
    if (!ids.length) return { ok: true, status: 200, body: { stats: [] } };
    const requestApiKey = validateFfscouterKey(apiKey);
    if (!requestApiKey) return { ok: false, status: 0, body: { error: "FFScouter key required" } };
    const url = new URL(STATS_API.getStats, SCRIPT.ffscouterOrigin);
    url.searchParams.set("key", requestApiKey);
    url.searchParams.set("targets", ids.join(","));
    const maxAttempts = initial ? CONFIG.fairFightInitialTransportRetryAttempts : CONFIG.sharedTransportRetryAttempts;
    const requestTimeout = initial ? CONFIG.fairFightInitialRequestTimeoutMs : CONFIG.requestTimeoutMs;
    let result = null;
    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      if (!isCurrent()) return result;
      result = await gmXhr({ method: "GET", url: url.toString(), headers: { Accept: "application/json" }, timeout: requestTimeout });
      if (!isCurrent()) return result;
      if (result.ok || result.status !== 0 || attempt >= maxAttempts) break;
      await wait(CONFIG.sharedTransportRetryDelayMs * (attempt + 1));
      if (!isCurrent()) return result;
    }
    return { ...result, body: parseJsonSafe(result?.responseText) };
  }

  function handleRejectedInjectedTornKey(key, body) {
    const injectedKey = validateTornApiKey(rawInjectedPdaTornApiKey());
    if (!injectedKey || key !== injectedKey || pdaTornApiKeyRejected || !isPdaTornKeyRejectedError(body)) {
      return false;
    }
    pdaTornApiKeyRejected = true;
    if (validateTornApiKey(storedTornApiKey) === injectedKey) storedTornApiKey = "";
    invalidateTornCredentialRequests();
    const fallback = validateTornApiKey(storedTornApiKey);
    if (fallback) {
      setTornStatusState("identity", "Torn: PDA key rejected; checking saved key", 0);
      window.setTimeout(() => {
        if (runtimeActive && isRuntimeEligible() && effectiveTornApiKey() === fallback) {
          void fetchTornStatuses({ force: true });
        }
      }, 0);
    } else {
      setTornStatusState("key-required", "Torn: PDA key rejected; API key required", 0);
    }
    return true;
  }

  async function tornApiRequest(path, key, { cacheBust = false, trackCredentialState = true, signal = null } = {}) {
    const isUserBasic = /^\/v2\/user\/\d+\/basic$/.test(path);
    const isUserProfile = /^\/v2\/user\/\d+\/profile$/.test(path);
    const isOwnFactionWars = path === SCRIPT.tornOwnWarsPath;
    const isOpponentMembers = /^\/v2\/faction\/\d+\/members$/.test(path);
    // The key owner's own faction member list: claimer names only.
    const isOwnFactionMembers = path === SCRIPT.tornOwnMembersPath;
    if (path !== SCRIPT.tornKeyInfoPath && !isUserBasic && !isUserProfile && !isOwnFactionWars && !isOpponentMembers && !isOwnFactionMembers) {
      throw new Error("Blocked non-allowlisted Torn API endpoint");
    }
    const apiKey = validateTornApiKey(key);
    if (!apiKey) return { ok: false, status: 0, body: { error: { error: "API key required" } } };
    if (signal?.aborted || !reserveTornRequest()) return { ok: false, status: 0, body: { error: { error: "Torn request limit or context unavailable" } } };
    const observationSerial = trackCredentialState ? ++tornCredentialObservationSerial : 0;
    const credentialEpochAtRequest = tornCredentialEpoch;
    const storedKeyAtRequest = validateTornApiKey(storedTornApiKey);
    const injectedKeyAtRequest = validateTornApiKey(rawInjectedPdaTornApiKey());
    const storedKeyRequest = Boolean(storedKeyAtRequest) && apiKey === storedKeyAtRequest;
    const injectedKeyRequest = Boolean(injectedKeyAtRequest) && apiKey === injectedKeyAtRequest;
    const url = new URL(path, SCRIPT.tornApiOrigin);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("comment", "KS_Torn_War_Dibs_PDA_v15145");
    if (cacheBust) url.searchParams.set("timestamp", String(nowMs()));
    const headers = cacheBust
      ? { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" }
      : { Accept: "application/json" };
    const result = await gmXhr({ method: "GET", url: url.toString(), headers, signal });
    recordTornClockFromHeaders(result);
    const body = parseJsonSafe(result.responseText);
    const rejected = isPdaTornKeyRejectedError(body);
    const capabilityRejected = !isUserProfile && isTornCapabilityRejectedError(body);
    const successfulObservation = result.ok && !body?.error;
    const successfulCredentialObservation =
      successfulObservation && path === SCRIPT.tornKeyInfoPath;
    const storedObservationCurrent = storedKeyRequest &&
      validateTornApiKey(storedTornApiKey) === storedKeyAtRequest;
    const injectedObservationCurrent = injectedKeyRequest &&
      validateTornApiKey(rawInjectedPdaTornApiKey()) === injectedKeyAtRequest;
    const epochCurrent = credentialEpochAtRequest === tornCredentialEpoch;
    const keyValidityObservationCurrent =
      trackCredentialState && epochCurrent &&
      (storedObservationCurrent || injectedObservationCurrent) &&
      (rejected || capabilityRejected || successfulCredentialObservation) &&
      observationSerial > lastTornKeyValidityObservationSerial;
    if (keyValidityObservationCurrent) {
      lastTornKeyValidityObservationSerial = observationSerial;
      if (storedObservationCurrent) {
        if (rejected) storedTornCredentialRejected = true;
        else if (successfulCredentialObservation || capabilityRejected) storedTornCredentialRejected = false;
      }
      if (injectedObservationCurrent && rejected) handleRejectedInjectedTornKey(apiKey, body);
    }
    if (
      trackCredentialState && epochCurrent && storedObservationCurrent &&
      (rejected || capabilityRejected) &&
      observationSerial > lastTornCapabilityAuthoritySerial
    ) {
      lastTornCapabilityAuthoritySerial = observationSerial;
      storedTornCapabilityRejected = capabilityRejected;
    }
    return {
      ...result,
      body,
      credentialObservation: trackCredentialState
        ? { serial: observationSerial, epoch: credentialEpochAtRequest, storedKeyRequest }
        : null
    };
  }

  function normalizeSelfIdentity(payload) {
    if (!isPlainRecord(payload) || payload.error || !isPlainRecord(payload.info)) return null;
    const user = payload.info.user;
    if (!isPlainRecord(user)) return null;
    if (
      !Object.prototype.hasOwnProperty.call(user, "id") ||
      !Object.prototype.hasOwnProperty.call(user, "faction_id") ||
      !Object.prototype.hasOwnProperty.call(user, "company_id") ||
      !isInt32(user.id, { positive: true }) ||
      !isInt32(user.faction_id, { positive: true }) ||
      (user.company_id !== null && !isInt32(user.company_id, { positive: true }))
    ) return null;
    const factionId = String(user.faction_id);
    for (const source of [user.faction, payload.info.faction]) {
      if (source === undefined) continue;
      if (!isPlainRecord(source) || !isInt32(source.id, { positive: true }) || String(source.id) !== factionId) return null;
    }
    return {
      playerId: String(user.id),
      playerName: normalizeText(user.name),
      factionId
    };
  }

  function tornErrorMessage(result, fallback) {
    const detail = result?.body?.error;
    const apiCode = Number(detail && typeof detail === "object" && !Array.isArray(detail) ? detail.code : NaN);
    if (Number.isSafeInteger(apiCode) && apiCode >= 0) return `${fallback} (API ${apiCode})`;
    const status = Number(result?.status);
    return Number.isInteger(status) && status > 0 ? `${fallback} (HTTP ${status})` : fallback;
  }

  function normalizeSelfBasicCapability(payload, expectedPlayerId) {
    if (!isPlainRecord(payload) || payload.error || !isPlainRecord(payload.profile)) return false;
    return Boolean(isInt32(payload.profile.id, { positive: true }) && String(payload.profile.id) === String(expectedPlayerId));
  }

  function commitStoredTornCapabilitySuccess(key, result, authorityWatermark) {
    const observation = result?.credentialObservation;
    if (
      !observation?.storedKeyRequest ||
      observation.epoch !== tornCredentialEpoch ||
      validateTornApiKey(key) !== validateTornApiKey(storedTornApiKey) ||
      observation.serial <= authorityWatermark ||
      lastTornCapabilityAuthoritySerial !== authorityWatermark
    ) return false;
    lastTornCapabilityAuthoritySerial = observation.serial;
    storedTornCapabilityRejected = false;
    return true;
  }

  async function verifyTornOperationalCapabilities({ key, identity, force, isCurrent, trackCredentialState = true }) {
    const surface = operationalWarSurfaceForFaction(identity.factionId);
    if (!surface) throw new Error("Ranked War opponent unavailable for capability check");
    const capabilityAuthorityWatermark = lastTornCapabilityAuthoritySerial;
    const operationCurrent = () => {
      if (!isCurrent()) return false;
      if (!operationalWarSurfaceMatches(surface)) throw new Error("Ranked War surface changed during capability check");
      return true;
    };
    const readCapability = async (path, label) => {
      if (!operationCurrent()) return null;
      const result = await tornApiRequest(path, key, { cacheBust: force, trackCredentialState });
      if (!operationCurrent()) return null;
      if (!result?.ok || result.body?.error) {
        throw new Error(tornErrorMessage(result, `${label} capability unavailable`));
      }
      return result;
    };

    const warsResult = await readCapability(SCRIPT.tornOwnWarsPath, "faction wars");
    if (!warsResult) return null;
    const warsFetchedAt = Number(warsResult.endedAt) || nowMs();
    if (!normalizeOwnWars(warsResult.body, warsFetchedAt, surface)) {
      throw new Error("faction wars capability response malformed");
    }
    const membersResult = await readCapability(`/v2/faction/${surface.opponentFactionId}/members`, "opponent members");
    if (!membersResult) return null;
    const members = normalizeTornMembers(membersResult.body);
    if (!(members instanceof Map)) throw new Error("opponent members capability response malformed");
    const basicResult = await readCapability(`/v2/user/${identity.playerId}/basic`, "user basic");
    if (!basicResult) return null;
    if (!normalizeSelfBasicCapability(basicResult.body, identity.playerId)) {
      throw new Error("user basic capability response malformed");
    }
    if (
      trackCredentialState &&
      !commitStoredTornCapabilitySuccess(key, basicResult, capabilityAuthorityWatermark)
    ) {
      throw new Error("Torn capability authority changed during verification");
    }
    return {
      surface,
      warsResult,
      warsFetchedAt,
      members,
      membersFetchedAt: Number(membersResult.endedAt) || nowMs()
    };
  }

  async function tornCandidateKeyProvesRecovery(key, evidence, isCurrent) {
    if (!isCurrent()) return false;
    try {
      const identityResult = await tornApiRequest(SCRIPT.tornKeyInfoPath, key, {
        cacheBust: true,
        trackCredentialState: false
      });
      if (!isCurrent() || !identityResult?.ok || identityResult.body?.error) return false;
      const identity = normalizeSelfIdentity(identityResult.body);
      if (!identity) return false;
      const expectedPlayerId = credentialRecoveryExpectedPlayerId(evidence);
      if (expectedPlayerId === null) return false;
      if (credentialRecoveryEvidenceActive(evidence) && !expectedPlayerId) return false;
      if (expectedPlayerId && identity.playerId !== expectedPlayerId) return false;
      const operational = await verifyTornOperationalCapabilities({
        key,
        identity,
        force: true,
        isCurrent,
        trackCredentialState: false
      });
      return Boolean(isCurrent() && operational);
    } catch {
      return false;
    }
  }

  async function fetchSelfIdentity({ force = false } = {}) {
    const key = effectiveTornApiKey();
    if (!key || selfIdentitySyncing) return false;
    if (!force && validTargetId(selfPlayerId) && validTargetId(selfFactionId) && keyScopeReady) return true;
    if (!force && selfIdentityLastAttemptAt > 0 && nowMs() - selfIdentityLastAttemptAt < 30000) return false;
    setTornStatusState("identity", "Torn: checking key identity…");

    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++selfIdentityRequestSerial;
    let verifiedIdentity = null;
    selfIdentitySyncing = true;
    selfIdentityLastAttemptAt = nowMs();
    const isCurrentRequest = () => (
      requestSerial === selfIdentityRequestSerial &&
      credentialEpoch === tornCredentialEpoch &&
      generation === runtimeGeneration &&
      key === effectiveTornApiKey() &&
      runtimeActive &&
      isRuntimeEligible()
    );
    try {
      const identityResult = await tornApiRequest(SCRIPT.tornKeyInfoPath, key, { cacheBust: force });
      if (!isCurrentRequest()) return false;
      if (!identityResult?.ok || identityResult.body?.error) {
        throw new Error(tornErrorMessage(identityResult, "Key identity unavailable"));
      }
      const identity = normalizeSelfIdentity(identityResult.body);
      if (!identity) throw new Error("Key identity response malformed");
      verifiedIdentity = identity;
      const operational = await verifyTornOperationalCapabilities({ key, identity, force, isCurrent: isCurrentRequest });
      if (!isCurrentRequest() || !operational) return false;
      const identityChanged = selfPlayerId !== identity.playerId || selfFactionId !== identity.factionId;
      if (identityChanged) {
        invalidateOwnWarsState();
        opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
      }
      selfPlayerId = identity.playerId;
      selfPlayerName = identity.playerName;
      selfFactionId = identity.factionId;
      refreshCurrentWarSurface({ structural: true });
      const committedSurface = captureCurrentWarSurface();
      if (
        !committedSurface ||
        committedSurface.card !== operational.surface.card ||
        committedSurface.warId !== operational.surface.warId ||
        committedSurface.opponentFactionId !== operational.surface.opponentFactionId ||
        committedSurface.selfFactionId !== operational.surface.selfFactionId
      ) throw new Error("Ranked War surface changed during capability check");
      const committedWars = normalizeOwnWars(operational.warsResult.body, operational.warsFetchedAt, committedSurface);
      if (!committedWars) throw new Error("faction wars capability response malformed");
      trackedRecordTornClockOffset(operational.warsResult, operational.warsResult.body);
      ownWarsState = committedWars;
      opponentMembersState = {
        factionId: committedSurface.opponentFactionId,
        members: operational.members,
        fetchedAt: operational.membersFetchedAt
      };
      keyScopeReady = true;
      reconcileOwnClaimFromShared();
      scanWarRows();
      updatePanel();
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        const retainVerifiedIdentity = Boolean(
          verifiedIdentity && !storedTornCredentialRejected
        );
        keyScopeReady = false;
        selfPlayerId = retainVerifiedIdentity ? verifiedIdentity.playerId : "";
        selfPlayerName = retainVerifiedIdentity ? verifiedIdentity.playerName : "";
        selfFactionId = retainVerifiedIdentity ? verifiedIdentity.factionId : "";
        opponentFactionId = "";
        invalidateOwnWarsState();
        opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
        currentWarSurface = null;
            publicBasicStatusCache.clear();
        if (retainVerifiedIdentity) reconcileOwnClaimFromShared();
        setTornStatusState("error", `Torn: ${normalizeText(error?.message) || "key validation failed"}`, 0);
        scanWarRows();
        updatePanel();
      }
      return false;
    } finally {
      if (requestSerial === selfIdentityRequestSerial && credentialEpoch === tornCredentialEpoch && key === effectiveTornApiKey()) {
        selfIdentitySyncing = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Shared claim queue (KS War Room board, see normalizeKsWarRoomClaims)
  // ---------------------------------------------------------------------------

  // A candidate FFScouter key is tried against the one FFScouter endpoint this
  // script still uses: get-stats, for the targets it already knows. The key no
  // longer has anything to do with DIBS, so there is no claim board to try it
  // against. With no known target there is nothing to ask and the key is
  // accepted on its format alone.
  async function ffCandidateKeyIsOperational(key, isCurrent) {
    if (!isCurrent()) return false;
    const result = await fairFightStatsRequest(knownOpponentTargetIds(), { initial: true, isCurrent, apiKey: key });
    // R6b. A 200 whose body carries an error field is FFScouter saying no
    // inside a 200. It does not validate a key.
    const body = result?.body;
    const refused = isPlainRecord(body) && body.error !== undefined && body.error !== null && body.error !== false && body.error !== "";
    return Boolean(isCurrent() && result?.ok && !refused);
  }

  function findSharedClaimById(claimId) {
    if (!isValidClaimId(claimId)) return null;
    for (const [targetId, queue] of sharedClaims.entries()) {
      const claim = Array.isArray(queue) ? queue.find(item => item?.claimId === claimId) : null;
      if (claim) return { targetId, claim, queue };
    }
    return null;
  }

  function exactSharedProofForOwnClaim(own = currentOwnClaim()) {
    if (
      !own || !validTargetId(selfPlayerId) ||
      own.claimerPlayerId !== String(selfPlayerId)
    ) return null;
    const found = findSharedClaimById(own.claimId);
    if (
      !found || found.targetId !== own.targetId ||
      found.claim.claimer.playerId !== String(selfPlayerId)
    ) return null;
    return found;
  }

  function quarantineAllowsExactOwnRelease(
    own,
    quarantine = currentClaimQuarantine()
  ) {
    if (!quarantine) return true;
    if (
      !own || !validTargetId(selfPlayerId) ||
      own.claimerPlayerId !== String(selfPlayerId)
    ) return false;
    return quarantine.targetId === own.targetId &&
      quarantine.expectedSelfPlayerId === String(selfPlayerId) &&
      (!quarantine.claimId || quarantine.claimId === own.claimId);
  }

  // True when the server could not say whether this target is taken: it was
  // named in unreadable[], or the whole board was degraded. Never free.
  function sharedClaimUnknown(targetId) {
    return sharedClaimsDegraded || sharedClaimsUnreadable.has(String(targetId || ""));
  }

  function sharedClaimForTarget(playerId) {
    const queue = sharedClaims.get(String(playerId || ""));
    if (!Array.isArray(queue) || !queue.length) return null;
    const active = queue.filter(claim => claim.expiresAt > nowSeconds());
    return active.length ? { first: active[0], queue: active } : null;
  }

  // Takes a queue entry already made by ksQueueEntryFromServerClaim() -- the
  // claim in the server's answer to /claim -- so the board shows it at once,
  // before the next poll, under the same claim id the poll will give it.
  function upsertImmediateSharedClaim(targetId, entry) {
    const id = String(targetId || "");
    if (!validTargetId(id) || !entry || !isValidClaimId(entry.claimId) || !/^\d+$/.test(String(entry.claimer?.playerId ?? "")) || !entry.claimer.name || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.expiresAt)) return;
    const queue = Array.isArray(sharedClaims.get(id)) ? [...sharedClaims.get(id)] : [];
    if (!queue.some(item => item.claimId === entry.claimId)) queue.push(entry);
    queue.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    sharedClaims.set(id, queue);
  }

  function removeImmediateSharedClaim(claimId) {
    if (!isValidClaimId(claimId)) return;
    for (const [targetId, queue] of [...sharedClaims.entries()]) {
      const next = queue.filter(item => item.claimId !== claimId);
      if (next.length) sharedClaims.set(targetId, next); else sharedClaims.delete(targetId);
    }
  }

  function activeSharedClaimsForClaimer(playerId) {
    const id = String(playerId || "").trim();
    if (!/^\d+$/.test(id)) return [];
    const matches = [];
    for (const [targetId, queue] of sharedClaims.entries()) {
      if (!Array.isArray(queue)) continue;
      for (const claim of queue) {
        if (claim?.expiresAt <= nowSeconds()) continue;
        if (String(claim?.claimer?.playerId || "") !== id) continue;
        matches.push({ targetId, claim });
      }
    }
    return matches.sort((a, b) => a.claim.createdAt - b.claim.createdAt || a.targetId.localeCompare(b.targetId));
  }

  function adoptSingleOwnServerClaim() {
    if (
      sharedClaimsVerifiedAt <= 0 ||
      currentOwnClaim() ||
      currentClaimQuarantine() ||
      !validTargetId(selfPlayerId)
    ) return false;
    const matches = activeSharedClaimsForClaimer(selfPlayerId);
    ambiguousOwnServerClaims = matches.length > 1;
    if (matches.length !== 1) return false;
    const { targetId, claim } = matches[0];
    if (!validTargetId(targetId) || !isValidClaimId(claim?.claimId)) return false;
    saveOwnClaim({
      claimId: claim.claimId,
      targetId,
      claimerPlayerId: selfPlayerId,
      claimerName: normalizeText(claim?.claimer?.name) || selfPlayerName || "You",
      expiresAt: claim.expiresAt,
      cleanupRequired: Number(claim.position) > 1,
      createdLocalAt: nowMs(),
      wireId: sharedClaimsWireId
    });
    ownClaimLastConfirmedAt = sharedClaimsVerifiedAt;
    return true;
  }

  function reconcileClaimQuarantineFromShared() {
    if (sharedClaimsVerifiedAt <= 0) return;
    const quarantine = currentClaimQuarantine();
    if (!quarantine || !validTargetId(selfPlayerId)) return;
    if (String(selfPlayerId) !== quarantine.expectedSelfPlayerId) return;
    let proven = null;
    if (isValidClaimId(quarantine.claimId)) {
      const found = findSharedClaimById(quarantine.claimId);
      if (found && found.claim.claimer.playerId === selfPlayerId) {
        if (found.claim.expiresAt <= nowSeconds()) {
          saveClaimQuarantine(null);
          return;
        }
        proven = found;
      }
    } else {
      const matches = activeSharedClaimsForClaimer(selfPlayerId)
        .filter(item => item.targetId === quarantine.targetId);
      if (matches.length === 1) proven = { ...matches[0], queue: sharedClaims.get(matches[0].targetId) };
      if (matches.length > 1) ambiguousOwnServerClaims = true;
    }
    if (!proven) return;
    const existingOwn = currentOwnClaim();
    if (existingOwn) {
      if (
        existingOwn.claimId === proven.claim.claimId &&
        (!existingOwn.claimerPlayerId || existingOwn.claimerPlayerId === String(selfPlayerId))
      ) {
        const persisted = saveOwnClaim({
          ...existingOwn,
          targetId: proven.targetId,
          claimerPlayerId: selfPlayerId,
          claimerName: proven.claim.claimer.name || selfPlayerName || "You",
          expiresAt: proven.claim.expiresAt,
          cleanupRequired: Number(proven.claim.position) > 1,
          wireId: sharedClaimsWireId
        });
        const committed = currentOwnClaim();
        if (
          persisted &&
          committed?.claimId === proven.claim.claimId &&
          committed.targetId === proven.targetId &&
          committed.claimerPlayerId === String(selfPlayerId)
        ) saveClaimQuarantine(null);
      }
      return;
    }
    const persisted = saveOwnClaim({
      claimId: proven.claim.claimId,
      targetId: proven.targetId,
      claimerPlayerId: selfPlayerId,
      claimerName: proven.claim.claimer.name || selfPlayerName || "You",
      expiresAt: proven.claim.expiresAt,
      cleanupRequired: Number(proven.claim.position) > 1,
      createdLocalAt: nowMs(),
      wireId: sharedClaimsWireId
    });
    ownClaimLastConfirmedAt = sharedClaimsVerifiedAt;
    if (persisted && currentOwnClaim()?.claimId === proven.claim.claimId) {
      saveClaimQuarantine(null);
    }
  }

  // R2. Where the own record was last found on the board, and how many
  // complete reads in a row have missed it since. Read and written only by
  // reconcileOwnClaimFromShared. Memory only: after a page reload it is empty
  // and the record's own wireId stands in for it (see below).
  let ownClaimBoardTrack = { claimId: "", wireId: "", readAt: 0, missingReads: 0 };

  function reconcileOwnClaimFromShared() {
    if (sharedClaimsVerifiedAt <= 0) return;
    ambiguousOwnServerClaims = activeSharedClaimsForClaimer(selfPlayerId).length > 1;
    reconcileClaimQuarantineFromShared();
    if (currentClaimQuarantine()) {
      ownClaimLastConfirmedAt = 0;
      return;
    }
    let own = currentOwnClaim();
    if (!own) {
      adoptSingleOwnServerClaim();
      own = currentOwnClaim();
    }
    if (!own) { ownClaimLastConfirmedAt = 0; return; }
    const found = findSharedClaimById(own.claimId);
    if (found) {
      if (!validTargetId(selfPlayerId)) {
        ambiguousOwnServerClaims = true;
        return;
      }
      if (found.claim.claimer.playerId !== selfPlayerId) {
        saveOwnClaim(null);
        ownClaimLastConfirmedAt = 0;
        return;
      }
      ownClaimLastConfirmedAt = sharedClaimsVerifiedAt;
      ownClaimBoardTrack = { claimId: own.claimId, wireId: sharedClaimsWireId, readAt: sharedClaimsVerifiedAt, missingReads: 0 };
      saveOwnClaim({
        ...own,
        targetId: found.targetId,
        claimerPlayerId: found.claim.claimer.playerId,
        claimerName: found.claim.claimer.name,
        expiresAt: found.claim.expiresAt,
        cleanupRequired: Number(found.claim.position) > 1,
        wireId: sharedClaimsWireId
      });
      return;
    }
    // The own record is not on the board. Until enough complete reads say so
    // nothing is known, and every DIBS button stays blocked as before.
    ambiguousOwnServerClaims = true;
    // R2. The server's board is single-owner and atomic: a claim it holds is
    // on the board. So an own record that complete reads no longer find has
    // been released by the server (another member's hospital report, expiry,
    // a release from another device). Same rule as PC: at least
    // ownClaimMissingReadThreshold reads in a row, at least
    // ownClaimMissingGraceMs after the last confirmation. Stricter than PC in
    // three ways, each so that a record the server still holds is never
    // dropped:
    //   - the record must belong to THIS war's board. Either this page has
    //     found it there before (the track), or -- 1.5.186, for a page that
    //     was reloaded and has no track -- the record itself names this
    //     board: own.wireId is written only from the server's own data for
    //     that war (the answer to /claim, or a row of its board), so it is
    //     the one board the claim can be on. A record without wireId (saved
    //     by 1.5.185 or older) or with another war's id is left alone, as
    //     before: it may belong to another board;
    //   - a read counts only if it was complete for this target: the board
    //     not degraded and the target not unreadable;
    //   - one board read counts once, however often this runs on it.
    if (!sharedClaimsWireId) return;
    let track = ownClaimBoardTrack;
    if (track.claimId !== own.claimId || track.wireId !== sharedClaimsWireId) {
      if (!own.wireId || own.wireId !== sharedClaimsWireId) return;
      track = ownClaimBoardTrack = { claimId: own.claimId, wireId: sharedClaimsWireId, readAt: 0, missingReads: 0 };
    }
    if (sharedClaimUnknown(own.targetId)) {
      track.missingReads = 0;
      track.readAt = sharedClaimsVerifiedAt;
      return;
    }
    if (track.readAt === sharedClaimsVerifiedAt) return;
    track.readAt = sharedClaimsVerifiedAt;
    track.missingReads += 1;
    const sinceConfirmedMs = ownClaimLastConfirmedAt > 0
      ? nowMs() - ownClaimLastConfirmedAt
      : Math.max(0, nowMs() - Number(own.createdLocalAt || 0));
    if (track.missingReads < CONFIG.ownClaimMissingReadThreshold || sinceConfirmedMs < CONFIG.ownClaimMissingGraceMs) return;
    saveOwnClaim(null);
    ownClaimLastConfirmedAt = 0;
    ownClaimBoardTrack = { claimId: "", wireId: "", readAt: 0, missingReads: 0 };
    // More than one own claim on the board is still ambiguous. Exactly one --
    // a newer claim of this member's -- becomes the own record at once.
    ambiguousOwnServerClaims = activeSharedClaimsForClaimer(selfPlayerId).length > 1;
    adoptSingleOwnServerClaim();
  }

  // A write result must stay readable. Without the hold, the shared poll that
  // runs immediately after a write overwrites the message inside a few tens of
  // milliseconds and the outcome is invisible.
  //
  // Only routine progress is suppressed: a newer error always wins, and
  // beginSharedWriteFeedback clears the hold so the owner's next tap reports
  // itself at once.
  function beginSharedWriteFeedback() {
    sharedStatusHoldUntil = 0;
  }

  function holdSharedWriteFailure(message) {
    setSharedStatus("error", message);
    sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
  }

  function setSharedStatus(state, message, count = sharedClaims.size) {
    const next = String(state || "unknown");
    if (next !== "error" && nowMs() < sharedStatusHoldUntil) {
      // Keep the held message on screen, but do not lose the target count.
      sharedStatus = { ...sharedStatus, count: Number.isInteger(count) && count >= 0 ? count : sharedStatus.count };
      updatePanel();
      return;
    }
    sharedStatus = { state: next, message: normalizeText(message) || "War Room: unknown", count: Number.isInteger(count) && count >= 0 ? count : 0 };
    updatePanel();
  }

  // Reads the KS War Room claim board (POST /war/<wire id>/claims), polled
  // every CONFIG.sharedPollMs as the FFScouter board was. It needs the Torn
  // key, not the FFScouter key. Never in VIEW: the transport refuses it there
  // anyway, and a request that never left must not feed the sign-in guard.
  //
  // Fail closed: anything but a complete, readable board -- no session, 503,
  // status 0, an answer that is not JSON, one unreadable row -- leaves
  // sharedClaimsVerifiedAt at 0, which blocks every DIBS button. It is never
  // read as "nobody has claimed anything".
  async function fetchSharedClaims({ allowDuringWrite = false } = {}) {
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return false;
    if (viewOnlyMode()) return false;
    if (ffCredentialChangeBusy() || tornCredentialMutationInProgress || (sharedWriteBusy && !allowDuringWrite)) return false;
    const requestKey = effectiveTornApiKey();
    if (!requestKey || sharedSyncing || nowMs() < sharedBackoffUntil) return false;
    const wireId = currentWireWarId();
    if (!wireId) {
      // R6a. The war on screen cannot be established, so the board held in
      // memory is verified for nothing: it must not stand as verified.
      sharedClaimsVerifiedAt = 0;
      return false;
    }
    if (sharedClaimsWireId !== wireId) {
      // The snapshot was read for another war. It says nothing about this one.
      sharedClaims = new Map(); sharedClaimsUnreadable = new Set();
      sharedClaimsDegraded = false;
      sharedClaimsVerifiedAt = 0;
      sharedClaimsWireId = wireId;
    }
    if (!ksSessionReady(requestKey)) {
      const waiting = ksSignInGuardVerdict(requestKey);
      if (waiting) {
        // The guard is holding the sign-in back: nothing is sent, and the row
        // says why instead of flashing CHECKING on every poll.
        const held = { signIn: waiting };
        sharedClaimsVerifiedAt = 0;
        setSharedStatus(ksFailureState(held), ksFailureLine(held));
        return false;
      }
    }
    const generation = runtimeGeneration;
    const authorityEpoch = sharedAuthorityEpoch;
    const credentialEpoch = tornCredentialEpoch;
    const requestRoot = canonicalPdaRankedWarSurface()?.root || null;
    const requestSerial = ++sharedRequestSerial;
    sharedSyncing = true;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      authorityEpoch === sharedAuthorityEpoch &&
      requestSerial === sharedRequestSerial &&
      credentialEpoch === tornCredentialEpoch &&
      requestKey === effectiveTornApiKey() &&
      requestRoot === (canonicalPdaRankedWarSurface()?.root || null) &&
      wireId === currentWireWarId() &&
      !tornCredentialMutationInProgress &&
      runtimeActive &&
      isRuntimeEligible() &&
      isWarPanelPresent()
    );
    setSharedStatus("syncing", "War Room: CHECKING…");
    let failed = null;
    try {
      let result = null;
      for (let attempt = 0; attempt <= CONFIG.sharedTransportRetryAttempts; attempt += 1) {
        if (!isCurrentRequest()) return false;
        result = await ksWarRoomRequest("claims", wireId, {}, { isCurrent: isCurrentRequest });
        if (!isCurrentRequest()) return false;
        // A sign-in the guard refused is not a transport hiccup: no retry.
        if (result.ok || result.status !== 0 || result.signIn || attempt >= CONFIG.sharedTransportRetryAttempts) break;
        await wait(CONFIG.sharedTransportRetryDelayMs * (attempt + 1));
        if (!isCurrentRequest()) return false;
      }
      const normalized = result?.ok ? normalizeKsWarRoomClaims(result.body, wireId) : null;
      if (!normalized) {
        if (Number(result?.status) === 0 && !result?.signIn) sharedTransportFailureStreak += 1; else sharedTransportFailureStreak = 0;
        failed = result || {};
        throw new Error("claim board not readable");
      }
      sharedTransportFailureStreak = 0;
      sharedCredentialRejected = false;
      sharedClaims = normalized.claims;
      sharedClaimsUnreadable = normalized.unreadable;
      sharedClaimsDegraded = normalized.degraded;
      sharedClaimsVerifiedAt = nowMs();
      sharedBackoffUntil = 0;
      reconcileOwnClaimFromShared();
      if (ambiguousOwnServerClaims) {
        setSharedStatus("error", "War Room: multiple own claims require manual review", sharedClaims.size);
      } else if (currentClaimQuarantine()) {
        setSharedStatus("error", "War Room: claim acknowledgement awaiting verification", sharedClaims.size);
      } else if (sharedClaimsDegraded || sharedClaimsUnreadable.size) {
        // A partial board that looks complete is worse than an offline one,
        // because it reads as "these targets are free".
        setSharedStatus("degraded", `War Room: SIGNED IN · ${sharedClaims.size} targets · ${normalized.unreadableCount} unreadable`, sharedClaims.size);
      } else {
        setSharedStatus("online", `War Room: SIGNED IN · ${sharedClaims.size} targets`, sharedClaims.size);
      }
      scanWarRows();
      // Follow-ups off the board just read, neither of them a second read of
      // it: the hospital report (K5) and the claimer names (5 min throttle).
      queueMicrotask(() => {
        if (!runtimeActive || !isRuntimeEligible()) return;
        void reportHospitalUpdatesToWarRoom();
        void fetchOwnFactionMemberNames();
      });
      return true;
    } catch {
      if (isCurrentRequest()) {
        sharedClaimsVerifiedAt = 0;
        setSharedStatus(ksFailureState(failed), ksFailureLine(failed));
      }
      return false;
    } finally {
      // R3. The newest read started owns the busy flag, and it always hands it
      // back. The old test also asked for an unchanged credential epoch and
      // key, and those can change without invalidateSharedReads() (a rejected
      // injected key): the flag then stayed set and no read ever ran again.
      // Two reads still cannot both count: every read takes a new serial, a
      // read commits only while its serial is the newest (isCurrentRequest),
      // and an older read neither commits nor clears the newer one's flag.
      if (requestSerial === sharedRequestSerial) sharedSyncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FF / Est stats — preserve v1.5.11 initial latency policy
  // ---------------------------------------------------------------------------

  function normalizeFairFightStats(payload, targetIds) {
    const fetchedAt = nowMs();
    const requested = [...new Set(targetIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
    const requestedSet = new Set(requested);
    const result = new Map();

    const rows = Array.isArray(payload) ? payload
      : Array.isArray(payload?.stats) ? payload.stats
      : Array.isArray(payload?.data) ? payload.data
      : Array.isArray(payload?.results) ? payload.results
      : [];

    for (const item of rows) {
      const playerId = Number(item?.player_id);
      if (!Number.isInteger(playerId) || playerId <= 0 || !requestedSet.has(playerId)) continue;

      const fairFight = Number(item?.fair_fight);
      const estimate = Number(item?.bs_estimate);
      const complete = Number.isFinite(fairFight) && fairFight > 0 &&
        Number.isFinite(estimate) && estimate > 0 &&
        Boolean(normalizeText(item?.bs_estimate_human));

      if (!complete) {
        result.set(playerId, { noData: true, playerId, fairFight: null, bsEstimate: null, bsEstimateHuman: "", fetchedAt });
        continue;
      }

      result.set(playerId, {
        noData: false,
        playerId,
        fairFight,
        bsEstimate: estimate,
        bsEstimateHuman: normalizeText(item.bs_estimate_human),
        fetchedAt
      });
    }

    for (const playerId of requested) {
      if (!result.has(playerId)) {
        result.set(playerId, { noData: true, playerId, fairFight: null, bsEstimate: null, bsEstimateHuman: "", fetchedAt });
      }
    }
    return result;
  }

  function scoutStatsForTarget(targetId) {
    const playerId = Number(targetId);
    if (!Number.isInteger(playerId) || playerId <= 0) return null;
    const entry = fairFightStats.get(playerId);
    if (!entry || !Number.isFinite(entry.fetchedAt) || nowMs() - entry.fetchedAt > CONFIG.fairFightMaxAgeMs) return null;
    return entry.noData ? null : entry;
  }

  function fairFightForTarget(targetId) {
    const entry = scoutStatsForTarget(targetId);
    return Number.isFinite(entry?.fairFight) ? Number(entry.fairFight) : null;
  }

  function scheduleFairFightRecoveryRetry() {
    if (fairFightRetryTimer !== null || !sharedApiKey) return;
    const generation = runtimeGeneration;
    fairFightRetryTimer = window.setTimeout(() => {
      fairFightRetryTimer = null;
      if (generation === runtimeGeneration && runtimeActive && isRuntimeEligible() && bridgeMounted && isWarPanelPresent() && sharedApiKey) void fetchFairFightStats({ force: true });
    }, CONFIG.fairFightTransportRecoveryMs);
  }

  function knownOpponentTargetIds() {
    const ids = new Set();
    if (opponentMembersState.factionId === opponentFactionId) {
      for (const id of opponentMembersState.members.keys()) {
        if (validTargetId(id)) ids.add(String(Number(id)));
      }
    }
    for (const id of targetRows.keys()) {
      if (validTargetId(id)) ids.add(String(Number(id)));
    }
    return [...ids]
      .sort((a, b) => Number(a) - Number(b))
      .slice(0, CONFIG.fairFightMaxTargets);
  }

  async function fetchFairFightStats({ force = false, missingOnly = false } = {}) {
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return false;
    if (ffCredentialChangeBusy() || !sharedApiKey || fairFightSyncing || nowMs() < fairFightBackoffUntil) return false;
    if (!force && fairFightLastFetchAt > 0 && nowMs() - fairFightLastFetchAt < CONFIG.fairFightRefreshMs) return false;
    const knownTargetIds = knownOpponentTargetIds();
    const targetIds = missingOnly
      ? knownTargetIds.filter(id => !fairFightStats.has(Number(id)))
      : knownTargetIds;
    if (!targetIds.length) return false;
    const generation = runtimeGeneration;
    const requestKey = sharedApiKey;
    const requestRoot = canonicalPdaRankedWarSurface()?.root || null;
    const requestSerial = ++fairFightRequestSerial;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      requestSerial === fairFightRequestSerial &&
      requestKey === sharedApiKey &&
      requestRoot === (canonicalPdaRankedWarSurface()?.root || null) &&
      runtimeActive &&
      isRuntimeEligible() &&
      bridgeMounted &&
      isWarPanelPresent()
    );
    fairFightSyncing = true;
    try {
      const initial = !fairFightEverSucceeded;
      const result = await fairFightStatsRequest(targetIds, { initial, isCurrent: isCurrentRequest, apiKey: requestKey });
      if (!isCurrentRequest() || !result) return false;
      if (!result.ok) {
        if (result.status === 429) fairFightBackoffUntil = nowMs() + CONFIG.fairFightErrorBackoffMs;
        if (result.status === 0) scheduleFairFightRecoveryRetry();
        throw new Error(normalizeText(result?.body?.error) || `HTTP ${result.status}`);
      }
      const fetchedStats = normalizeFairFightStats(result.body, targetIds);
      fairFightStats = missingOnly
        ? new Map([...fairFightStats, ...fetchedStats])
        : fetchedStats;
      fairFightLastFetchAt = nowMs();
      fairFightBackoffUntil = 0;
      fairFightEverSucceeded = true;
      if (fairFightRetryTimer !== null) { window.clearTimeout(fairFightRetryTimer); fairFightRetryTimer = null; }
      scanWarRows();
      return true;
    } catch {
      if (isCurrentRequest()) {
        // Keep the values we have; each one expires on its own after
        // fairFightMaxAgeMs. Retry on the next timer tick.
        if (!missingOnly) fairFightLastFetchAt = 0;
        scanWarRows();
      }
      return false;
    } finally {
      if (requestSerial === fairFightRequestSerial && requestKey === sharedApiKey) fairFightSyncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Torn member status
  // ---------------------------------------------------------------------------

  function setTornStatusState(state, message, count = 0) {
    tornStatusState = { state: String(state || "unknown"), message: normalizeText(message) || "Torn: unknown", count: Number.isInteger(count) && count >= 0 ? count : 0 };
    updatePanel();
  }

  function normalizeRankedWarParticipants(factions) {
    if (!Array.isArray(factions) || factions.length !== 2) return null;
    const participants = new Map();
    for (const faction of factions) {
      if (!isPlainRecord(faction)) return null;
      if (
        !Object.prototype.hasOwnProperty.call(faction, "id") ||
        !Object.prototype.hasOwnProperty.call(faction, "name") ||
        !Object.prototype.hasOwnProperty.call(faction, "score") ||
        !Object.prototype.hasOwnProperty.call(faction, "chain") ||
        !isInt32(faction.id, { positive: true }) ||
        typeof faction.name !== "string" ||
        !normalizeText(faction.name) ||
        !isInt32(faction.score, { nonNegative: true }) ||
        !isInt32(faction.chain, { nonNegative: true })
      ) return null;
      const id = String(faction.id);
      if (participants.has(id)) return null;
      participants.set(id, { id, name: normalizeText(faction.name), score: faction.score, chain: faction.chain });
    }
    return participants;
  }

  function normalizeOwnWars(payload, fetchedAt = nowMs(), surface = null) {
    if (!isPlainRecord(payload) || payload.error) return null;
    if (
      !surface ||
      !validTargetId(surface.warId) ||
      !validTargetId(surface.opponentFactionId) ||
      !validTargetId(surface.selfFactionId) ||
      !Number.isInteger(surface.surfaceSerial) ||
      surface.surfaceSerial <= 0
    ) return null;
    const wars = payload.wars;
    if (!isPlainRecord(wars) || !Object.prototype.hasOwnProperty.call(wars, "ranked")) return null;
    const ranked = wars.ranked;
    if (ranked === null) return emptyOwnWarsState(fetchedAt, surface);
    if (!isPlainRecord(ranked)) return null;
    for (const field of ["war_id", "start", "end", "target", "winner", "factions"]) {
      if (!Object.prototype.hasOwnProperty.call(ranked, field)) return null;
    }
    if (!isInt32(ranked.war_id, { positive: true }) || !isInt32(ranked.start, { positive: true }) || !isInt32(ranked.target, { positive: true })) return null;
    if (ranked.end !== null && !isInt32(ranked.end, { positive: true })) return null;
    if (ranked.end !== null && ranked.end <= ranked.start) return null;
    const participants = normalizeRankedWarParticipants(ranked.factions);
    const selfId = String(Number(surface.selfFactionId));
    const opponentId = String(Number(surface.opponentFactionId));
    if (!participants || !participants.has(selfId) || !participants.has(opponentId)) return null;
    if (ranked.winner !== null && (!isInt32(ranked.winner, { positive: true }) || !participants.has(String(ranked.winner)))) return null;
    if (ranked.winner !== null && ranked.end === null) return null;
    const warId = String(ranked.war_id);
    if (warId !== String(Number(surface.warId))) return null;
    const responseTimestamp = Number(payload.timestamp);
    const authoritativeNow = Number.isSafeInteger(responseTimestamp) && responseTimestamp > 0
      ? responseTimestamp
      : Math.floor(getTornNowMs() / 1000);
    const unfinished = ranked.winner === null && (ranked.end === null || authoritativeNow < ranked.end);
    const phase = unfinished && authoritativeNow < ranked.start
      ? RW_PHASE.PREWAR
      : (unfinished && authoritativeNow >= ranked.start ? RW_PHASE.LIVE : RW_PHASE.UNKNOWN);
    return {
      phase,
      live: phase === RW_PHASE.LIVE,
      start: ranked.start,
      warId,
      opponentFactionId: opponentId,
      selfFactionId: selfId,
      surfaceWarId: String(Number(surface.warId)),
      surfaceOpponentFactionId: opponentId,
      surfaceSerial: surface.surfaceSerial,
      fetchedAt
    };
  }

  function normalizeTornMembers(payload) {
    if (!isPlainRecord(payload) || payload.error) return null;
    const source = payload.members;
    const entries = Array.isArray(source)
      ? source.map(member => ["", member])
      : (isPlainRecord(source) ? Object.entries(source) : null);
    if (!entries) return null;
    const members = new Map();
    for (const [key, member] of entries) {
      if (!isPlainRecord(member) || !isPlainRecord(member.status)) continue;
      const rawId = String(member.id ?? member.player_id ?? key ?? "").trim();
      const id = validTargetId(rawId) ? String(Number(rawId)) : "";
      const status = member.status;
      const rawUntil = status.until;
      const until = rawUntil === null || rawUntil === undefined || rawUntil === "" ? 0 : Number(rawUntil);
      if (!id || !Number.isSafeInteger(until) || until < 0) continue;
      members.set(id, {
        state: normalizeText(status?.state),
        description: normalizeText(status?.description),
        details: normalizeText(status?.details),
        until,
        activity: typeof member.last_action?.status === "string" &&
          ["online", "idle", "offline"].includes(member.last_action.status.trim().toLowerCase())
          ? member.last_action.status.trim().toLowerCase() : null,
        activityTimestamp: Number.isInteger(member.last_action?.timestamp)
          ? member.last_action.timestamp : null
      });
    }
    return members;
  }

  function recordTornClockOffset(result, body) {
    const timestamp = Number(body?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    // Same whole-second evidence as the Date header, from the body instead.
    // Torn reports the floor of its clock, so the value names the second start.
    recordTornWholeSecondMs(timestamp * 1000, Number(result.startedAt), Number(result.endedAt));
  }

  function tornPageUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return /^(?:www\.)?torn\.com$/i.test(url.hostname) ? url : null;
    } catch { return null; }
  }

  function factionIdFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return "";
    const url = tornPageUrl(link.getAttribute("href") || link.href);
    if (!url || !/\/factions\.php$/i.test(url.pathname)) return "";
    for (const name of ["ID", "id"]) {
      const id = String(url.searchParams.get(name) || "").trim();
      if (validTargetId(id)) return String(Number(id));
    }
    return "";
  }

  function isRenderedRouteSurfaceElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    for (let current = element; current instanceof HTMLElement; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(current);
      const opacity = Number.parseFloat(style.opacity || "1");
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.pointerEvents === "none" || (Number.isFinite(opacity) && opacity <= 0)) return false;
    }
    const rect = element.getBoundingClientRect();
    return element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0;
  }

  function warCardFactionIds(card) {
    if (!(card instanceof HTMLElement)) return [];
    return [...new Set([...card.querySelectorAll("a[href]")].map(factionIdFromLink).filter(validTargetId))];
  }

  function canonicalPdaRankedWarSurface() {
    if (!isAnyRankedWarRoute()) return null;
    const roots = [...document.querySelectorAll("#faction_war_list_id")]
      .filter(root => root instanceof HTMLElement && isRenderedRouteSurfaceElement(root));
    if (roots.length !== 1) return null;
    const root = roots[0];
    const enemySurface = root.matches(".enemy-faction")
      ? root
      : (root.closest(".enemy-faction") || root.querySelector(".enemy-faction"));
    if (!(enemySurface instanceof HTMLElement) || !isRenderedRouteSurfaceElement(enemySurface)) return null;
    const scopes = [root, root.parentElement, root.closest(".faction-war"), root.closest("main")].filter(Boolean);
    const cards = new Set();
    for (const scope of scopes) {
      if (scope instanceof HTMLElement && scope.matches("[data-warid]")) cards.add(scope);
      for (const card of scope?.querySelectorAll?.("[data-warid]") || []) {
        if (card.contains(root) || root.contains(card)) cards.add(card);
      }
    }
    const candidates = [...cards].filter(card => (
      card instanceof HTMLElement &&
      isRenderedRouteSurfaceElement(card) &&
      validTargetId(card.dataset.warid) &&
      warCardFactionIds(card).length === 2
    ));
    if (candidates.length !== 1) return null;
    const card = candidates[0];
    const factionIds = warCardFactionIds(card);
    if (factionIds.length !== 2) return null;
    return {
      card,
      root,
      enemySurface,
      warId: String(Number(card.dataset.warid)),
      factionIds,
      countdownSeconds: readRankedWarCountdownSeconds(card)
    };
  }

  function operationalWarSurfaceForFaction(factionId) {
    // In VIEW the owner's own faction is not on this card, so the faction whose
    // page is open takes its place. Nothing is written in VIEW, so this is a
    // presentation identity only -- the authority path still requires
    // isRankedWarRoute() via viewOnlyMode().
    const anchorId = viewOnlyMode() ? viewedFactionIdFromRoute() : factionId;
    if (!validTargetId(anchorId)) return null;
    const canonical = canonicalPdaRankedWarSurface();
    if (!canonical) return null;
    const selfId = String(Number(anchorId));
    const factionIds = canonical.factionIds;
    if (!factionIds.includes(selfId)) return null;
    const opponentId = factionIds.find(id => id !== selfId) || "";
    if (!validTargetId(opponentId)) return null;
    return {
      card: canonical.card,
      root: canonical.root,
      warId: canonical.warId,
      countdownSeconds: canonical.countdownSeconds,
      opponentFactionId: String(Number(opponentId)),
      selfFactionId: selfId,
      surfaceSerial: 1
    };
  }

  function operationalWarSurfaceMatches(expected) {
    const current = operationalWarSurfaceForFaction(expected?.selfFactionId);
    return Boolean(current && current.card === expected.card && current.root === expected.root && current.warId === expected.warId && current.opponentFactionId === expected.opponentFactionId && current.selfFactionId === expected.selfFactionId);
  }

  function refreshCurrentWarSurface({ structural = false } = {}) {
    const selected = operationalWarSurfaceForFaction(selfFactionId);
    if (!selected) {
      if (currentWarSurface || opponentFactionId) {
        resetLifeState();
        warSurfaceSerial += 1;
        invalidateOwnWarsState();
      }
      prewarObservation = null;
      currentWarSurface = null;
      opponentFactionId = "";
      opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
      return null;
    }
    // Identity is the WAR and the OPPONENT, never the DOM node.
    //
    // Torn re-renders the war card on every score tick once the war is running.
    // Treating a new node as a new war called invalidateOwnWarsState(), which
    // wiped the confirmed LIVE state, so currentRwPhase() fell back to UNKNOWN
    // and every DIBS button locked with rw-phase-unverifiable -- for the rest of
    // the war, because the card keeps being re-rendered. That is the lock the
    // owner hit in the last Ranked War. Reproduced and locked down in
    // tools\war-dibs-pda\phase.mjs.
    //
    // The node reference is still refreshed below; it is just not evidence that
    // the war changed. A real change of war or opponent, and an explicit
    // structural reset, invalidate exactly as before.
    const previousSurface = currentWarSurface;
    const identityChanged =
      structural ||
      !previousSurface ||
      previousSurface.warId !== selected.warId ||
      previousSurface.opponentFactionId !== selected.opponentFactionId;
    const previousOpponent = opponentFactionId;
    opponentFactionId = selected.opponentFactionId;
    if (previousOpponent !== opponentFactionId) opponentMembersState = { factionId: opponentFactionId, members: new Map(), fetchedAt: 0 };
    if (identityChanged) {
      resetLifeState();
      warSurfaceSerial += 1;
      invalidateOwnWarsState();
      prewarObservation = null;
    }
    // The no-war marker only matters while the war is not yet confirmed LIVE.
    // Re-reading it on every repaint of a running war would be DOM work per row
    // per tick on a phone, for a value that cannot change the outcome.
    const shouldReadPrewarSurface = identityChanged || !previousSurface || !ownWarsFreshLive();
    currentWarSurface = {
      ...selected,
      surfaceSerial: warSurfaceSerial || 1,
      noWarMarker: shouldReadPrewarSurface
        ? pageHasExplicitNoWarMarker()
        : previousSurface.noWarMarker
    };
    if (!warSurfaceSerial) warSurfaceSerial = 1;
    currentWarSurface.surfaceSerial = warSurfaceSerial;

    if (
      !ownWarsFreshLive() &&
      currentWarSurface.noWarMarker &&
      Number.isFinite(currentWarSurface.countdownSeconds) &&
      currentWarSurface.countdownSeconds > 0 &&
      !lockedPrewarWarIds.has(currentWarSurface.warId) &&
      prewarObservation?.warId !== currentWarSurface.warId
    ) {
      prewarObservation = {
        warId: currentWarSurface.warId,
        startAtSeconds: Math.floor(getTornNowMs() / 1000) + currentWarSurface.countdownSeconds
      };
    }
    return currentWarSurface;
  }

  function captureCurrentWarSurface() {
    const surface = refreshCurrentWarSurface();
    if (!surface?.card?.isConnected || !validTargetId(surface.warId) || !validTargetId(surface.opponentFactionId) || !validTargetId(selfFactionId)) return null;
    return {
      card: surface.card,
      root: surface.root,
      warId: String(Number(surface.warId)),
      opponentFactionId: String(Number(surface.opponentFactionId)),
      selfFactionId: String(Number(selfFactionId)),
      surfaceSerial: surface.surfaceSerial
    };
  }

  function currentWarSurfaceMatchesSnapshot(surface) {
    return Boolean(surface && currentWarSurface?.card === surface.card && currentWarSurface?.root === surface.root && currentWarSurface?.card?.isConnected && currentWarSurface?.surfaceSerial === surface.surfaceSerial && currentWarSurface?.warId === surface.warId && currentWarSurface?.opponentFactionId === surface.opponentFactionId && selfFactionId === surface.selfFactionId && operationalWarSurfaceMatches(surface));
  }

  function ownWarsStateMatchesSurface(surface = currentWarSurface) {
    return Boolean(surface && ownWarsState.surfaceSerial === surface.surfaceSerial && ownWarsState.surfaceWarId === String(surface.warId || "") && ownWarsState.surfaceOpponentFactionId === String(surface.opponentFactionId || "") && ownWarsState.opponentFactionId === String(surface.opponentFactionId || "") && ownWarsState.selfFactionId === selfFactionId);
  }

  function ownWarsFreshLive(maxAgeMs = CONFIG.tornStatusMaxAgeMs) {
    return Boolean(ownWarsState.live === true && ownWarsState.phase === RW_PHASE.LIVE && ownWarsState.warId === currentWarSurface?.warId && ownWarsStateMatchesSurface() && nowMs() - ownWarsState.fetchedAt <= maxAgeMs);
  }

  async function tornReadWithTransportRetry(path, key, { cacheBust = false, isCurrent = () => true } = {}) {
    let result = null;
    for (let attempt = 0; attempt <= CONFIG.tornTransportRetryAttempts; attempt += 1) {
      if (!isCurrent()) return result;
      result = await tornApiRequest(path, key, { cacheBust });
      if (!isCurrent()) return result;
      if (result.ok || result.status !== 0 || attempt >= CONFIG.tornTransportRetryAttempts) break;
      await wait(CONFIG.tornTransportRetryDelayMs * (attempt + 1));
    }
    return result;
  }

  // 1.5.174: a short burst of extra Torn reads, run once per runtime start,
  // purely to feed the bound clock. Same transport wrapper, same gate, same
  // budget as every other read. Never touches ownWarsState/viewMembersState/
  // opponentMembersState -- the clock is fed automatically by
  // tornApiRequest's own recordTornClockFromHeaders, plus (own war only)
  // the body timestamp via trackedRecordTornClockOffset.
  async function runTornClockSyncBurst() {
    if (tornClockSyncBurstGeneration === runtimeGeneration) return;
    tornClockSyncBurstGeneration = runtimeGeneration;
    const key = effectiveTornApiKey();
    if (!key) return;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const isCurrentBurst = () => (
      generation === runtimeGeneration &&
      credentialEpoch === tornCredentialEpoch &&
      key === effectiveTornApiKey() &&
      runtimeActive &&
      isRuntimeEligible()
    );
    const clockBoundsWidthMs = () => (
      Number.isFinite(tornClockLowMs) && Number.isFinite(tornClockHighMs)
        ? tornClockHighMs - tornClockLowMs
        : Infinity
    );
    for (let attempt = 0; attempt < CONFIG.tornClockSyncBurstMaxAttempts; attempt += 1) {
      if (!isCurrentBurst() || clockBoundsWidthMs() <= CONFIG.tornClockSyncBurstTargetWidthMs) return;
      if (viewOnlyMode()) {
        const factionId = viewPermittedFactionIds()[0];
        if (!validTargetId(factionId)) return;
        await tornReadWithTransportRetry(`/v2/faction/${factionId}/members`, key, { isCurrent: isCurrentBurst });
        // No further action: recordTornClockFromHeaders already ran inside
        // tornApiRequest. The response is discarded, same as its headers.
      } else {
        const result = await tornReadWithTransportRetry(SCRIPT.tornOwnWarsPath, key, { isCurrent: isCurrentBurst });
        if (isCurrentBurst() && result?.ok && !result.body?.error) trackedRecordTornClockOffset(result, result.body);
      }
      if (!isCurrentBurst() || clockBoundsWidthMs() <= CONFIG.tornClockSyncBurstTargetWidthMs) return;
      if (attempt < CONFIG.tornClockSyncBurstMaxAttempts - 1) await wait(CONFIG.tornClockSyncBurstDelayMs);
    }
  }

  async function fetchOwnWars({ force = false } = {}) {
    const key = effectiveTornApiKey();
    if (!key || !keyScopeReady || !validTargetId(selfFactionId) || !runtimeActive || !isRuntimeEligible()) return false;
    const surface = captureCurrentWarSurface();
    if (!surface) return false;
    if (!force && ownWarsStateMatchesSurface(surface) && nowMs() - ownWarsState.fetchedAt < CONFIG.tornStatusPollMs) return true;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++ownWarsRequestSerial;
    const isCurrentRequest = () => generation === runtimeGeneration && credentialEpoch === tornCredentialEpoch && requestSerial === ownWarsRequestSerial && key === effectiveTornApiKey() && runtimeActive && isRuntimeEligible() && currentWarSurfaceMatchesSnapshot(surface);
    try {
      const result = await tornReadWithTransportRetry(SCRIPT.tornOwnWarsPath, key, { cacheBust: force, isCurrent: isCurrentRequest });
      if (!isCurrentRequest() || !result?.ok || result.body?.error) return false;
      const fetchedAt = Number(result.endedAt) || nowMs();
      trackedRecordTornClockOffset(result, result.body);
      const next = normalizeOwnWars(result.body, fetchedAt, surface);
      if (!next) {
        ownWarsState = emptyOwnWarsState(fetchedAt, surface);
        return false;
      }
      ownWarsState = next;
      return true;
    } catch { return false; }
  }

  async function fetchOpponentMembers({ force = false } = {}) {
    refreshCurrentWarSurface();
    const key = effectiveTornApiKey();
    const factionId = opponentFactionId;
    if (!key || !keyScopeReady || !validTargetId(factionId) || !runtimeActive || !isRuntimeEligible()) return false;
    if (!force && opponentMembersState.factionId === factionId && nowMs() - opponentMembersState.fetchedAt < CONFIG.tornStatusPollMs) return true;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const surface = captureCurrentWarSurface();
    const isCurrentRequest = () => generation === runtimeGeneration && credentialEpoch === tornCredentialEpoch && key === effectiveTornApiKey() && factionId === opponentFactionId && runtimeActive && isRuntimeEligible() && currentWarSurfaceMatchesSnapshot(surface);
    try {
      const result = await tornReadWithTransportRetry(`/v2/faction/${factionId}/members`, key, { cacheBust: force, isCurrent: isCurrentRequest });
      if (!isCurrentRequest() || !result?.ok || result.body?.error) return false;
      const members = normalizeTornMembers(result.body);
      if (!(members instanceof Map)) return false;
      opponentMembersState = { factionId, members, fetchedAt: Number(result.endedAt) || nowMs() };
      const hasMissingScoutStats = [...members.keys()]
        .some(id => !fairFightStats.has(Number(id)));
      if (sharedApiKey && hasMissingScoutStats) {
        queueMicrotask(() => {
          if (runtimeActive && isRuntimeEligible() && sharedApiKey) {
            void fetchFairFightStats({ force: true, missingOnly: true });
          }
        });
      }
      return true;
    } catch { return false; }
  }

  async function fetchViewMembers({ force = false } = {}) {
    if (!viewOnlyMode()) return false;
    const key = effectiveTornApiKey();
    const factionIds = viewPermittedFactionIds();
    if (!key || factionIds.length === 0 || !runtimeActive || !isRuntimeEligible()) return false;
    if (
      !force &&
      viewMembersState.factionIds.length > 0 &&
      factionIds.every(id => viewMembersState.factionIds.includes(id)) &&
      nowMs() - viewMembersState.fetchedAt < CONFIG.tornStatusPollMs
    ) return true;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      credentialEpoch === tornCredentialEpoch &&
      key === effectiveTornApiKey() &&
      runtimeActive &&
      isRuntimeEligible()
    );
    const merged = new Map();
    const readIds = [];
    for (const factionId of factionIds) {
      if (!isCurrentRequest()) return false;
      const result = await tornReadWithTransportRetry(`/v2/faction/${factionId}/members`, key, { cacheBust: force, isCurrent: isCurrentRequest });
      if (!isCurrentRequest()) return false;
      if (!result?.ok || result.body?.error) continue;
      const members = normalizeTornMembers(result.body);
      if (!(members instanceof Map)) continue;
      for (const [id, status] of members) merged.set(id, status);
      readIds.push(factionId);
    }
    if (!readIds.length) return false;
    viewMembersState = { factionIds: readIds, members: merged, fetchedAt: nowMs() };
    return true;
  }

  async function fetchTornStatuses({ force = false } = {}) {
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return false;
    const key = effectiveTornApiKey();
    if (!key || tornStatusSyncing || (!force && nowMs() < tornStatusBackoffUntil)) return false;
    if (viewOnlyMode()) {
      // Read-only preview of somebody else's war. No own identity is needed or
      // obtainable here, and asking for one fails closed at the transport.
      const generation = runtimeGeneration;
      const credentialEpoch = tornCredentialEpoch;
      const requestSerial = ++tornStatusRequestSerial;
      tornStatusSyncing = true;
      setTornStatusState("syncing", "Torn: syncing…");
      const viewCurrent = () => (
        requestSerial === tornStatusRequestSerial &&
        credentialEpoch === tornCredentialEpoch &&
        generation === runtimeGeneration &&
        key === effectiveTornApiKey() &&
        runtimeActive &&
        isRuntimeEligible()
      );
      try {
        const viewReady = await fetchViewMembers({ force });
        if (!viewCurrent()) return false;
        if (!viewReady) throw new Error("members unavailable");
        tornStatusBackoffUntil = 0;
        tornTransportFailureStreak = 0;
        setTornStatusState("ready", `Torn: VIEW · ${viewMembersState.members.size} members`, viewMembersState.members.size);
        scanWarRows();
        return true;
      } catch (error) {
        if (viewCurrent()) {
          tornStatusBackoffUntil = nowMs() + CONFIG.tornStatusErrorBackoffMs;
          setTornStatusState("error", `Torn: ${normalizeText(error?.message) || "offline"}`, 0);
          scanWarRows();
        }
        return false;
      } finally {
        if (requestSerial === tornStatusRequestSerial && credentialEpoch === tornCredentialEpoch) tornStatusSyncing = false;
      }
    }
    if (!validTargetId(selfPlayerId) || !validTargetId(selfFactionId) || !keyScopeReady) {
      const identityReady = await fetchSelfIdentity({ force });
      return identityReady ? fetchTornStatuses({ force: false }) : false;
    }
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++tornStatusRequestSerial;
    tornStatusSyncing = true;
    setTornStatusState("syncing", "Torn: syncing…");
    const isCurrentRequest = () => requestSerial === tornStatusRequestSerial && credentialEpoch === tornCredentialEpoch && generation === runtimeGeneration && key === effectiveTornApiKey() && runtimeActive && isRuntimeEligible();
    try {
      const warsReady = await fetchOwnWars({ force });
      if (!isCurrentRequest() || !warsReady) throw new Error("own faction wars unavailable");
      const membersReady = await fetchOpponentMembers({ force });
      if (!isCurrentRequest()) return false;
      if (!membersReady) throw new Error("opponent members unavailable");
      tornStatusBackoffUntil = 0;
      tornTransportFailureStreak = 0;
      const memberCount = membersReady && opponentMembersState.factionId === opponentFactionId ? opponentMembersState.members.size : 0;
      const activityCount = memberCount > 0 ? [...opponentMembersState.members.values()].filter(member => member.activity !== null).length : 0;
      const rwLabel = ownWarsState.live ? "LIVE" : (ownWarsState.phase === RW_PHASE.PREWAR ? "PREWAR" : "not confirmed");
      setTornStatusState(membersReady ? "ready" : "error", `Torn: own RW ${rwLabel} · ${memberCount} members · activity ${activityCount}/${memberCount}`, memberCount);
      void runLifeReadQueue();
      scanWarRows();
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        tornTransportFailureStreak += 1;
        tornStatusBackoffUntil = nowMs() + CONFIG.tornStatusErrorBackoffMs;
        invalidateOwnWarsState();
        const opponentSnapshotAgeMs = nowMs() - opponentMembersState.fetchedAt;
        if (opponentMembersState.factionId !== opponentFactionId ||
            opponentMembersState.fetchedAt <= 0 ||
            opponentSnapshotAgeMs > CONFIG.opponentMembersMaxAgeMs) {
          opponentMembersState = { factionId: opponentFactionId, members: new Map(), fetchedAt: 0 };
        }
        setTornStatusState("error", `Torn: ${normalizeText(error?.message) || "offline"}`, 0);
        scanWarRows();
      }
      return false;
    } finally {
      if (requestSerial === tornStatusRequestSerial && credentialEpoch === tornCredentialEpoch && key === effectiveTornApiKey()) tornStatusSyncing = false;
    }
  }

  function tornStatusForTarget(targetId) {
    const id = String(targetId || "");
    if (viewOnlyMode()) {
      if (viewMembersState.factionIds.length === 0) return null;
      if (nowMs() - viewMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs) return null;
      return viewMembersState.members.get(id) || null;
    }
    if (!validTargetId(opponentFactionId) || opponentMembersState.factionId !== opponentFactionId || nowMs() - opponentMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs) return null;
    return opponentMembersState.members.get(id) || null;
  }

  // Rate timestamps survive suspend so blur/focus cannot bypass the limits.
  // Life values and the active queue are invalidated at every context change.
  function resetLifeState() {
    lifeContextSerial += 1;
    lifeCache.clear();
    lifeReadController?.abort();
    if (lifeClaimWaitCancel) lifeClaimWaitCancel();
  }

  function syncLifeCredential() {
    const key = effectiveTornApiKey();
    if (key && key !== lifeCapabilityKey) {
      lifeCapabilityKey = key;
      lifeProfileMissing = false;
      lifeKeyFailureCode = null;
      lifeRetryAfter = 0;
      resetLifeState();
    }
    return key;
  }

  function reserveTornRequest() {
    const now = nowMs();
    tornRequestTimes = tornRequestTimes.filter(at => now - at < 60000);
    if (tornRequestTimes.length >= CONFIG.tornCallsPerMinuteMax) return false;
    tornRequestTimes.push(now);
    return true;
  }

  function lifeRuntimeReady() {
    return runtimeActive && isRuntimeEligible() && !viewOnlyMode() &&
      !(typeof demoActive === "function" && demoActive()) && keyScopeReady &&
      validTargetId(selfFactionId) && validTargetId(opponentFactionId) &&
      currentWarSurface?.opponentFactionId === opponentFactionId &&
      currentRwPhase().phase === RW_PHASE.LIVE;
  }

  function lifeHospitalSecondsForTarget(targetId) {
    const status = tornStatusForTarget(targetId);
    if (!status || status.activity === "online") return null;
    if (!isHospitalStatusValue(status.state) && !isHospitalStatusValue(status.description) && !isHospitalStatusValue(status.details)) return null;
    if (hospitalUntilExpired(status.until)) return null;
    const seconds = hospitalRemainingSeconds(status.until);
    return Number.isFinite(seconds) && seconds >= 0 && seconds <= CONFIG.gateSeconds ? seconds : null;
  }

  function normalizeTargetLife(payload, targetId, fetchedAt) {
    const profile = payload?.profile;
    if (!isPlainRecord(profile) || !Number.isSafeInteger(profile.id) || String(profile.id) !== String(targetId)) return null;
    const current = profile.life?.current;
    const maximum = profile.life?.maximum;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(maximum) || maximum <= 0 || current > maximum) return null;
    if (!Number.isFinite(fetchedAt)) return null;
    return { current, maximum, ratio: current / maximum, fetchedAt, source: "torn-profile", schemaVersion: 1 };
  }

  function freshLifeForTarget(targetId) {
    const entry = lifeCache.get(String(targetId));
    if (!entry || entry.source !== "torn-profile" || entry.schemaVersion !== 1) return null;
    const age = nowMs() - entry.fetchedAt;
    return Number.isFinite(age) && age >= 0 && age <= CONFIG.lifeMaxAgeMs ? entry : null;
  }

  function lowHpForTarget(targetId) {
    const entry = freshLifeForTarget(targetId);
    return Boolean(entry && Number.isFinite(entry.ratio) && entry.ratio <= CONFIG.lowHpLifeMaxRatio);
  }

  async function readTargetLife(targetId, { forClaim = false, isCurrent = () => true } = {}) {
    const id = String(targetId);
    const key = syncLifeCredential();
    if (!key || lifeProfileMissing || lifeKeyFailureCode !== null || nowMs() < lifeRetryAfter || !validTargetId(id) || !lifeRuntimeReady() || !isCurrent() || lifeReadPending) return null;
    if (sharedWriteBusy && !forClaim) return null;
    if (lifeHospitalSecondsForTarget(id) === null) return null;
    const startedAt = nowMs();
    for (const [previousId, attemptedAt] of lifeReadAttempts) {
      if (startedAt - attemptedAt >= 60000) lifeReadAttempts.delete(previousId);
    }
    // A DIBS click is one deliberate read: it skips the 10 s spacing and the
    // queue's 30/min cap (it is still counted), so the claim is never delayed.
    // The 100/min Torn budget in tornApiRequest still applies.
    const lastAttempt = lifeReadAttempts.get(id);
    if (!forClaim && Number.isFinite(lastAttempt) && startedAt - lastAttempt < CONFIG.lifeReadMinIntervalMs) return null;
    lifeReadTimes = lifeReadTimes.filter(at => startedAt - at < 60000);
    if (!forClaim && lifeReadTimes.length >= CONFIG.lifeReadsPerMinuteMax) return null;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const contextSerial = lifeContextSerial;
    const warId = currentWarSurface?.warId;
    const surfaceSerial = currentWarSurface?.surfaceSerial;
    const opponentId = opponentFactionId;
    const controller = new AbortController();
    lifeReadController = controller;
    const current = () => !controller.signal.aborted && isCurrent() &&
      generation === runtimeGeneration && credentialEpoch === tornCredentialEpoch &&
      contextSerial === lifeContextSerial && key === effectiveTornApiKey() &&
      warId === currentWarSurface?.warId && surfaceSerial === currentWarSurface?.surfaceSerial &&
      opponentId === opponentFactionId && lifeRuntimeReady();
    lifeReadAttempts.set(id, startedAt);
    lifeReadTimes.push(startedAt);
    const operation = (async () => {
      try {
        const result = await tornApiRequest("/v2/user/" + id + "/profile", key, { signal: controller.signal });
        if (!current()) return null;
        const apiCode = Number(result?.body?.error?.code);
        if ([2, 10, 13, 18].includes(apiCode)) {
          lifeKeyFailureCode = apiCode;
          lifeCache.clear();
          updatePanel();
          scanWarRows();
          return null;
        }
        if ([5, 9, 17].includes(apiCode)) {
          lifeRetryAfter = nowMs() + 60000;
          return null;
        }
        if (apiCode === 16) {
          lifeProfileMissing = true;
          lifeCache.clear();
          updatePanel();
          scanWarRows();
          return null;
        }
        if (!result?.ok || result.body?.error) return null;
        // The start time is conservative: a delayed response cannot gain freshness.
        const entry = normalizeTargetLife(result.body, id, startedAt);
        if (!entry || (lifeCache.get(id)?.fetchedAt ?? -Infinity) > entry.fetchedAt) return null;
        lifeCache.set(id, entry);
        updatePanel();
        scanWarRows();
        return freshLifeForTarget(id);
      } catch {
        return null;
      }
    })();
    lifeReadPending = operation;
    try {
      return await operation;
    } finally {
      if (lifeReadPending === operation) lifeReadPending = null;
      if (lifeReadController === controller) lifeReadController = null;
    }
  }

  async function runLifeReadQueue() {
    syncLifeCredential();
    if (lifeQueueRunning || lifeProfileMissing || lifeKeyFailureCode !== null || nowMs() < lifeRetryAfter || !lifeRuntimeReady() || sharedWriteBusy) return false;
    const contextSerial = lifeContextSerial;
    lifeQueueRunning = true;
    try {
      const targets = [...opponentMembersState.members.keys()]
        .map(id => ({ id, seconds: lifeHospitalSecondsForTarget(id) }))
        .filter(target => target.seconds !== null)
        .sort((a, b) => a.seconds - b.seconds || Number(a.id) - Number(b.id));
      for (const target of targets) {
        if (contextSerial !== lifeContextSerial || !lifeRuntimeReady() || sharedWriteBusy || lifeProfileMissing || lifeKeyFailureCode !== null || nowMs() < lifeRetryAfter) break;
        await readTargetLife(target.id);
      }
      return true;
    } finally {
      lifeQueueRunning = false;
    }
  }

  async function waitForLifeClaimReadSlot(targetId, isCurrent = () => true) {
    syncLifeCredential();
    const contextSerial = lifeContextSerial;
    const current = () => contextSerial === lifeContextSerial && isCurrent() && lifeRuntimeReady() && !lifeProfileMissing && lifeKeyFailureCode === null && nowMs() >= lifeRetryAfter;
    if (!current()) return false;
    // An existing serial read has its normal request timeout and aborts on suspend.
    if (lifeReadPending) await lifeReadPending;
    // No 10 s per-target wait before a claim: the click read is exempt (1.1.6/1.5.179 review fix C1).
    return current();
  }

  function lifeStatusMessage() {
    syncLifeCredential();
    if (viewOnlyMode()) return "Life: not used in VIEW";
    if (lifeKeyFailureCode !== null) return "Life: API key rejected · low-life DIBS unavailable";
    if (lifeProfileMissing) return "Life: key lacks 'profile' · create a new custom key to use low-life DIBS";
    const newest = Math.max(...[...lifeCache.values()].map(entry => entry.fetchedAt));
    return Number.isFinite(newest)
      ? "Life: " + lifeCache.size + " targets read · newest " + Math.max(0, Math.floor((nowMs() - newest) / 1000)) + " s ago"
      : "Life: 0 targets read · newest unknown";
  }

  function freshOpponentActivityForTarget(targetId) {
    if (viewOnlyMode()) return null;
    const status = tornStatusForTarget(targetId);
    return ["online", "idle", "offline"].includes(status?.activity) ? status.activity : null;
  }

  // ---------------------------------------------------------------------------
  // Torn war rows / hospital state
  // ---------------------------------------------------------------------------

  function getPlayerName(row) {
    const profile = row?.li?.querySelector(`a[href*="XID=${row.id}"]`) || row?.li?.querySelector("a.user.name, a[class*='user'], a[href*='profiles.php']");
    return normalizeText(profile?.textContent) || row?.id || "target";
  }

  function parseHospitalSecondsFromText(text) {
    const value = normalizeText(text);
    const compact = value.match(/\b(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\b)?/i);
    if (compact && (compact[1] || compact[2] || compact[3] || compact[4])) {
      const total = Number(compact[1] || 0) * 86400 + Number(compact[2] || 0) * 3600 + Number(compact[3] || 0) * 60 + Number(compact[4] || 0);
      if (Number.isFinite(total) && total >= 0) return total;
    }
    const verbose = value.match(/\b(?:(\d+)\s*days?\s*)?(?:(\d+)\s*hours?\s*)?(?:(\d+)\s*minutes?\s*)?(?:(\d+)\s*seconds?\b)?/i);
    if (verbose && (verbose[1] || verbose[2] || verbose[3] || verbose[4])) {
      const total = Number(verbose[1] || 0) * 86400 + Number(verbose[2] || 0) * 3600 + Number(verbose[3] || 0) * 60 + Number(verbose[4] || 0);
      if (Number.isFinite(total) && total >= 0) return total;
    }
    return null;
  }

  function isHospitalStatusValue(value) { return /hospital/i.test(normalizeText(value)); }

  // A release time that has passed means the target is out, whatever a cached or
  // lagging status record still says. Returns false when there is no usable
  // timestamp, so a genuinely unknown release time is left alone.
  // Ported from PC 1.0.31: without it a member Torn already shows as Okay keeps
  // reading "Hosp 0:00" until the next members batch, up to 30 s later.
  function hospitalUntilExpired(until) {
    const timestamp = Number(until);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    return timestamp - getTornNowMs() / 1000 <= 0;
  }

  function hospitalRemainingSeconds(until) {
    const timestamp = Number(until);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    // Ceil only, no added second. Rounding up is deliberate: showing less than
    // the real wait makes a caller attack early and the hit fails.
    const remaining = Math.ceil(timestamp - getTornNowMs() / 1000);
    return Number.isFinite(remaining) && remaining >= 0 && remaining < CONFIG.maxHospitalSeconds
      ? remaining
      : null;
  }

  // An unreadable hospital time is not zero.
  //
  // Owner screenshots 2026-09-05: one target read "Hosp 0:00" at 12:56 and was
  // still reading it at 13:26. The boundary second can only show 0:00 for about
  // one second, so that was this fallback, not a countdown. Torn said hospital
  // but the release time could not be read, and the cell printed 0:00 -- which
  // reads as "attack now", the one direction this must never fail in. The
  // decision engine already classifies seconds === null as UNKNOWN; only the
  // cell was lying.
  function hospitalCountdownText(hospitalState) {
    if (!hospitalState || hospitalState.isHospital !== true) return "";
    return formatCountdown(hospitalState.seconds) || "?";
  }

  function visibleHospitalEvidence(row) {
    const li = row?.li;
    const statusCell = row?.statusDiv;
    if (!(li instanceof HTMLElement) || !(statusCell instanceof HTMLElement)) {
      return { isHospital: false, seconds: null, source: "dom" };
    }
    const isHospital =
      statusCell.classList.contains("hospital") ||
      isHospitalStatusValue(statusCell.textContent);
    if (!isHospital) return { isHospital: false, seconds: null, source: "dom" };
    const untilNodes = [statusCell, li, ...li.querySelectorAll("[data-until]")];
    for (const node of untilNodes) {
      const remaining = hospitalRemainingSeconds(node.getAttribute?.("data-until"));
      if (Number.isFinite(remaining)) {
        return { isHospital: true, seconds: remaining, source: "dom-until" };
      }
    }
    return {
      isHospital: true,
      seconds: parseHospitalSecondsFromText(statusCell.textContent || li.textContent),
      source: "dom-text"
    };
  }

  function computeHospitalSeconds(row) {
    const apiStatus = tornStatusForTarget(row.id);
    if (apiStatus) {
      const hospital =
        isHospitalStatusValue(apiStatus.state) ||
        isHospitalStatusValue(apiStatus.description) ||
        isHospitalStatusValue(apiStatus.details);
      if (!hospital) return { isHospital: false, seconds: null, source: "torn-api" };
      const remaining = hospitalRemainingSeconds(apiStatus.until);
      if (Number.isFinite(remaining)) return { isHospital: true, seconds: remaining, source: "torn-api" };
      // The release time has passed: out, regardless of a stale state field.
      if (hospitalUntilExpired(apiStatus.until)) {
        return { isHospital: false, seconds: null, source: "torn-api-expired" };
      }
      const fallback = visibleHospitalEvidence(row);
      if (fallback.isHospital && Number.isFinite(fallback.seconds)) return fallback;
      return { isHospital: true, seconds: null, source: "torn-api" };
    }
    return visibleHospitalEvidence(row);
  }

  function pageHasExplicitNoWarMarker() {
    const scope = document.querySelector("main") || document.body;
    if (!(scope instanceof HTMLElement)) return false;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let visited = 0;
    while (walker.nextNode() && visited < 6000) {
      visited += 1;
      const parent = walker.currentNode.parentElement;
      if (!parent || !isRenderedRouteSurfaceElement(parent)) continue;
      if (normalizeText(walker.currentNode.nodeValue).toUpperCase() === "YOUR FACTION IS NOT IN A WAR") return true;
    }
    return false;
  }

  function stripGeneratedContent(value) {
    let text = normalizeText(value);
    if (!text || text === "none" || text === "normal") return "";
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }
    return normalizeText(text.replace(/\\A/gi, " ").replace(/\\(["'\\])/g, "$1"));
  }

  function parsePreWarCountdownSeconds(text) {
    const value = normalizeText(text);
    const match = value.match(/(?:^|[^\d:])(\d{1,3}):([0-2]\d):([0-5]\d):([0-5]\d)(?![\d:])/);
    if (!match) return null;
    const days = Number(match[1]);
    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    const seconds = Number(match[4]);
    if (!Number.isInteger(days) || !Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    return Number.isFinite(total) && total >= 0 ? total : null;
  }

  function threePartClock(text) {
    const value = normalizeText(text);
    const match = value.match(/(?:^|[^\d:])([0-2]\d):([0-5]\d):([0-5]\d)(?![\d:])/);
    return match ? `${match[1]}:${match[2]}:${match[3]}` : "";
  }

  function simpleDayPrefix(text) {
    const value = stripGeneratedContent(text);
    const match = value.match(/(?:^|[^\d])(\d{1,3}):?(?:[^\d]|$)/);
    return match ? match[1] : "";
  }

  function safePseudoContent(element, pseudo) {
    if (!(element instanceof Element)) return "";
    try { return stripGeneratedContent(getComputedStyle(element, pseudo).content); }
    catch { return ""; }
  }

  function candidateCountdownStrings(element) {
    if (!(element instanceof Element)) return [];
    const values = [];
    const add = value => {
      const text = normalizeText(value);
      if (text && !values.includes(text)) values.push(text);
    };
    const text = normalizeText(element.textContent);
    const innerText = element instanceof HTMLElement ? normalizeText(element.innerText) : "";
    const before = safePseudoContent(element, "::before");
    const after = safePseudoContent(element, "::after");
    add(text);
    add(innerText);
    add(`${before}${text}${after}`);
    add(`${before}${innerText}${after}`);
    add(`${before} ${text} ${after}`);

    const clock = threePartClock(text) || threePartClock(innerText);
    const beforeDay = simpleDayPrefix(before);
    const afterDay = simpleDayPrefix(after);
    if (clock && beforeDay) add(`${beforeDay}:${clock}`);
    if (clock && afterDay) add(`${afterDay}:${clock}`);

    const children = Array.from(element.children || []).slice(0, 12);
    const childTexts = children.map(child => normalizeText(child.textContent)).filter(Boolean);
    for (let index = 0; index + 1 < childTexts.length; index += 1) {
      const day = childTexts[index].match(/^\d{1,3}:?$/)?.[0]?.replace(/:$/, "") || "";
      const childClock = threePartClock(childTexts[index + 1]);
      if (day && childClock) add(`${day}:${childClock}`);
    }
    if (childTexts.length >= 4) {
      for (let index = 0; index + 3 < childTexts.length; index += 1) {
        const parts = childTexts.slice(index, index + 4).map(value => value.match(/^\d{1,3}$/)?.[0] || "");
        if (parts.every(Boolean)) add(parts.join(":"));
      }
    }
    return values;
  }

  function readRankedWarCountdownSeconds(active) {
    if (!(active instanceof Element)) return null;
    const nodes = [active, ...Array.from(active.querySelectorAll("*")).slice(0, 220)];
    for (const node of nodes) {
      for (const candidate of candidateCountdownStrings(node)) {
        const seconds = parsePreWarCountdownSeconds(candidate);
        if (Number.isFinite(seconds)) return seconds;
      }
    }
    return null;
  }

  function currentRwPhase({ refresh = true } = {}) {
    // VIEW has no authority over any war, so the phase is never LIVE there.
    // Saying so plainly beats letting it read as an unverifiable own war.
    if (viewOnlyMode()) {
      if (refresh) refreshCurrentWarSurface();
      return { phase: RW_PHASE.UNKNOWN, runwaySeconds: null, warId: currentWarSurface?.warId || "", view: true };
    }
    const surface = refresh ? refreshCurrentWarSurface() : currentWarSurface;
    if (!surface) {
      return { phase: RW_PHASE.UNKNOWN, runwaySeconds: null, warId: surface?.warId || "" };
    }
    const now = Math.floor(getTornNowMs() / 1000);
    if (ownWarsFreshLive()) {
      lockedPrewarWarIds.add(surface.warId);
      if (prewarObservation?.warId === surface.warId) prewarObservation = null;
      return { phase: RW_PHASE.LIVE, runwaySeconds: 0, warId: ownWarsState.warId };
    }
    const freshMatchingWars =
      ownWarsStateMatchesSurface(surface) &&
      nowMs() - ownWarsState.fetchedAt <= CONFIG.tornStatusMaxAgeMs;
    if (freshMatchingWars && ownWarsState.phase === RW_PHASE.PREWAR) {
      const runwaySeconds = ownWarsState.start - now;
      if (runwaySeconds > 0) {
        return { phase: RW_PHASE.PREWAR, runwaySeconds, warId: ownWarsState.warId };
      }
      lockedPrewarWarIds.add(surface.warId);
    }
    if (prewarObservation?.warId === surface.warId) {
      const runwaySeconds = prewarObservation.startAtSeconds - now;
      if (runwaySeconds > 0 && !lockedPrewarWarIds.has(surface.warId)) {
        return { phase: RW_PHASE.PREWAR, runwaySeconds, warId: surface.warId };
      }
      lockedPrewarWarIds.add(surface.warId);
      prewarObservation = null;
    }
    return { phase: RW_PHASE.UNKNOWN, runwaySeconds: null, warId: surface.warId };
  }

  // Pure target decision engine
  // ---------------------------------------------------------------------------

  function classifyLiveTargetState({ playerId, ownTargetId, isHospital, seconds, fairFight, rwPhase, activity = null, lowHp = false }) {
    const ff = Number.isFinite(fairFight) ? Number(fairFight) : null;
    if (ownTargetId) {
      if (ownTargetId === playerId) return { state: TARGET_STATE.CLAIMED, seconds, fairFight: ff, reason: "active-own-dibs", mode: "live" };
      return { state: TARGET_STATE.BLOCKED, seconds, fairFight: ff, reason: "another-active-dibs", mode: "live" };
    }
    if (rwPhase?.phase !== RW_PHASE.LIVE) {
      return {
        state: TARGET_STATE.LOCKED,
        seconds,
        fairFight: ff,
        reason: rwPhase?.phase === RW_PHASE.PREWAR ? "rw-not-started" : "rw-phase-unverifiable",
        mode: "prewar",
        prewarHospital: isHospital,
        rwPhase
      };
    }
    if (!isHospital) return { state: TARGET_STATE.UNAVAILABLE, seconds: null, fairFight: ff, reason: "not-hospital", mode: "live" };
    if (seconds === null) return { state: TARGET_STATE.UNKNOWN, seconds: null, fairFight: ff, reason: "hospital-timer-unverifiable", mode: "live" };
    if (seconds > CONFIG.gateSeconds) return { state: TARGET_STATE.LOCKED, seconds, fairFight: ff, reason: "hospital-too-early", mode: "live" };
    if (ff === null) return { state: TARGET_STATE.UNKNOWN, seconds, fairFight: null, reason: "fair-fight-unverifiable", mode: "live" };
    if (ff < CONFIG.minFairFight) return { state: TARGET_STATE.LOCKED, seconds, fairFight: ff, reason: "fair-fight-too-low", mode: "live" };
    if (ff > (lowHp === true ? CONFIG.lowHpMaxFairFight : CONFIG.maxFairFight)) return { state: TARGET_STATE.LOCKED, seconds, fairFight: ff, reason: "fair-fight-too-high", mode: "live" };
    if (activity === "online") return { state: TARGET_STATE.FREE, seconds, fairFight: ff, reason: "online-free-for-all", mode: "live" };
    return { state: TARGET_STATE.READY, seconds, fairFight: ff, reason: lowHp === true ? "hospital-window-low-life-fair-fight-open" : "hospital-window-and-fair-fight-open", mode: "live", ...(lowHp === true ? { lowHp: true } : {}) };
  }

  function classifyTargetState({ playerId, ownClaim, isHospital, seconds, fairFight, rwPhase, activity = null, lowHp = false, ownershipUnresolved = false }) {
    if (ownClaim) {
      if (ownClaim.targetId === playerId) {
        return { state: TARGET_STATE.CLAIMED, seconds, fairFight, reason: "active-own-dibs", mode: "live" };
      }
      return { state: TARGET_STATE.BLOCKED, seconds, fairFight, reason: "another-active-dibs", mode: "live" };
    }
    if (ownershipUnresolved) {
      return { state: TARGET_STATE.BLOCKED, seconds, fairFight, reason: "shared-ownership-unresolved", mode: "live" };
    }
    return classifyLiveTargetState({
      playerId,
      ownTargetId: "",
      isHospital,
      seconds,
      fairFight,
      rwPhase,
      activity,
      lowHp
    });
  }

  function currentDecisionForTarget(targetId) {
    const id = String(targetId || "");
    const binding = xidBindings.get(id);
    const row = currentResolvedBinding(binding);
    if (!row || !bindingTargetIsUnique(binding, row)) return null;
    const hospital = computeHospitalSeconds(row);
    const rwPhase = currentRwPhase();
    return classifyTargetState({
      playerId: row.id,
      ownClaim: currentOwnClaim(),
      isHospital: hospital.isHospital,
      seconds: hospital.seconds,
      fairFight: fairFightForTarget(row.id),
      activity: freshOpponentActivityForTarget(row.id),
      lowHp: lowHpForTarget(row.id),
      rwPhase,
      ownershipUnresolved: Boolean(
        !newClaimStorageAuthorityReady() ||
        (effectiveTornApiKey() && sharedClaimsVerifiedAt <= 0) ||
        tornCredentialMutationInProgress ||
        currentClaimQuarantine() ||
        ambiguousOwnServerClaims
      )
    });
  }

  // ---------------------------------------------------------------------------
  // Claim / release.
  // ---------------------------------------------------------------------------

  async function verifyFreshTargetBasicForClaim(targetId, isCurrent = () => true) {
    const key = effectiveTornApiKey();
    if (!key || !validTargetId(targetId) || !isCurrent()) return null;
    const result = await tornApiRequest(`/v2/user/${targetId}/basic`, key, { cacheBust: true });
    if (!isCurrent() || key !== effectiveTornApiKey()) return null;
    const body = result?.body || {};
    const profile = body?.profile;
    const status = profile?.status;
    const fetchedAt = Number(result?.endedAt) || 0;
    if (
      !result?.ok || body?.error || !isPlainRecord(profile) ||
      !isInt32(profile.id, { positive: true }) || String(profile.id) !== String(targetId) ||
      !isPlainRecord(status) || !fetchedAt || nowMs() - fetchedAt > CONFIG.targetBasicWriteMaxAgeMs
    ) return null;
    trackedRecordTornClockOffset(result, body);
    const hospital =
      isHospitalStatusValue(status.state) ||
      isHospitalStatusValue(status.description) ||
      isHospitalStatusValue(status.details);
    const seconds = hospitalRemainingSeconds(status.until);
    if (!hospital || !Number.isFinite(seconds) || seconds > CONFIG.gateSeconds) return null;
    return { targetId: String(targetId), status, seconds, fetchedAt };
  }

  // normalizeClaimAcknowledgement, quarantineClaimAcknowledgement,
  // exactCleanupCreatedClaim and exactCleanupQuarantinedAcknowledgement from
  // 1.5.185 are gone with the FFScouter claim transport they served: that
  // transport answered with a queue position, and a position above 1 had to
  // be cleaned up. The KS server's /claim is atomic and single-owner, so
  // there is no position, no acknowledgement to quarantine and nothing to
  // clean up -- its status field is the whole answer.

  // POST /war/<wire id>/claim. Every gate before the write is 1.5.185's,
  // unchanged: own LIVE war, fresh board, fresh own-wars LIVE proof, fresh
  // target read, FF window, online rule, low-life rule, storage writable.
  // None of them was FFScouter-specific. Only the write and what follows it
  // are new. Five outcomes, each with its own row:
  //   200 claimed          -> own record saved
  //   200 already_claimed  -> own record, "already yours", expiry unchanged
  //   409 taken            -> no own record, "taken by <name>"
  //   409 already_holding  -> no new record, the board is read again
  //   409 unreadable       -> no record, "cannot verify"
  async function claimSharedTarget(playerId, playerName) {
    const targetId = String(playerId || "");
    if (
      !runtimeActive || !isRuntimeEligible() || sharedWriteBusy || ffCredentialChangeBusy() ||
      tornCredentialMutationInProgress ||
      !newClaimStorageAuthorityReady() ||
      !effectiveTornApiKey() || !validTargetId(targetId)
    ) return;
    if (
      currentOwnClaim() || currentClaimQuarantine() || ambiguousOwnServerClaims ||
      sharedClaimForTarget(targetId) || sharedClaimUnknown(targetId)
    ) return;
    const clickedBinding = xidBindings.get(targetId);
    const clickedResolved = currentResolvedBinding(clickedBinding);
    const clickedSurface = captureCurrentWarSurface();
    const clickedOpponentId = opponentFactionId;
    if (!clickedResolved || !bindingTargetIsUnique(clickedBinding, clickedResolved) || !clickedSurface || clickedSurface.opponentFactionId !== clickedOpponentId) return;
    const eligibility = currentDecisionForTarget(targetId);
    if (!eligibility || eligibility.state !== TARGET_STATE.READY) {
      if (eligibility?.state === TARGET_STATE.FREE) {
        holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
      }
      scanWarRows(); return;
    }

    // The war this claim is for, fixed at the tap. No id, nothing is sent.
    const wireId = currentWireWarId();
    if (!wireId) { scanWarRows(); return; }
    const generation = runtimeGeneration;
    const operationSerial = ++sharedWriteOperationSerial;
    const credentialEpoch = tornCredentialEpoch;
    const tornKey = effectiveTornApiKey();
    const selfAtStart = selfPlayerId;
    let failed = null;
    const ownsWrite = () => operationSerial === sharedWriteOperationSerial;
    const operationRuntimeCurrent = () => (
      ownsWrite() &&
      generation === runtimeGeneration &&
      credentialEpoch === tornCredentialEpoch &&
      tornKey === effectiveTornApiKey() &&
      selfAtStart === selfPlayerId &&
      wireId === currentWireWarId() &&
      runtimeActive &&
      isRuntimeEligible()
    );
    const claimCreationCurrent = () => (
      operationRuntimeCurrent() && newClaimStorageAuthorityReady()
    );
    sharedWriteBusy = true;
    claimFlowState = CLAIM_FLOW_STATE.CLAIMING;
    pendingTargetId = targetId;
    setSharedStatus("writing", `War Room: claiming ${normalizeText(playerName) || targetId}…`);
    scanWarRows();

    try {
      invalidateSharedReads();
      if (!(await fetchSharedClaims({ allowDuringWrite: true }))) {
        throw new Error("fresh claim board read failed");
      }
      if (!claimCreationCurrent()) return;
      if (
        currentOwnClaim() || currentClaimQuarantine() || ambiguousOwnServerClaims ||
        sharedClaimForTarget(targetId) || sharedClaimUnknown(targetId)
      ) throw new Error("target already claimed or ownership unresolved");
      if (eligibility.fairFight > CONFIG.maxFairFight &&
          !(await waitForLifeClaimReadSlot(targetId, claimCreationCurrent))) {
        if (claimCreationCurrent()) holdSharedWriteFailure("War Room: claim refused · low life could not be confirmed");
        return;
      }
      if (!claimCreationCurrent()) return;
      if (!(await fetchOwnWars({ force: true })) || !ownWarsFreshLive(CONFIG.ownWarsWriteMaxAgeMs)) {
        throw new Error("fresh own faction wars did not confirm LIVE");
      }
      const targetProof = await verifyFreshTargetBasicForClaim(targetId, claimCreationCurrent);
      if (!targetProof) throw new Error("fresh target basic verification failed");
      if (!claimCreationCurrent()) return;
      const finalSurface = captureCurrentWarSurface();
      const finalBinding = xidBindings.get(targetId);
      const finalResolved = currentResolvedBinding(finalBinding);
      if (
        finalBinding !== clickedBinding ||
        !finalResolved ||
        !bindingTargetIsUnique(finalBinding, finalResolved) ||
        !finalSurface ||
        !currentWarSurfaceMatchesSnapshot(clickedSurface) ||
        finalSurface.opponentFactionId !== clickedOpponentId
      ) throw new Error("target identity or opponent relation changed");
      let lowLifeProfileRead = false;
      if (fairFightForTarget(targetId) > CONFIG.maxFairFight) {
        if (freshOpponentActivityForTarget(targetId) === "online") {
          holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
          return;
        }
        const life = await readTargetLife(targetId, { forClaim: true, isCurrent: claimCreationCurrent });
        if (!claimCreationCurrent()) return;
        if (freshOpponentActivityForTarget(targetId) === "online") {
          holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
          return;
        }
        if (!life || life.ratio > CONFIG.lowHpLifeMaxRatio) {
          holdSharedWriteFailure("War Room: claim refused · low life could not be confirmed");
          return;
        }
        lowLifeProfileRead = true;
      }
      const finalEligibility = classifyTargetState({
        playerId: targetId,
        ownClaim: currentOwnClaim(),
        isHospital: lowLifeProfileRead ? !hospitalUntilExpired(targetProof.status.until) : true,
        seconds: lowLifeProfileRead ? hospitalRemainingSeconds(targetProof.status.until) : targetProof.seconds,
        fairFight: fairFightForTarget(targetId),
        activity: freshOpponentActivityForTarget(targetId),
        lowHp: lowHpForTarget(targetId),
        rwPhase: currentRwPhase()
      });
      if (finalEligibility?.state === TARGET_STATE.FREE) {
        holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
        return;
      }
      if (
        !claimCreationCurrent() ||
        (lowLifeProfileRead && (
          xidBindings.get(targetId) !== clickedBinding ||
          !currentResolvedBinding(clickedBinding) ||
          !bindingTargetIsUnique(clickedBinding, currentResolvedBinding(clickedBinding)) ||
          !currentWarSurfaceMatchesSnapshot(clickedSurface)
        )) ||
        !newClaimStorageAuthorityReady() ||
        currentOwnClaim() || currentClaimQuarantine() || ambiguousOwnServerClaims ||
        sharedClaimForTarget(targetId) || sharedClaimUnknown(targetId) ||
        !ownWarsFreshLive(CONFIG.ownWarsWriteMaxAgeMs) ||
        nowMs() - targetProof.fetchedAt > CONFIG.targetBasicWriteMaxAgeMs ||
        !finalEligibility || finalEligibility.state !== TARGET_STATE.READY
      ) throw new Error("target eligibility changed");
      if (!claimAuthorityStorageWritable()) {
        throw new Error("claim authority storage is not durably writable");
      }
      invalidateSharedReads();
      // hospitalUntil in whole Torn seconds, straight off the fresh target
      // read verified above (status.until); 0 means Okay. No Torn call is made
      // for it. memberId is never sent: the server takes it from the session.
      const provenUntil = Number(targetProof.status?.until);
      const hospitalUntilSeconds = Number.isSafeInteger(provenUntil) && provenUntil > 0 ? provenUntil : 0;
      const result = await ksWarRoomRequest(
        "claim",
        wireId,
        { targetId, hospitalUntil: hospitalUntilSeconds },
        { isCurrent: claimCreationCurrent }
      );
      if (!claimCreationCurrent()) return;
      invalidateSharedReads();
      const answer = result?.body || null;
      const status = answer ? normalizeText(answer.status) : "";
      // Three refusals, each with its own row, none of them shown as a claim
      // and none of them leaving an own record behind.
      if (result?.status === 409 && status === "taken") {
        const holder = ksQueueEntryFromServerClaim(wireId, answer.claim);
        holdSharedWriteFailure(`War Room: taken by ${holder?.entry.claimer.name || "another member"}`);
        return;
      }
      if (result?.status === 409 && status === "already_holding") {
        // The finally block reads the board again, which shows what is held.
        holdSharedWriteFailure("War Room: you already hold another target");
        return;
      }
      if (result?.status === 409 && status === "unreadable") {
        holdSharedWriteFailure("War Room: cannot verify — try again");
        return;
      }
      if (!result?.ok || answer?.ok !== true || (status !== "claimed" && status !== "already_claimed")) {
        failed = result || {};
        throw new Error("claim not confirmed");
      }
      // The claim as the server holds it, through the same conversion the
      // board goes through -- so the own record gets the claim id the next
      // poll will find, and its times are seconds like every other claim time.
      const converted = ksQueueEntryFromServerClaim(wireId, answer.claim);
      if (
        !converted || converted.targetId !== targetId ||
        converted.entry.claimer.playerId !== String(selfAtStart) ||
        converted.entry.expiresAt <= nowSeconds()
      ) {
        // The server said yes, but the claim in its answer cannot be read as
        // this member's live claim on this target. Nothing is recorded; the
        // board read in the finally block decides what is true.
        holdSharedWriteFailure("War Room: cannot verify — try again");
        return;
      }
      const claimerName = selfPlayerName || "You";
      const ownRecord = {
        claimId: converted.entry.claimId,
        targetId,
        claimerPlayerId: String(selfAtStart),
        claimerName,
        expiresAt: converted.entry.expiresAt,
        cleanupRequired: false,
        createdLocalAt: nowMs(),
        wireId
      };
      const ownPersisted = saveOwnClaim(ownRecord);
      ownClaimLastConfirmedAt = 0;
      const committedOwn = currentOwnClaim();
      const durableOwn = Boolean(
        ownPersisted && committedOwn?.claimId === ownRecord.claimId &&
        committedOwn.targetId === ownRecord.targetId &&
        committedOwn.claimerPlayerId === ownRecord.claimerPlayerId
      );
      if (!durableOwn) {
        // The server holds this claim under our Torn id even though local
        // storage would not record it durably. Say so and require RELEASE.
        claimFlowState = CLAIM_FLOW_STATE.CLEANUP_REQUIRED;
        setSharedStatus("error", "War Room: claim storage failed · RELEASE required", sharedClaims.size);
        return;
      }
      upsertImmediateSharedClaim(targetId, converted.entry);
      if (!operationRuntimeCurrent()) return;
      // already_claimed: the server did not move the expiry, and neither does
      // this -- the own record carries the server's unchanged end time.
      setSharedStatus(
        "online",
        status === "already_claimed"
          ? "War Room: already yours · time unchanged"
          : `War Room: DIBS ✓ ${claimerName}`,
        sharedClaims.size
      );
      // The poll started in the finally block would replace the row at once.
      // "Already yours" explains a countdown that did not restart, so it is
      // held the way a refusal is held. "DIBS ✓" is left as 1.5.185 has it.
      if (status === "already_claimed") sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
    } catch (error) {
      if (operationRuntimeCurrent()) {
        holdSharedWriteFailure(failed
          ? `War Room: claim failed · ${ksFailureLine(failed).replace(/^War Room: /, "")}`
          : `War Room: claim failed · ${normalizeText(error?.message) || "request failed"}`);
      }
    } finally {
      if (ownsWrite()) {
        sharedWriteBusy = false;
        claimFlowState = currentOwnClaim() || currentClaimQuarantine()
          ? CLAIM_FLOW_STATE.CLEANUP_REQUIRED
          : CLAIM_FLOW_STATE.IDLE;
        pendingTargetId = "";
        if (operationRuntimeCurrent()) { scanWarRows(); void fetchSharedClaims(); }
      }
    }
  }

  // POST /war/<wire id>/unclaim. The ownership proof before the write is
  // 1.5.185's, unchanged: the own record must be found on a fresh board, by
  // claim id, under this member's Torn id. unclaimed and absent remove the
  // own record; 409 not_owner and 409 unreadable leave it and say so.
  async function releaseOwnSharedTarget() {
    const own = currentOwnClaim();
    const quarantine = currentClaimQuarantine();
    // The war the own claim was read on. No id, nothing is sent.
    const wireId = currentWireWarId();
    if (!wireId || wireId !== sharedClaimsWireId) return;
    let failed = null;
    if (
      !runtimeActive || !isRuntimeEligible() || sharedWriteBusy || ffCredentialChangeBusy() ||
      tornCredentialMutationInProgress ||
      !effectiveTornApiKey() || !own || !isValidClaimId(own.claimId) ||
      !quarantineAllowsExactOwnRelease(own, quarantine) ||
      !exactSharedProofForOwnClaim(own)
    ) return;
    const generation = runtimeGeneration;
    const operationSerial = ++sharedWriteOperationSerial;
    const credentialEpoch = tornCredentialEpoch;
    const tornKey = effectiveTornApiKey();
    const selfAtStart = selfPlayerId;
    const ownsWrite = () => operationSerial === sharedWriteOperationSerial;
    const writeRuntimeCurrent = () => (
      ownsWrite() &&
      generation === runtimeGeneration &&
      runtimeActive &&
      isRuntimeEligible() &&
      credentialEpoch === tornCredentialEpoch &&
      tornKey === effectiveTornApiKey() &&
      selfAtStart === selfPlayerId &&
      wireId === currentWireWarId() &&
      currentOwnClaim()?.claimId === own.claimId &&
      quarantineAllowsExactOwnRelease(currentOwnClaim())
    );
    sharedWriteBusy = true;
    claimFlowState = CLAIM_FLOW_STATE.RELEASING;
    pendingTargetId = own.targetId;
    setSharedStatus("writing", `War Room: releasing ${own.claimerName || "DIBS"}…`);
    scanWarRows();
    try {
      invalidateSharedReads();
      if (!(await fetchSharedClaims({ allowDuringWrite: true }))) {
        throw new Error("fresh claim board read failed");
      }
      if (!writeRuntimeCurrent()) return;
      const verifiedOwn = currentOwnClaim();
      const found = findSharedClaimById(own.claimId);
      if (
        !verifiedOwn || verifiedOwn.targetId !== own.targetId ||
        ownClaimLastConfirmedAt !== sharedClaimsVerifiedAt ||
        !found || found.targetId !== own.targetId ||
        found.claim.claimer.playerId !== selfAtStart
      ) throw new Error("server ownership proof did not match this exact claim");
      invalidateSharedReads();
      const result = await ksWarRoomRequest(
        "unclaim",
        wireId,
        { targetId: own.targetId },
        { isCurrent: writeRuntimeCurrent }
      );
      const answer = result?.body || null;
      const status = answer ? normalizeText(answer.status) : "";
      // unclaimed: it was ours and is gone. absent: there was nothing left to
      // release. Either way the own record goes.
      if (result?.ok && answer?.ok === true && (status === "unclaimed" || status === "absent")) {
        invalidateSharedReads();
        removeImmediateSharedClaim(own.claimId);
        if (currentOwnClaim()?.claimId === own.claimId) saveOwnClaim(null);
        if (currentClaimQuarantine()) saveClaimQuarantine(null);
        ownClaimLastConfirmedAt = 0;
        if (writeRuntimeCurrent()) setSharedStatus("online", "War Room: released", sharedClaims.size);
        return;
      }
      if (!writeRuntimeCurrent()) return;
      // Two refusals where the own record stays, and the panel says so.
      if (result?.status === 409 && status === "not_owner") {
        holdSharedWriteFailure("War Room: release refused · not your claim · DIBS kept");
        return;
      }
      if (result?.status === 409 && status === "unreadable") {
        holdSharedWriteFailure("War Room: release not confirmed · cannot verify — DIBS kept");
        return;
      }
      failed = result || {};
      throw new Error("release not confirmed");
    } catch (error) {
      if (writeRuntimeCurrent()) {
        holdSharedWriteFailure(failed
          ? `War Room: release failed · ${ksFailureLine(failed).replace(/^War Room: /, "")}`
          : `War Room: release failed · ${normalizeText(error?.message) || "request failed"}`);
      }
    } finally {
      if (ownsWrite()) {
        sharedWriteBusy = false;
        claimFlowState = currentOwnClaim()?.cleanupRequired ? CLAIM_FLOW_STATE.CLEANUP_REQUIRED : CLAIM_FLOW_STATE.IDLE;
        pendingTargetId = "";
        if (writeRuntimeCurrent()) { scanWarRows(); void fetchSharedClaims(); }
      }
    }
  }

  // Auto-release.
  //
  // Members forget to release a claim after the hit -- it happened right through
  // the previous Ranked War -- and a forgotten claim locks that target for the
  // whole faction until the server-side expiry finally runs out. More of the
  // faction plays on the phone than on the desktop, so this matters more here.
  //
  // The proof that a target has been beaten is arithmetic, not a guess. A claim
  // can only ever be taken while the target has CONFIG.gateSeconds or less left
  // in hospital, and a hospital timer never grows on its own: it moves forward
  // only when the target is hospitalised again. So a FRESH reading well above
  // the gate means the target went back in -- beaten, by us or by someone else.
  // Either way the claim is spent and holding it helps nobody.
  //
  // Fail closed at every step: own war only, fresh Torn status only, never while
  // another write is in flight, and one attempt per claim. No extra request is
  // made -- this reads the opponent members batch the script already polls, and
  // tornStatusForTarget refuses anything older than opponentMembersMaxAgeMs.
  function ownClaimTargetIsBeaten() {
    if (viewOnlyMode()) return false;
    const own = currentOwnClaim();
    if (!own || !validTargetId(own.targetId)) return false;
    const status = tornStatusForTarget(own.targetId);
    if (!status) return false;
    const isHospital =
      isHospitalStatusValue(status.state) ||
      isHospitalStatusValue(status.description) ||
      isHospitalStatusValue(status.details);
    if (!isHospital) return false;
    if (hospitalUntilExpired(status.until)) return false;
    const seconds = hospitalRemainingSeconds(status.until);
    return Number.isFinite(seconds) && seconds > CONFIG.autoReleaseHospitalSeconds;
  }

  function ownClaimTargetIsOnline() {
    if (viewOnlyMode() || !ownWarsFreshLive()) return false;
    const own = currentOwnClaim();
    return Boolean(own && freshOpponentActivityForTarget(own.targetId) === "online");
  }

  async function maybeAutoReleaseBeatenTarget() {
    if (
      !runtimeActive || !isRuntimeEligible() || sharedWriteBusy || ffCredentialChangeBusy() ||
      tornCredentialMutationInProgress
    ) return false;
    const own = currentOwnClaim();
    if (!own || autoReleaseAttemptedClaimId === own.claimId) return false;
    const online = ownClaimTargetIsOnline();
    if (!online && !ownClaimTargetIsBeaten()) return false;
    autoReleaseAttemptedClaimId = own.claimId;
    await releaseOwnSharedTarget();
    if (currentOwnClaim()) return false;
    // releaseOwnSharedTarget kicks off a shared poll in its own finally block,
    // and that poll would overwrite the message within about 100 ms. Hold it the
    // same way a write failure is held, so the owner actually sees what happened.
    setSharedStatus("online", online
      ? "War Room: auto-released · target online (free for all)"
      : "War Room: auto-released \u00b7 target back in hospital", sharedClaims.size);
    sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
    return true;
  }

  // ---------------------------------------------------------------------------
  // PDA-owned presentation. Torn's Ranked War DOM is read-only.
  // ---------------------------------------------------------------------------

  const SCOUT_PALETTE = Object.freeze([
    "#3057e1", "#3274ff", "#29a9ff", "#27d7f2", "#28d8b8",
    "#35d96f", "#85dd28", "#d9df24", "#f3b326", "#f57c1f", "#ef3340"
  ]);

  // DEMO.
  //
  // Between wars every row is read-only VIEW, so the owner never gets to see
  // what the column actually looks like when the war is running -- which is
  // the one thing he cannot check afterwards, in the middle of a war.
  //
  // DEMO paints the finished look on somebody else's roster. It is deliberately
  // powerless: it is refused on the owner's own war route, it makes no request,
  // it writes nothing, a tap does nothing, and no real DIBS state is read or
  // altered. The hospital countdowns stay real -- only the DIBS state and the
  // FF/Est values are illustrative, because a foreign roster has neither.
  let demoMode = false;
  // 1.5.173: whether the Settings/About sections are expanded. In-memory
  // only, never written to storage, always false on a fresh script
  // instance (page load) and reset to false whenever the presentation
  // layer is rebuilt against a genuinely new root (see ensurePresentationLayer).
  let settingsExpanded = false;
  let aboutExpanded = false;


  function demoActive() {
    // Read-only route AND an actual Ranked War page. Either alone is not
    // enough: viewOnlyMode() is true on any page that is not the owner's own
    // war route, including pages this script does not belong on.
    return demoMode === true && viewOnlyMode() && isAnyRankedWarRoute();
  }

  // Deterministic per target, so a row keeps its example state instead of
  // flickering between them on every repaint.
  const DEMO_STATES = Object.freeze(["ready", "claimed", "shared", "early", "ff-low", "unreadable"]);

  function demoStateForTarget(targetId) {
    const id = Number(targetId);
    if (!Number.isInteger(id) || id <= 0) return "early";
    return DEMO_STATES[id % DEMO_STATES.length];
  }

  // An FF inside the 2.00-3.40 gate for the rows shown as attackable, outside it
  // for the row shown as blocked by FF. Illustrative only.
  function demoFairFightForTarget(targetId) {
    const id = Number(targetId) || 0;
    if (demoStateForTarget(targetId) === "ff-low") return 1.2 + (id % 7) / 10;
    return 2.0 + (id % 15) / 10;
  }

  const rowRegistry = new Map();
  const targetRows = new Map();
  const rowBindings = new Map();
  const xidBindings = new Map();
  const hostBindings = new WeakMap();
  const ownedPresentationLayers = new WeakSet();
  const ownedPanelHosts = new WeakSet();
  const boundPanelNodes = new WeakSet();
  const FF_CREDENTIAL_LOCK_REASON =
    "Locked while DIBS ownership is active or unverified. Tap for the current reason.";
  const TORN_CREDENTIAL_LOCK_REASON =
    "Locked while DIBS ownership is active or unresolved. Tap for the current reason.";
  const PANEL_ISOLATED_EVENTS = Object.freeze([
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "touchstart",
    "touchend"
  ]);
  const PANEL_CONTROL_ROLES = new Set([
    "key",
    "torn-key",
    "key-save",
    "key-cancel",
    "torn-key-save",
    "torn-key-cancel",
    "sync",
    "demo",
    "forget-ff",
    "forget-torn",
    "settings-toggle",
    "about-toggle"
  ]);
  let ownedPresentationLayer = null;
  let inlinePanelHost = null;
  let presentationRoot = null;
  let presentationRootEpoch = 0;
  let presentationResizeObserver = null;
  let presentationIntersectionObserver = null;
  let presentationFrameHandle = null;
  let presentationFrameNeedsLayout = false;
  let presentationFrameNeedsRender = false;
  let presentationFrameRenderAll = false;
  let lastPresentationDataSignature = "";
  let lastPresentationFairFightAt = 0;

  function presentationLayer() {
    const layer = ownedPresentationLayer;
    return layer instanceof HTMLElement &&
      presentationRoot instanceof HTMLElement &&
      layer.parentElement === presentationRoot &&
      layer.id === SCRIPT.layerId && ownedPresentationLayers.has(layer)
      ? layer
      : null;
  }

  function rowPlaneShadow() {
    return presentationLayer()?.shadowRoot || null;
  }

  function presentationShadow() {
    const host = inlinePanelHost;
    return host instanceof HTMLElement &&
      host.id === SCRIPT.panelId && ownedPanelHosts.has(host)
      ? host.shadowRoot
      : null;
  }

  const ROW_IDENTITY_ATTRIBUTES = Object.freeze([
    "data-profile",
    "data-profile-id",
    "data-user-id",
    "data-player-id",
    "data-target-id",
    "data-xid",
    "data-user2-id",
    "data-user2id"
  ]);

  function profileIdFromHref(href) {
    try {
      const url = new URL(String(href || ""), location.href);
      if (url.origin !== location.origin || !/\/profiles(?:\.php)?$/i.test(url.pathname)) return "";
      for (const name of ["XID", "xid", "user2ID", "user2id"]) {
        const id = String(url.searchParams.get(name) || "").trim();
        if (validTargetId(id)) return String(Number(id));
      }
      return "";
    } catch { return ""; }
  }

  function normalizedTargetId(value) {
    const id = String(value || "").trim();
    return validTargetId(id) ? String(Number(id)) : "";
  }

  function rowDatasetIdentityMatches(row, targetId) {
    for (const attribute of ROW_IDENTITY_ATTRIBUTES) {
      if (!row.hasAttribute(attribute)) continue;
      if (normalizedTargetId(row.getAttribute(attribute)) !== targetId) return false;
    }
    return true;
  }

  function rowFactionIdentityMatches(row) {
    if (!validTargetId(opponentFactionId)) return true;
    for (const link of row.querySelectorAll("a[href]")) {
      const factionId = factionIdFromLink(link);
      if (validTargetId(factionId) && factionId !== opponentFactionId) return false;
    }
    return true;
  }

  function nativeAttackIdentityMatches(attackCell, targetId) {
    if (!(attackCell instanceof HTMLElement)) return false;
    const expectedTargetId = normalizedTargetId(targetId);
    if (!expectedTargetId) return false;
    const links = [...attackCell.querySelectorAll("a")];
    if (links.length === 0) return normalizeText(attackCell.textContent).toLowerCase() === "attack";

    const ids = new Set();
    for (const link of links) {
      const href = link.getAttribute("href");
      if (!href) return false;
      let url;
      try { url = new URL(href, location.href); }
      catch { return false; }
      if (url.origin !== location.origin) return false;

      const sidValues = [];
      const targetValues = [];
      for (const [name, value] of url.searchParams.entries()) {
        const normalizedName = name.toLowerCase();
        if (normalizedName === "sid") sidValues.push(normalizeText(value).toLowerCase());
        if (normalizedName === "user2id") {
          const attackId = normalizedTargetId(value);
          if (!attackId) return false;
          targetValues.push(attackId);
        }
      }
      if (sidValues.length !== 1 || sidValues[0] !== "attack" || targetValues.length !== 1) return false;
      ids.add(targetValues[0]);
    }
    return ids.size === 1 && ids.has(expectedTargetId);
  }

  function directCell(row, selectors) {
    for (const selector of selectors) {
      const cell = row.querySelector(`:scope > ${selector}`);
      if (cell instanceof HTMLElement) return cell;
    }
    return null;
  }

  function currentRosterRoot() {
    const root = canonicalPdaRankedWarSurface()?.root || null;
    return root instanceof HTMLElement ? root : null;
  }

  function resolveLivePdaRow(row, expectedRoot = currentRosterRoot()) {
    if (!(row instanceof HTMLElement) || !(expectedRoot instanceof HTMLElement)) return null;
    if (!row.isConnected || !expectedRoot.isConnected || !expectedRoot.contains(row) || !row.matches("li.enemy")) return null;

    const profileAnchors = [...row.querySelectorAll("a[href]")]
      .filter(anchor => Boolean(profileIdFromHref(anchor.getAttribute("href"))));
    const profileIds = new Set(profileAnchors.map(anchor => profileIdFromHref(anchor.getAttribute("href"))));
    if (profileIds.size !== 1) return null;
    const targetId = normalizedTargetId([...profileIds][0]);
    if (!targetId || !rowDatasetIdentityMatches(row, targetId) || !rowFactionIdentityMatches(row)) return null;

    const member = directCell(row, [".member", "[class*='member__']"]);
    const score = directCell(row, [
      ".score",
      "[class*='score__']",
      ".points",
      "[class*='points__']"
    ]);
    const level = directCell(row, [".level", "[class*='level__']"]);
    const status = directCell(row, [".status", "[class*='status__']"]);
    const attack = directCell(row, [".attack", "[class*='attack__']"]);
    if (!(member instanceof HTMLElement) || !nativeAttackIdentityMatches(attack, targetId)) return null;

    const honor = member.querySelector("[class*='honor'], [class*='honour']");
    return {
      row,
      li: row,
      statusDiv: status instanceof HTMLElement ? status : row,
      id: targetId,
      profile: profileAnchors[0],
      anchors: {
        member,
        honor: honor instanceof HTMLElement ? honor : member,
        score,
        level,
        est: score instanceof HTMLElement ? score : level,
        status,
        attack
      }
    };
  }

  function formatBattleStatsEstimate(entry) {
    const human = normalizeText(entry?.bsEstimateHuman);
    if (human) return human.toLowerCase();
    const value = Number(entry?.bsEstimate);
    if (!Number.isFinite(value) || value <= 0) return "-";
    if (value >= 1e12) return `${(value / 1e12).toFixed(value >= 1e13 ? 0 : 1)}t`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 0 : 1)}b`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e8 ? 0 : 1)}m`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(value >= 1e5 ? 0 : 1)}k`;
    return String(Math.round(value));
  }

  function scoutColorForFairFight(value) {
    const ffValue = Number(value);
    if (!Number.isFinite(ffValue) || ffValue <= 0) return "#4b5563";
    const ff = Math.max(1, Math.min(5, ffValue));
    const index = Math.max(0, Math.min(10, Math.floor(((ff - 1) / 4) * 10)));
    return SCOUT_PALETTE[index];
  }

  function ensureInlinePanel(sourceShadow = rowPlaneShadow()) {
    // Anchor on the war card, not the roster, and sit ABOVE it. Below the
    // roster the panel is a long scroll away from the rows it describes; on a
    // phone that means it is never on screen when it matters.
    const surface = canonicalPdaRankedWarSurface();
    const anchor = (surface?.card instanceof HTMLElement && surface.card.parentElement)
      ? surface.card
      : currentRosterRoot();
    if (!(anchor instanceof HTMLElement) || !anchor.parentElement) return null;
    let panelHost = inlinePanelHost;
    if (!(panelHost instanceof HTMLElement) || !ownedPanelHosts.has(panelHost)) {
      const collision = document.getElementById(SCRIPT.panelId);
      if (collision && !ownedPanelHosts.has(collision)) return null;
      collision?.remove();
      panelHost = document.createElement("div");
      panelHost.id = SCRIPT.panelId;
      Object.assign(panelHost.style, {
        display: "block",
        position: "static",
        width: "100%",
        boxSizing: "border-box",
        margin: "6px 0"
      });
      ownedPanelHosts.add(panelHost);
      inlinePanelHost = panelHost;
      panelHost.attachShadow({ mode: "open" });
      isolatePanelHostInteraction(panelHost);
    }
    if (panelHost.parentElement !== anchor.parentElement || panelHost.nextElementSibling !== anchor) {
      anchor.before(panelHost);
    }
    const panelShadow = panelHost.shadowRoot;
    if (!panelShadow?.querySelector("[data-role='panel']") && sourceShadow) {
      const style = sourceShadow.querySelector("style")?.cloneNode(true);
      const panel = sourceShadow.querySelector("[data-role='panel']");
      if (style) panelShadow.appendChild(style);
      if (panel) {
        panel.removeAttribute("id");
        panelShadow.appendChild(panel);
      }
    }
    sourceShadow?.querySelectorAll("[data-role='panel']").forEach(panel => panel.remove());
    bindPanelControls(panelShadow);
    return panelHost;
  }

  // Torn's own collapse handler sits on an ancestor of the war card, and the
  // panel is a sibling of that card by owner decision (2026-09-03), so it lives
  // inside the section Torn folds. A click inside an open shadow root does not
  // stop at the host: it keeps bubbling out, retargeted to the host, and up
  // into Torn's tree. Every tap in the panel therefore reached that handler and
  // folded the whole section -- Torn's roster list and the panel with it, both
  // back the instant the next tap unfolded it.
  //
  // The DIBS button has carried exactly this guard since it moved onto Torn's
  // own Status cell (handleDibsClick). The panel never got it.
  //
  // Stopped on the panel host, which is KS's own element: no Torn node is
  // touched, so Torn's collapse still works on its own header and anywhere
  // outside the panel. touchmove is deliberately absent, so a finger that
  // starts on the panel still scrolls the page, and nothing here calls
  // preventDefault.
  function isolatePanelHostInteraction(panelHost) {
    for (const eventName of PANEL_ISOLATED_EVENTS) {
      panelHost.addEventListener(eventName, stopPanelInteractionPropagation, { passive: true });
    }
  }

  function stopPanelInteractionPropagation(event) {
    event.stopPropagation();
  }

  // One delegated handler on the panel element the script owns, not eight
  // handlers on eight controls. Torn re-renders the war card the panel is
  // anchored beside, so anything bound per control at mount is bound to a node
  // that may be gone by the next tap; the panel element survives, and when it
  // does not the new one is bound here the moment it is installed. Keyed on the
  // panel node itself, so the same handler is never installed twice.
  function bindPanelControls(panelShadow) {
    const panel = panelShadow?.querySelector("[data-role='panel']");
    if (!(panel instanceof HTMLElement) || boundPanelNodes.has(panel)) return;
    boundPanelNodes.add(panel);
    const byRole = role => panelShadow.querySelector(`[data-role='${role}']`);
    const ffTerms = byRole("ff-terms");
    const ffPrivacy = byRole("ff-privacy");
    const createKey = byRole("create-key");
    if (ffTerms instanceof HTMLAnchorElement) ffTerms.href = SCRIPT.ffscouterTermsUrl;
    if (ffPrivacy instanceof HTMLAnchorElement) ffPrivacy.href = SCRIPT.ffscouterPrivacyUrl;
    if (createKey instanceof HTMLAnchorElement) createKey.href = SCRIPT.tornCustomKeyUrl;
    panel.addEventListener("click", event => {
      const control = event.composedPath()
        .find(node => node instanceof HTMLElement && PANEL_CONTROL_ROLES.has(node.dataset?.role || ""));
      if (!(control instanceof HTMLElement)) return;
      handlePanelControl(control.dataset.role, event);
    });
    // Key setup A. Delegated from the panel node for the same reason the
    // click handler is: the two key inputs move between the breakout slot and
    // Settings but never out of this panel, and focusout bubbles. A lock that
    // was held back while the field had focus is applied when it loses it.
    panel.addEventListener("focusout", handleCredentialInputFocusOut);
  }

  function handlePanelControl(role, event) {
    // Every action below re-checks its own lock on entry and refuses there.
    // This switch routes the tap; it never decides whether the action is
    // allowed, so a control that is only marked aria-disabled cannot reach
    // anything the disabled property used to prevent.
    switch (role) {
      case "key": beginFfCredentialEdit(); return;
      case "torn-key": beginTornCredentialEdit(); return;
      case "key-cancel": closeFfCredentialEditor(); return;
      case "torn-key-cancel": closeTornCredentialEditor(); return;
      case "key-save": void runFfCredentialMutation(saveSharedKeyFromEditor); return;
      case "torn-key-save": void runTornCredentialMutation(saveTornKeyFromEditor); return;
      case "forget-ff": void runFfCredentialMutation(forgetSharedKey); return;
      case "forget-torn": void runTornCredentialMutation(forgetTornKey); return;
      case "sync":
        event.preventDefault(); registerTrustedInteraction();
        // One tap, one sign-in attempt -- also with a key the server refused.
        ksAllowOneManualSignIn();
        if (effectiveTornApiKey()) { void fetchSharedClaims(); void fetchTornStatuses({ force: true }); }
        if (sharedApiKey) void fetchFairFightStats({ force: true });
        scanWarRows();
        return;
      case "demo":
        // Powerless on the owner's own war by owner decision: the control
        // does not exist in the DOM there at all (see updatePanel), so this
        // never runs, and it sends nothing anywhere. Kept as a second,
        // redundant guard.
        if (!viewOnlyMode()) { demoMode = false; updatePanel(); return; }
        demoMode = !demoMode;
        scanWarRows();
        updatePanel();
        return;
      case "settings-toggle":
        registerTrustedInteraction();
        settingsExpanded = !settingsExpanded;
        updatePanel();
        return;
      case "about-toggle":
        registerTrustedInteraction();
        aboutExpanded = !aboutExpanded;
        updatePanel();
        return;
      default:
    }
  }

  function ensurePresentationLayer() {
    const root = currentRosterRoot();
    if (!(root instanceof HTMLElement) || !isWarPanelPresent()) return null;
    if (presentationRoot !== root) {
      retireAllBindings();
      presentationResizeObserver?.disconnect();
      presentationIntersectionObserver?.disconnect();
      rowRegistry.clear();
      targetRows.clear();
      ownedPresentationLayer?.remove();
      ownedPresentationLayer = null;
      presentationRoot = root;
      presentationRootEpoch += 1;
      // A genuinely new root is a remount: Settings/About never survive one.
      settingsExpanded = false;
      aboutExpanded = false;
    }
    let layer = presentationLayer();
    if (layer?.shadowRoot) {
      ensureInlinePanel();
      return layer;
    }
    const idCollision = document.getElementById(SCRIPT.layerId);
    if (idCollision && !ownedPresentationLayers.has(idCollision)) return null;
    retireAllBindings();
    presentationResizeObserver?.disconnect();
    presentationResizeObserver = null;
    idCollision?.remove();

    layer = document.createElement("div");
    layer.id = SCRIPT.layerId;
    Object.assign(layer.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "0",
      height: "0",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2"
    });
    ownedPresentationLayers.add(layer);
    ownedPresentationLayer = layer;
    presentationRoot.appendChild(layer);
    const shadow = layer.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all:initial; display:block; width:100%; }
        *,*::before,*::after { box-sizing:border-box; }
        [data-role='row-surface'] { position:absolute; left:0; top:0; width:100%; height:0; overflow:visible; pointer-events:none; }
        [data-role='row-host'] { position:absolute; display:block; overflow:visible; pointer-events:none; contain:layout style; font-family:Arial,sans-serif; }
        .presenter { position:absolute; display:none; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; pointer-events:none; text-align:center; }
        .presenter[hidden] { display:none !important; }
        .ff,.est,.hospital { border:1px solid rgba(15,23,42,.55); border-radius:4px; color:#fff; background:rgba(15,23,42,.88); text-shadow:0 1px 1px #000; font-weight:900; line-height:14px; }
        .ff { font-size:7px; }
        .est { font-size:7px; }
        .hospital { color:#ffe2e2; background:rgba(127,29,29,.88); border-color:rgba(248,113,113,.75); font-size:7px; }
        button[data-role='dibs'] { position:absolute; display:none; min-width:34px; min-height:30px; margin:0; padding:1px 2px; border:1px solid #718096; border-radius:6px; background:rgba(26,32,44,.96); color:#e2e8f0; font:900 8px/1.05 Arial,sans-serif; text-align:center; touch-action:manipulation; -webkit-tap-highlight-color:transparent; pointer-events:auto; overflow:hidden; }
        button[data-role='dibs'] .label { display:block; font:900 12px/1.15 Arial,sans-serif; white-space:nowrap; }
        button[data-role='dibs'] .sub { display:block; font:700 8px/1.1 Arial,sans-serif; opacity:.85; white-space:nowrap; }
        button[data-role='dibs'].ready { border-color:#38a169; background:#22543d; color:#f0fff4; }
        button[data-role='dibs'].free { border-color:#38b2ac; background:#234e52; color:#e6fffa; }
        button[data-role='dibs'].lowhp { border-color:#d53f8c; background:#702459; color:#fff5f7; }
        button[data-role='dibs'].locked,button[data-role='dibs'].prewar { border-color:#975a16; background:#744210; color:#fefcbf; }
        button[data-role='dibs'].unknown { border-color:#9b2c2c; background:#742a2a; color:#fff5f5; }
        button[data-role='dibs'].unavailable,button[data-role='dibs'].blocked { border-color:#4a5568; background:#171923; color:#94a3b8; }
        button[data-role='dibs'].claimed { border-color:#3182ce; background:#2a4365; color:#ebf8ff; }
        button[data-role='dibs'].shared { border-color:#805ad5; background:#44337a; color:#faf5ff; }
        button[data-role='dibs'].working { border-color:#0ea5e9; background:#0c4a6e; color:#e0f2fe; }
        button[data-role='dibs'].cleanup { border-color:#dc2626; background:#7f1d1d; color:#fff1f2; }
        button[data-role='dibs']:disabled { opacity:.7; }
        .label,.sub { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sub { margin-top:1px; font-size:6.5px; opacity:.94; }
        .panel { box-sizing:border-box; width:100%; padding:7px 10px 6px; border:1px solid rgba(100,116,139,.55); border-radius:8px; background:rgba(15,23,42,.96); color:#dbe5f1; font-family:system-ui,sans-serif; pointer-events:auto; }
        .top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .brand { font:850 10px/1.2 system-ui,sans-serif; color:#f8fafc; }
        .version { font:750 8px/1.2 system-ui,sans-serif; color:#8fa0b4; }
        .status-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; margin-top:5px; }
        .status-item { min-width:0; display:flex; align-items:center; gap:4px; padding:4px 5px; border:1px solid rgba(100,116,139,.25); border-radius:5px; background:rgba(2,6,23,.45); }
        .dot { flex:0 0 5px; width:5px; height:5px; border-radius:50%; background:#64748b; }
        [data-state='ready'] .dot,[data-state='online'] .dot { background:#22c55e; }
        [data-state='upcoming'] .dot,[data-state='degraded'] .dot { background:#f59e0b; }
        [data-state='syncing'] .dot,[data-state='writing'] .dot { background:#38bdf8; }
        [data-state='error'] .dot,[data-state='offline'] .dot,[data-state='unknown'] .dot,[data-state='ended'] .dot { background:#ef4444; }
        .status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cbd5e1; font:700 7.7px/1.2 system-ui,sans-serif; }
        button,a { border:0; padding:0; background:none; color:#94a3b8; font:700 8.2px/1.2 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
        button:hover,a:hover { color:#fff; text-decoration:underline; }
        button:disabled { opacity:.4; cursor:default; text-decoration:none; }
        button[data-role='dibs']:hover { text-decoration:none; }
        /* A phone finger is about 8mm wide. Eight 9.8px text links on one line
           is not a control row, it is a row nobody can hit. 44px minimum per
           target, wrapped, with a pressed state so a tap that lands is
           visible even when the action it triggers is refused. */
        .controls { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:6px; margin-top:7px; }
        .controls > button,.controls > a { display:flex; align-items:center; justify-content:center; min-height:44px; padding:6px 7px; border:1px solid rgba(100,116,139,.45); border-radius:8px; background:rgba(2,6,23,.5); color:#cbd5e1; font:700 9.5px/1.15 system-ui,sans-serif; text-align:center; white-space:normal; overflow-wrap:anywhere; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
        .controls > button:hover,.controls > a:hover { color:#fff; text-decoration:none; border-color:rgba(148,163,184,.8); }
        .controls > button:active,.controls > a:active { background:rgba(56,189,248,.22); border-color:#38bdf8; color:#f8fafc; }
        .controls > [aria-disabled='true'] { color:#8494a8; border-style:dashed; border-color:rgba(100,116,139,.5); background:rgba(2,6,23,.3); }
        .controls > button:disabled { opacity:.4; cursor:default; }
        .editor { display:none; flex-wrap:wrap; align-items:center; gap:5px; margin-top:5px; }
        .editor.open { display:flex; }
        /* Key setup A: the lock's reason, directly below the editor controls. */
        .credential-lock-message { flex:0 0 100%; color:#fbbf24; font:600 10px/1.35 system-ui,sans-serif; white-space:normal; overflow-wrap:anywhere; }
        /* Key setup B: Save and Cancel at both key fields are at least
           44 x 44 px. Only these four touch targets change size. */
        button[data-role='key-save'],button[data-role='key-cancel'],button[data-role='torn-key-save'],button[data-role='torn-key-cancel'] { min-width:44px; min-height:44px; flex-shrink:0; padding:6px; touch-action:manipulation; }
        .editor input { min-width:0; flex:1 1 180px; height:28px; box-sizing:border-box; border:1px solid #64748b; border-radius:5px; background:#111827; color:#f8fafc; padding:4px 7px; font:700 10px/1 system-ui,sans-serif; outline:none; }
        /* B: keep the larger targets inside the existing breakout grid row. */
        .controls > .editor { margin-top:0; }
        /* B: with two 44px buttons in the same cell the field was left
           22px wide. Full width puts the field on its own row; .editor
           wraps, so Save and Cancel sit below it and keep their size. */
        .controls > .editor input { flex-basis:100%; }
        .note { margin-top:4px; color:#8794a5; font:600 7.2px/1.3 system-ui,sans-serif; }
        .api-policy { margin-top:6px; padding-top:6px; border-top:1px solid rgba(148,163,184,.18); color:#9aa9ba; font:600 7px/1.35 system-ui,sans-serif; }
        .api-policy strong { color:#d8e1eb; font-weight:750; }
        .api-policy a { color:#b9d7f2; text-decoration:underline; }
        .warning { color:#fbbf24; }
        /* 1.5.173: normal mode is the brand row, one summary row and Settings.
           Everything else lives here, collapsed by default, a class toggle only. */
        .summary-item { margin-top:5px; }
        .settings-panel { display:none; }
        .settings-panel.open { display:block; }
        .about-panel { display:none; margin-top:5px; }
        .about-panel.open { display:block; }
        .danger-zone { margin-top:6px; padding-top:6px; border-top:1px solid rgba(148,163,184,.18); }
        .danger-zone-label { color:#fca5a5; font:750 7px/1.3 system-ui,sans-serif; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
        @media (max-width:520px) { .status-grid { grid-template-columns:1fr; } .panel { padding-left:8px; padding-right:8px; } }
      </style>
      <div data-role="row-surface"></div>
      <div class="panel" data-role="panel" id="${SCRIPT.panelId}">
        <div class="top"><span class="brand">KS Torn War Dibs</span><span class="version">v${SCRIPT.version}</span></div>
        <div class="status-item summary-item" data-role="summary-item"><span class="dot"></span><span class="status" data-role="summary-status">Loading…</span></div>
        <div class="controls"><button type="button" data-role="settings-toggle" aria-expanded="false">Settings</button></div>
        <div class="controls" data-role="key-breakout" hidden></div>
        <div class="settings-panel" data-role="settings-panel">
          <div class="status-grid">
            <div class="status-item" data-role="shared-item"><span class="dot"></span><span class="status" data-role="status">War Room: CHECKING…</span></div>
            <div class="status-item" data-role="torn-item"><span class="dot"></span><span class="status" data-role="torn-status">Torn: loading…</span></div>
            <div class="status-item" data-role="rw-item"><span class="dot"></span><span class="status" data-role="rw-status">DIBS: checking RW…</span></div>
            <div class="status-item" data-role="clock-item"><span class="dot"></span><span class="status" data-role="clock-status">Clock: loading…</span></div>
            <div class="status-item" data-role="life-item"><span class="dot"></span><span class="status" data-role="life-status">Life: 0 targets read · newest unknown</span></div>
          </div>
          <div class="controls" data-role="controls-primary">
            <button type="button" data-role="key">FFScouter key</button>
            <button type="button" data-role="torn-key">Torn key</button>
            <a data-role="create-key" target="_blank" rel="noopener noreferrer">Create custom API key</a>
            <button type="button" data-role="sync">Sync</button>
          </div>
          <div class="editor" data-role="key-editor"><input data-role="key-input" type="text" maxlength="16" autocomplete="off" placeholder="16-character FFScouter key"><button type="button" data-role="key-save">Save</button><button type="button" data-role="key-cancel">Cancel</button><div class="credential-lock-message" data-role="key-lock-message" role="status" hidden></div></div>
          <div class="editor" data-role="torn-key-editor"><input data-role="torn-key-input" type="text" maxlength="16" autocomplete="off" placeholder="16-character Torn API key"><button type="button" data-role="torn-key-save">Save</button><button type="button" data-role="torn-key-cancel">Cancel</button><div class="credential-lock-message" data-role="torn-key-lock-message" role="status" hidden></div></div>
          <div class="note" data-role="note">LIVE: Hospital ≤2:00 + FF 2.00–3.40. Online targets are free for all. Low life (≤20%): FF up to 4.50. First successful DIBS wins; claimant can RELEASE.</div>
          <div class="controls"><button type="button" data-role="about-toggle" aria-expanded="false">About — data &amp; privacy</button></div>
          <div class="about-panel" data-role="about-panel">
            <div class="api-policy">
              <strong>Torn API key:</strong> stored only locally, encrypted in this browser; sent to api.torn.com and, when signing in, to the KS War Room server, which asks Torn who the key belongs to and does not store or log it. Torn API data is processed locally and is not sent to FFScouter. Purpose: faction member Hospital/status data, key-owner identity, the names of your own faction's members (to show who holds a DIBS) and life of opponents who are about to leave hospital (low-life DIBS). Access: Custom key requiring faction → members, wars and user → basic, profile; key → info is used to identify the key owner.
              <br>
              <strong>FFScouter key/integration:</strong> key stored only locally, encrypted in this browser; sent only to FFScouter. Visible target IDs from the actively viewed war page are sent to FFScouter for FF/Est lookup only.
              <a data-role="ff-terms" target="_blank" rel="noopener noreferrer">FFScouter terms/data policy</a> · <a data-role="ff-privacy" target="_blank" rel="noopener noreferrer">Privacy</a>.
              <br>
              <strong>KS War Room (shared DIBS):</strong> claim/release data is shared with faction members through the KS War Room server (ks-war-room-claims.hans-viklund.workers.dev). Signing in returns a temporary sign-in token that is kept only in this page's memory and is never stored. Sent to the server: that token, the war ID, the target's Torn ID and the target's hospital end time. Calls: sign in, read the claim board (every 2.5 s on your own war page), claim, release, and a report when a claimed target is back in hospital. Kept on the server: target ID, the claimer's Torn ID, claim time and hospital end time, removed once the war has been untouched for 12 hours.
              <br>
              Data Storage: Temporary (&lt; 1 day) · Data Sharing: Faction · Purpose of Use: Competitive advantage · Key Storage &amp; Sharing: Not stored/shared · Key Access Level: Public
            </div>
          </div>
          <div class="danger-zone">
            <div class="danger-zone-label">Danger zone</div>
            <div class="controls" data-role="controls-danger">
              <button type="button" data-role="forget-ff">Forget FF key</button>
              <button type="button" data-role="forget-torn">Forget Torn key</button>
            </div>
          </div>
        </div>
      </div>
    `;

    ensureInlinePanel(shadow);
    startPresentationResizeObserver();
    startPresentationIntersectionObserver();
    updatePanel();
    return layer;
  }

  function startPresentationResizeObserver() {
    presentationResizeObserver?.disconnect();
    if (typeof ResizeObserver !== "function") return;
    presentationResizeObserver = new ResizeObserver(() => {
      if (runtimeActive && bridgeMounted && isRuntimeEligible()) layoutRowBindings();
    });
    const root = currentRosterRoot();
    if (root) presentationResizeObserver.observe(root);
    for (const binding of rowBindings.values()) observeBindingGeometry(binding);
  }

  function clipsPresentationViewport(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const clipsY = ["auto", "scroll", "hidden", "clip"].includes(style.overflowY);
    return clipsY && element.scrollHeight > element.clientHeight + 1;
  }

  function presentationVisibilityRoot() {
    let candidate = presentationRoot;
    while (
      candidate instanceof HTMLElement &&
      candidate !== document.body &&
      candidate !== document.documentElement
    ) {
      if (clipsPresentationViewport(candidate)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function startPresentationIntersectionObserver() {
    presentationIntersectionObserver?.disconnect();
    presentationIntersectionObserver = null;
    if (typeof IntersectionObserver !== "function") {
      for (const entry of rowRegistry.values()) entry.nearVisible = true;
      return;
    }
    presentationIntersectionObserver = new IntersectionObserver(records => {
      let changed = false;
      for (const record of records) {
        const entry = rowRegistry.get(record.target);
        if (!entry) continue;
        const nearVisible = record.isIntersecting || record.intersectionRatio > 0;
        if (entry.nearVisible === nearVisible) continue;
        entry.nearVisible = nearVisible;
        changed = true;
      }
      if (changed) schedulePresentationFrame({ layout: false, render: true });
    }, { root: presentationVisibilityRoot(), rootMargin: "160px 0px", threshold: 0 });
    for (const entry of rowRegistry.values()) presentationIntersectionObserver.observe(entry.row);
  }

  function observeBindingGeometry(binding) {
    if (!presentationResizeObserver || !binding) return;
    for (const node of [binding.row, ...Object.values(binding.anchors)]) {
      if (node instanceof Element) presentationResizeObserver.observe(node);
    }
  }

  // Torn's status text is wider than the cell KS measures, so it printed out
  // from behind the button -- "Okay" and "Abroad" reading through a DIBS box
  // (owner screenshots 2026-09-05). Hiding it is the only way to own the cell,
  // and it is done for exactly as long as the button covers it: the moment the
  // button has nothing to say, Torn's own status is back, untouched.
  //
  // visibility, not display: display would change the row's layout and move
  // everything KS has just measured.
  function setNativeStatusHidden(binding, hidden) {
    const cell = binding?.anchors?.status;
    if (!(cell instanceof HTMLElement)) return;
    const next = hidden ? "hidden" : "";
    if (cell.style.visibility !== next) cell.style.visibility = next;
  }

  // Same rule for the Score cell. The Est box was drawn on top of Torn's own
  // score and the score read through behind it -- two numbers in one small cell
  // (owner, 2026-09-05). KS takes the cell only when it has an estimate to put
  // there; with no estimate the box goes away and Torn's score is untouched.
  function setNativeScoreHidden(binding, hidden) {
    const cell = binding?.anchors?.est;
    if (!(cell instanceof HTMLElement)) return;
    const next = hidden ? "hidden" : "";
    if (cell.style.visibility !== next) cell.style.visibility = next;
  }

  function retireBinding(binding) {
    if (!binding) return;
    // Never leave a Torn cell hidden behind a control that is going away.
    setNativeStatusHidden(binding, false);
    setNativeScoreHidden(binding, false);
    for (const node of [binding.row, ...Object.values(binding.anchors || {})]) {
      if (node instanceof Element) presentationResizeObserver?.unobserve(node);
    }
    if (rowBindings.get(binding.row) === binding) rowBindings.delete(binding.row);
    if (xidBindings.get(binding.targetId) === binding) xidBindings.delete(binding.targetId);
    const entry = rowRegistry.get(binding.row);
    if (entry?.binding === binding) entry.binding = null;
    binding.host?.remove();
  }

  function retireAllBindings() {
    for (const binding of [...rowBindings.values()]) retireBinding(binding);
    rowBindings.clear();
    xidBindings.clear();
  }

  function removePresentationLayer() {
    if (presentationFrameHandle !== null) cancelAnimationFrame(presentationFrameHandle);
    presentationFrameHandle = null;
    presentationFrameNeedsLayout = false;
    presentationFrameNeedsRender = false;
    presentationFrameRenderAll = false;
    lastPresentationDataSignature = "";
    lastPresentationFairFightAt = 0;
    restoreRosterOrder();
    rosterFirstSeen.clear();
    rosterFirstSeenNext = 0;
    retireAllBindings();
    for (const entry of rowRegistry.values()) {
      presentationIntersectionObserver?.unobserve(entry.row);
    }
    rowRegistry.clear();
    targetRows.clear();
    presentationResizeObserver?.disconnect();
    presentationIntersectionObserver?.disconnect();
    presentationResizeObserver = null;
    presentationIntersectionObserver = null;
    presentationRoot = null;
    presentationRootEpoch += 1;
    const layer = ownedPresentationLayer;
    ownedPresentationLayer = null;
    if (layer instanceof HTMLElement && ownedPresentationLayers.has(layer)) layer.remove();
    const panelHost = inlinePanelHost;
    inlinePanelHost = null;
    if (panelHost instanceof HTMLElement && ownedPanelHosts.has(panelHost)) panelHost.remove();
  }

  function sameResolvedBinding(binding, resolved) {
    return Boolean(
      binding && resolved &&
      binding.host?.isConnected &&
      binding.host.getRootNode() === rowPlaneShadow() &&
      binding.host.parentElement === rowPlaneShadow()?.querySelector("[data-role='row-surface']") &&
      binding.rootEpoch === presentationRootEpoch &&
      binding.row === resolved.row &&
      binding.targetId === resolved.id &&
      binding.profile === resolved.profile &&
      binding.anchors.member === resolved.anchors.member &&
      binding.anchors.est === resolved.anchors.est &&
      binding.anchors.status === resolved.anchors.status &&
      binding.anchors.attack === resolved.anchors.attack &&
      xidBindings.get(binding.targetId) === binding
    );
  }

  function currentResolvedBinding(binding) {
    if (!binding || presentationRoot !== currentRosterRoot()) return null;
    const entry = rowRegistry.get(binding.row);
    if (!entry || entry.binding !== binding || entry.targetId !== binding.targetId) return null;
    const resolved = resolveLivePdaRow(binding.row, presentationRoot);
    return sameResolvedBinding(binding, resolved) ? resolved : null;
  }

  function cachedResolvedBinding(binding) {
    if (!binding || !(presentationRoot instanceof HTMLElement) || !presentationRoot.isConnected) return null;
    const entry = rowRegistry.get(binding.row);
    if (
      !entry || entry.binding !== binding || entry.targetId !== binding.targetId ||
      !binding.host?.isConnected || binding.host.getRootNode() !== rowPlaneShadow() ||
      !binding.row?.isConnected || !presentationRoot.contains(binding.row)
    ) return null;
    for (const anchor of [binding.profile, ...Object.values(binding.anchors || {})]) {
      if (!(anchor instanceof Element) || !anchor.isConnected || !binding.row.contains(anchor)) return null;
    }
    return {
      row: binding.row,
      li: binding.row,
      statusDiv: binding.anchors.status instanceof HTMLElement
        ? binding.anchors.status
        : binding.row,
      id: binding.targetId,
      profile: binding.profile,
      anchors: binding.anchors
    };
  }

  function activeTargetEntries(targetId) {
    const rows = targetRows.get(String(targetId || ""));
    if (!rows) return [];
    const entries = [];
    for (const row of rows) {
      const entry = rowRegistry.get(row);
      const resolved = resolveLivePdaRow(row, presentationRoot);
      if (entry && resolved && entry.targetId === resolved.id && entry.profile === resolved.profile) {
        entries.push(entry);
      }
    }
    return entries;
  }

  function bindingTargetIsUnique(binding, resolved) {
    if (!binding || !resolved || binding.targetId !== resolved.id) return false;
    const entries = activeTargetEntries(resolved.id);
    return entries.length === 1 &&
      entries[0].row === binding.row &&
      entries[0].binding === binding &&
      xidBindings.get(resolved.id) === binding;
  }

  function removeRowRegistryEntry(row, { reconcile = true } = {}) {
    const entry = rowRegistry.get(row);
    if (!entry) return;
    presentationIntersectionObserver?.unobserve(row);
    if (entry.binding) retireBinding(entry.binding);
    rowRegistry.delete(row);
    const rows = targetRows.get(entry.targetId);
    rows?.delete(row);
    if (rows?.size === 0) targetRows.delete(entry.targetId);
    if (reconcile) reconcileTargetOwnership(entry.targetId);
  }

  function reconcileTargetOwnership(targetId) {
    const entries = activeTargetEntries(targetId);
    if (entries.length !== 1) {
      for (const entry of entries) {
        if (entry.binding) retireBinding(entry.binding);
      }
      xidBindings.delete(String(targetId || ""));
      return null;
    }
    const entry = entries[0];
    const resolved = resolveLivePdaRow(entry.row, presentationRoot);
    if (!resolved) {
      removeRowRegistryEntry(entry.row);
      return null;
    }
    let binding = entry.binding;
    if (!sameResolvedBinding(binding, resolved)) {
      if (binding) retireBinding(binding);
      binding = createBinding(resolved);
    }
    return binding;
  }

  function registerOrReconcileRow(row) {
    if (!(row instanceof HTMLElement)) return null;
    const resolved = resolveLivePdaRow(row, presentationRoot);
    const existing = rowRegistry.get(row);
    const same = Boolean(
      existing && resolved &&
      existing.targetId === resolved.id &&
      existing.profile === resolved.profile &&
      existing.anchors.member === resolved.anchors.member &&
      existing.anchors.honor === resolved.anchors.honor &&
      existing.anchors.est === resolved.anchors.est &&
      existing.anchors.status === resolved.anchors.status &&
      existing.anchors.attack === resolved.anchors.attack
    );
    if (same) {
      reconcileTargetOwnership(existing.targetId);
      return existing;
    }
    const oldTargetId = existing?.targetId || "";
    if (existing) removeRowRegistryEntry(row, { reconcile: false });
    if (oldTargetId) reconcileTargetOwnership(oldTargetId);
    if (!resolved) return null;
    const entry = {
      row,
      targetId: resolved.id,
      profile: resolved.profile,
      anchors: resolved.anchors,
      nearVisible: !presentationIntersectionObserver,
      binding: null
    };
    rowRegistry.set(row, entry);
    let rows = targetRows.get(entry.targetId);
    if (!rows) {
      rows = new Set();
      targetRows.set(entry.targetId, rows);
    }
    rows.add(row);
    presentationIntersectionObserver?.observe(row);
    reconcileTargetOwnership(entry.targetId);
    return entry;
  }

  function handleDibsClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.isTrusted !== true) return;
    registerTrustedInteraction();
    const button = event.currentTarget;
    const host = button?.closest?.("[data-role='row-host']");
    const binding = hostBindings.get(host);
    const resolved = currentResolvedBinding(binding);
    if (!resolved || !bindingTargetIsUnique(binding, resolved)) {
      if (binding) registerOrReconcileRow(binding.row);
      return;
    }
    // DEMO is a picture. Nothing behind it exists to act on.
    if (demoActive()) return;
    const own = currentOwnClaim();
    const state = button.dataset.state;
    if ((state === "claimed" || state === "cleanup") && own?.targetId === resolved.id) {
      beginSharedWriteFeedback();
      void releaseOwnSharedTarget();
      return;
    }
    if (button.disabled || button.dataset.ready !== "true") return;
    if (
      own || sharedWriteBusy || ffCredentialChangeBusy() ||
      tornCredentialMutationInProgress || !newClaimStorageAuthorityReady() || !effectiveTornApiKey()
    ) return;
    beginSharedWriteFeedback();
    void claimSharedTarget(resolved.id, getPlayerName(resolved));
  }

  function createBinding(resolved) {
    const surface = rowPlaneShadow()?.querySelector(`[data-role='row-surface']`);
    if (!(surface instanceof HTMLElement)) return null;
    const host = document.createElement("div");
    host.id = `${SCRIPT.rowHostPrefix}${resolved.id}`;
    host.dataset.role = "row-host";
    host.dataset.xid = resolved.id;
    host.innerHTML = `
      <span class="presenter ff" data-role="ff"></span>
      <span class="presenter est" data-role="est"></span>
      <span class="presenter hospital" data-role="hospital" hidden></span>
      <button type="button" data-role="dibs" disabled data-state="loading" data-ready="false"><span class="label">DIBS</span><span class="sub">LOADING</span></button>
    `;
    surface.appendChild(host);
    const binding = {
      rootEpoch: presentationRootEpoch,
      row: resolved.row,
      targetId: resolved.id,
      profile: resolved.profile,
      anchors: resolved.anchors,
      host
    };
    rowBindings.set(resolved.row, binding);
    xidBindings.set(resolved.id, binding);
    const entry = rowRegistry.get(resolved.row);
    if (entry) entry.binding = binding;
    hostBindings.set(host, binding);
    host.querySelector(`[data-role='dibs']`)?.addEventListener("click", handleDibsClick);
    observeBindingGeometry(binding);
    return binding;
  }

  function setOwnGeometry(element, rect, rowRect, options = {}) {
    if (!(element instanceof HTMLElement) || element.hidden || !rect || rect.width <= 0 || rect.height <= 0) {
      if (element instanceof HTMLElement) element.style.display = "none";
      return false;
    }
    const inset = Number(options.inset || 0);
    const left = rect.left - rowRect.left + inset;
    const top = rect.top - rowRect.top + inset;
    const width = Math.max(0, rect.width - inset * 2);
    const height = Math.max(0, rect.height - inset * 2);
    if (![left, top, width, height].every(Number.isFinite) || width < 2 || height < 2) {
      element.style.display = "none";
      return false;
    }
    Object.assign(element.style, {
      display: "block",
      left: `${left.toFixed(2)}px`,
      top: `${top.toFixed(2)}px`,
      width: `${width.toFixed(2)}px`,
      height: `${height.toFixed(2)}px`
    });
    return true;
  }

  function measureRowBinding(binding, layerRect) {
    const resolved = currentResolvedBinding(binding);
    if (!resolved) return { binding, resolved: null };
    const rowRect = resolved.row.getBoundingClientRect();
    if (rowRect.width <= 0 || rowRect.height <= 0) {
      return { binding, resolved, hidden: true };
    }
    return {
      binding,
      resolved,
      layerRect,
      rowRect,
      memberRect: resolved.anchors.honor?.getBoundingClientRect() || null,
      estRect: resolved.anchors.est?.getBoundingClientRect() || null,
      statusRect: resolved.anchors.status?.getBoundingClientRect() || null,
      attackRect: resolved.anchors.attack?.getBoundingClientRect() || null
    };
  }

  function applyRowBindingLayout(measurement) {
    const { binding, resolved, layerRect, rowRect } = measurement;
    if (!resolved) { retireBinding(binding); return; }
    if (measurement.hidden) { binding.host.style.display = "none"; return; }
    binding.lastLayout = {
      rowRect,
      statusRect: measurement.statusRect
    };
    Object.assign(binding.host.style, {
      display: "block",
      left: `${(rowRect.left - layerRect.left).toFixed(2)}px`,
      top: `${(rowRect.top - layerRect.top).toFixed(2)}px`,
      width: `${rowRect.width.toFixed(2)}px`,
      height: `${rowRect.height.toFixed(2)}px`
    });

    const ff = binding.host.querySelector(`[data-role='ff']`);
    const est = binding.host.querySelector(`[data-role='est']`);
    const hospital = binding.host.querySelector(`[data-role='hospital']`);
    const dibs = binding.host.querySelector(`[data-role='dibs']`);
    const memberRect = measurement.memberRect;
    if (memberRect && ff instanceof HTMLElement) {
      const pillWidth = Math.min(52, Math.max(30, memberRect.width * .38));
      const pillRect = {
        left: memberRect.right - pillWidth - 2,
        top: memberRect.bottom - Math.min(15, memberRect.height) - 1,
        width: pillWidth,
        height: Math.min(15, memberRect.height)
      };
      setOwnGeometry(ff, pillRect, rowRect);
    } else if (ff instanceof HTMLElement) ff.style.display = "none";
    setOwnGeometry(est, measurement.estRect, rowRect, { inset: 1 });
    // The countdown moved into the button, which now owns the Status cell.
    // Two boxes cannot share one cell on a phone.
    setOwnGeometry(hospital, null, rowRect);
    const dibsPlaced = setOwnGeometry(dibs, measurement.statusRect, rowRect, { inset: 1 });
    if (!dibsPlaced && dibs instanceof HTMLButtonElement) { dibs.disabled = true; dibs.dataset.ready = "false"; }
  }

  function layoutRowBindings() {
    schedulePresentationFrame({ layout: true, render: false });
  }

  // Covering Torn's Status cell is only justified when KS actually has something
  // to add. Otherwise the cell is left alone and Torn's own Okay / Traveling /
  // Abroad reads exactly as it always did.
  function dibsControlHasSomethingToSay({ playerId, own, sharedClaim, countdown, decision = null }) {
    return Boolean(
      countdown ||
      (decision?.state === TARGET_STATE.FREE && Number.isFinite(decision.seconds)) ||
      sharedClaim ||
      sharedClaimUnknown(playerId) ||
      pendingTargetId === playerId ||
      own?.targetId === playerId
    );
  }

  // The button sits on the Status cell and is the only thing KS draws there.
  //
  // MEASURED 2026-09-05 on the owner's phone: `attack cell 0x0, DIBS HIDDEN`.
  // Torn PDA's Ranked War roster has Members, Score and Status and no Attack
  // column; the attack cell exists with a valid attack link but has no size, so
  // setOwnGeometry hid the button on every row. The button had never been drawn
  // on PDA at all -- it would have been discovered mid-war.
  //
  // It therefore takes the Status cell and carries the countdown itself. When it
  // has nothing to say -- not in hospital, no claim, nothing pending -- it goes
  // invisible instead, and Torn's own Okay / Traveling / Abroad shows through
  // untouched. Visibility, not display: layout runs after render in the same
  // frame and would undo a display change.
  function updateDibsControl(host, decision, sharedClaim, context = {}) {
    const button = host?.querySelector?.(`[data-role='dibs']`);
    const label = button?.querySelector?.(".label");
    const sub = button?.querySelector?.(".sub");
    if (!(button instanceof HTMLButtonElement) || !label || !sub || !decision) return;
    const playerId = String(host.dataset.xid || "");
    const own = currentOwnClaim();
    const exactOwnProof = exactSharedProofForOwnClaim(own);
    const countdown = normalizeText(context.countdown);
    button.dataset.ready = "false";
    button.removeAttribute("title");

    if (!demoActive() && !dibsControlHasSomethingToSay({ playerId, own, sharedClaim, countdown, decision })) {
      button.style.visibility = "hidden";
      button.disabled = true;
      return;
    }
    button.style.visibility = "visible";

    if (demoActive()) {
      // The example state is assigned per target id, so it can land on a row
      // whose real countdown is hours away or unreadable. An attackable example
      // must never be shown against a time that says otherwise, so the example
      // states carry example times; only the locked example keeps the real one.
      const ff = demoFairFightForTarget(playerId).toFixed(1);
      switch (demoStateForTarget(playerId)) {
        case "ready":
          button.className = "ready"; button.dataset.state = TARGET_STATE.READY;
          button.disabled = false; button.dataset.ready = "true";
          label.textContent = "0:42"; sub.textContent = `DIBS · FF${ff}`;
          return;
        case "claimed":
          button.className = "claimed"; button.dataset.state = "claimed"; button.disabled = false;
          label.textContent = "DIBBED"; sub.textContent = "RELEASE";
          return;
        case "shared":
          button.className = "shared"; button.dataset.state = "shared"; button.disabled = true;
          label.textContent = "TAKEN"; sub.textContent = "Kingshade";
          return;
        case "ff-low":
          button.className = TARGET_STATE.LOCKED; button.dataset.state = TARGET_STATE.LOCKED;
          button.disabled = true; label.textContent = "1:05"; sub.textContent = `FF${ff}`;
          return;
        case "unreadable":
          button.className = "unavailable"; button.dataset.state = "unreadable"; button.disabled = true;
          label.textContent = "DIBS?"; sub.textContent = "UNKNOWN";
          return;
        default:
          button.className = TARGET_STATE.LOCKED; button.dataset.state = TARGET_STATE.LOCKED;
          button.disabled = true;
          label.textContent = countdown && countdown !== "?" ? countdown : "3h 12m";
          sub.textContent = "LOCKED";
          return;
      }
    }

    // Read-only preview of another faction's war. The countdown is the point:
    // it is what makes the clock and the mount verifiable without an own war.
    if (viewOnlyMode()) {
      button.className = "unavailable";
      button.dataset.state = "view";
      button.disabled = true;
      label.textContent = countdown || "VIEW";
      sub.textContent = "VIEW";
      return;
    }

    // No Torn key, no DIBS: the board cannot be read and nothing can be
    // claimed or released. The cell says what is missing.
    if (tornApiKeyMissing()) {
      button.className = "unavailable"; button.dataset.state = "no-torn-key"; button.disabled = true;
      label.textContent = countdown || "DIBS"; sub.textContent = "SET TORN KEY"; return;
    }

    if (pendingTargetId === playerId) {
      button.className = "working"; button.dataset.state = "working"; button.disabled = true;
      label.textContent = claimFlowState === CLAIM_FLOW_STATE.RELEASING ? "RELEASING" : "CLAIMING"; sub.textContent = "WAIT"; return;
    }
    if (
      own?.targetId === playerId && exactOwnProof &&
      quarantineAllowsExactOwnRelease(own)
    ) {
      const cleanup = own.cleanupRequired === true;
      button.className = cleanup ? "cleanup" : "claimed"; button.dataset.state = cleanup ? "cleanup" : "claimed"; button.disabled = !effectiveTornApiKey() || sharedWriteBusy;
      label.textContent = cleanup ? "QUEUED" : "DIBBED"; sub.textContent = "RELEASE"; return;
    }
    if (decision.state === TARGET_STATE.FREE) {
      button.className = "free"; button.dataset.state = TARGET_STATE.FREE; button.disabled = true;
      label.textContent = countdown || "FREE"; sub.textContent = "ONLINE"; return;
    }
    if (!sharedClaim && sharedClaimUnknown(playerId)) {
      button.className = "unavailable"; button.dataset.state = "unreadable"; button.disabled = true;
      label.textContent = "DIBS?"; sub.textContent = "UNKNOWN"; return;
    }
    if (sharedClaim) {
      const firstName = normalizeText(sharedClaim.first?.claimer?.name) || "UNKNOWN";
      const extraCount = Math.max(0, sharedClaim.queue.length - 1);
      button.className = "shared"; button.dataset.state = "shared"; button.disabled = true; label.textContent = "TAKEN"; sub.textContent = extraCount > 0 ? `${firstName} +${extraCount}` : firstName; return;
    }
    if (own?.targetId === playerId) {
      button.className = "blocked"; button.dataset.state = "blocked"; button.disabled = true;
      label.textContent = "BLOCKED"; sub.textContent = "VERIFYING"; return;
    }

    button.className = decision.reason === "rw-not-started" || decision.reason === "rw-phase-unverifiable" ? "prewar" : decision.state;
    button.dataset.state = decision.state;
    label.textContent = "DIBS";
    // The number is what the caller reads, so it leads. The word underneath
    // says why the number is not actionable yet.
    label.textContent = countdown || "DIBS";
    if (decision.state === TARGET_STATE.READY) {
      button.disabled = !effectiveTornApiKey() || sharedWriteBusy;
      button.dataset.ready = button.disabled ? "false" : "true";
      if (decision.lowHp === true) {
        const life = freshLifeForTarget(playerId);
        if (!life) {
          button.className = "unknown"; button.disabled = true; button.dataset.ready = "false";
          sub.textContent = "CHECKING"; return;
        }
        button.className = "lowhp";
        sub.textContent = `LOW HP ${Math.round(life.ratio * 100)}% · FF${Number(decision.fairFight).toFixed(1)}`;
        return;
      }
      sub.textContent = `DIBS · FF${Number(decision.fairFight).toFixed(1)}`;
      return;
    }
    button.disabled = true;
    if (decision.state === TARGET_STATE.BLOCKED) { label.textContent = "BLOCKED"; sub.textContent = own?.claimerName || "ACTIVE"; return; }
    if (decision.reason === "rw-not-started") { sub.textContent = "PREWAR"; return; }
    if (decision.reason === "fair-fight-too-low" || decision.reason === "fair-fight-too-high") {
      sub.textContent = `FF${Number(decision.fairFight).toFixed(2)}`;
      return;
    }
    if (decision.state === TARGET_STATE.UNKNOWN) { sub.textContent = "UNKNOWN"; return; }
    if (decision.state === TARGET_STATE.UNAVAILABLE) { sub.textContent = ""; return; }
    sub.textContent = "LOCKED";
  }

  // The FF pill is KS's own element on the nameplate, not a Torn cell, but it
  // follows the same rule Status and Score already do: draw only when there
  // is a real value, and leave nothing behind when there is not. It used to
  // print "FF -" on every row with no value yet, covering part of the member
  // name (owner Demo-off screenshot 2026-09-05). visibility, not display: the
  // layout pass runs after this one and would undo a display change.
  function renderFairFightBadge(ff, shown) {
    if (!(ff instanceof HTMLElement)) return;
    const hasFf = Number.isFinite(shown) && shown > 0;
    ff.textContent = hasFf ? `FF ${shown.toFixed(2)}` : "";
    ff.style.background = hasFf ? scoutColorForFairFight(shown) : "rgba(15,23,42,.88)";
    ff.style.visibility = hasFf ? "visible" : "hidden";
  }

  function renderRowBinding(binding, resolved, rwPhase) {
    const host = binding.host;
    const stats = scoutStatsForTarget(resolved.id);
    const ffValue = Number(stats?.fairFight);
    const ff = host.querySelector(`[data-role='ff']`);
    const est = host.querySelector(`[data-role='est']`);
    const hospital = host.querySelector(`[data-role='hospital']`);
    // A foreign roster has no FF and no Est -- the shared key is refused there
    // by design -- so DEMO supplies illustrative ones. Nothing else does.
    const demoFf = demoActive() ? demoFairFightForTarget(resolved.id) : null;
    renderFairFightBadge(ff, Number.isFinite(demoFf) ? demoFf : ffValue);
    const estimate = demoActive()
      ? `${(1.2 + (Number(resolved.id) % 40) / 10).toFixed(1)}m`
      : formatBattleStatsEstimate(stats);
    const hasEstimate = Boolean(estimate) && estimate !== "-";
    if (est instanceof HTMLElement) {
      est.textContent = hasEstimate ? `Est ${estimate}` : "";
      est.style.visibility = hasEstimate ? "visible" : "hidden";
    }
    setNativeScoreHidden(binding, hasEstimate);
    const hospitalState = computeHospitalSeconds(resolved);
    // The separate hospital box is retired: the button owns the Status cell and
    // carries the countdown. The element is kept, emptied and hidden, so nothing
    // can re-place it over the button on a later frame.
    if (hospital instanceof HTMLElement) {
      hospital.hidden = true;
      hospital.textContent = "";
      hospital.style.display = "none";
    }

    const decision = classifyTargetState({
      playerId: resolved.id,
      ownClaim: currentOwnClaim(),
      isHospital: hospitalState.isHospital,
      seconds: hospitalState.seconds,
      fairFight: fairFightForTarget(resolved.id),
      activity: freshOpponentActivityForTarget(resolved.id),
      lowHp: lowHpForTarget(resolved.id),
      rwPhase,
      ownershipUnresolved: Boolean(
        !newClaimStorageAuthorityReady() ||
        (effectiveTornApiKey() && sharedClaimsVerifiedAt <= 0) ||
        tornCredentialMutationInProgress ||
        currentClaimQuarantine() ||
        ambiguousOwnServerClaims
      )
    });
    updateDibsControl(host, decision, sharedClaimForTarget(resolved.id), {
      countdown: hospitalCountdownText(hospitalState)
    });
    const dibs = host.querySelector(`[data-role='dibs']`);
    setNativeStatusHidden(binding, dibs instanceof HTMLElement && dibs.style.visibility !== "hidden");
  }

  function auditRowRegistry() {
    if (!(presentationRoot instanceof HTMLElement) || presentationRoot !== currentRosterRoot()) return;
    const rows = [...presentationRoot.querySelectorAll("li.enemy")];
    const currentRows = new Set(rows);
    for (const entry of [...rowRegistry.values()]) {
      if (!currentRows.has(entry.row)) removeRowRegistryEntry(entry.row, { reconcile: false });
    }
    for (const row of rows) registerOrReconcileRow(row);
    for (const targetId of targetRows.keys()) reconcileTargetOwnership(targetId);
    schedulePresentationFrame({ layout: true, render: true, renderAll: true });
  }

  function orderedRegistryEntries() {
    return [...rowRegistry.values()].sort((left, right) =>
      Number(right.nearVisible) - Number(left.nearVisible)
    );
  }

  function renderRegisteredRows({ all = false } = {}) {
    const rwPhase = currentRwPhase({ refresh: false });
    for (const entry of orderedRegistryEntries()) {
      if (!entry.binding || (!all && !entry.nearVisible)) continue;
      const resolved = cachedResolvedBinding(entry.binding);
      if (!resolved) {
        registerOrReconcileRow(entry.row);
        continue;
      }
      renderRowBinding(entry.binding, resolved, rwPhase);
    }
    updatePanel();
  }

  function renderScoutCacheRows({ all = false } = {}) {
    for (const entry of orderedRegistryEntries()) {
      if (!entry.binding || (!all && !entry.nearVisible)) continue;
      const host = entry.binding.host;
      const stats = scoutStatsForTarget(entry.targetId);
      const ffValue = Number(stats?.fairFight);
      const ff = host?.querySelector?.(`[data-role='ff']`);
      const est = host?.querySelector?.(`[data-role='est']`);
      renderFairFightBadge(ff, ffValue);
      if (est instanceof HTMLElement) est.textContent = `Est ${formatBattleStatsEstimate(stats)}`;
    }
  }

  // 1.5.181 roster order. See the header note. Restored on every dispose.
  const rosterFirstSeen = new Map();
  let rosterFirstSeenNext = 0;
  let sortedRosterList = null;
  let sortedRosterListPrevious = null;
  const sortedRosterRows = new Set();
  const ROSTER_GROUP = Object.freeze({ OKAY: 0, HOSPITAL: 1, HOSPITAL_UNKNOWN: 2, TRAVEL: 3, OTHER: 4, UNBOUND: 5 });
  const ROSTER_GROUP_RANK = Object.freeze({
    desc: [0, 1, 2, 3, 4, 5],
    // Status up: hospital first. Index = group, value = rank.
    asc: [2, 0, 1, 3, 4, 5]
  });

  // Torn's own header for this list: "off" unless Status is the active sort
  // column. Read only; KS never taps it.
  function rosterSortMode(list) {
    if (!(list instanceof HTMLElement)) return "off";
    let active = null;
    const header = list.previousElementSibling;
    if (header instanceof HTMLElement) active = header.querySelector("[class*='activeIcon']");
    if (!active) {
      active = [...(list.parentElement?.querySelectorAll("[class*='activeIcon']") || [])]
        .find(node => !list.contains(node)) || null;
    }
    if (!(active instanceof HTMLElement)) return "off";
    const column = active.closest("[class*='tab___']") || active.parentElement;
    if (!(column instanceof HTMLElement) || !/(^|\s)status(\s|___|$)/.test(column.className)) return "off";
    if (/asc___/.test(active.className)) return "asc";
    if (/desc___/.test(active.className)) return "desc";
    return "off";
  }

  function rosterSortKey(entry) {
    const resolved = entry.binding ? cachedResolvedBinding(entry.binding) : null;
    const statusDiv = resolved?.statusDiv instanceof HTMLElement
      ? resolved.statusDiv
      : (entry.anchors?.status instanceof HTMLElement ? entry.anchors.status : entry.row);
    const rowView = resolved || { row: entry.row, li: entry.row, statusDiv, id: entry.targetId };
    const hospital = computeHospitalSeconds(rowView);
    if (hospital?.isHospital === true) {
      return Number.isFinite(hospital.seconds)
        ? { group: ROSTER_GROUP.HOSPITAL, seconds: hospital.seconds }
        : { group: ROSTER_GROUP.HOSPITAL_UNKNOWN, seconds: 0 };
    }
    if (hospital?.source === "torn-api-expired") return { group: ROSTER_GROUP.OKAY, seconds: 0 };
    const apiState = normalizeText(tornStatusForTarget(entry.targetId)?.state);
    const text = (apiState || normalizeText(statusDiv?.textContent)).toLowerCase();
    if (text.startsWith("okay")) return { group: ROSTER_GROUP.OKAY, seconds: 0 };
    if (text.includes("travel") || text.includes("abroad")) return { group: ROSTER_GROUP.TRAVEL, seconds: 0 };
    return { group: ROSTER_GROUP.OTHER, seconds: 0 };
  }

  function restoreRosterOrder() {
    for (const row of sortedRosterRows) {
      if (row instanceof HTMLElement && row.style.order !== "") row.style.order = "";
    }
    sortedRosterRows.clear();
    if (sortedRosterList instanceof HTMLElement && sortedRosterListPrevious) {
      sortedRosterList.style.display = sortedRosterListPrevious.display;
      sortedRosterList.style.flexDirection = sortedRosterListPrevious.flexDirection;
    }
    sortedRosterList = null;
    sortedRosterListPrevious = null;
  }

  // Returns true when anything visible moved, so the caller re-measures rows.
  function syncRosterOrder() {
    const entries = [...rowRegistry.values()].filter(entry => entry.row instanceof HTMLElement && entry.row.isConnected);
    const list = entries[0]?.row.parentElement || null;
    if (!(list instanceof HTMLElement) || !entries.every(entry => entry.row.parentElement === list)) {
      const had = sortedRosterList !== null || sortedRosterRows.size > 0;
      restoreRosterOrder();
      return had;
    }
    const mode = rosterSortMode(list);
    if (mode === "off") {
      const had = sortedRosterList !== null || sortedRosterRows.size > 0;
      restoreRosterOrder();
      return had;
    }
    const rank = ROSTER_GROUP_RANK[mode];
    let changed = false;
    if (sortedRosterList !== list) {
      restoreRosterOrder();
      sortedRosterList = list;
      sortedRosterListPrevious = { display: list.style.display, flexDirection: list.style.flexDirection };
      list.style.display = "flex";
      list.style.flexDirection = "column";
      changed = true;
    }
    const seq = targetId => {
      if (!rosterFirstSeen.has(targetId)) rosterFirstSeen.set(targetId, rosterFirstSeenNext++);
      return rosterFirstSeen.get(targetId);
    };
    const keyed = entries.map(entry => ({ row: entry.row, seq: seq(entry.targetId), ...rosterSortKey(entry) }));
    const registered = new Set(entries.map(entry => entry.row));
    let unboundIndex = 0;
    for (const child of list.children) {
      if (child instanceof HTMLElement && child.tagName === "LI" && !registered.has(child)) {
        keyed.push({ row: child, seq: 1e9 + unboundIndex++, group: ROSTER_GROUP.UNBOUND, seconds: 0 });
      }
    }
    keyed.sort((a, b) => rank[a.group] - rank[b.group] || a.seconds - b.seconds || a.seq - b.seq);
    const seen = new Set();
    keyed.forEach((item, index) => {
      const value = String(index + 1);
      if (item.row.style.order !== value) {
        item.row.style.order = value;
        changed = true;
      }
      seen.add(item.row);
      sortedRosterRows.add(item.row);
    });
    for (const row of [...sortedRosterRows]) {
      if (seen.has(row)) continue;
      if (row instanceof HTMLElement && row.style.order !== "") row.style.order = "";
      sortedRosterRows.delete(row);
      changed = true;
    }
    return changed;
  }

  function performPresentationFrame() {
    presentationFrameHandle = null;
    let needsLayout = presentationFrameNeedsLayout;
    const needsRender = presentationFrameNeedsRender;
    const renderAll = presentationFrameRenderAll;
    presentationFrameNeedsLayout = false;
    presentationFrameNeedsRender = false;
    presentationFrameRenderAll = false;
    if (!runtimeActive || !bridgeMounted || !isRuntimeEligible()) return;
    const layer = presentationLayer();
    if (!layer) return;
    // Order first, then measure in the same frame: no paint with a button on
    // the wrong row.
    if (syncRosterOrder()) needsLayout = true;
    let measurements = [];
    if (needsLayout) {
      const layerRect = layer.getBoundingClientRect();
      measurements = orderedRegistryEntries()
        .filter(entry => entry.binding)
        .map(entry => measureRowBinding(entry.binding, layerRect));
    }
    if (needsRender) renderRegisteredRows({ all: renderAll });
    for (const measurement of measurements) applyRowBindingLayout(measurement);
  }

  function schedulePresentationFrame({ layout = false, render = false, renderAll = false } = {}) {
    presentationFrameNeedsLayout ||= layout;
    presentationFrameNeedsRender ||= render;
    presentationFrameRenderAll ||= render && renderAll;
    if (presentationFrameHandle !== null) return;
    presentationFrameHandle = requestAnimationFrame(performPresentationFrame);
  }

  function onPresentationScroll() {
    // Row hosts use the roster's own content coordinates, so native scrolling
    // moves cached presentation in lockstep without geometry reads or rescans.
  }

  function tickVisibleHospitalCountdowns() {
    if (!runtimeActive || !bridgeMounted || !isRuntimeEligible()) return;
    void maybeAutoReleaseBeatenTarget();
    renderRegisteredRows();
    schedulePresentationFrame();
  }

  function presentationDataSignature() {
    return [
      runtimeGeneration,
      sharedAuthorityEpoch,
      tornCredentialEpoch,
      sharedClaimsVerifiedAt,
      fairFightLastFetchAt,
      ownWarsState.fetchedAt,
      opponentMembersState.fetchedAt
    ].join(":");
  }

  function scanWarRows({ structural = false } = {}) {
    if (!runtimeActive || !bridgeMounted || !isRuntimeEligible() || !isWarPanelPresent()) return;
    refreshCurrentWarSurface({ structural });
    const layer = ensurePresentationLayer();
    if (!layer || !(presentationRoot instanceof HTMLElement)) return;
    const dataSignature = presentationDataSignature();
    const renderAll = dataSignature !== lastPresentationDataSignature;
    const fairFightChanged = fairFightLastFetchAt !== lastPresentationFairFightAt;
    lastPresentationDataSignature = dataSignature;
    lastPresentationFairFightAt = fairFightLastFetchAt;
    if (structural || rowRegistry.size === 0) auditRowRegistry();
    else {
      if (renderAll) {
        if (fairFightChanged) renderScoutCacheRows();
        else renderRegisteredRows();
      }
      schedulePresentationFrame({ layout: false, render: true, renderAll });
    }
    ensureInlinePanel();
  }

  function formatRwRunway(totalSeconds) {
    const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }

  // "Nothing to do" stays a disabled button: no key stored, or a key Torn PDA
  // manages itself. The label already says so and there is nothing to explain.
  //
  // "Locked right now" is different, and it is what the owner met on 2026-09-12:
  // a disabled button dispatches no click at all, so the reason each action
  // already carries could never be shown. Marked aria-disabled instead, the tap
  // arrives, the action refuses on its own entry check exactly as before, and
  // the panel says why. The lock itself is unchanged.
  function setPanelControlState(element, { unavailable = false, locked = false, reason = "" } = {}) {
    if (!(element instanceof HTMLElement)) return;
    element.disabled = unavailable;
    if (locked && !unavailable) {
      element.setAttribute("aria-disabled", "true");
      element.title = reason;
      return;
    }
    element.removeAttribute("aria-disabled");
    if (!unavailable) element.title = "";
  }

  // 1.5.173: the summary row's own text for a Torn-error condition. Pure
  // display formatting of an already-set, unmodified tornStatusState.message.
  function tornStatusReasonText() {
    const message = normalizeText(tornStatusState.message);
    return message.replace(/^Torn:\s*/i, "") || "unknown";
  }

  // Fail-closed, first matching condition wins. Reuses the same rwState
  // currentRwPhase() already produced for the RW row this render, so the
  // decision engine is read, never called twice.
  function summaryRowState(rwState) {
    if (!sharedApiKey) return { state: "error", text: "Set your FFScouter key" };
    if (!effectiveTornApiKey()) return { state: "error", text: "Set your Torn API key" };
    if (viewOnlyMode()) return { state: "idle", text: "Viewing another faction's war — read only" };
    if (tornStatusState.state === "error") {
      return { state: "error", text: `Torn unavailable — ${tornStatusReasonText()}` };
    }
    if (sharedStatus.state !== "online" && sharedStatus.state !== "degraded") {
      return { state: "syncing", text: "War Room offline — DIBS unavailable" };
    }
    if (rwState.phase !== RW_PHASE.LIVE) return { state: "idle", text: "Waiting for the war to go live" };
    const memberCount = opponentMembersState.factionId === opponentFactionId ? opponentMembersState.members.size : 0;
    return { state: "ready", text: `Ready · ${memberCount} members` };
  }

  function updatePanel() {
    const shadow = presentationShadow();
    if (!shadow) return;
    const $ = role => shadow.querySelector(`[data-role='${role}']`);
    const sharedItem = $("shared-item"); const tornItem = $("torn-item"); const rwItem = $("rw-item");
    if (sharedItem) sharedItem.dataset.state = sharedStatus.state;
    if (tornItem) tornItem.dataset.state = tornStatusState.state;

    // Never let DEMO survive a route change onto the owner's own war.
    if (demoMode && !viewOnlyMode()) demoMode = false;
    // Demo does not exist in the DOM at all outside VIEW -- not disabled,
    // absent -- per the 2026-09-12 decision that it must never be active in
    // the owner's own war.
    const controlsPrimary = $("controls-primary");
    let demoButton = $("demo");
    if (viewOnlyMode()) {
      if (!demoButton && controlsPrimary) {
        demoButton = document.createElement("button");
        demoButton.type = "button";
        demoButton.dataset.role = "demo";
        controlsPrimary.appendChild(demoButton);
      }
      if (demoButton) {
        demoButton.textContent = demoMode ? "Demo: ON" : "Demo";
        demoButton.disabled = false;
      }
    } else if (demoButton) {
      demoButton.remove();
    }
    const rwState = currentRwPhase();
    if (rwItem) {
      rwItem.dataset.state = demoActive()
        ? "degraded"
        : rwState.view === true
        ? "idle"
        : (rwState.phase === RW_PHASE.LIVE
          ? "online"
          : (rwState.phase === RW_PHASE.PREWAR ? "idle" : "error"));
    }
    if ($("rw-status")) {
      if (demoActive()) {
        $("rw-status").textContent = "RW: DEMO · example only, nothing here is real";
        $("rw-status").title = "A picture of the live look on somebody else's roster. No DIBS is read, written or possible.";
      } else if (rwState.view === true) {
        // Say plainly that this is somebody else's war, rather than letting it
        // read as an own war that could not be verified.
        $("rw-status").textContent = "RW: VIEW · read-only";
        $("rw-status").title = "Another faction's Ranked War. DIBS is available only on your own faction's active Ranked War.";
      } else if (rwState.phase === RW_PHASE.LIVE) {
        $("rw-status").textContent = "RW: LIVE";
        $("rw-status").title = "Fresh matching own-faction /v2/faction/wars confirms LIVE";
      } else if (rwState.phase === RW_PHASE.PREWAR) {
        $("rw-status").textContent = `RW: PREWAR ${formatRwRunway(rwState.runwaySeconds)}`;
        $("rw-status").title = "PREWAR is locked; a disappearing DOM countdown cannot unlock DIBS";
      } else {
        $("rw-status").textContent = "RW: VERIFYING";
        $("rw-status").title = "DIBS stays locked until own-faction wars confirms this visible war LIVE";
      }
    }
    if ($("status")) {
      // In VIEW the claim board is not read at all (fetchSharedClaims
      // returns at once and gmXhr would refuse it anyway), so sharedStatus
      // has nothing true to say there. A panel row must not say something
      // it cannot know. sharedStatus itself is untouched -- this only
      // changes what is displayed.
      if (viewOnlyMode()) {
        $("status").textContent = "War Room: not used in VIEW";
        $("status").title = "War Room: not used in VIEW";
        if (sharedItem) sharedItem.dataset.state = "idle";
      } else {
        $("status").textContent = sharedStatus.message;
        $("status").title = sharedStatus.message;
      }
    }
    if ($("torn-status")) { $("torn-status").textContent = tornStatusState.message; $("torn-status").title = tornStatusState.message; }
    if ($("clock-status")) {
      // Freshen the tornClockSource side effect before reading the label, so
      // this row can never freeze on a stale value the way the old
      // clock-in-the-Torn-row text did.
      getTornNowMs();
      const clockText = `Clock: ${tornClockSourceLabel()}`;
      $("clock-status").textContent = clockText;
      $("clock-status").title = clockText;
    }
    if ($("life-status")) {
      const lifeText = lifeStatusMessage();
      $("life-status").textContent = lifeText;
      $("life-status").title = lifeText;
    }
    const ffLockVerdict = evaluateFfCredentialExternalLock();
    const ffExternalLock = ffLockVerdict.active;
    const ffChangeBusy = ffCredentialChangeBusy();
    renderCredentialLockMessage($("key-lock-message"), ffLockVerdict, ffChangeBusy);
    if ($("key")) {
      $("key").textContent = sharedApiKey ? "Change FF key" : "Set FFScouter key";
      setPanelControlState($("key"));
    }
    setPanelControlState($("forget-ff"), {
      unavailable: !sharedApiKey,
      locked: ffCredentialForgetLockActive() || ffChangeBusy,
      reason: FF_CREDENTIAL_LOCK_REASON
    });
    setCredentialInputDisabled($("key-input"), ffExternalLock || ffChangeBusy);
    if ($("key-save")) $("key-save").disabled = ffExternalLock || ffChangeBusy;
    if ($("key-cancel")) $("key-cancel").disabled = ffChangeBusy;
    const tornLockVerdict = evaluateTornCredentialExternalLock();
    const tornExternalLock = tornLockVerdict.active;
    const tornChangeBusy = tornCredentialMutationInProgress;
    renderCredentialLockMessage($("torn-key-lock-message"), tornLockVerdict, tornChangeBusy);
    if ($("torn-key")) {
      if (injectedPdaTornApiKey()) {
        $("torn-key").textContent = "Torn key: PDA";
        setPanelControlState($("torn-key"), { unavailable: true });
      } else {
        $("torn-key").textContent = storedTornApiKey ? "Change Torn key" : "Set Torn key";
        setPanelControlState($("torn-key"));
      }
    }
    setPanelControlState($("forget-torn"), {
      unavailable: !!injectedPdaTornApiKey() || !storedTornApiKey,
      locked: tornCredentialForgetLockActive() || tornChangeBusy,
      reason: TORN_CREDENTIAL_LOCK_REASON
    });
    setCredentialInputDisabled($("torn-key-input"), tornExternalLock || tornChangeBusy);
    if ($("torn-key-save")) $("torn-key-save").disabled = tornExternalLock || tornChangeBusy;
    if ($("torn-key-cancel")) $("torn-key-cancel").disabled = tornChangeBusy;
    const note = $("note");
    if (note) {
      note.textContent = "LIVE: Hospital ≤2:00 + FF 2.00–3.40. Online targets are free for all. Low life (≤20%): FF up to 4.50. First successful DIBS wins; claimant can RELEASE.";
    }

    // Relocate the FF/Torn key controls: broken out into the always-visible
    // normal-mode slot while the key is missing, back into Settings (in
    // front of Create custom API key, which never moves) once it is set.
    // The editor moves with its button -- inserted right before the LIVE
    // note, which also never moves -- so it always opens where the button
    // that opened it currently lives, in or out of Settings.
    const keyBreakout = $("key-breakout");
    const keyButton = $("key");
    const keyEditor = $("key-editor");
    const tornKeyButton = $("torn-key");
    const tornKeyEditor = $("torn-key-editor");
    const createKeyAnchor = $("create-key");
    const noteAnchor = $("note");
    const ffKeyMissing = !sharedApiKey;
    const tornKeyMissing = !effectiveTornApiKey();
    //
    // 1.5.176: this block only moves a node when it is not already where it
    // belongs. updatePanel() runs about once a second (rowRefreshTimer ->
    // renderRegisteredRows), and the old code re-inserted the key button and
    // editor on every run. Re-inserting a focused <input> takes its focus
    // away, and on a phone that closes the keyboard, so a member without a
    // key could not type one in. The final positions are exactly the ones
    // the old code produced: in the breakout slot FF pair then Torn pair; in
    // Settings FF button, Torn button, Create custom API key, and FF editor,
    // Torn editor, LIVE note. The "OK" checks below accept that order, so no
    // state moves anything once it has settled -- including both keys set,
    // where the two pairs share one anchor.
    const ksPairInBreakout = (button, editor) =>
      button.parentNode === keyBreakout && button.nextElementSibling === editor;
    const ksNodeBeforeAnchor = (node, anchor, sibling) =>
      anchor.previousElementSibling === node ||
      (anchor.previousElementSibling === sibling && sibling.previousElementSibling === node);
    if (keyBreakout && keyButton && keyEditor && createKeyAnchor && noteAnchor) {
      if (ffKeyMissing) {
        if (!ksPairInBreakout(keyButton, keyEditor) ||
            (tornKeyMissing && tornKeyButton && tornKeyButton.parentNode === keyBreakout &&
              keyEditor.nextElementSibling !== tornKeyButton)) {
          keyBreakout.appendChild(keyButton);
          keyBreakout.appendChild(keyEditor);
        }
      } else {
        if (!ksNodeBeforeAnchor(keyButton, createKeyAnchor, tornKeyButton)) createKeyAnchor.before(keyButton);
        if (!ksNodeBeforeAnchor(keyEditor, noteAnchor, tornKeyEditor)) noteAnchor.before(keyEditor);
      }
    }
    if (keyBreakout && tornKeyButton && tornKeyEditor && createKeyAnchor && noteAnchor) {
      if (tornKeyMissing) {
        if (!ksPairInBreakout(tornKeyButton, tornKeyEditor) ||
            (ffKeyMissing && keyEditor && keyEditor.parentNode === keyBreakout &&
              tornKeyButton.previousElementSibling !== keyEditor)) {
          keyBreakout.appendChild(tornKeyButton);
          keyBreakout.appendChild(tornKeyEditor);
        }
      } else {
        if (createKeyAnchor.previousElementSibling !== tornKeyButton) createKeyAnchor.before(tornKeyButton);
        if (noteAnchor.previousElementSibling !== tornKeyEditor) noteAnchor.before(tornKeyEditor);
      }
    }
    if (keyBreakout) keyBreakout.hidden = !ffKeyMissing && !tornKeyMissing;

    // Summary row: the one thing normal mode always shows besides Settings.
    const summary = summaryRowState(rwState);
    const summaryItem = $("summary-item");
    if (summaryItem) summaryItem.dataset.state = summary.state;
    if ($("summary-status")) {
      $("summary-status").textContent = summary.text;
      $("summary-status").title = summary.text;
    }

    // Settings/About: a class toggle, nothing else. Never persisted --
    // settingsExpanded/aboutExpanded are in-memory only (see their
    // declaration) and this just renders their current value.
    const settingsPanel = $("settings-panel");
    if (settingsPanel) settingsPanel.classList.toggle("open", settingsExpanded);
    const settingsToggle = $("settings-toggle");
    if (settingsToggle) settingsToggle.setAttribute("aria-expanded", String(settingsExpanded));
    const aboutPanel = $("about-panel");
    if (aboutPanel) aboutPanel.classList.toggle("open", aboutExpanded);
    const aboutToggle = $("about-toggle");
    if (aboutToggle) aboutToggle.setAttribute("aria-expanded", String(aboutExpanded));
  }

  async function runFfCredentialMutation(mutation) {
    try {
      await mutation();
    } catch {
      let recovered = !ffCredentialMutationInProgress;
      if (ffCredentialMutationInProgress) {
        try { recovered = await restoreSharedApiChangeJournal(); } catch { recovered = false; }
      }
      if (!recovered) ffCredentialStorageUnresolved = true;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus(
          "error",
          recovered
            ? "War Room: FFScouter key change failed; original state recovered"
            : "War Room: FFScouter key change failed; secure recovery unresolved",
          sharedClaims.size
        );
      }
    } finally {
      if (ffCredentialMutationInProgress) {
        ffCredentialMutationInProgress = false;
        enforceFfCredentialLock();
        updatePanel();
      }
    }
  }

  async function runTornCredentialMutation(mutation) {
    try {
      await mutation();
    } catch {
      if (tornCredentialMutationInProgress) tornCredentialStorageUnresolved = true;
      if (runtimeActive && isRuntimeEligible()) {
        setTornStatusState("error", "Torn: credential change failed; secure state unresolved", 0);
      }
    } finally {
      if (tornCredentialMutationInProgress) {
        tornCredentialMutationInProgress = false;
        closeTornCredentialEditor();
        updatePanel();
      }
      if (runtimeActive && isRuntimeEligible()) scanWarRows();
    }
  }

  async function saveSharedKeyFromEditor() {
    const shadow = presentationShadow();
    const input = shadow?.querySelector("[data-role='key-input']");
    const key = validateFfscouterKey(input?.value);
    if (!key) { setSharedStatus("error", "War Room: invalid FFScouter key format"); return; }
    if (ffCredentialChangeBusy() || ffCredentialExternalLockActive()) {
      enforceFfCredentialLock();
      setSharedStatus("error", "War Room: FFScouter key change locked while DIBS ownership is active or unresolved");
      return;
    }
    const recoveryEvidence = captureCredentialRecoveryEvidence();
    const recoveryFingerprint = credentialRecoveryEvidenceFingerprint(recoveryEvidence);
    if (credentialRecoveryEvidenceActive(recoveryEvidence)) {
      closeFfCredentialEditor();
      setSharedStatus("error", "War Room: active DIBS must be released or expire before FFScouter key replacement");
      return;
    }
    const oldKey = sharedApiKey;
    const selfAtStart = selfPlayerId;
    const ownershipProofVerifiedAt = sharedClaimsVerifiedAt;
    const credentialRejectedAtStart = sharedCredentialRejected;
    const operationSerial = ++ffCredentialChangeSerial;
    const generation = runtimeGeneration;
    let operationAuthorityEpoch = -1;
    const operationOwns = () => operationSerial === ffCredentialChangeSerial && ffCredentialMutationInProgress;
    const operationEvidenceCurrent = () =>
      credentialRecoveryEvidenceFingerprint() === recoveryFingerprint;
    const operationAuthorityCurrent = () => {
      if (
        !operationEvidenceCurrent() || sharedWriteBusy || ambiguousOwnServerClaims ||
        claimAuthorityStorageUnresolved
      ) return false;
      if (!credentialRecoveryEvidenceActive(recoveryEvidence) || !oldKey || credentialRejectedAtStart) return true;
      return selfAtStart === selfPlayerId && validTargetId(selfAtStart) &&
        ownershipProofVerifiedAt > 0 &&
        nowMs() - ownershipProofVerifiedAt <= CONFIG.sharedPollMs * 2 &&
        activeSharedClaimsForClaimer(selfAtStart).length === 0;
    };
    const operationForegroundCurrent = () => (
      operationOwns() && apiKeyStorageReady && generation === runtimeGeneration && runtimeActive && isRuntimeEligible() &&
      sharedApiKey === oldKey && sharedAuthorityEpoch === operationAuthorityEpoch &&
      input instanceof HTMLInputElement && input.isConnected && validateFfscouterKey(input.value) === key &&
      operationAuthorityCurrent()
    );
    ffCredentialMutationInProgress = true;
    invalidateSharedReads();
    operationAuthorityEpoch = sharedAuthorityEpoch;
    fairFightRequestSerial += 1;
    fairFightSyncing = false;
    updatePanel();
    const candidateOperational = await ffCandidateKeyIsOperational(key, operationForegroundCurrent);
    if (!candidateOperational || !operationForegroundCurrent()) {
      if (operationOwns()) ffCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus("error", "War Room: FFScouter key could not be validated; key unchanged");
        void fetchSharedClaims();
      }
      return;
    }
    const journalReady = await prepareSharedApiChangeJournal(oldKey, operationForegroundCurrent);
    if (!journalReady) {
      if (operationOwns()) ffCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus("error", "War Room: existing FFScouter key could not be secured for replacement");
        void fetchSharedClaims();
      }
      return;
    }
    const stored = await saveSecureApiKey(key);
    const accepted = stored && operationForegroundCurrent()
      ? await commitSharedApiChangeJournal()
      : false;
    if (!accepted) {
      const recovered = await restoreSharedApiChangeToKnownKey(oldKey);
      if (!recovered) ffCredentialStorageUnresolved = true;
      if (operationOwns()) ffCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus(
          "error",
          recovered
            ? (stored ? "War Room: FFScouter key change cancelled by a new DIBS lock" : "War Room: FFScouter key could not be stored securely")
            : "War Room: FFScouter key change cancelled; original key recovery pending"
        );
        void fetchSharedClaims();
      }
      return;
    }
    sharedApiKey = key;
    sharedCredentialRejected = false;
    ffCredentialMutationInProgress = false;
    invalidateSharedReads();
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set(); sharedClaimsDegraded = false;
    sharedBackoffUntil = 0;
    sharedTransportFailureStreak = 0;
    fairFightStats = new Map();
    fairFightLastFetchAt = 0;
    fairFightEverSucceeded = false;
    if (input instanceof HTMLInputElement && input.isConnected) input.value = "";
    closeFfCredentialEditor();
    setSharedStatus(
      ffCredentialStorageUnresolved ? "error" : "ready",
      ffCredentialStorageUnresolved
        ? "War Room: FFScouter key saved; secure cleanup unresolved"
        : "War Room: FFScouter key saved securely",
      0
    );
    if (runtimeActive && isRuntimeEligible()) {
      void fetchSharedClaims();
      void fetchFairFightStats({ force: true });
    }
  }

  async function saveTornKeyFromEditor() {
    const shadow = presentationShadow();
    const input = shadow?.querySelector("[data-role='torn-key-input']");
    const key = validateTornApiKey(input?.value);
    if (!key) { setTornStatusState("error", "Torn: invalid key format"); return; }
    if (tornCredentialMutationInProgress || tornCredentialExternalLockActive()) {
      closeCredentialEditorUnlessFocused("torn-key-editor");
      setTornStatusState("error", "Torn: key change locked while DIBS ownership is active or unresolved");
      return;
    }
    const recoveryEvidence = captureCredentialRecoveryEvidence();
    const recoveryFingerprint = credentialRecoveryEvidenceFingerprint(recoveryEvidence);
    const recoveryMode = credentialRecoveryEvidenceActive(recoveryEvidence);
    const recoveryExpectedPlayerId = credentialRecoveryExpectedPlayerId(recoveryEvidence);
    if (recoveryMode && !recoveryExpectedPlayerId) {
      closeTornCredentialEditor();
      setTornStatusState("error", "Torn: recovery identity is ambiguous; key unchanged");
      return;
    }
    const oldKey = validateTornApiKey(storedTornApiKey);
    const effectiveKeyAtStart = effectiveTornApiKey();
    const sharedKeyAtStart = sharedApiKey;
    const selfAtStart = selfPlayerId;
    const ownershipProofVerifiedAt = sharedClaimsVerifiedAt;
    const credentialRejectedAtStart = storedTornCredentialRejected || storedTornCapabilityRejected;
    const operationSerial = ++tornCredentialChangeSerial;
    const generation = runtimeGeneration;
    let operationTornEpoch = -1;
    let operationSharedEpoch = -1;
    const operationOwns = () =>
      operationSerial === tornCredentialChangeSerial && tornCredentialMutationInProgress;
    const operationEvidenceCurrent = () =>
      credentialRecoveryEvidenceFingerprint() === recoveryFingerprint;
    const operationAuthorityCurrent = () => {
      if (
        !operationEvidenceCurrent() || sharedWriteBusy || ffCredentialMutationInProgress ||
        claimAuthorityEvidenceUnresolved
      ) return false;
      if (recoveryMode) {
        return credentialRecoveryExpectedPlayerId(captureCredentialRecoveryEvidence()) ===
          recoveryExpectedPlayerId;
      }
      if (claimAuthorityStorageUnresolved || ambiguousOwnServerClaims) return false;
      if (!effectiveKeyAtStart || credentialRejectedAtStart) return true;
      // R4. Without an own claim and without a quarantine record a stale
      // ownership check does not stop the change. (recoveryMode is false here,
      // and the evidence is checked unchanged above.)
      if (!credentialRecoveryEvidenceActive(recoveryEvidence)) return true;
      return validTargetId(selfAtStart) && ownershipProofVerifiedAt > 0 &&
        nowMs() - ownershipProofVerifiedAt <= CONFIG.sharedPollMs * 2 &&
        activeSharedClaimsForClaimer(selfAtStart).length === 0;
    };
    const operationForegroundCurrent = () => (
      operationOwns() && apiKeyStorageReady && generation === runtimeGeneration &&
      runtimeActive && isRuntimeEligible() && storedTornApiKey === oldKey &&
      sharedApiKey === sharedKeyAtStart && tornCredentialEpoch === operationTornEpoch &&
      sharedAuthorityEpoch === operationSharedEpoch && input instanceof HTMLInputElement &&
      input.isConnected && validateTornApiKey(input.value) === key && operationAuthorityCurrent()
    );
    tornCredentialMutationInProgress = true;
    invalidateTornCredentialRequests();
    operationTornEpoch = tornCredentialEpoch;
    invalidateSharedReads();
    operationSharedEpoch = sharedAuthorityEpoch;
    updatePanel();
    const candidateOperational = await tornCandidateKeyProvesRecovery(
      key,
      recoveryEvidence,
      operationForegroundCurrent
    );
    if (!candidateOperational || !operationForegroundCurrent()) {
      if (operationOwns()) tornCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setTornStatusState("error", "Torn: candidate identity or capabilities failed; key unchanged", 0);
        if (effectiveTornApiKey()) void fetchSharedClaims();
        if (effectiveTornApiKey()) void fetchTornStatuses({ force: true });
      }
      return;
    }
    const stored = await saveSecureTornApiKey(key);
    const accepted = stored && operationForegroundCurrent();
    if (!accepted) {
      let recovered = false;
      if (operationOwns()) {
        recovered = oldKey ? await saveSecureTornApiKey(oldKey) : await deleteSecureTornApiKey();
        if (!recovered) tornCredentialStorageUnresolved = true;
        tornCredentialMutationInProgress = false;
      }
      if (runtimeActive && isRuntimeEligible()) {
        setTornStatusState(
          "error",
          recovered
            ? (stored ? "Torn: key change cancelled by a new DIBS lock" : "Torn: key could not be stored securely")
            : "Torn: key change cancelled; original key recovery pending"
        );
        if (effectiveTornApiKey()) void fetchSharedClaims();
        if (effectiveTornApiKey()) void fetchTornStatuses({ force: true });
      }
      return;
    }
    storedTornApiKey = key;
    storedTornCredentialRejected = false;
    storedTornCapabilityRejected = false;
    tornCredentialMutationInProgress = false;
    apiKeyStorageReady = true;
    invalidateTornCredentialRequests();
    invalidateSharedReads();
    // The key was saved again: the sign-in guard forgets the old refusal.
    ksResetForTornKeyChange();
    setSharedStatus("loading-key", "War Room: CHECKING…", 0);
    keyScopeReady = false;
    selfPlayerId = ""; selfPlayerName = ""; selfFactionId = ""; opponentFactionId = ""; tornUserBasicCapability = "unknown"; selfIdentityLastAttemptAt = 0;
    publicBasicStatusCache.clear();
    if (input instanceof HTMLInputElement && input.isConnected) input.value = "";
    closeTornCredentialEditor();
    opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
    currentWarSurface = null;
    setTornStatusState("ready", "Torn: key saved · syncing…", 0);
    if (runtimeActive && isRuntimeEligible()) {
      void fetchSharedClaims();
      void fetchTornStatuses({ force: true });
    }
  }

  async function forgetSharedKey() {
    if (!sharedApiKey) return;
    if (ffCredentialChangeBusy() || ffCredentialForgetLockActive()) {
      enforceFfCredentialLock();
      window.alert(credentialRecoveryEvidenceActive()
        ? "Resolve active or unverified DIBS before forgetting the FFScouter key."
        : "The FFScouter key cannot be forgotten while storage is unavailable or another operation is unresolved. Please try again once it is safe.");
      return;
    }
    if (!window.confirm("Forget the saved FFScouter key on this device?")) return;
    registerTrustedInteraction();
    const oldKey = sharedApiKey;
    const selfAtStart = selfPlayerId;
    const ownershipProofVerifiedAt = sharedClaimsVerifiedAt;
    const credentialRejectedAtStart = sharedCredentialRejected;
    const operationSerial = ++ffCredentialChangeSerial;
    const generation = runtimeGeneration;
    let operationAuthorityEpoch = -1;
    const operationOwns = () => operationSerial === ffCredentialChangeSerial && ffCredentialMutationInProgress;
    const operationForegroundCurrent = () => (
      operationOwns() && apiKeyStorageReady && generation === runtimeGeneration && runtimeActive && isRuntimeEligible() &&
      sharedApiKey === oldKey && sharedAuthorityEpoch === operationAuthorityEpoch &&
      !ffCredentialClaimLockActive() && (
        !credentialRecoveryEvidenceActive() ||
        (credentialRejectedAtStart && sharedCredentialRejected) || (
          selfAtStart === selfPlayerId && validTargetId(selfAtStart) && ownershipProofVerifiedAt > 0 &&
          nowMs() - ownershipProofVerifiedAt <= CONFIG.sharedPollMs * 2
        )
      )
    );
    ffCredentialMutationInProgress = true;
    invalidateSharedReads();
    operationAuthorityEpoch = sharedAuthorityEpoch;
    fairFightRequestSerial += 1;
    fairFightSyncing = false;
    updatePanel();
    const journalReady = await prepareSharedApiChangeJournal(oldKey, operationForegroundCurrent);
    if (!journalReady) {
      if (operationOwns()) ffCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus("error", "War Room: existing FFScouter key could not be secured before forget");
        void fetchSharedClaims();
      }
      return;
    }
    const removed = await deleteSecureApiKey();
    const accepted = removed && operationForegroundCurrent()
      ? await commitSharedApiChangeJournal()
      : false;
    if (!accepted) {
      const recovered = await restoreSharedApiChangeToKnownKey(oldKey);
      if (!recovered) ffCredentialStorageUnresolved = true;
      if (operationOwns()) ffCredentialMutationInProgress = false;
      if (runtimeActive && isRuntimeEligible()) {
        setSharedStatus(
          "error",
          recovered
            ? (removed ? "War Room: FFScouter key forget cancelled by a new DIBS lock" : "War Room: saved FFScouter key could not be removed")
            : "War Room: FFScouter key forget cancelled; original key recovery pending"
        );
        void fetchSharedClaims();
      }
      return;
    }
    sharedApiKey = "";
    sharedCredentialRejected = false;
    ffCredentialMutationInProgress = false;
    invalidateSharedReads();
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set(); sharedClaimsDegraded = false;
    sharedBackoffUntil = 0;
    sharedTransportFailureStreak = 0;
    fairFightStats = new Map();
    fairFightLastFetchAt = 0;
    fairFightEverSucceeded = false;
    setSharedStatus(
      ffCredentialStorageUnresolved ? "error" : "ready",
      ffCredentialStorageUnresolved
        ? "War Room: FFScouter key removed; secure cleanup unresolved"
        : "War Room: FFScouter key removed",
      0
    );
    scanWarRows();
    // The board never depended on the FFScouter key: read it again at once.
    if (runtimeActive && isRuntimeEligible()) void fetchSharedClaims();
  }

  async function forgetTornKey() {
    if (injectedPdaTornApiKey()) { setTornStatusState("ready", "Torn: PDA API key is managed by Torn PDA", opponentMembersState.members.size); return; }
    if (!storedTornApiKey) return;
    if (tornCredentialMutationInProgress || tornCredentialForgetLockActive()) {
      closeCredentialEditorUnlessFocused("torn-key-editor");
      window.alert(credentialRecoveryEvidenceActive()
        ? "Resolve active or unverified DIBS before forgetting the Torn API key."
        : "The Torn API key cannot be forgotten while storage is unavailable or another operation is unresolved. Please try again once it is safe.");
      return;
    }
    if (!window.confirm("Forget the saved Torn API key on this device?")) return;
    registerTrustedInteraction();
    const oldKey = validateTornApiKey(storedTornApiKey);
    const sharedKeyAtStart = sharedApiKey;
    const selfAtStart = selfPlayerId;
    const ownershipProofVerifiedAt = sharedClaimsVerifiedAt;
    const operationSerial = ++tornCredentialChangeSerial;
    const generation = runtimeGeneration;
    let operationTornEpoch = -1;
    let operationSharedEpoch = -1;
    const operationOwns = () =>
      operationSerial === tornCredentialChangeSerial && tornCredentialMutationInProgress;
    const operationForegroundCurrent = () => (
      operationOwns() && apiKeyStorageReady && generation === runtimeGeneration &&
      runtimeActive && isRuntimeEligible() && storedTornApiKey === oldKey &&
      sharedApiKey === sharedKeyAtStart && tornCredentialEpoch === operationTornEpoch &&
      sharedAuthorityEpoch === operationSharedEpoch && !sharedWriteBusy &&
      !ffCredentialStorageUnresolved && !tornCredentialStorageUnresolved &&
      !claimAuthorityEvidenceUnresolved && !ffCredentialClaimLockActive() &&
      // R4. No own claim and no quarantine record: nothing to prove.
      (!credentialRecoveryEvidenceActive() || (
        Boolean(sharedKeyAtStart) && validTargetId(selfAtStart) &&
        ownershipProofVerifiedAt > 0 &&
        nowMs() - ownershipProofVerifiedAt <= CONFIG.sharedPollMs * 2 &&
        activeSharedClaimsForClaimer(selfAtStart).length === 0
      ))
    );
    tornCredentialMutationInProgress = true;
    invalidateTornCredentialRequests();
    operationTornEpoch = tornCredentialEpoch;
    invalidateSharedReads();
    operationSharedEpoch = sharedAuthorityEpoch;
    updatePanel();
    const removed = await deleteSecureTornApiKey();
    const accepted = removed && operationForegroundCurrent();
    if (!accepted) {
      let recovered = false;
      if (operationOwns()) {
        recovered = Boolean(oldKey) && await saveSecureTornApiKey(oldKey);
        if (!recovered) tornCredentialStorageUnresolved = true;
        tornCredentialMutationInProgress = false;
      }
      if (runtimeActive && isRuntimeEligible()) {
        setTornStatusState(
          "error",
          recovered
            ? (removed ? "Torn: forget cancelled by a new DIBS lock" : "Torn: saved key could not be removed")
            : "Torn: forget cancelled; original key recovery pending"
        );
        if (effectiveTornApiKey()) void fetchSharedClaims();
        if (effectiveTornApiKey()) void fetchTornStatuses({ force: true });
      }
      return;
    }
    storedTornApiKey = "";
    storedTornCredentialRejected = false;
    storedTornCapabilityRejected = false;
    tornCredentialMutationInProgress = false;
    apiKeyStorageReady = true;
    invalidateTornCredentialRequests();
    invalidateSharedReads();
    // No Torn key, no session and no board: the row says what is missing.
    ksResetForTornKeyChange();
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set(); sharedClaimsDegraded = false;
    setSharedStatus("key-required", "War Room: KEY REQUIRED — set your Torn API key", 0);
    keyScopeReady = false; opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 }; currentWarSurface = null;
    selfPlayerId = ""; selfPlayerName = ""; selfFactionId = ""; opponentFactionId = ""; tornUserBasicCapability = "unknown"; selfIdentityLastAttemptAt = 0;
    publicBasicStatusCache.clear();
    setTornStatusState("key-required", "Torn: API key required", 0); scanWarRows();
  }

  async function initializeApiKeyStorage() {
    const tornOperationSerial = tornCredentialChangeSerial;
    const sharedOperationSerial = ffCredentialChangeSerial;
    let sharedLoad = { ready: false, key: "" };
    let tornLoad = { ready: false, key: "" };
    try { [sharedLoad, tornLoad] = await Promise.all([loadSecureApiKey(), loadSecureTornApiKey()]); }
    catch { sharedLoad = { ready: false, key: "" }; tornLoad = { ready: false, key: "" }; }

    if (sharedOperationSerial === ffCredentialChangeSerial && !ffCredentialMutationInProgress) {
      sharedApiKey = sharedLoad.key;
      ffCredentialStorageUnresolved = !sharedLoad.ready;
    }
    if (tornOperationSerial === tornCredentialChangeSerial && !tornCredentialMutationInProgress) {
      storedTornApiKey = tornLoad.key;
      tornCredentialStorageUnresolved = !tornLoad.ready;
    }
    apiKeyStorageReady = true;

    if (claimAuthorityStorageUnresolved) {
      setSharedStatus("error", "War Room: claim authority storage unresolved", 0);
    } else if (tornCredentialStorageUnresolved) {
      setSharedStatus("error", "War Room: secure storage unavailable", 0);
    } else if (effectiveTornApiKey()) setSharedStatus("loading-key", "War Room: CHECKING…", 0);
    else setSharedStatus("key-required", "War Room: KEY REQUIRED — set your Torn API key", 0);
    if (tornCredentialStorageUnresolved) {
      setTornStatusState("error", "Torn: secure storage unavailable", 0);
    } else if (effectiveTornApiKey()) {
      setTornStatusState("ready", injectedPdaTornApiKey() ? "Torn: PDA key loaded" : "Torn: saved key loaded", 0);
    } else setTornStatusState("key-required", "Torn: API key required", 0);
    updatePanel();

    if (runtimeActive) {
      if (effectiveTornApiKey()) { void fetchSharedClaims(); void fetchTornStatuses({ force: true }); }
      if (sharedApiKey) void fetchFairFightStats({ force: true });
    }
  }

  // ---------------------------------------------------------------------------
  // SPA lifecycle / foreground-only runtime
  // ---------------------------------------------------------------------------

  const queuedRosterMutationRecords = [];

  function rowsWithinMutationNode(node) {
    if (!(node instanceof Element)) return [];
    const rows = [];
    if (node.matches("li.enemy")) rows.push(node);
    rows.push(...node.querySelectorAll("li.enemy"));
    return rows;
  }

  function reconcileRosterMutations(records) {
    const affectedRows = new Set();
    let layoutNeeded = false;
    for (const record of records) {
      const target = record.target instanceof Element
        ? record.target
        : record.target?.parentElement;
      const targetRow = target?.closest?.("li.enemy");
      if (targetRow) affectedRows.add(targetRow);
      else if (target instanceof HTMLElement && rowRegistry.has(target)) affectedRows.add(target);
      for (const node of record.removedNodes) {
        for (const row of rowsWithinMutationNode(node)) {
          if (rowRegistry.has(row)) layoutNeeded = true;
          // Still in the roster: moved, not removed. Keep the binding.
          if (row.isConnected && presentationRoot instanceof HTMLElement && presentationRoot.contains(row)) {
            affectedRows.add(row);
            continue;
          }
          removeRowRegistryEntry(row);
        }
      }
      for (const node of record.addedNodes) {
        for (const row of rowsWithinMutationNode(node)) affectedRows.add(row);
      }
    }
    for (const row of affectedRows) {
      const before = rowRegistry.get(row);
      const beforeBinding = before?.binding || null;
      const beforeTargetId = before?.targetId || "";
      const after = registerOrReconcileRow(row);
      if (
        beforeBinding !== (after?.binding || null) ||
        beforeTargetId !== (after?.targetId || "")
      ) layoutNeeded = true;
    }
    schedulePresentationFrame({ layout: layoutNeeded, render: true });
  }

  function kickInitialFairFightLoad() {
    if (fairFightEverSucceeded || fairFightSyncing || !sharedApiKey) return;
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return;
    if (rowRegistry.size === 0) return;
    void fetchFairFightStats({ force: true });
  }

  function queueObserverScan(records = []) {
    queuedRosterMutationRecords.push(...records);
    if (observerScanQueued) return;
    observerScanQueued = true;
    queueMicrotask(() => {
      observerScanQueued = false;
      if (!runtimeActive || !isRuntimeEligible()) return;
      const queued = queuedRosterMutationRecords.splice(0);
      reconcileRosterMutations(queued);
    });
  }

  function startBodyObserver() {
    const root = currentRosterRoot();
    if (!(root instanceof HTMLElement)) return;
    if (bodyObserver && observedRosterRoot === root) return;
    bodyObserver?.disconnect();
    bodyObserver = new MutationObserver(records => {
      if (runtimeActive && isRuntimeEligible()) queueObserverScan(records);
    });
    observedRosterRoot = root;
    bodyObserver.observe(root, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ["href", "class", ...ROW_IDENTITY_ATTRIBUTES, "data-until", "title"]
    });
  }

  function stopBodyObserver() {
    bodyObserver?.disconnect(); bodyObserver = null; observedRosterRoot = null; observerScanQueued = false;
    queuedRosterMutationRecords.splice(0);
  }

  function mutationTouchesRouteSurface(records) {
    const routeSurfaceSelector =
      "[data-warid], #faction_war_list_id, .enemy-faction, a[href*='factions.php']";
    for (const record of records) {
      const element = record.target instanceof Element ? record.target : record.target?.parentElement;
      if (record.type === "attributes" && element instanceof Element) {
        const root = document.getElementById("faction_war_list_id");
        const visibilityAttribute = ["aria-hidden", "class", "hidden", "style"]
          .includes(String(record.attributeName || ""));
        if (
          visibilityAttribute && root instanceof Element &&
          (element === root || element.contains(root))
        ) return true;
        if (
          record.attributeName === "data-warid" &&
          (
            element.matches(routeSurfaceSelector) ||
            Boolean(element.closest(routeSurfaceSelector)) ||
            Boolean(element.querySelector(routeSurfaceSelector))
          )
        ) return true;
      }
      if (
        record.type === "characterData" &&
        normalizeText(record.target?.nodeValue).toUpperCase() === "YOUR FACTION IS NOT IN A WAR"
      ) return true;
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (
          node.matches("[data-warid], #faction_war_list_id, .enemy-faction") ||
          node.querySelector("[data-warid], #faction_war_list_id, .enemy-faction")
        ) return true;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (normalizeText(walker.currentNode.nodeValue).toUpperCase() === "YOUR FACTION IS NOT IN A WAR") return true;
        }
      }
    }
    return false;
  }

  function queueRouteReconcile(records) {
    if (
      destroyed || !isRuntimeContextEligible() || !mutationTouchesRouteSurface(records) ||
      routeReconcileQueued
    ) return;
    routeReconcileQueued = true;
    queueMicrotask(() => {
      routeReconcileQueued = false;
      if (!destroyed && isRuntimeContextEligible()) reconcileLifecycle({ structural: true });
    });
  }

  function startRouteObserver() {
    if (routeObserver || !isRuntimeContextEligible() || !(document.body instanceof HTMLElement)) return;
    routeObserver = new MutationObserver(queueRouteReconcile);
    routeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-hidden", "class", "data-warid", "hidden", "style"],
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function stopRouteObserver() {
    routeObserver?.disconnect();
    routeObserver = null;
    routeReconcileQueued = false;
  }

  function reconcileRoute({ structural = false } = {}) {
    if (!runtimeActive || !isRuntimeContextEligible()) return false;
    const canonical = canonicalPdaRankedWarSurface();
    if (!canonical) {
      suspendRuntime();
      if (isRuntimeContextEligible()) startRouteObserver();
      return false;
    }
    if (!bridgeMounted) mountBridge();
    if (!bridgeMounted) return false;
    refreshCurrentWarSurface({ structural });
    ensurePresentationLayer();
    startBodyObserver();
    scanWarRows();
    return true;
  }

  function clearTimers() {
    if (rowRefreshTimer !== null) window.clearTimeout(rowRefreshTimer);
    if (sharedPollTimer !== null) window.clearInterval(sharedPollTimer);
    if (fairFightTimer !== null) window.clearInterval(fairFightTimer);
    if (fairFightRetryTimer !== null) window.clearTimeout(fairFightRetryTimer);
    if (tornStatusTimer !== null) window.clearInterval(tornStatusTimer);
    if (routeHeartbeatTimer !== null) window.clearInterval(routeHeartbeatTimer);
    if (sharedRetryTimer !== null) window.clearTimeout(sharedRetryTimer);
    if (tornRetryTimer !== null) window.clearTimeout(tornRetryTimer);
    if (mountPrimeTimer !== null) window.clearTimeout(mountPrimeTimer);
    rowRefreshTimer = sharedPollTimer = fairFightTimer = fairFightRetryTimer = null;
    tornStatusTimer = routeHeartbeatTimer = sharedRetryTimer = tornRetryTimer = mountPrimeTimer = null;
  }

  function removeOwnUi() {
    removePresentationLayer();
  }

  function mountBridge() {
    if (bridgeMounted || !runtimeActive || !isRuntimeEligible() || !isWarPanelPresent()) return;
    bridgeMounted = true;
    ensurePresentationLayer(); startBodyObserver(); scanWarRows({ structural: true });
    kickInitialFairFightLoad();
    mountPrimeTimer = window.setTimeout(() => primeMountedBridge(0), CONFIG.mountPrimeDelayMs);
  }

  function unmountBridge() {
    bridgeMounted = false;
    stopBodyObserver();
    removeOwnUi();
  }

  function primeMountedBridge(attempt) {
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return;
    if (rowRegistry.size === 0 && attempt < CONFIG.mountPrimeMaxAttempts) {
      scanWarRows({ structural: true });
      mountPrimeTimer = window.setTimeout(() => primeMountedBridge(attempt + 1), CONFIG.mountPrimeRetryMs);
      return;
    }
    scanWarRows();
  }

  function reconcileLifecycle({ structural = false } = {}) {
    if (destroyed) return false;
    if (!isRuntimeContextEligible()) {
      if (runtimeActive) suspendRuntime();
      else { stopRouteObserver(); unmountBridge(); }
      return false;
    }
    if (!canonicalPdaRankedWarSurface()) {
      if (runtimeActive) suspendRuntime();
      else unmountBridge();
      startRouteObserver();
      return false;
    }
    if (!runtimeActive) {
      resumeRuntime();
      return runtimeActive;
    }
    return reconcileRoute({ structural });
  }

  // Aligned to Torn's second boundary rather than free-running, so the cell
  // changes its digits in the same instant every second (PC 1.0.32).
  function scheduleRowRefreshTick() {
    if (rowRefreshTimer !== null) {
      window.clearTimeout(rowRefreshTimer);
      rowRefreshTimer = null;
    }
    if (!runtimeActive) return;
    const sinceBoundary = ((getTornNowMs() % 1000) + 1000) % 1000;
    const delay = Math.min(CONFIG.rowRefreshMs, Math.max(20, CONFIG.rowRefreshMs - sinceBoundary));
    rowRefreshTimer = window.setTimeout(() => {
      rowRefreshTimer = null;
      if (runtimeActive && isRuntimeEligible()) tickVisibleHospitalCountdowns();
      if (runtimeActive) scheduleRowRefreshTick();
    }, delay);
  }

  function startRuntimeTimers() {
    clearTimers();
    scheduleRowRefreshTick();
    sharedPollTimer = window.setInterval(() => { if (effectiveTornApiKey() && runtimeActive && isRuntimeEligible()) void fetchSharedClaims(); }, CONFIG.sharedPollMs);
    fairFightTimer = window.setInterval(() => { if (sharedApiKey && runtimeActive && isRuntimeEligible()) void fetchFairFightStats(); }, CONFIG.fairFightRefreshMs);
    tornStatusTimer = window.setInterval(() => {
      if (!effectiveTornApiKey() || !runtimeActive || !isRuntimeEligible()) return;
      void fetchTornStatuses();
      if (selfPlayerId) {
        }
    }, CONFIG.tornStatusPollMs);
    routeHeartbeatTimer = window.setInterval(() => {
      if (runtimeActive) reconcileLifecycle();
    }, CONFIG.routeHeartbeatMs);
  }

  function suspendRuntime() {
    if (!runtimeActive) return;
    const observedPrewarWarId = ownWarsState.phase === RW_PHASE.PREWAR
      ? ownWarsState.warId
      : prewarObservation?.warId;
    if (validTargetId(observedPrewarWarId)) lockedPrewarWarIds.add(String(observedPrewarWarId));
    runtimeActive = false;
    runtimeGeneration += 1;
    invalidateSharedReads();
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set(); sharedClaimsDegraded = false;
    ambiguousOwnServerClaims = false;
    fairFightRequestSerial += 1;
    fairFightSyncing = false;
    fairFightStats = new Map();
    fairFightLastFetchAt = 0;
    invalidateTornCredentialRequests();
    ownWarsState = emptyOwnWarsState();
    opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
    currentWarSurface = null;
    prewarObservation = null;
    opponentFactionId = "";
    clearTimers();
    stopRouteObserver();
    unmountBridge();
  }

  function resumeRuntime() {
    if (destroyed || runtimeActive || !isRuntimeContextEligible() || !canonicalPdaRankedWarSurface()) return;
    runtimeActive = true;
    runtimeGeneration += 1;
    mountBridge();
    if (!bridgeMounted) { runtimeActive = false; return; }
    startRouteObserver();
    startRuntimeTimers();

    if (apiKeyStorageReady) {
      if (effectiveTornApiKey()) { void fetchSharedClaims(); void fetchTornStatuses({ force: true }); void runTornClockSyncBurst(); }
      if (sharedApiKey) void fetchFairFightStats({ force: true });
    }
  }

  function handleViewportGeometryChange() {
    if (destroyed) return;
    if (!runtimeActive) {
      if (isRuntimeContextEligible()) reconcileLifecycle({ structural: true });
      return;
    }
    if (!bridgeMounted) return;
    if (!isRuntimeEligible()) {
      reconcileLifecycle();
      return;
    }
    schedulePresentationFrame({ layout: true, render: true });
  }

  function destroy() {
    if (destroyed) return;
    if (runtimeActive) suspendRuntime();
    destroyed = true;
    runtimeActive = false;
    runtimeGeneration += 1;
    clearTimers();
    stopRouteObserver();
    unmountBridge();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("hashchange", onRouteLocationChange);
    window.removeEventListener("popstate", onRouteLocationChange);
    window.removeEventListener("online", onOnline);
    for (const eventName of ["pointerdown", "touchstart", "wheel", "keydown"]) {
      document.removeEventListener(eventName, onTrustedActivity, true);
    }
    document.removeEventListener("scroll", onPresentationScroll, true);
    window.removeEventListener("resize", handleViewportGeometryChange);
    window.removeEventListener("orientationchange", handleViewportGeometryChange);
    window.visualViewport?.removeEventListener("resize", handleViewportGeometryChange);
    window.visualViewport?.removeEventListener("scroll", onPresentationScroll);
    window.removeEventListener("DOMContentLoaded", boot);
    if (wrappedHistoryPushState && history.pushState === wrappedHistoryPushState) history.pushState = nativeHistoryPushState;
    if (wrappedHistoryReplaceState && history.replaceState === wrappedHistoryReplaceState) history.replaceState = nativeHistoryReplaceState;
    delete window[SCRIPT.instanceKey];
  }

  function onVisibilityChange() {
    if (!isPageVisible()) {
      suspendRuntime();
      return;
    }
    windowFocused = initialFocusState();
    if (windowFocused) reconcileLifecycle({ structural: true });
  }

  function onWindowFocus() {
    windowFocused = true;
    if (isPageVisible()) reconcileLifecycle({ structural: true });
  }

  function onWindowBlur() {
    windowFocused = false;
    suspendRuntime();
  }

  function onRouteLocationChange() {
    if (!destroyed) reconcileLifecycle({ structural: true });
  }

  function onTrustedActivity(event) {
    registerTrustedInteraction(event);
  }

  function onPageHide(event) {
    if (event.persisted) suspendRuntime();
    else destroy();
  }

  function onPageShow() {
    if (destroyed || !isPageVisible()) return;
    windowFocused = initialFocusState();
    if (windowFocused) reconcileLifecycle({ structural: true });
  }

  function onOnline() {
    if (!runtimeActive || !isRuntimeEligible()) return;
    sharedBackoffUntil = 0;
    fairFightBackoffUntil = 0;
    tornStatusBackoffUntil = 0;
    if (effectiveTornApiKey()) { void fetchSharedClaims(); void fetchTornStatuses({ force: true }); }
    if (sharedApiKey) void fetchFairFightStats({ force: true });
  }

  function installHistoryLifecycleHooks() {
    wrappedHistoryPushState = function (...args) {
      const result = Reflect.apply(nativeHistoryPushState, this, args);
      onRouteLocationChange();
      return result;
    };
    wrappedHistoryReplaceState = function (...args) {
      const result = Reflect.apply(nativeHistoryReplaceState, this, args);
      onRouteLocationChange();
      return result;
    };
    history.pushState = wrappedHistoryPushState;
    history.replaceState = wrappedHistoryReplaceState;
  }

  function boot() {
    if (destroyed) return;
    windowFocused = initialFocusState();
    if (windowFocused && isPageVisible()) reconcileLifecycle({ structural: true });
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("hashchange", onRouteLocationChange);
  window.addEventListener("popstate", onRouteLocationChange);
  window.addEventListener("online", onOnline);
  for (const eventName of ["pointerdown", "touchstart", "wheel", "keydown"]) {
    document.addEventListener(eventName, onTrustedActivity, { capture: true, passive: true });
  }
  document.addEventListener("scroll", onPresentationScroll, { capture: true, passive: true });
  window.addEventListener("resize", handleViewportGeometryChange, { passive: true });
  window.addEventListener("orientationchange", handleViewportGeometryChange, { passive: true });
  window.visualViewport?.addEventListener("resize", handleViewportGeometryChange, { passive: true });
  window.visualViewport?.addEventListener("scroll", onPresentationScroll, { passive: true });
  installHistoryLifecycleHooks();

  void initializeApiKeyStorage();
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
