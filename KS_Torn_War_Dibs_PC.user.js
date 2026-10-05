// ==UserScript==
// @name         KS Torn War Dibs PC
// @namespace    kingshade.torn
// @version      1.1.10
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Torn_War_Dibs_PC.user.js
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/KS_Torn_War_Dibs_PC.user.js
// @description  PC TEST: DIBS as a native roster column beside Torn's Attack cell; FF and Est from FFScouter's get-stats API. War Stuff Enhanced is detected and shown read-only; it never blocks.
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
 * KS Torn War Dibs PC v1.1.10 -- CANDIDATE
 *
 * ONE MAIN CHANGE: the DIBS transport. The claim board, claim, release and
 * the hospital report go to the KS War Room server
 * (https://ks-war-room-claims.hans-viklund.workers.dev) instead of FFScouter's
 * claim endpoints. FF and Est still come from FFScouter's get-stats API,
 * unchanged. Built from the 0.2.0-0.2.2 trial versions of this transport, with
 * everything that existed only for the trial removed. Name, namespace, update
 * address and every storage name are those of v1.1.9, so the saved keys and
 * the panel state stay in place after the update.
 *
 * FIXED
 *   - A board read that was in flight when a claim or release succeeded
 *     could stop the board from being read again until the window lost
 *     focus.
 * ADDED
 *   - Sign-in to the KS War Room server with the Torn API key the script
 *     already holds. The sign-in slip is kept in page memory only.
 *   - Claimer names from the own faction's member list (Torn
 *     /v2/faction/members, at most once every 5 minutes, memory only).
 *   - Hospital report: a claimed target that is back in hospital has its
 *     new end time reported, so the server can release the claim. Only when
 *     the new end time is more than 180 s past the stored one, only on a
 *     Torn reading made more than 45 s after the claim, once per target and
 *     end time, never in VIEW.
 * CHANGED
 *   - DIBS needs the Torn key, not the FFScouter key. The FFScouter key
 *     only governs FF and Est.
 *   - Every server request is a POST with a JSON body through
 *     GM_xmlhttpRequest. The war id in the address is Torn's own ranked war
 *     id for the war on screen; nothing else goes into an address or a
 *     header.
 *   - One owner per target: FFScouter's queue is gone. A target somebody
 *     else holds answers "taken".
 *   - Fail closed: while the board has not been read for the war on screen,
 *     a claimable target reads DIBS? and cannot be claimed.
 *   - A key the server or Torn refuses is not sent again automatically. A
 *     server that does not answer is retried after 15 s, 30 s, then every
 *     60 s.
 *   - In VIEW no request is made to the KS War Room server.
 *   - The panel link to the FFScouter War Room page is removed.
 * KNOWN ISSUES
 *   - An own claim saved by v1.1.9 against FFScouter does not exist on the
 *     KS War Room server. After the update it locks the other DIBS buttons
 *     until the board has been read and the claim was not on it (normally
 *     within seconds of the page load). While the server does not answer it
 *     locks them until its own expiry, never longer.
 *   - The Torn key can be forgotten while a claim is held; the claim then
 *     stays on the server until it expires (at most 300 s).
 * VERIFICATION
 *   - Synthetic only: the whole script in Chromium against stand-in
 *     backends. Claim, release and report have never run from a real client
 *     against the real server. See RAPPORT_PC_1.1.10.txt.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.9 TEST
 *
 * ONE MAIN CHANGE: the opponent roster is sorted by hospital time when Torn's
 * own Status column header is the active sort. Same mechanism as PDA 1.5.182:
 * KS never moves a row in the DOM. ul.members-list gets display:flex +
 * flex-direction:column and every row gets a CSS order, so a DOM re-sort by
 * Torn or WSE cannot undo it. Status down: Okay, Hospital shortest first,
 * Hospital without a time, Traveling/Abroad, other. Status up: Hospital
 * shortest first, Hospital without a time, Okay, Traveling/Abroad, other.
 * Any other active column -- Torn's Members/Level/Score or FFScouter's
 * Stats sort (its header cell carries data-ffscouter-sort and its own
 * activeIcon, measured 2026-10-03) -- or an unreadable header: KS releases
 * the order and Torn/FFScouter decide. KS never clicks the header. Note E
 * below ("sorting permanently off") is superseded for this case only; the
 * old DIBS column sort stays locked OFF. Restored on every unmount.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.8 TEST
 *
 * ONE MAIN CHANGE: updates now come from kingshade-leader-tools instead of Kingshade-Torn-Suite (@downloadURL and @updateURL). Nothing else changed.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.7 TEST
 *
 * ONE MAIN CHANGE: one failed FFScouter read no longer wipes every FF value.
 * Each value keeps its own 6 min validity (fairFightMaxAgeMs) and is dropped
 * by scoutStatsForTarget() when it gets older, so a 502/429/network error no
 * longer turns every claimable row UNKNOWN until the next good read. A key
 * change or suspend still clears everything, as before. Same fix as PDA
 * 1.5.185.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.6 TEST
 *
 * ONE MAIN CHANGE: optional fresh opponent life reads allow Fair Fight up to
 * 4.50 at 20% life or less inside the hospital window. Reads are serial and
 * bounded, stop on suspend, and never run in VIEW. A missing profile scope
 * keeps ordinary DIBS available. Claims above 3.40 confirm life again.
 * Review fix (Claude 2026-09-28): that click read no longer waits for the
 * 10 s per-target spacing, so a low-life DIBS is sent without delay.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.5 TEST
 *
 * ONE MAIN CHANGE: fresh Online opponents are free for all whenever the
 * hospital and FF gates permit DIBS. Activity comes from the existing Torn
 * members batch; an own claim on an Online target is released once.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.4 TEST
 *
 * ONE MAIN CHANGE: DIBS now allows Fair Fight 2.00-3.40 inclusive, as
 * requested by the faction leader. FF-locked cells use two decimal places
 * so a value above the ceiling cannot look like the permitted boundary.
 *
 * ---------------------------------------------------------------------------
 * KS Torn War Dibs PC v1.1.3 TEST -- CANDIDATE
 *
 * Identity, storage lineage and distribution change only. The decision core --
 * clock, hospital arithmetic, RW phase, classify, shared-claim normalisation,
 * claim/release, unreadable entries, the Torn and FFScouter transport -- is
 * character-identical to v0.1.0. What changed:
 *
 *   1. @name reverts to "KS Torn War Dibs PC", the same name v1.0.40 already
 *      ships under. Tampermonkey matches installed scripts on @name +
 *      @namespace, so this is what makes the update to installed 1.0.40
 *      clients automatic instead of a second parallel client.
 *   2. @version is 1.1.3, higher than 1.0.40.
 *   3. @downloadURL and @updateURL are added, both pointing at the address
 *      installed 1.0.40 clients already poll:
 *      https://raw.githubusercontent.com/Hjunez/Kingshade-Torn-Suite/main/KS_Torn_War_Dibs_PC.user.js
 *   4. Storage lineage reads from v1.0.40's names, not v0.1.0's, so an
 *      installed member's saved Torn key, FFScouter key and own claim survive
 *      the update: ks_torn_war_dibs_pc_native_own_claim_v1,
 *      ks_torn_war_dibs_pc_native_panel_minimized_v1,
 *      ks_torn_war_dibs_pc_native_ff_change_journal_v1, IndexedDB
 *      KSTornWarDibsPcNativeSecure, cipher IDs pcNativeSharedApiCipherV1,
 *      pcNativeSharedApiCipherRollbackV1 and pcNativeTornApiCipherV1 (the
 *      last is not named in the storage lineage request but is required for
 *      the same reason: it is where 1.0.40 keeps the encrypted Torn API key,
 *      verified against the 1.0.40 file).
 *   5. A one-time migration copies v0.1.0's own "wse" storage into the
 *      names above whenever the target name is still empty. It never
 *      overwrites an existing entry and never deletes the wse entries. This
 *      only matters on a machine that ran v0.1.0, i.e. the owner's own.
 *   6. instanceKey is a new value, __ksTornWarDibsPcV110, distinct from both
 *      v0.1.0's and v1.0.40's.
 *   7. The WSE gate still never blocks; warStuffEnhancedGate() still returns
 *      false. Detection and the panel line are unchanged.
 *   8. The @description and panel brand no longer name this a WSE variant.
 *      It is the universal PC script; WSE is one thing it happens to detect.
 *
 * Never run this script at the same time as v1.0.40 or v0.1.0 WSE PC.
 *
 * ---------------------------------------------------------------------------
 * v0.1.0 lineage notes follow. Where they describe this script as a WSE
 * coexistence variant, v1.1.3 above supersedes that framing; the mechanism
 * itself (WSE detected, never gated) is unchanged.
 *
 * KS Torn War Dibs WSE PC v0.1.0 TEST -- CANDIDATE
 *
 * A copy of KS Torn War Dibs PC v1.0.40 QUEUE_NOTICE_TEST with exactly the
 * changes needed to coexist with Torn War Stuff Enhanced 2.1 on the same
 * Ranked War roster. The decision core -- clock, hospital arithmetic, RW
 * phase, classify, shared-claim normalisation, claim/release, unreadable
 * entries, the Torn and FFScouter transport -- is character-identical to
 * v1.0.40. What changed:
 *
 *   A. The WSE gate never blocks. WSE presence is still detected and shown
 *      as a panel line: "WSE: detected" / "WSE: not detected".
 *   B. The Status cell belongs to WSE. KS no longer hides Torn's Status
 *      column and no longer renders its own status cell. The hospital
 *      countdown is in the DIBS cell, as it already was.
 *   C. FF and Est come from FFScouter's get-stats API, ported from PDA
 *      v1.5.167, instead of FF Scouter V2's row attributes. One batched
 *      request, refreshed at most once a minute, allowed in VIEW as well.
 *   D. The FFScouter Sort/filter warning is gone. The panel FF line reports
 *      the get-stats fetch instead.
 *   E. DIBS sorting is permanently off: WSE re-sorts ul.members-list on
 *      every childList change and would undo it at once.
 *   F. The row observer no longer watches FF Scouter V2's row attributes.
 *   G. KS never inserts a node as a direct child of ul.members-list.
 *   H. The disclosure text names the get-stats request and WSE.
 *
 * Own storage namespace ("wse"): the Torn key and the FFScouter key are
 * entered once more in this script. Never run this script and v1.0.40 at
 * the same time.
 *
 * ---------------------------------------------------------------------------
 * v1.0.40 lineage notes follow. Where they describe FF Scouter V2's row
 * attributes or the WSE block, v0.1.0 above supersedes them.
 *
 * KS Torn War Dibs PC v1.0.20 COUNTDOWN TEST -- CANDIDATE
 * v1.0.19 was verified in real PC runtime: the native column mounted, no row
 * wrapped, Score was swapped for DIBS, and FFScouter's column, sorting, filter
 * panel and FF/Est switch all survived.
 *
 * v1.0.20 proved in real PC runtime that Torn's Ranked War roster does NOT
 * carry the hospital time. The status cell says "Hospital" and nothing more --
 * no data-until, no text countdown. So a fully offline VIEW mode can never show
 * a countdown, and no amount of DOM work changes that.
 *
 * v1.0.22 was verified in real PC runtime: hospital countdowns resolve for the
 * side the column is mounted on, and the merged members batch covers both
 * factions on the war card.
 *
 * v1.0.23 was verified in real PC runtime: the panel sits between FFScouter's
 * controls and the roster at the content column's width.
 *
 * v1.0.24 widened the cell from 38px to 46px and that is confirmed in real PC
 * runtime, but hour-long times still ellipsised. The cause was not the width:
 * "2h 55m" is six characters plus a space, and real Arial Bold on Windows is
 * wider than the metric substitute an offline test renders with.
 *
 * Torn renders the Status word once and does not refresh it. A target who goes
 * to hospital after the roster was drawn keeps showing Okay until the page is
 * reloaded, while the DIBS cell -- which reads Torn's API every ten seconds --
 * already shows the countdown. The owner confirmed with F5 that the API was
 * right and Torn's own column was stale.
 *
 * Found by simulating a live Ranked War end to end -- real clicks, real claim
 * and release traffic against a stateful fake of FFScouter's claim API:
 *
 * A DIBS that FAILS says so for less than a twentieth of a second. The catch
 * block sets "Shared: claim failed ...", and then the finally block's
 * fetchSharedClaims immediately overwrites it with "syncing" and then "online".
 * A sampler reading the panel every 50 ms never caught the message once.
 *
 * In a war that is the dangerous kind of quiet: the caller clicks DIBS, the
 * write fails, the cell goes back to being claimable, and nothing says why. The
 * natural reading is that the target was taken.
 *
 * ONE MAIN CHANGE: a failed claim or release holds the panel message for six
 * seconds. Routine syncing and online updates are suppressed while the hold
 * runs; a newer error replaces an older one immediately, and the hold is
 * dropped the moment the owner starts another write, so it can never mask the
 * state of something they are doing now.
 *
 * Nothing about what the buttons do changes, and no decision, request or stored
 * record is affected. fetchSharedClaims is still byte-identical to v1.0.13.
 * claimSharedTarget and releaseOwnSharedTarget each have exactly one changed
 * line: the failure message they print now goes through holdSharedWriteFailure
 * instead of setSharedStatus. The hold is cleared in the click handler, not in
 * them. This is the presentation layer only -- it was frozen for its authority
 * logic, and that logic is untouched.
 *
 * v1.0.33 notes, still current:
 *
 * Measured frame by frame in the owner's timer.mp4, with the same player's own
 * hospital banner and the DIBS cell in the same picture:
 *
 *   frame 12  DIBS 0:15   Torn "15 seconds"
 *   frame 13  DIBS 0:15   Torn "14 seconds"   <- Torn ticks
 *   frame 28  DIBS 0:15   Torn "14 seconds"
 *   frame 29  DIBS 0:14   Torn "14 seconds"   <- we tick, 0.53 s later
 *
 * The same for every one of the fifteen seconds in the clip: the cell ticks
 * 16-17 frames (0.53-0.57 s) after Torn's own timer, so for slightly more than
 * half of every second it reads one second too high. Same lag against Torn's
 * server clock in the corner, and the row went Okay 1.1 s late.
 *
 * The cause is not the tick and not the rounding. It is the clock. The Torn
 * clock offset was only ever sampled from the own-faction wars response and
 * from the claim gate. On a foreign war -- VIEW mode -- neither request is ever
 * made, so no sample exists, no offset is known, and getTornNowMs() falls
 * all the way back to Date.now(). The countdown then runs on the PC's own
 * clock, which on this machine sits about half a second behind Torn.
 *
 * v1.0.33 answered this with two sources, a coarse one from the HTTP Date
 * header and a fine one that watched Torn's own clock element tick over.
 * THE FINE SOURCE IS GONE AS OF v1.0.35 and the reasoning is recorded here so
 * nobody rebuilds it:
 *
 *   - Measured in the owner's Chrome on a live war roster, the cell still
 *     changed a median 308 ms after Torn's clock. The watch never locked, and
 *     the script was running on the coarse offset alone the whole time.
 *   - Torn's clock is not in the page unless the user has clicked it open. A
 *     fine source that exists only for the one caller who happened to open the
 *     clock is worse than no fine source at all.
 *   - It would have been wrong regardless. Two Torn windows were measured
 *     0.6 s apart, and two widgets inside the SAME window 0.4 s apart. Torn's
 *     clocks are free-running intervals started at page load. The page cannot
 *     say when a server second begins.
 *
 * ONE MAIN CHANGE (v1.0.35): the offset is no longer estimated at all. It is
 * bounded. A response whose Date header -- or whose body timestamp -- names the
 * whole second S proves that S was current at some instant inside the round
 * trip, and therefore that
 *
 *     offset  in  [ S - endedAt , S + 1000 - startedAt )
 *
 * Every response yields another such interval, and the true offset lies in all
 * of them at once. The running intersection can only narrow and can never
 * exclude the truth, so the whole-second error is gone by construction: there
 * is no rounding step left to get wrong.
 *
 * The estimate is read at the LOW EDGE of the interval, not the middle. The
 * middle is unbiased but wrong in both directions, and one of those directions
 * is unacceptable: a clock that runs ahead makes the cell show less time than
 * there is, and somebody attacks early into a hospital. The low edge puts our
 * clock as far behind Torn as the evidence permits, so remaining time reads as
 * high as the evidence permits. While the interval is still wide the cell may
 * read high. It can never read low.
 *
 * The Torn poll is scheduled with a small jitter instead of a fixed period.
 * Same endpoints, same average rate -- but a fixed 10 s period is exactly ten
 * whole seconds, so every sample would land at the same phase inside the
 * second and the intervals would never intersect down to anything narrow.
 *
 * NOTHING READS TORN'S DOM FOR TIME ANY MORE. The Date header still costs no
 * request: it arrives with responses the script had already asked for, and a
 * cached reply (Age above zero) is ignored.
 *
 * v1.0.32 notes, still current:
 *
 * The cause is that the display ran on setInterval(1000) started at whatever
 * moment the script booted. It was never aligned to the second boundary, so the
 * number on screen was recomputed at an arbitrary phase and could sit up to a
 * full second stale while Torn's own timer ticked on. Against a live Torn
 * countdown that reads as an error that drifts and never settles.
 *
 * ONE MAIN CHANGE: the display tick is scheduled onto Torn's second boundary
 * instead of running free. Each update reschedules itself for the next whole
 * Torn second, so the cell changes in the same instant Torn's clock does.
 *
 * This also settles the rounding question. At a second boundary the remaining
 * time is a whole number, so ceil returns it unchanged -- the cell shows the
 * exact number of whole seconds left, which is what Torn shows.
 *
 * v1.0.31 notes, still current:
 *
 * ONE MAIN CHANGE: an expired hospital record is no longer treated as hospital.
 * The release timestamp is authoritative -- once it has passed, the target is
 * out, whatever a cached or lagging API record still says. Previously the code
 * fell through to "in hospital, release time unknown", which locked the button
 * and froze the status until a later batch happened to disagree.
 *
 * Applied in all three places that read hospital state: the live path's
 * computeHospitalSeconds, the VIEW lookup, and the Status column renderer.
 *
 * computeHospitalSeconds is the third engine function this chain has changed,
 * again for a defect measured in real runtime. Its behaviour is unchanged for
 * every record that has not expired.
 *
 * v1.0.30 notes, still current:
 *
 * 1. hospitalRemainingSeconds computed Math.ceil(until - now) + 1. The ceil is
 *    correct and stays -- a countdown must never show less than the real wait,
 *    or a caller attacks a second early and the hit fails. The + 1 constant is
 *    the extra second and is removed. It came from the v1.5.135 PDA lineage as
 *    "FFScouter-aligned +1 second semantics".
 *
 * 2. recordTornClockOffset compared Torn's whole-second timestamp against a
 *    millisecond midpoint. Torn reports the floor of the current second, so the
 *    offset was biased up to a full second low, which made our clock read early
 *    and the remaining time read long.
 *
 * 3. v1.0.35. Both whole-second sources -- the HTTP Date header and the body
 *    timestamp -- are now treated as constraints rather than estimates. Each
 *    response proves the offset lies in [S - endedAt, S + 1000 - startedAt),
 *    and the running intersection of those intervals can only narrow and can
 *    never exclude the truth. The estimate is taken at the low edge, so the
 *    countdown can read high but never low. Nothing reads Torn's DOM for time.
 *
 * 4. v1.0.36. The DIBS cell's tooltip blinked once a second while the pointer
 *    rested on it, because every display tick removed and rewrote the title
 *    attribute and the text itself carried a live countdown. The title is now
 *    written only when its text changes, and it no longer contains anything
 *    that changes by itself. Presentation only; no decision path is touched.
 *
 * 5. v1.0.37. The panel and the DIBS header now say when FFScouter's own Sort
 *    or filters are on. FFScouter's sort pass re-runs on every class change in
 *    the roster and undoes ours; its filters hide a row the moment a released
 *    target stops matching. Both were confirmed by the owner in live runtime
 *    and neither is a KS fault, but nothing told the user why. KS reads the
 *    two marks FFScouter writes on the page it is showing and reports them.
 *    It never changes FFScouter's state and makes no request. Presentation only.
 *
 * Combined error before: +1 to +3 seconds, about +2 on average.
 * Combined error after:  0 to +1 second, from the deliberate ceil alone.
 *
 * NOTE: hospitalRemainingSeconds is no longer byte-identical to v1.0.13. It is
 * the only engine function this whole 1.0.18-1.0.30 chain has changed, and it
 * is changed because a defect was measured in real runtime, not by preference.
 * PDA still carries the + 1, so PDA and PC will differ by one second until the
 * same correction is made there.
 *
 * Everything else in VIEW mode stays refused at the transport: no FFScouter
 * traffic, no shared claim reads or writes, no own-wars call, no key/info, no
 * target basic check. The faction ID is pinned to the one in the URL, so VIEW
 * cannot be pointed at any other faction. The button stays locked; no CLAIM or
 * RELEASE is reachable.
 *
 * Live-war behaviour, shared DIBS authority and the claim engine are unchanged. Built from v1.0.13 RELEASE (169,007 bytes,
 * SHA-256 723A0582A7EAE95E830313DCF67F6C208719D6A6EC74EC504583639D0E74A313).
 * v1.0.16 and v1.0.17 were not used as an implementation base.
 *
 * ONE MAIN CHANGE: the per-row DIBS control moves out of the body-owned geometry
 * overlay and becomes a real roster cell inserted before Torn's native Attack
 * cell. Width is net zero -- Torn's Score column is hidden only on rows that
 * actually carry a KS cell, and the KS cell takes exactly the width that frees.
 *
 * FFScouter keeps its own FF/Est cell, header, sorting and filtering. This
 * script never hides, rewrites or duplicates FFScouter's column. (v0.1.0: FF
 * and Est come from FFScouter's get-stats API; see the note at the top.)
 *
 * Removed from the v1.0.13 presentation path: elementFromPoint hit sampling,
 * per-row rect measurement, per-row and per-attack-cell ResizeObserver targets
 * and the rAF row layout loop. Column width is measured once per roster mount.
 *
 * VIEW mode: on any other faction's /war/rank route the column renders
 * read-only. While VIEW mode is active every network call is refused at the
 * transport and every shared write is refused at the control.
 *
 * Shared DIBS authority, CLAIM/QUEUED/RELEASE semantics, credential guards and
 * the target decision engine are unchanged from v1.0.13.
 * Hospital countdown uses v1.5.135 FFScouter-aligned second-boundary semantics.
 * Identity-bearing row changes immediately invalidate stale XID-bound DIBS controls.
 * PREWAR lock, Hospital <=2:00 and FF 2.00-5.00 gates are retained.
 */

(() => {
  "use strict";

  const SCRIPT = Object.freeze({
    name: "KS Torn War Dibs PC",
    version: "1.1.10",
    instanceKey: "__ksTornWarDibsPcV1110",
    rowHostPrefix: "ks-twd-wse-row-v010-",
    rosterStyleId: "ks-twd-wse-roster-style-v010",
    panelId: "ks-twd-wse-panel",
    layerId: "ks-twd-wse-layer",
    ownClaimStorageKey: "ks_torn_war_dibs_pc_native_own_claim_v1",
    panelMinimizedStorageKey: "ks_torn_war_dibs_pc_native_panel_minimized_v1",
    secureVaultDbName: "KSTornWarDibsPcNativeSecure",
    secureVaultStoreName: "vault",
    secureVaultCryptoKeyId: "sharedApiCryptoKey",
    secureVaultCipherId: "pcNativeSharedApiCipherV1",
    secureVaultRollbackCipherId: "pcNativeSharedApiCipherRollbackV1",
    sharedApiChangeJournalKey: "ks_torn_war_dibs_pc_native_ff_change_journal_v1",
    tornApiCipherId: "pcNativeTornApiCipherV1",
    ffscouterOrigin: "https://ffscouter.com",
    ffscouterTermsUrl: "https://ffscouter.com/",
    ffscouterPrivacyUrl: "https://ffscouter.com/privacy",
    tornApiOrigin: "https://api.torn.com",
    tornKeyInfoPath: "/v2/key/info",
    tornOwnWarsPath: "/v2/faction/wars",
    tornOwnFactionMembersPath: "/v2/faction/members",
    tornCustomKeyUrl: "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=KS%20Torn%20War%20Dibs%20PC&faction=members,wars&user=basic,profile"
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
    tornStatusErrorBackoffMs: 15000,
    tornTransportRetryDelayMs: 450,
    tornTransportRetryAttempts: 2,
    tornTransportOfflineThreshold: 2,
    tornTransportRecoveryDelayMs: 1800,
    tornClockMaxRoundTripMs: 10000,
    tornClockDriftPpm: 500,
    tornStatusPollJitterMs: 400,
    sharedErrorHoldMs: 6000,
    displayTickMs: 1000,
    sharedPollMs: 2500,
    sharedTransportRetryDelayMs: 450,
    sharedTransportRetryAttempts: 2,
    sharedTransportOfflineThreshold: 2,
    routeHeartbeatMs: 1000,
    requestTimeoutMs: 15000,
    ownClaimMissingReadThreshold: 2,
    ownClaimMissingGraceMs: 500,
    trustedScrollIntentMs: 1500,
    maxHospitalSeconds: 172800,
    // A claim can only be taken while the target has gateSeconds or less
    // left, and a hospital timer only grows when the target is put back
    // in. A fresh reading above this is therefore proof of a NEW
    // hospitalisation, not the one the claim was taken during. 180 leaves
    // 60 s of margin over the 120 s gate.
    autoReleaseHospitalSeconds: 180
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

  const FF_CREDENTIAL_STATE = Object.freeze({
    IDLE: "idle",
    EDITING: "editing",
    SAVING: "saving",
    FORGETTING: "forgetting"
  });

  // false: the sharp version. The war id on the wire is Torn's own ranked war
  // id for the war on screen, unchanged; see wireWarId(), the only reader. A
  // trial build sets this to true and can then reach nothing but a trial war.
  const KS_SERVER_TEST_BUILD = false;

  // The KS War Room server (contract: KS War Room 3C rapport avsnitt 10).
  // POST only, JSON body, the sign-in slip in the body field "session".
  const KS_SERVER = Object.freeze({
    origin: "https://ks-war-room-claims.hans-viklund.workers.dev",
    sessionPath: "/session",
    warOps: Object.freeze(["claims", "claim", "unclaim", "report"]),
    // Renew the sign-in this long before the server lets it run out.
    sessionRenewMarginSeconds: 60,
    sessionDefaultTtlSeconds: 600,
    // A server that does not answer: wait 15 s, then 30 s, then 60 s at most.
    retryStepsMs: Object.freeze([15000, 30000, 60000]),
    // 429 without a retryAfterSeconds field.
    loginBlockedDefaultSeconds: 60,
    // A board read older than this no longer proves a target is free.
    boardMaxAgeMs: 10000,
    memberNamesRefreshMs: 300000,
    // Same numbers the server uses: it releases only when the new hospital
    // end time is more than 180 s past the stored one, and refuses a reading
    // older than 30 s.
    reportMarginSeconds: 180,
    reportMaxAgeSeconds: 30,
    // R1 (0.2.1). A report may rest only on a Torn reading made more than this
    // long AFTER the claim was taken. 45 = 30 s (Torn serves a cached answer
    // for up to 30 s, so a younger reading can still show the hospital time
    // from before the claim) + 15 s (the clock gap the server allows between
    // its clock and the client's). The server gets the same rule; the client
    // keeps it on its own.
    reportMinSecondsAfterClaim: 45,
    reportMemoryMax: 400
  });

  const STATS_API = Object.freeze({ getStats: "/api/v1/get-stats" });

  if (window[SCRIPT.instanceKey]) return;
  window[SCRIPT.instanceKey] = true;

  const LEGACY_WSE = Object.freeze({
    ownClaimStorageKey: "ks_torn_war_dibs_wse_own_claim_v1",
    panelMinimizedStorageKey: "ks_torn_war_dibs_wse_panel_minimized_v1",
    sharedApiChangeJournalKey: "ks_torn_war_dibs_wse_ff_change_journal_v1",
    secureVaultDbName: "KSTornWarDibsWseSecure",
    secureVaultCryptoKeyId: "sharedApiCryptoKey",
    secureVaultCipherId: "wseSharedApiCipherV1",
    tornApiCipherId: "wseTornApiCipherV1"
  });

  migrateLegacyWseLocalStorage();

  let destroyed = false;
  let runtimeActive = false;
  let bridgeMounted = false;
  let runtimeGeneration = 0;
  let lastTrustedScrollIntentAt = Number.NEGATIVE_INFINITY;
  let focusedResumeQueued = false;
  let panelMinimized = loadPanelMinimizedPreference();

  let displayTickTimer = null;
  let sharedPollTimer = null;
  let tornStatusTimer = null;
  let routeHeartbeatTimer = null;
  let rosterObserver = null;
  let rosterResizeObserver = null;
  let routeObserver = null;
  const nativeHistoryPushState = history.pushState;
  const nativeHistoryReplaceState = history.replaceState;
  let wrappedHistoryPushState = null;
  let wrappedHistoryReplaceState = null;
  let observerWorkQueued = false;
  let observerNeedsFullScan = false;
  let rosterObserverEpoch = 0;
  let routeReconcileQueued = false;
  let presentationLayoutFrame = null;
  const pendingRows = new Set();

  let sharedApiKey = "";
  let storedTornApiKey = "";
  let pdaTornApiKeyRejected = false;
  let sharedSyncing = false;
  let sharedWriteBusy = false;
  let sharedWriteOperationSerial = 0;
  // KS War Room sign-in. Module variables only: never written to storage,
  // never logged, never shown, and gone on a page reload.
  let ksSessionToken = "";
  let ksSessionKeyUsed = "";
  let ksSessionRenewAt = 0;
  let ksSignInPromise = null;
  let ksSignInPromiseKey = "";
  // Set when the server or Torn refused THIS key. No automatic sign-in is
  // made with the same key again; saving the Torn key or one press on Sync
  // allows exactly one more.
  let ksSignInHold = null;
  let ksManualSignInAllowed = false;
  // No server request before this moment (429, or a server that did not
  // answer). ksRetryStep walks KS_SERVER.retryStepsMs.
  let ksRetryAt = 0;
  let ksRetryStep = 0;
  // When, and for which wire war id, the claim board was last read whole.
  let ksBoardVerifiedAt = 0;
  let ksBoardWire = "";
  // Own faction member names for the claimer line. Memory only.
  let ksMemberNames = new Map();
  let ksMemberNamesAttemptAt = 0;
  let ksMemberNamesSyncing = false;
  // One hospital report per target and end time.
  const ksReportedKeys = new Set();
  let ksReportRunning = false;
  let sharedClaims = new Map();
  // Targets the shared server sent a claim for that could not be read.
  // We do not know whether they are taken, so they are never shown as free.
  let sharedClaimsUnreadable = new Set();
  let sharedAuthorityEpoch = 0;
  let sharedRequestSerial = 0;
  let ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
  let ffCredentialChangeSerial = 0;
  let fairFightStats = new Map();
  let fairFightSyncing = false;
  let fairFightRequestSerial = 0;
  let fairFightLastFetchAt = 0;
  let fairFightBackoffUntil = 0;
  let fairFightEverSucceeded = false;
  let fairFightRetryTimer = null;
  let fairFightStatus = { state: "idle", message: "FF: waiting…" };
  let tornStatusSyncing = false;
  let tornStatusRequestSerial = 0;
  let tornStatusBackoffUntil = 0;
  let selfPlayerId = "";
  let selfPlayerName = "";
  let selfFactionId = "";
  let opponentFactionId = "";
  let selfIdentitySyncing = false;
  let selfIdentityRequestSerial = 0;
  let selfIdentityLastAttemptAt = 0;
  let tornCredentialEpoch = 0;
  let tornCredentialChangeSerial = 0;
  let keyScopeReady = false;
  let apiKeyStorageReady = false;
  let tornTransportFailureStreak = 0;
  let ownWarsState = {
    live: false,
    warId: "",
    opponentFactionId: "",
    selfFactionId: "",
    surfaceWarId: "",
    surfaceOpponentFactionId: "",
    surfaceSerial: 0,
    fetchedAt: 0
  };
  let ownWarsRequestSerial = 0;
  let opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
  let currentWarSurface = null;
  let warSurfaceSerial = 0;
  let prewarObservation = null;
  const lockedPrewarWarIds = new Set();
  let sharedStatusHoldUntil = 0;
  // Running intersection of every interval Torn's own responses allow the true
  // clock offset to lie in. Null until the first usable sample.
  let tornClockLowMs = null;
  let tornClockHighMs = null;
  let tornClockBoundsAt = 0;
  let pendingTargetId = "";
  let ownClaimMissingReads = 0;
  let ownClaimLastConfirmedAt = 0;
  // Claim id the auto-release has already acted on. One attempt per claim:
  // a failed release must not turn into a request every second.
  let autoReleaseAttemptedClaimId = "";
  let claimFlowState = CLAIM_FLOW_STATE.IDLE;

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


  let sharedStatus = { state: "loading-key", message: "War Room: CHECKING…", count: 0 };
  let tornStatusState = { state: "loading-key", message: "Torn: loading key…", count: 0 };

  const rowBindings = new Map();
  let mountedRosterRoot = null;

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
    return injectedPdaTornApiKey() || validateTornApiKey(storedTornApiKey);
  }

  function nowMs() { return Date.now(); }
  function nowSeconds() { return Math.floor(getTornNowMs() / 1000); }
  function wait(ms) { return new Promise(resolve => window.setTimeout(resolve, ms)); }

  function emptyOwnWarsState(fetchedAt = 0, surface = null) {
    return {
      live: false,
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
  }

  function invalidateTornCredentialRequests() {
    tornCredentialEpoch += 1;
    resetLifeState();
    selfIdentityRequestSerial += 1;
    tornStatusRequestSerial += 1;
    selfIdentitySyncing = false;
    tornStatusSyncing = false;
    invalidateOwnWarsState();
  }

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

  function recordTornClockFromHeaders(result) {
    if (!result?.ok || !tornResponseIsFresh(result.headers)) return;
    const serverMs = tornDateHeaderMs(result.headers);
    if (serverMs === null) return;
    // Date is a whole second, so the value is that second's own start.
    recordTornWholeSecondMs(serverMs, Number(result.startedAt), Number(result.endedAt));
  }

  // The low edge of the interval, never the middle. The middle is unbiased but
  // wrong in both directions, and one direction is unacceptable: a clock that
  // runs ahead makes the cell show less time than there is and somebody attacks
  // early. The low edge puts our clock as far behind Torn as the evidence
  // permits, so the remaining time reads as high as the evidence permits. The
  // cell can read high while the interval is still wide. It can never read low.
  function getTornNowMs() {
    if (Number.isFinite(tornClockLowMs)) return nowMs() + tornClockLowMs;
    if (typeof window.getCurrentTimestamp === "function") {
      try {
        const value = window.getCurrentTimestamp();
        if (Number.isFinite(value)) return value;
      } catch {}
    }
    return nowMs();
  }

  // Cell-sized time. formatCountdown stays as it is for tooltips and the panel,
  // where there is room for the readable form.
  function formatCellCountdown(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}`;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

  function hasPageFocus() {
    try { return document.hasFocus(); } catch { return false; }
  }

  function isRankedWarRoute(value = location.href) {
    try {
      const url = new URL(value, location.href);
      const hashPath = String(url.hash || "").slice(1).split("?", 1)[0].replace(/\/+$/, "");
      return (
        /\/factions\.php$/i.test(url.pathname) &&
        url.searchParams.get("step") === "your" &&
        url.searchParams.get("type") === "1" &&
        hashPath === "/war/rank"
      );
    } catch {
      return false;
    }
  }

  // Another faction's Ranked War, reached from its public profile. Rendering is
  // allowed here so the roster column can be inspected outside an own war.
  // Authority is not: viewOnlyMode() gates every write and every request.
  // The public faction ID of the profile Ranked War page currently open, or "".
  // Every VIEW-mode request is pinned to this value, so VIEW can never be
  // pointed at a faction whose page the user is not actually looking at.
  function viewedFactionIdFromRoute(value = location.href) {
    try {
      const url = new URL(value, location.href);
      const hashPath = String(url.hash || "").slice(1).split("?", 1)[0].replace(/\/+$/, "");
      if (!/\/factions\.php$/i.test(url.pathname)) return "";
      if (url.searchParams.get("step") !== "profile" || hashPath !== "/war/rank") return "";
      const id = String(url.searchParams.get("ID") || "").trim();
      return validTargetId(id) ? String(Number(id)) : "";
    } catch {
      return "";
    }
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
    return !destroyed && isPageVisible() && hasPageFocus() && isAnyRankedWarRoute();
  }

  function isRuntimeEligible() {
    return runtimeActive && isRuntimeContextEligible() && Boolean(canonicalRankedWarSurface());
  }

  function isWarPanelPresent() {
    return Boolean(canonicalRankedWarSurface());
  }

  function registerTrustedInteraction(event) {
    if (!isPageVisible() || event?.isTrusted !== true) return;
    lastTrustedScrollIntentAt = performance.now();
    if (!runtimeActive) queueFocusedResume();
  }

  function registerTrustedScroll(event) {
    if (runtimeActive || !isPageVisible() || event?.isTrusted !== true) return;
    const elapsed = performance.now() - lastTrustedScrollIntentAt;
    if (elapsed >= 0 && elapsed <= CONFIG.trustedScrollIntentMs) queueFocusedResume();
  }

  function queueFocusedResume() {
    if (destroyed || runtimeActive || !isPageVisible()) return;
    if (hasPageFocus()) {
      reconcileLifecycle();
      return;
    }
    if (focusedResumeQueued) return;
    focusedResumeQueued = true;
    queueMicrotask(() => {
      focusedResumeQueued = false;
      if (!destroyed && !runtimeActive && isPageVisible() && hasPageFocus()) reconcileLifecycle();
    });
  }

  // ---------------------------------------------------------------------------
  // Own claim persistence.
  // ---------------------------------------------------------------------------

  function sanitizeOwnClaim(raw) {
    const claimId = normalizeText(raw?.claimId);
    const targetId = String(raw?.targetId ?? "").trim();
    const claimerPlayerId = String(raw?.claimerPlayerId ?? "").trim();
    const claimerName = normalizeText(raw?.claimerName) || "You";
    const expiresAt = Number(raw?.expiresAt);
    const cleanupRequired = raw?.cleanupRequired === true;
    const createdLocalAt = Number(raw?.createdLocalAt) || 0;
    if (!isValidClaimId(claimId) || !validTargetId(targetId)) return null;
    if (claimerPlayerId && !/^\d+$/.test(claimerPlayerId)) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds()) return null;
    return { claimId, targetId, claimerPlayerId, claimerName, expiresAt, cleanupRequired, createdLocalAt };
  }

  function loadOwnClaim() {
    try {
      const raw = localStorage.getItem(SCRIPT.ownClaimStorageKey);
      if (!raw) return null;
      const claim = sanitizeOwnClaim(JSON.parse(raw));
      if (!claim) localStorage.removeItem(SCRIPT.ownClaimStorageKey);
      return claim;
    } catch { return null; }
  }

  let ownSharedClaim = loadOwnClaim();

  function saveOwnClaim(value) {
    ownSharedClaim = value ? sanitizeOwnClaim(value) : null;
    try {
      if (ownSharedClaim) localStorage.setItem(SCRIPT.ownClaimStorageKey, JSON.stringify(ownSharedClaim));
      else localStorage.removeItem(SCRIPT.ownClaimStorageKey);
    } catch {}
    if (ownSharedClaim) enforceFfCredentialLock();
  }

  function currentOwnClaim() {
    if (!ownSharedClaim) return null;
    if (Number(ownSharedClaim.expiresAt) <= nowSeconds()) {
      saveOwnClaim(null);
      ownClaimMissingReads = 0;
      ownClaimLastConfirmedAt = 0;
      return null;
    }
    return ownSharedClaim;
  }

  function ffCredentialChangeBusy() {
    return ffCredentialChangeState !== FF_CREDENTIAL_STATE.IDLE;
  }

  function ffCredentialExternalLockActive() {
    return Boolean(currentOwnClaim()) || sharedWriteBusy;
  }

  function closeFfCredentialEditor() {
    if (!runtimeActive || !isRuntimeEligible()) return;
    const editor = document.getElementById(SCRIPT.panelId)?.shadowRoot?.querySelector("[data-role='key-editor']");
    editor?.classList.remove("open");
  }

  function setFfCredentialChangeState(state) {
    ffCredentialChangeState = state;
    updatePanel();
    updateBoundControls();
  }

  function enforceFfCredentialLock() {
    if (!ffCredentialExternalLockActive()) return false;
    if (runtimeActive && isRuntimeEligible()) closeFfCredentialEditor();
    if (ffCredentialChangeState === FF_CREDENTIAL_STATE.EDITING) {
      ffCredentialChangeSerial += 1;
      ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
    }
    if (runtimeActive && isRuntimeEligible()) {
      updatePanel();
      updateBoundControls();
    }
    return true;
  }

  function beginFfCredentialEdit() {
    if (ffCredentialChangeBusy() || ffCredentialExternalLockActive()) {
      closeFfCredentialEditor();
      updatePanel();
      return false;
    }
    ffCredentialChangeSerial += 1;
    setFfCredentialChangeState(FF_CREDENTIAL_STATE.EDITING);
    document.getElementById(SCRIPT.panelId)?.shadowRoot?.querySelector("[data-role='key-editor']")?.classList.add("open");
    return true;
  }

  function cancelFfCredentialEdit() {
    if (ffCredentialChangeState !== FF_CREDENTIAL_STATE.EDITING) return;
    ffCredentialChangeSerial += 1;
    closeFfCredentialEditor();
    setFfCredentialChangeState(FF_CREDENTIAL_STATE.IDLE);
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
    const db = await openSecureVault();
    try {
      const cryptoKey = await getOrCreateVaultCryptoKey(db);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(value);
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
      await vaultPut(db, id, { v: 1, iv: Array.from(iv), ciphertext });
      return true;
    } catch { return false; } finally { db.close(); }
  }

  async function loadCipher(id, validator) {
    const db = await openSecureVault();
    try {
      const payload = await vaultGet(db, id);
      const key = await vaultGet(db, SCRIPT.secureVaultCryptoKeyId);
      if (!payload || payload.v !== 1 || !Array.isArray(payload.iv) || !payload.ciphertext) return "";
      if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return "";
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(payload.iv) }, key, payload.ciphertext);
      return validator(new TextDecoder().decode(plaintext));
    } catch { return ""; } finally { db.close(); }
  }

  async function deleteCipher(id) {
    const db = await openSecureVault();
    try { return await vaultDelete(db, [id]); } catch { return false; } finally { db.close(); }
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
    if (!isCurrent()) return false;
    if (oldKey && !(await saveSecureApiKeyRollback(oldKey))) return false;
    if (!isCurrent()) return false;
    return writeSharedApiChangeJournal(Boolean(oldKey));
  }

  async function restoreSharedApiChangeJournal() {
    const journal = readSharedApiChangeJournal();
    if (journal === null) return true;
    if (!journal.valid) return false;
    if (journal.oldPresent) {
      const oldKey = await loadSecureApiKeyRollback();
      if (!oldKey || !(await saveSecureApiKey(oldKey))) return false;
    } else if (!(await deleteSecureApiKey())) {
      return false;
    }
    if (!clearSharedApiChangeJournal()) return false;
    void deleteSecureApiKeyRollback();
    return true;
  }

  function commitSharedApiChangeJournal() {
    if (!clearSharedApiChangeJournal()) return false;
    void deleteSecureApiKeyRollback();
    return true;
  }

  async function loadSecureApiKey() {
    const journal = readSharedApiChangeJournal();
    if (journal === null) return loadCipher(SCRIPT.secureVaultCipherId, validateFfscouterKey);
    if (!journal.valid) return "";
    if (!journal.oldPresent) {
      if ((await deleteSecureApiKey()) && clearSharedApiChangeJournal()) void deleteSecureApiKeyRollback();
      return "";
    }
    const oldKey = await loadSecureApiKeyRollback();
    if (!oldKey) return "";
    if ((await saveSecureApiKey(oldKey)) && clearSharedApiChangeJournal()) void deleteSecureApiKeyRollback();
    return oldKey;
  }

  const saveSecureTornApiKey = key => saveCipher(SCRIPT.tornApiCipherId, validateTornApiKey(key));
  const loadSecureTornApiKey = () => loadCipher(SCRIPT.tornApiCipherId, validateTornApiKey);
  const deleteSecureTornApiKey = () => deleteCipher(SCRIPT.tornApiCipherId);

  // ---------------------------------------------------------------------------
  // One-time storage migration from v0.1.0's own "wse" identity. Never
  // overwrites an existing entry under the names above and never deletes the
  // wse entries. Idempotent by construction: every guard below is "target
  // name still empty AND wse name present", which is false after the first
  // successful copy, so running this on every boot is harmless.
  // ---------------------------------------------------------------------------

  function migrateLegacyWseLocalStorageValue(newKey, oldKey) {
    try {
      if (localStorage.getItem(newKey) !== null) return;
      const oldValue = localStorage.getItem(oldKey);
      if (oldValue === null) return;
      localStorage.setItem(newKey, oldValue);
    } catch {}
  }

  function migrateLegacyWseLocalStorage() {
    migrateLegacyWseLocalStorageValue(SCRIPT.ownClaimStorageKey, LEGACY_WSE.ownClaimStorageKey);
    migrateLegacyWseLocalStorageValue(SCRIPT.panelMinimizedStorageKey, LEGACY_WSE.panelMinimizedStorageKey);
    migrateLegacyWseLocalStorageValue(SCRIPT.sharedApiChangeJournalKey, LEGACY_WSE.sharedApiChangeJournalKey);
  }

  async function legacyWseDatabaseExists() {
    try {
      if (typeof indexedDB.databases !== "function") return false;
      const names = await indexedDB.databases();
      return names.some(entry => entry?.name === LEGACY_WSE.secureVaultDbName);
    } catch { return false; }
  }

  // Opens the legacy wse vault for reading only. If the database does not
  // already exist this must fail rather than create it -- legacyWseDatabaseExists
  // is checked by the caller first, and onupgradeneeded aborts as a second guard.
  function openLegacyWseVault() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window) || !window.crypto?.subtle) return reject(new Error("Secure browser storage unavailable"));
      const request = indexedDB.open(LEGACY_WSE.secureVaultDbName, 1);
      request.onupgradeneeded = event => { if (event.oldVersion === 0) request.transaction?.abort(); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Secure storage open failed"));
      request.onblocked = () => reject(new Error("Secure storage upgrade blocked"));
    });
  }

  async function loadLegacyWseCipher(id, validator) {
    let db;
    try { db = await openLegacyWseVault(); } catch { return ""; }
    try {
      const payload = await vaultGet(db, id);
      const key = await vaultGet(db, LEGACY_WSE.secureVaultCryptoKeyId);
      if (!payload || payload.v !== 1 || !Array.isArray(payload.iv) || !payload.ciphertext) return "";
      if (typeof CryptoKey === "undefined" || !(key instanceof CryptoKey)) return "";
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(payload.iv) }, key, payload.ciphertext);
      return validator(new TextDecoder().decode(plaintext));
    } catch { return ""; } finally { db.close(); }
  }

  // Decrypts under the wse identity's own vault key and re-encrypts under this
  // script's own vault via the existing save functions -- never copies raw
  // ciphertext, since the two identities use different IndexedDB-scoped keys.
  async function migrateLegacyWseVaultKeys() {
    if (!(await legacyWseDatabaseExists())) return;
    try {
      const existingFfKey = await loadSecureApiKey();
      if (!existingFfKey) {
        const legacyFfKey = await loadLegacyWseCipher(LEGACY_WSE.secureVaultCipherId, validateFfscouterKey);
        if (legacyFfKey) await saveSecureApiKey(legacyFfKey);
      }
    } catch {}
    try {
      const existingTornKey = await loadSecureTornApiKey();
      if (!existingTornKey) {
        const legacyTornKey = await loadLegacyWseCipher(LEGACY_WSE.tornApiCipherId, validateTornApiKey);
        if (legacyTornKey) await saveSecureTornApiKey(legacyTornKey);
      }
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Network transport / explicit allowlists
  // ---------------------------------------------------------------------------

  // The factions whose rosters are actually rendered on screen: both IDs on the
  // current war card, plus the profile faction from the URL. VIEW may read the
  // members batch for these and nothing else.
  function viewPermittedFactionIds() {
    const ids = new Set();
    const routeId = viewedFactionIdFromRoute();
    if (validTargetId(routeId)) ids.add(routeId);
    const card = canonicalRankedWarSurface()?.selected?.card || null;
    for (const id of cardFactionIds(card)) {
      if (validTargetId(id)) ids.add(id);
    }
    return [...ids];
  }

  // VIEW mode allowlist. Fail closed: anything that is not exactly the members
  // endpoint for a faction rendered on the current page is refused. v0.1.0 adds
  // exactly one more permitted request, FFScouter's get-stats: it only reads FF
  // and battle-stat estimates and touches no claim. The KS War Room server
  // stays refused.
  function isViewModePermittedRequest(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ""));
      if (url.origin === SCRIPT.ffscouterOrigin && url.pathname === STATS_API.getStats) return true;
      if (url.origin !== SCRIPT.tornApiOrigin) return false;
      return viewPermittedFactionIds().some(id => url.pathname === `/v2/faction/${id}/members`);
    } catch {
      return false;
    }
  }

  function gmXhr(options) {
    return new Promise(resolve => {
      let settled = false;
      let request = null;
      let abortRequest = null;
      const startedAt = nowMs();
      // Single transport choke point. In VIEW mode everything is refused except
      // the members status batch for the faction being viewed; see
      // isViewModePermittedRequest for the exact allowlist.
      if (viewOnlyMode() && !isViewModePermittedRequest(options?.url)) {
        resolve({ ok: false, status: 0, responseText: "", headers: "", startedAt, endedAt: nowMs(), viewOnlyBlocked: true });
        return;
      }
      const finish = result => {
        if (settled) return;
        settled = true;
        if (abortRequest) options.signal?.removeEventListener("abort", abortRequest);
        resolve({ ...result, startedAt, endedAt: nowMs() });
      };
      abortRequest = () => {
        try { request?.abort(); } catch {}
        finish({ ok: false, status: 0, responseText: "", headers: "", aborted: true });
      };
      if (options.signal?.aborted) { abortRequest(); return; }
      options.signal?.addEventListener("abort", abortRequest, { once: true });
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
        if (options.signal?.aborted) abortRequest();
      } catch { finish({ ok: false, status: 0, responseText: "", headers: "" }); }
    });
  }

  function parseJsonSafe(text) {
    try { return JSON.parse(text || "{}"); } catch { return {}; }
  }

  // ---------------------------------------------------------------------------
  // KS War Room server transport (0.2.0). Contract: KS War Room 3C rapport
  // avsnitt 10. Every request is a POST with a JSON body through gmXhr
  // (GM_xmlhttpRequest). The sign-in slip travels in the body field
  // "session". Nothing goes into a header, and nothing but the wire war id
  // goes into the address.
  // ---------------------------------------------------------------------------

  // The ONE place a war id becomes part of a server address. The input is
  // Torn's own ranked war id for the war on screen, digits only. A test build
  // writes "sim-<id>" -- the same rule the War Room page uses in simulation --
  // so it lands in the same test war as that page and can never write to a
  // real war's board. Anything else throws, and nothing is sent.
  function wireWarId(tornWarId) {
    const text = typeof tornWarId === "number" ? String(tornWarId) : String(tornWarId ?? "").trim();
    if (!/^[0-9]{1,12}$/.test(text) || !(Number(text) > 0)) {
      throw new Error("Not a Torn ranked war id. Nothing was sent.");
    }
    const id = String(Number(text));
    const wire = KS_SERVER_TEST_BUILD ? `sim-${id}` : id;
    if (KS_SERVER_TEST_BUILD && !wire.startsWith("sim-")) {
      throw new Error("A test build may only reach a sim- war. Nothing was sent.");
    }
    return wire;
  }

  // Torn's ranked war id for the war on screen, or "". Read from the surface
  // the script already tracks; in the own war that surface is also checked
  // against /v2/faction/wars before anything is written (ownWarsFreshLive).
  function ksWarIdOnScreen() {
    // currentWarSurface is refreshed by the route heartbeat every second, in
    // the own war and in VIEW alike.
    const id = currentWarSurface?.warId;
    return validTargetId(id) ? String(Number(id)) : "";
  }

  function ksWarPath(op) {
    if (!KS_SERVER.warOps.includes(op)) throw new Error("Blocked non-allowlisted KS War Room operation");
    return `/war/${wireWarId(ksWarIdOnScreen())}/${op}`;
  }

  // Allowlist: exactly /session and /war/<wire id of the war on screen>/
  // (claims|claim|unclaim|report). No wipe, no other war, no query string.
  function ksServerPathAllowed(path) {
    if (path === KS_SERVER.sessionPath) return true;
    try {
      return KS_SERVER.warOps.some(op => path === ksWarPath(op));
    } catch {
      return false;
    }
  }

  // An answer that is not a JSON object -- Cloudflare's own error page, an
  // empty body -- is null: "the server did not answer", never "empty board".
  function ksParseJsonObject(text) {
    try {
      const parsed = JSON.parse(String(text ?? ""));
      return isPlainRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function ksServerApiRequest(path, body) {
    if (!ksServerPathAllowed(path)) throw new Error("Blocked non-allowlisted KS War Room endpoint");
    const result = await gmXhr({
      method: "POST",
      url: `${KS_SERVER.origin}${path}`,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      data: JSON.stringify(body || {})
    });
    return { ...result, body: ksParseJsonObject(result.responseText) };
  }

  function ksDropSession() {
    ksSessionToken = "";
    ksSessionKeyUsed = "";
    ksSessionRenewAt = 0;
  }

  function ksSessionReady(apiKey) {
    return Boolean(ksSessionToken) && ksSessionKeyUsed === apiKey && nowMs() < ksSessionRenewAt;
  }

  // The Torn key was saved or forgotten: whatever the server said about the
  // old key no longer applies. A timed wait (429, no answer) is NOT lifted:
  // it is about this sender, not about the key.
  function ksResetForTornKeyChange() {
    ksDropSession();
    ksSignInHold = null;
    ksManualSignInAllowed = false;
    ksMemberNames = new Map();
    // R5a (0.2.1): the names are fetched again at once with the new key
    // instead of waiting out the five minutes counted for the old one.
    ksMemberNamesAttemptAt = 0;
    ksBoardVerifiedAt = 0;
    invalidateSharedReads();
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set();
  }

  // One press on Sync allows one sign-in with a key that was refused.
  function ksAllowManualSignIn() {
    if (ksSignInHold) ksManualSignInAllowed = true;
  }

  // What a failed answer means, read from the HTTP status and the error
  // field only -- never from the server's own detail text.
  //   hold     the key itself was refused: no automatic retry with it
  //   wait     429: wait as long as the server says
  //   backoff  no usable answer: 15 s, 30 s, then 60 s
  // The server's own guard pauses EVERY new sign-in for ten minutes after ten
  // refused keys in two minutes, so a client that signs in again on every
  // poll could lock the whole faction out. That is what this prevents.
  function ksClassifyFailure(result, signIn) {
    const status = Number(result?.status) || 0;
    const body = result?.body || null;
    const error = body ? normalizeText(body.error) : "";
    if (status === 429) {
      const seconds = Number(body?.retryAfterSeconds);
      const waitSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : KS_SERVER.loginBlockedDefaultSeconds;
      return { kind: "wait", word: "SERVER OFFLINE", waitMs: waitSeconds * 1000 };
    }
    if (signIn) {
      if (status === 403 && error === "not_a_member") return { kind: "hold", word: "NOT A MEMBER" };
      if (status === 400) return { kind: "hold", word: "KEY REJECTED" };
      if (status === 401 && error === "key_rejected" && body.retryable !== true) return { kind: "hold", word: "KEY REJECTED" };
    }
    return { kind: "backoff", word: "SERVER OFFLINE" };
  }

  function ksApplyFailure(failure, apiKey) {
    // Whatever went wrong, the board is no longer known.
    ksBoardVerifiedAt = 0;
    if (failure.kind === "hold") {
      ksSignInHold = { key: apiKey, word: failure.word };
      return;
    }
    if (failure.kind === "wait") {
      ksRetryAt = nowMs() + failure.waitMs;
      return;
    }
    const steps = KS_SERVER.retryStepsMs;
    ksRetryAt = nowMs() + steps[Math.min(ksRetryStep, steps.length - 1)];
    ksRetryStep += 1;
  }

  function ksNoteServerAnswered() {
    ksRetryAt = 0;
    ksRetryStep = 0;
  }

  // Null when a request may go out now, otherwise why it may not.
  function ksGate(apiKey) {
    if (nowMs() < ksRetryAt) return { kind: "wait", word: "SERVER OFFLINE" };
    if (
      ksSignInHold && ksSignInHold.key === apiKey &&
      !ksSessionReady(apiKey) && !ksManualSignInAllowed
    ) return { kind: "hold", word: ksSignInHold.word };
    return null;
  }

  // One sign-in at a time: a second caller shares the request in flight
  // instead of sending the key twice.
  async function ksSignIn(apiKey) {
    if (ksSignInPromise) {
      if (ksSignInPromiseKey === apiKey) return ksSignInPromise;
      return { ok: false, failure: { kind: "busy", word: "CHECKING" } };
    }
    const credentialEpoch = tornCredentialEpoch;
    ksSignInPromiseKey = apiKey;
    ksSignInPromise = (async () => {
      let result;
      try { result = await ksServerApiRequest(KS_SERVER.sessionPath, { apiKey }); }
      catch { result = { ok: false, status: 0, body: null }; }
      if (credentialEpoch !== tornCredentialEpoch || apiKey !== effectiveTornApiKey()) {
        return { ok: false, failure: { kind: "busy", word: "CHECKING" } };
      }
      const body = result.body;
      if (Number(result.status) === 200 && body && body.ok === true && typeof body.session === "string" && body.session) {
        const ttl = Number(body.sessionTtlSeconds);
        const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? ttl : KS_SERVER.sessionDefaultTtlSeconds;
        const margin = KS_SERVER.sessionRenewMarginSeconds;
        const usableSeconds = ttlSeconds > margin * 2 ? ttlSeconds - margin : ttlSeconds / 2;
        ksSessionToken = body.session;
        ksSessionKeyUsed = apiKey;
        ksSessionRenewAt = nowMs() + usableSeconds * 1000;
        ksSignInHold = null;
        // The backoff walk is reset by an answered request, not by the sign-in:
        // a server that signs in but refuses its own slip must not be asked
        // again every few seconds.
        ksRetryAt = 0;
        return { ok: true, fresh: true };
      }
      ksDropSession();
      const failure = ksClassifyFailure(result, true);
      ksApplyFailure(failure, apiKey);
      return { ok: false, failure };
    })();
    try { return await ksSignInPromise; }
    finally { ksSignInPromise = null; ksSignInPromiseKey = ""; }
  }

  async function ksEnsureSession(apiKey) {
    if (ksSessionReady(apiKey)) return { ok: true };
    const gate = ksGate(apiKey);
    if (gate) return { ok: false, failure: gate };
    // The one sign-in a press on Sync allowed is this one.
    ksManualSignInAllowed = false;
    return ksSignIn(apiKey);
  }

  function ksNotSent(kind, word) {
    return { ok: false, status: 0, body: null, ksNotSent: true, ksFailure: { kind, word } };
  }

  // Signs in when needed and sends one request for the war on screen. When
  // the server says the slip is no longer good (401 unauthorized: expired,
  // malformed, bad_signature) the slip is dropped, ONE new sign-in is made and
  // the request is sent ONE more time. Never a loop.
  // Never used in VIEW: the board, claims and reports belong to the own war.
  async function ksServerRequest(op, fields, { isCurrent = () => true } = {}) {
    if (viewOnlyMode()) return ksNotSent("view", "CHECKING");
    const apiKey = effectiveTornApiKey();
    if (!apiKey) return ksNotSent("no-key", "KEY REQUIRED");
    const gate = ksGate(apiKey);
    if (gate) return ksNotSent(gate.kind, gate.word);
    let result = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ensured = await ksEnsureSession(apiKey);
      if (!ensured.ok) return ksNotSent(ensured.failure.kind, ensured.failure.word);
      if (!isCurrent() || apiKey !== effectiveTornApiKey()) return ksNotSent("busy", "CHECKING");
      try {
        result = await ksServerApiRequest(ksWarPath(op), { session: ksSessionToken, ...fields });
      } catch {
        return ksNotSent("busy", "CHECKING");
      }
      const status = Number(result.status) || 0;
      const body = result.body;
      if (status === 401 && body && normalizeText(body.error) === "unauthorized") {
        ksDropSession();
        // A slip that was fetched for this very request and is refused at
        // once is not worth a second sign-in.
        if (attempt === 0 && ensured.fresh !== true) continue;
        const failure = { kind: "backoff", word: "SERVER OFFLINE" };
        ksApplyFailure(failure, apiKey);
        return { ...result, ksFailure: failure };
      }
      if (body && (status === 200 || status === 409)) {
        ksNoteServerAnswered();
        return result;
      }
      const failure = ksClassifyFailure(result, false);
      ksApplyFailure(failure, apiKey);
      return { ...result, ksFailure: failure };
    }
    return result;
  }

  // The panel line for a request that did not go through. One of the fixed
  // English lines; no HTTP code, no error code, no address.
  function ksFailureStatus(failure) {
    const word = failure?.word || "SERVER OFFLINE";
    if (word === "KEY REQUIRED") return { state: "key-required", message: "War Room: KEY REQUIRED — set your Torn API key" };
    if (word === "CHECKING") return { state: "syncing", message: "War Room: CHECKING…" };
    if (word === "SERVER OFFLINE") {
      const seconds = Math.ceil((ksRetryAt - nowMs()) / 1000);
      return {
        state: "offline",
        message: seconds > 0 ? `War Room: SERVER OFFLINE · retry in ${seconds}s` : "War Room: SERVER OFFLINE"
      };
    }
    return { state: "offline", message: `War Room: ${word}` };
  }

  // The few words that go after "claim failed" / "release failed".
  function ksFailureWords(failure) {
    const word = failure?.word || "SERVER OFFLINE";
    if (word === "KEY REQUIRED") return "Torn API key required";
    if (word === "KEY REJECTED") return "key rejected";
    if (word === "NOT A MEMBER") return "not a member";
    if (word === "CHECKING") return "try again";
    return "server offline";
  }

  // True while the claim board for the war on screen has not been read whole
  // and recently. A target is then never shown as free and cannot be claimed.
  function ksBoardUnknown() {
    if (!(ksBoardVerifiedAt > 0) || nowMs() - ksBoardVerifiedAt > KS_SERVER.boardMaxAgeMs) return true;
    try {
      return ksBoardWire !== wireWarId(currentWarSurface?.warId);
    } catch {
      return true;
    }
  }

  // A stable local id for a server claim, in the UUID shape isValidClaimId()
  // and sanitizeOwnClaim() already require. It is derived from the wire war
  // id, the target, the member and the server's EXACT claimedAt in
  // milliseconds, so the same server claim gets the same id whether it is read
  // from the board or from the answer to a claim. It is never sent anywhere.
  function ksDeterministicClaimId(wire, targetId, memberId, claimedAtMs) {
    const source = `ks-war-room:${wire}:${targetId}:${memberId}:${claimedAtMs}`;
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

  // The server knows a claimer only by Torn id. The name comes from the own
  // faction's member list; without it the line says #<Torn id>.
  function ksMemberDisplayName(memberId) {
    const id = String(memberId || "");
    if (id && id === String(selfPlayerId || "")) return selfPlayerName || "You";
    return ksMemberNames.get(id) || `#${id}`;
  }

  // THE ONE CONVERSION POINT. The server counts claimedAt and expiresAt in
  // MILLISECONDS; everything else in this file counts claim times in SECONDS
  // (expiresAt against nowSeconds()). A server claim becomes a queue entry
  // here and nowhere else, and no other code ever sees the milliseconds.
  // hospitalUntil is already in seconds on the server (Torn's status.until);
  // null means the claim carries no stored hospital time.
  // Returns null for a row that cannot be trusted.
  function ksClaimToQueueEntry(raw, wire) {
    if (!isPlainRecord(raw)) return null;
    const targetId = String(raw.targetId ?? "").trim();
    const memberId = String(raw.memberId ?? "").trim();
    const claimedAtMs = raw.claimedAt;
    const expiresAtMs = raw.expiresAt;
    if (targetId !== String(Number(targetId)) || !validTargetId(targetId)) return null;
    if (memberId !== String(Number(memberId)) || !validTargetId(memberId)) return null;
    // 1e11 ms is 1973; a value below it is not a millisecond timestamp.
    if (!Number.isSafeInteger(claimedAtMs) || claimedAtMs < 1e11) return null;
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= claimedAtMs) return null;
    const createdAt = Math.floor(claimedAtMs / 1000);
    const expiresAt = Math.floor(expiresAtMs / 1000);
    if (expiresAt <= createdAt) return null;
    const hospitalUntil = Number.isSafeInteger(raw.hospitalUntil) && raw.hospitalUntil >= 0
      ? raw.hospitalUntil
      : null;
    return {
      targetId,
      entry: {
        claimId: ksDeterministicClaimId(wire, targetId, memberId, claimedAtMs),
        position: 1,
        createdAt,
        expiresAt,
        hospitalUntil,
        claimer: { playerId: memberId, name: ksMemberDisplayName(memberId) }
      }
    };
  }

  // The claim board. The server keeps one owner per target and no queue, so
  // every target maps to a one-entry queue and the code written against a
  // queue keeps working unchanged.
  //
  // Fail closed. A single row that cannot be trusted voids the whole answer.
  // A target named in unreadable[] is unknown. degraded:true means the server
  // could not read everything, and which targets that hides is not known, so
  // every known target without a readable claim is unknown. The answer must
  // also be for the war that was asked about.
  function normalizeKsServerClaims(payload, wire) {
    if (!isPlainRecord(payload) || payload.ok !== true) return null;
    if (payload.warId !== wire) return null;
    if (!Array.isArray(payload.claims) || !Array.isArray(payload.unreadable) || typeof payload.degraded !== "boolean") return null;
    const claims = new Map();
    const unreadable = new Set();
    for (const raw of payload.claims) {
      const converted = ksClaimToQueueEntry(raw, wire);
      if (!converted || claims.has(converted.targetId)) return null;
      claims.set(converted.targetId, [converted.entry]);
    }
    let unreadableCount = 0;
    for (const raw of payload.unreadable) {
      unreadableCount += 1;
      const targetId = String((isPlainRecord(raw) ? raw.targetId : raw) ?? "").trim();
      if (validTargetId(targetId)) unreadable.add(String(Number(targetId)));
    }
    if (payload.degraded === true || unreadableCount > 0) {
      for (const id of knownOpponentTargetIds()) {
        if (!claims.has(id)) unreadable.add(id);
      }
      unreadableCount = Math.max(1, unreadableCount);
    }
    return { claims, unreadable, unreadableCount };
  }

  // Names of the key's own faction, for the claimer line. Torn
  // /v2/faction/members without an id is the key owner's own faction. At most
  // one request every five minutes, kept in memory only, never in VIEW.
  function normalizeKsMemberNames(payload) {
    if (!isPlainRecord(payload) || payload.error) return null;
    const source = payload.members;
    const entries = Array.isArray(source)
      ? source.map(member => ["", member])
      : isPlainRecord(source)
        ? Object.entries(source)
        : null;
    if (!entries) return null;
    const names = new Map();
    for (const [key, member] of entries) {
      if (!isPlainRecord(member)) continue;
      const rawId = String(member.id ?? member.player_id ?? key ?? "").trim();
      const name = normalizeText(member.name).slice(0, 32);
      if (validTargetId(rawId) && name) names.set(String(Number(rawId)), name);
    }
    return names;
  }

  async function fetchKsMemberNames() {
    if (viewOnlyMode() || !runtimeActive || !isRuntimeEligible() || ksMemberNamesSyncing) return false;
    const key = effectiveTornApiKey();
    if (!key || !keyScopeReady) return false;
    if (ksMemberNamesAttemptAt > 0 && nowMs() - ksMemberNamesAttemptAt < KS_SERVER.memberNamesRefreshMs) return false;
    ksMemberNamesAttemptAt = nowMs();
    ksMemberNamesSyncing = true;
    const credentialEpoch = tornCredentialEpoch;
    try {
      const result = await tornApiRequest(SCRIPT.tornOwnFactionMembersPath, key);
      if (credentialEpoch !== tornCredentialEpoch || key !== effectiveTornApiKey()) return false;
      if (!result?.ok || result.body?.error) return false;
      const names = normalizeKsMemberNames(result.body);
      if (!(names instanceof Map)) return false;
      ksMemberNames = names;
      return true;
    } catch {
      return false;
    } finally {
      ksMemberNamesSyncing = false;
    }
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

  async function tornApiRequest(path, key, { cacheBust = false, signal = null } = {}) {
    const isTargetBasic = /^\/v2\/user\/\d+\/basic$/.test(path);
    const isTargetProfile = /^\/v2\/user\/\d+\/profile$/.test(path);
    const isOwnFactionWars = path === SCRIPT.tornOwnWarsPath;
    const isOpponentMembers = /^\/v2\/faction\/\d+\/members$/.test(path);
    // 0.2.0: the key owner's own faction member list, for claimer names only.
    const isOwnFactionMembers = path === SCRIPT.tornOwnFactionMembersPath;
    if (
      path !== SCRIPT.tornKeyInfoPath &&
      !isTargetBasic &&
      !isTargetProfile &&
      !isOwnFactionWars &&
      !isOpponentMembers &&
      !isOwnFactionMembers
    ) {
      throw new Error("Blocked non-allowlisted Torn API endpoint");
    }
    const apiKey = validateTornApiKey(key);
    if (!apiKey) return { ok: false, status: 0, body: { error: { error: "API key required" } } };
    const url = new URL(path, SCRIPT.tornApiOrigin);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("comment", "KS_Torn_War_Dibs_PC_v116");
    if (cacheBust) url.searchParams.set("timestamp", String(nowMs()));
    const headers = cacheBust
      ? { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" }
      : { Accept: "application/json" };
    if (!reserveTornRequest()) return { ok: false, status: 0, body: { error: { error: "Local Torn request budget exhausted" } } };
    const result = await gmXhr({ method: "GET", url: url.toString(), headers, signal });
    recordTornClockFromHeaders(result);
    return { ...result, body: parseJsonSafe(result.responseText) };
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function normalizeSelfIdentity(payload) {
    if (!isPlainRecord(payload) || payload.error || !isPlainRecord(payload.info)) return null;
    const info = payload.info;
    if (!isPlainRecord(info.user)) return null;
    const user = info.user;
    if (
      !Object.prototype.hasOwnProperty.call(user, "id") ||
      !Object.prototype.hasOwnProperty.call(user, "faction_id") ||
      !Object.prototype.hasOwnProperty.call(user, "company_id") ||
      !isInt32(user.id, { positive: true }) ||
      !isInt32(user.faction_id, { positive: true }) ||
      (user.company_id !== null && !isInt32(user.company_id, { positive: true }))
    ) return null;

    const id = String(user.id);
    const factionId = String(user.faction_id);
    for (const source of [user.faction, info.faction]) {
      if (source === undefined) continue;
      if (!isPlainRecord(source) || !isInt32(source.id, { positive: true }) || String(source.id) !== factionId) return null;
    }

    return {
      playerId: id,
      playerName: normalizeText(user.name),
      factionId
    };
  }

  function tornErrorMessage(result, fallback) {
    const detail = result?.body?.error;
    const apiCode = Number(
      detail && typeof detail === "object" && !Array.isArray(detail) ? detail.code : NaN
    );
    if (Number.isSafeInteger(apiCode) && apiCode >= 0) return `${fallback} (API ${apiCode})`;
    const status = Number(result?.status);
    return Number.isInteger(status) && status > 0 ? `${fallback} (HTTP ${status})` : fallback;
  }

  function operationalWarSurfaceForFaction(factionId) {
    if (!validTargetId(factionId) || !isRankedWarRoute()) return null;
    const selfId = String(Number(factionId));
    const roots = [...document.querySelectorAll("#faction_war_list_id")]
      .filter(root => root instanceof HTMLElement && isRenderedRouteSurfaceElement(root));
    if (roots.length !== 1) return null;
    const root = roots[0];
    const enemySurface = root.querySelector(".enemy-faction");
    if (!(enemySurface instanceof HTMLElement) || !isRenderedRouteSurfaceElement(enemySurface)) return null;
    const cards = [...root.querySelectorAll("div[data-warid]")].filter(card => (
      card instanceof HTMLElement &&
      isRenderedRouteSurfaceElement(card) &&
      validTargetId(card.dataset.warid) &&
      cardFactionIds(card).length === 2
    ));
    if (cards.length !== 1) return null;
    const card = cards[0];
    const factionIds = cardFactionIds(card);
    if (!factionIds.includes(selfId)) return null;
    const opponentId = factionIds.find(id => id !== selfId) || "";
    if (!validTargetId(opponentId)) return null;
    return {
      card,
      root,
      warId: String(Number(card.dataset.warid)),
      opponentFactionId: String(Number(opponentId)),
      selfFactionId: selfId,
      surfaceSerial: 1
    };
  }

  function operationalWarSurfaceMatches(expected) {
    const current = operationalWarSurfaceForFaction(expected?.selfFactionId);
    return Boolean(
      current &&
      current.card === expected.card &&
      current.root === expected.root &&
      current.warId === expected.warId &&
      current.opponentFactionId === expected.opponentFactionId &&
      current.selfFactionId === expected.selfFactionId
    );
  }

  function normalizeSelfBasicCapability(payload, expectedPlayerId) {
    if (!isPlainRecord(payload) || payload.error || !isPlainRecord(payload.profile)) return false;
    return Boolean(
      isInt32(payload.profile.id, { positive: true }) &&
      String(payload.profile.id) === String(expectedPlayerId)
    );
  }

  async function verifyTornOperationalCapabilities({ key, identity, force, isCurrent }) {
    const surface = operationalWarSurfaceForFaction(identity.factionId);
    if (!surface) throw new Error("Ranked War opponent unavailable for capability check");
    const operationCurrent = () => {
      if (!isCurrent()) return false;
      if (!operationalWarSurfaceMatches(surface)) {
        throw new Error("Ranked War surface changed during capability check");
      }
      return true;
    };
    const readCapability = async (path, label) => {
      if (!operationCurrent()) return null;
      const result = await tornApiRequest(path, key, { cacheBust: force });
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

    const membersResult = await readCapability(
      `/v2/faction/${surface.opponentFactionId}/members`,
      "opponent members"
    );
    if (!membersResult) return null;
    const members = normalizeTornMembers(membersResult.body);
    if (!(members instanceof Map)) {
      throw new Error("opponent members capability response malformed");
    }

    const basicResult = await readCapability(
      `/v2/user/${identity.playerId}/basic`,
      "user basic"
    );
    if (!basicResult) return null;
    if (!normalizeSelfBasicCapability(basicResult.body, identity.playerId)) {
      throw new Error("user basic capability response malformed");
    }

    return {
      surface,
      warsResult,
      warsFetchedAt,
      members,
      membersFetchedAt: Number(membersResult.endedAt) || nowMs()
    };
  }

  async function fetchSelfIdentity({ force = false } = {}) {
    const key = effectiveTornApiKey();
    if (!key || selfIdentitySyncing) return false;
    if (!force && validTargetId(selfPlayerId) && validTargetId(selfFactionId) && keyScopeReady) return true;
    if (!force && selfIdentityLastAttemptAt > 0 && nowMs() - selfIdentityLastAttemptAt < 30000) return false;

    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++selfIdentityRequestSerial;
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
      const operational = await verifyTornOperationalCapabilities({
        key,
        identity,
        force,
        isCurrent: isCurrentRequest
      });
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
      const committedWars = normalizeOwnWars(
        operational.warsResult.body,
        operational.warsFetchedAt,
        committedSurface
      );
      if (!committedWars) throw new Error("faction wars capability response malformed");
      recordTornClockOffset(operational.warsResult, operational.warsResult.body);
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
      void fetchFairFightStats();
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        keyScopeReady = false;
        selfPlayerId = "";
        selfPlayerName = "";
        selfFactionId = "";
        opponentFactionId = "";
        invalidateOwnWarsState();
        opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
        setTornStatusState("error", `Torn: ${normalizeText(error?.message) || "key validation failed"}`, 0);
        scanWarRows();
        updatePanel();
      }
      return false;
    } finally {
      if (
        requestSerial === selfIdentityRequestSerial &&
        credentialEpoch === tornCredentialEpoch &&
        key === effectiveTornApiKey()
      ) {
        selfIdentitySyncing = false;
      }
    }
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
    const status = freshOpponentStatusForTarget(targetId);
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
          updateBoundControls();
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
          updateBoundControls();
          return null;
        }
        if (!result?.ok || result.body?.error) return null;
        // The start time is conservative: a delayed response cannot gain freshness.
        const entry = normalizeTargetLife(result.body, id, startedAt);
        if (!entry || (lifeCache.get(id)?.fetchedAt ?? -Infinity) > entry.fetchedAt) return null;
        lifeCache.set(id, entry);
        updatePanel();
        updateBoundControls();
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

  // ---------------------------------------------------------------------------
  // Shared claim board (KS War Room server; see normalizeKsServerClaims)
  // ---------------------------------------------------------------------------

  function findSharedClaimById(claimId) {
    if (!isValidClaimId(claimId)) return null;
    for (const [targetId, queue] of sharedClaims.entries()) {
      const claim = Array.isArray(queue) ? queue.find(item => item?.claimId === claimId) : null;
      if (claim) return { targetId, claim, queue };
    }
    return null;
  }

  function sharedClaimForTarget(playerId) {
    const queue = sharedClaims.get(String(playerId || ""));
    if (!Array.isArray(queue) || !queue.length) return null;
    const active = queue.filter(claim => claim.expiresAt > nowSeconds());
    return active.length ? { first: active[0], queue: active } : null;
  }

  // Puts one server claim on the local board at once, without waiting for the
  // next poll. `entry` is a queue entry from ksClaimToQueueEntry (seconds).
  // The server keeps one owner per target, so the entry replaces the queue.
  function upsertImmediateSharedClaim(targetId, entry) {
    const id = String(targetId || "");
    if (!validTargetId(id) || !isValidClaimId(entry?.claimId) || !/^\d+$/.test(String(entry?.claimer?.playerId ?? "")) || !entry.claimer.name || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.expiresAt)) return;
    sharedClaims.set(id, [entry]);
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
    if (currentOwnClaim() || !/^\d+$/.test(selfPlayerId)) return false;
    const matches = activeSharedClaimsForClaimer(selfPlayerId);
    if (matches.length !== 1) return false;
    const { targetId, claim } = matches[0];
    if (!validTargetId(targetId) || !isValidClaimId(claim?.claimId)) return false;
    saveOwnClaim({
      claimId: claim.claimId,
      targetId,
      claimerPlayerId: selfPlayerId,
      claimerName: normalizeText(claim?.claimer?.name) || selfPlayerName || "You",
      expiresAt: claim.expiresAt,
      cleanupRequired: Number(claim?.position) > 1,
      createdLocalAt: nowMs()
    });
    ownClaimMissingReads = 0;
    ownClaimLastConfirmedAt = nowMs();
    return true;
  }

  function reconcileOwnClaimFromShared() {
    let own = currentOwnClaim();
    if (!own) {
      adoptSingleOwnServerClaim();
      own = currentOwnClaim();
    }
    if (!own) { ownClaimMissingReads = 0; ownClaimLastConfirmedAt = 0; return; }
    const found = findSharedClaimById(own.claimId);
    if (found) {
      ownClaimMissingReads = 0;
      ownClaimLastConfirmedAt = nowMs();
      saveOwnClaim({ ...own, targetId: found.targetId, claimerPlayerId: found.claim.claimer.playerId, claimerName: found.claim.claimer.name, expiresAt: found.claim.expiresAt });
      return;
    }
    ownClaimMissingReads += 1;
    const localAgeMs = Math.max(0, nowMs() - Number(own.createdLocalAt || 0));
    const sinceConfirmedMs = ownClaimLastConfirmedAt > 0 ? nowMs() - ownClaimLastConfirmedAt : localAgeMs;
    if (ownClaimMissingReads >= CONFIG.ownClaimMissingReadThreshold && sinceConfirmedMs >= CONFIG.ownClaimMissingGraceMs && (sharedStatus.state === "online" || sharedStatus.state === "degraded")) {
      saveOwnClaim(null);
      ownClaimMissingReads = 0;
      ownClaimLastConfirmedAt = 0;
    }
  }

  // A write that failed must stay readable. Without the hold, the shared poll
  // that runs immediately after a failed claim overwrites the message inside a
  // few tens of milliseconds and the failure is invisible.
  //
  // Only routine progress is suppressed: a newer error always wins, and
  // beginSharedWriteFeedback clears the hold so the owner's next click reports
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
      // Keep the failure on screen, but do not lose the target count.
      sharedStatus = { ...sharedStatus, count: Number.isInteger(count) && count >= 0 ? count : sharedStatus.count };
      updatePanel();
      return;
    }
    sharedStatus = { state: next, message: normalizeText(message) || "War Room: CHECKING…", count: Number.isInteger(count) && count >= 0 ? count : 0 };
    updatePanel();
  }

  // Reads the claim board of the war on screen from the KS War Room server
  // (POST /war/<wire id>/claims). Gated on the Torn key: the FFScouter key has
  // nothing to do with DIBS any more. The generation / epoch / serial guards
  // are the ones 1.1.9 had.
  //
  // Anything but a whole, trusted board is "don't know": the last good claims
  // stay on screen as TAKEN, ksBoardUnknown() turns true, and no target is
  // shown as free or can be claimed until the board has been read again.
  async function fetchSharedClaims() {
    if (!runtimeActive || !isRuntimeEligible() || !bridgeMounted || !isWarPanelPresent()) return false;
    // VIEW never reads the board through this path: no sharedClaims, no
    // reconcile, no own record. 1.1.9 refused the request at the transport.
    if (viewOnlyMode()) return false;
    if (
      ffCredentialChangeState === FF_CREDENTIAL_STATE.SAVING ||
      ffCredentialChangeState === FF_CREDENTIAL_STATE.FORGETTING
    ) return false;
    const requestKey = effectiveTornApiKey();
    if (!requestKey) {
      ksBoardVerifiedAt = 0;
      setSharedStatus("key-required", "War Room: KEY REQUIRED — set your Torn API key", 0);
      return false;
    }
    if (sharedSyncing) return false;
    const gate = ksGate(requestKey);
    if (gate) {
      // Nothing is sent. Keep the line current (the seconds count down).
      ksBoardVerifiedAt = 0;
      const gated = ksFailureStatus(gate);
      setSharedStatus(gated.state, gated.message);
      return false;
    }
    let requestWire = "";
    try { requestWire = wireWarId(ksWarIdOnScreen()); } catch { return false; }
    const generation = runtimeGeneration;
    const authorityEpoch = sharedAuthorityEpoch;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++sharedRequestSerial;
    sharedSyncing = true;
    const requestStillOwned = () => (
      generation === runtimeGeneration &&
      authorityEpoch === sharedAuthorityEpoch &&
      requestSerial === sharedRequestSerial &&
      credentialEpoch === tornCredentialEpoch &&
      requestKey === effectiveTornApiKey()
    );
    const isCurrentRequest = () => (
      requestStillOwned() &&
      runtimeActive &&
      isRuntimeEligible() &&
      isWarPanelPresent() &&
      !viewOnlyMode()
    );
    if (ksBoardUnknown()) setSharedStatus("syncing", "War Room: CHECKING…");
    // R4 (0.2.1): the only thing the catch below may show. It is set from
    // ksFailureStatus and nowhere else, so the text of an error thrown by
    // anything in this block can never reach the War Room line.
    let failureStatus = null;
    try {
      const result = await ksServerRequest("claims", {}, { isCurrent: isCurrentRequest });
      if (!isCurrentRequest()) return false;
      if (result?.ksNotSent || result?.ksFailure || Number(result?.status) !== 200) {
        failureStatus = ksFailureStatus(result?.ksFailure);
        throw new Error("claim board not read");
      }
      let currentWire = "";
      try { currentWire = wireWarId(ksWarIdOnScreen()); } catch { currentWire = ""; }
      const normalized = currentWire === requestWire ? normalizeKsServerClaims(result.body, requestWire) : null;
      if (!normalized) {
        // Answered, but not with a board that can be trusted.
        const failure = { kind: "backoff", word: "SERVER OFFLINE" };
        ksApplyFailure(failure, requestKey);
        failureStatus = ksFailureStatus(failure);
        throw new Error("claim board not trusted");
      }
      sharedClaims = normalized.claims;
      sharedClaimsUnreadable = normalized.unreadable;
      ksBoardVerifiedAt = nowMs();
      ksBoardWire = requestWire;
      // The unreadable count is never hidden. A partial list that looks complete
      // is worse than an offline one, because it reads as "these targets are free".
      const unreadableCount = normalized.unreadableCount;
      setSharedStatus(
        unreadableCount ? "degraded" : "online",
        unreadableCount
          ? `War Room: SIGNED IN · ${sharedClaims.size} targets · ${unreadableCount} unreadable`
          : `War Room: SIGNED IN · ${sharedClaims.size} targets`,
        sharedClaims.size
      );
      reconcileOwnClaimFromShared();
      updateBoundControls();
      return true;
    } catch {
      if (requestStillOwned() && runtimeActive) {
        ksBoardVerifiedAt = 0;
        // Any error that did not come from ksFailureStatus reads SERVER OFFLINE.
        setSharedStatus(
          failureStatus ? failureStatus.state : "offline",
          failureStatus ? failureStatus.message : "War Room: SERVER OFFLINE"
        );
        updateBoundControls();
      }
      return false;
    } finally {
      // This read is over. 1.1.9 also required the authority epoch to be
      // unchanged here, so a read that was in flight when a claim or release
      // succeeded (they bump the epoch) left sharedSyncing true for good and
      // the board was never read again until the window lost focus.
      if (requestSerial === sharedRequestSerial) sharedSyncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FF / Est come from FFScouter's get-stats API (fairFightStats below). The
  // row is only used to find the target id; nothing is read from FF Scouter
  // V2's row attributes and this script does not require it on the page.
  // ---------------------------------------------------------------------------

  // decisionForBinding passes binding.row (the li), the presentation path
  // passes the binding itself. Both resolve to the same bound target id.
  function rowTargetIdForStats(row) {
    if (validTargetId(row?.targetId)) return String(Number(row.targetId));
    const li = row?.li instanceof HTMLElement ? row.li : row instanceof HTMLElement ? row : null;
    const binding = li ? rowBindings.get(li) : null;
    return validTargetId(binding?.targetId) ? String(Number(binding.targetId)) : "";
  }

  function readRowFairFight(row) {
    return fairFightForTarget(rowTargetIdForStats(row));
  }

  // The freshest status we have for a target, from whichever batch applies.
  // Returns null when nothing fresh is available, which is what keeps the
  // takeover fail-safe.
  function freshApiStatusForTarget(targetId) {
    return (viewOnlyMode() ? viewMemberStatusForTarget(targetId) : null) ||
      freshOpponentStatusForTarget(targetId);
  }

  function viewMemberStatusForTarget(targetId) {
    const id = String(targetId || "");
    if (!validTargetId(id)) return null;
    if (viewMembersState.factionIds.length === 0) return null;
    if (
      !Number.isFinite(viewMembersState.fetchedAt) ||
      nowMs() - viewMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs
    ) return null;
    return viewMembersState.members.get(id) || null;
  }

  const STATUS_LABELS = Object.freeze([
    [/hospital/i, "Hospital", "hospital"],
    [/jail/i, "Jail", "jail"],
    [/travel|abroad|flying|returning/i, "Traveling", "travel"],
    [/federal|fedded/i, "Federal", "jail"],
    [/okay|ok\b/i, "Okay", "okay"]
  ]);

  function statusPresentation(status) {
    // An expired hospital record renders as Okay, not as a frozen Hospital.
    if (hospitalUntilExpired(status?.until) && /hospital/i.test(`${status?.state || ""}`)) {
      return { label: "Okay", tone: "okay" };
    }
    const text = `${status?.state || ""} ${status?.description || ""}`;
    for (const [pattern, label, tone] of STATUS_LABELS) {
      if (pattern.test(text)) return { label, tone };
    }
    const state = normalizeText(status?.state);
    return state ? { label: state, tone: "other" } : null;
  }

  function readRowBattleStatsEstimate(row) {
    return scoutStatsForTarget(rowTargetIdForStats(row))?.bsEstimate ?? null;
  }

  function formatBattleStats(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "";
    if (number >= 1e9) return `${(number / 1e9).toFixed(number >= 1e10 ? 0 : 1)}b`;
    if (number >= 1e6) return `${(number / 1e6).toFixed(number >= 1e7 ? 0 : 1)}m`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(number >= 1e4 ? 0 : 1)}k`;
    return String(Math.round(number));
  }

  // There is no FFScouter column to complement here. The cell always shows FF,
  // the value the DIBS gate acts on, and nothing at all when FF is missing.
  function complementaryRowValue(binding) {
    const fairFight = readRowFairFight(binding);
    return Number.isFinite(fairFight) ? `FF${Number(fairFight).toFixed(1)}` : "";
  }

  function rowValueTooltip(binding) {
    const fairFight = readRowFairFight(binding);
    const estimate = readRowBattleStatsEstimate(binding);
    const parts = [];
    if (Number.isFinite(fairFight)) parts.push(`Fair Fight ${Number(fairFight).toFixed(2)}`);
    if (Number.isFinite(estimate)) parts.push(`Est ${formatBattleStats(estimate)}`);
    return parts.join(" \u00b7 ");
  }

  // ---------------------------------------------------------------------------
  // FF / Est stats from FFScouter's get-stats API. Ported from PDA v1.5.167;
  // the only edits are the roster-presence check (canonicalRankedWarSurface),
  // the target source (rowBindings) and the three panel status lines.
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
    for (const binding of rowBindings.values()) {
      if (validTargetId(binding?.targetId)) ids.add(String(Number(binding.targetId)));
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
    const requestRoot = canonicalRankedWarSurface()?.root || null;
    const requestSerial = ++fairFightRequestSerial;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      requestSerial === fairFightRequestSerial &&
      requestKey === sharedApiKey &&
      requestRoot === (canonicalRankedWarSurface()?.root || null) &&
      runtimeActive &&
      isRuntimeEligible() &&
      bridgeMounted &&
      isWarPanelPresent()
    );
    fairFightSyncing = true;
    setFairFightStatus("syncing", "FF: syncing…");
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
      const usableCount = [...fetchedStats.values()].filter(entry => !entry.noData).length;
      setFairFightStatus("online", `FF: ${usableCount} of ${targetIds.length} targets`);
      scanWarRows();
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        // Keep the values we have; each one expires on its own after
        // fairFightMaxAgeMs. Retry on the next timer tick.
        if (!missingOnly) fairFightLastFetchAt = 0;
        setFairFightStatus("offline", `FF: offline · ${normalizeText(error?.message) || "request failed"}`);
        scanWarRows();
      }
      return false;
    } finally {
      if (requestSerial === fairFightRequestSerial && requestKey === sharedApiKey) fairFightSyncing = false;
    }
  }

  function setFairFightStatus(state, message) {
    fairFightStatus = { state: String(state || "unknown"), message: normalizeText(message) || "FF: unknown" };
    updatePanel();
  }

  // ---------------------------------------------------------------------------
  // Torn own-faction Ranked War state
  // ---------------------------------------------------------------------------

  function setTornStatusState(state, message, count = 0) {
    tornStatusState = { state: String(state || "unknown"), message: normalizeText(message) || "Torn: unknown", count: Number.isInteger(count) && count >= 0 ? count : 0 };
    updatePanel();
  }

  function isInt32(value, { positive = false, nonNegative = false } = {}) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) return false;
    if (positive && value <= 0) return false;
    if (nonNegative && value < 0) return false;
    return true;
  }

  function normalizeRankedWarParticipants(factions) {
    if (!Array.isArray(factions) || factions.length !== 2) return null;
    const participants = new Map();
    for (const faction of factions) {
      if (!faction || typeof faction !== "object" || Array.isArray(faction)) return null;
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
      participants.set(id, {
        id,
        name: normalizeText(faction.name),
        score: faction.score,
        chain: faction.chain
      });
    }
    return participants;
  }

  function normalizeOwnWars(payload, fetchedAt = nowMs(), surface = null) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) return null;
    if (
      !surface ||
      !validTargetId(surface.warId) ||
      !validTargetId(surface.opponentFactionId) ||
      !validTargetId(surface.selfFactionId) ||
      !Number.isInteger(surface.surfaceSerial) ||
      surface.surfaceSerial <= 0
    ) return null;
    const wars = payload.wars;
    if (!wars || typeof wars !== "object" || Array.isArray(wars) || !Object.prototype.hasOwnProperty.call(wars, "ranked")) return null;
    const ranked = wars.ranked;
    if (ranked === null) return emptyOwnWarsState(fetchedAt, surface);
    if (!ranked || typeof ranked !== "object" || Array.isArray(ranked)) return null;
    for (const field of ["war_id", "start", "end", "target", "winner", "factions"]) {
      if (!Object.prototype.hasOwnProperty.call(ranked, field)) return null;
    }
    if (
      !isInt32(ranked.war_id, { positive: true }) ||
      !isInt32(ranked.start, { positive: true }) ||
      !isInt32(ranked.target, { positive: true })
    ) return null;
    const end = ranked.end;
    if (end !== null && !isInt32(end, { positive: true })) return null;
    if (end !== null && end <= ranked.start) return null;

    const participants = normalizeRankedWarParticipants(ranked.factions);
    const selfId = String(Number(surface.selfFactionId));
    const opponentId = String(Number(surface.opponentFactionId));
    if (!participants || !participants.has(selfId) || !participants.has(opponentId)) return null;
    const winner = ranked.winner;
    if (winner !== null && (!isInt32(winner, { positive: true }) || !participants.has(String(winner)))) return null;
    if (winner !== null && end === null) return null;

    const warId = String(ranked.war_id);
    if (warId !== String(Number(surface.warId))) return null;
    const responseTimestamp = Number(payload.timestamp);
    const authoritativeNow = Number.isSafeInteger(responseTimestamp) && responseTimestamp > 0
      ? responseTimestamp
      : Math.floor(getTornNowMs() / 1000);
    const live = winner === null && authoritativeNow >= ranked.start && (end === null || authoritativeNow < end);
    return {
      live,
      warId,
      opponentFactionId: opponentId,
      selfFactionId: selfId,
      surfaceWarId: String(Number(surface.warId)),
      surfaceOpponentFactionId: opponentId,
      surfaceSerial: surface.surfaceSerial,
      fetchedAt
    };
  }

  function recordTornClockOffset(result, body) {
    const timestamp = Number(body?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    // Same whole-second evidence as the Date header, from the body instead.
    // Torn reports the floor of its clock, so the value names the second start.
    recordTornWholeSecondMs(timestamp * 1000, Number(result.startedAt), Number(result.endedAt));
  }

  async function tornReadWithTransportRetry(path, key, { cacheBust = false, isCurrent = () => true } = {}) {
    let result = null;
    for (let attempt = 0; attempt <= CONFIG.tornTransportRetryAttempts; attempt += 1) {
      if (!isCurrent()) return result;
      result = await tornApiRequest(path, key, { cacheBust });
      if (!isCurrent()) return result;
      if (result.ok || result.status !== 0 || attempt >= CONFIG.tornTransportRetryAttempts) break;
      await wait(CONFIG.tornTransportRetryDelayMs * (attempt + 1));
      if (!isCurrent()) return result;
    }
    return result;
  }

  async function fetchOwnWars({ force = false } = {}) {
    const key = effectiveTornApiKey();
    if (!key || !keyScopeReady || !validTargetId(selfFactionId) || !runtimeActive || !isRuntimeEligible()) return false;
    const surface = captureCurrentWarSurface();
    if (!surface) return false;
    if (
      !force &&
      ownWarsStateMatchesSurface(surface) &&
      nowMs() - ownWarsState.fetchedAt < CONFIG.tornStatusPollMs
    ) return true;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++ownWarsRequestSerial;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      credentialEpoch === tornCredentialEpoch &&
      requestSerial === ownWarsRequestSerial &&
      key === effectiveTornApiKey() &&
      runtimeActive &&
      isRuntimeEligible() &&
      currentWarSurfaceMatchesSnapshot(surface)
    );
    try {
      const result = await tornReadWithTransportRetry(SCRIPT.tornOwnWarsPath, key, {
        cacheBust: force,
        isCurrent: isCurrentRequest
      });
      if (
        generation !== runtimeGeneration ||
        credentialEpoch !== tornCredentialEpoch ||
        key !== effectiveTornApiKey() ||
        !runtimeActive ||
        !isRuntimeEligible()
      ) return false;
      refreshCurrentWarSurface();
      if (
        requestSerial !== ownWarsRequestSerial ||
        !currentWarSurfaceMatchesSnapshot(surface)
      ) return false;
      if (!result?.ok || result.body?.error) return false;
      const fetchedAt = Number(result.endedAt) || nowMs();
      recordTornClockOffset(result, result.body);
      const next = normalizeOwnWars(result.body, fetchedAt, surface);
      if (!next) {
        ownWarsState = emptyOwnWarsState(fetchedAt, surface);
        return false;
      }
      ownWarsState = next;
      return true;
    } catch {
      return false;
    }
  }

  function normalizeTornMemberStatus(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const state = normalizeText(source.state);
    const description = normalizeText(source.description);
    const details = normalizeText(source.details);
    const rawUntil = source.until;
    let until = null;
    if (rawUntil !== null && rawUntil !== undefined && rawUntil !== "") {
      const numericUntil = Number(rawUntil);
      if (!Number.isSafeInteger(numericUntil) || numericUntil < 0) return null;
      until = numericUntil;
    }
    if (!state && !description && !details && until === null) return null;
    return { state, description, details, until };
  }

  function normalizeTornMembers(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.error) return null;
    const source = payload.members;
    const entries = Array.isArray(source)
      ? source.map(member => ["", member])
      : source && typeof source === "object"
        ? Object.entries(source)
        : null;
    if (!entries) return null;
    const members = new Map();
    for (const [key, member] of entries) {
      if (!member || typeof member !== "object" || Array.isArray(member)) continue;
      const rawId = String(member.id ?? member.player_id ?? key ?? "").trim();
      const id = validTargetId(rawId) ? String(Number(rawId)) : "";
      const status = normalizeTornMemberStatus(member.status);
      const action = member.last_action;
      const rawActivity = typeof action?.status === "string" ? action.status.trim().toLowerCase() : "";
      const activity = ["online", "idle", "offline"].includes(rawActivity) ? rawActivity : null;
      const activityTimestamp = Number.isInteger(action?.timestamp) ? action.timestamp : null;
      if (id && status) members.set(id, { ...status, activity, activityTimestamp });
    }
    return members;
  }

  async function fetchOpponentMembers({ force = false } = {}) {
    const roster = mountedRosterRoot?.isConnected ? mountedRosterRoot : document.getElementById("faction_war_list_id");
    if (!(roster instanceof HTMLElement)) return true;
    refreshCurrentWarSurface();
    const key = effectiveTornApiKey();
    const factionId = opponentFactionId;
    if (!key || !keyScopeReady || !validTargetId(factionId) || !runtimeActive || !isRuntimeEligible()) return false;
    if (
      !force &&
      opponentMembersState.factionId === factionId &&
      nowMs() - opponentMembersState.fetchedAt < CONFIG.tornStatusPollMs
    ) return true;
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const isCurrentRequest = () => (
      generation === runtimeGeneration &&
      credentialEpoch === tornCredentialEpoch &&
      key === effectiveTornApiKey() &&
      factionId === opponentFactionId &&
      runtimeActive &&
      isRuntimeEligible()
    );
    try {
      const result = await tornReadWithTransportRetry(`/v2/faction/${factionId}/members`, key, {
        cacheBust: force,
        isCurrent: isCurrentRequest
      });
      if (
        generation !== runtimeGeneration ||
        credentialEpoch !== tornCredentialEpoch ||
        key !== effectiveTornApiKey() ||
        factionId !== opponentFactionId ||
        !runtimeActive ||
        !isRuntimeEligible()
      ) return false;
      if (!result?.ok || result.body?.error) return false;
      const members = normalizeTornMembers(result.body);
      if (!(members instanceof Map)) return false;
      opponentMembersState = {
        factionId,
        members,
        fetchedAt: Number(result.endedAt) || nowMs()
      };
      return true;
    } catch {
      return false;
    }
  }

  async function fetchTornStatuses({ force = false } = {}) {
    if (!runtimeActive || !isRuntimeEligible()) return false;
    const key = effectiveTornApiKey();
    if (!key || tornStatusSyncing || (!force && nowMs() < tornStatusBackoffUntil)) return false;
    if (!validTargetId(selfPlayerId) || !validTargetId(selfFactionId) || !keyScopeReady) {
      setTornStatusState("identity", "Torn: checking key identity...");
      const identityReady = await fetchSelfIdentity({ force });
      return identityReady ? fetchTornStatuses({ force: false }) : false;
    }
    const generation = runtimeGeneration;
    const credentialEpoch = tornCredentialEpoch;
    const requestSerial = ++tornStatusRequestSerial;
    tornStatusSyncing = true;
    setTornStatusState("syncing", "Torn: syncing…");
    const isCurrentRequest = () => (
      requestSerial === tornStatusRequestSerial &&
      credentialEpoch === tornCredentialEpoch &&
      generation === runtimeGeneration &&
      key === effectiveTornApiKey() &&
      runtimeActive &&
      isRuntimeEligible()
    );
    try {
      const ownWarsReady = await fetchOwnWars({ force });
      if (!isCurrentRequest()) return false;
      if (!ownWarsReady) throw new Error("own faction wars unavailable");
      const membersReady = await fetchOpponentMembers({ force });
      if (!isCurrentRequest()) return false;
      tornStatusBackoffUntil = 0;
      tornTransportFailureStreak = 0;
      const memberCount = membersReady && opponentMembersState.factionId === opponentFactionId
        ? opponentMembersState.members.size
        : 0;
      const activityCount = memberCount > 0
        ? [...opponentMembersState.members.values()].filter(member => member.activity !== null).length
        : 0;
      const rwLabel = ownWarsState.live ? "LIVE" : "not confirmed";
      const memberLabel = document.getElementById("faction_war_list_id")
        ? (membersReady ? ` · ${memberCount} members · activity ${activityCount}/${memberCount}` : " · members unavailable")
        : "";
      setTornStatusState(membersReady ? "ready" : "error", `Torn: own RW ${rwLabel}${memberLabel}`, memberCount);
      updateBoundControls();
      if (membersReady) {
        void fetchFairFightStats();
        void runLifeReadQueue();
        // 0.2.0: off the Torn reading this call just produced -- the hospital
        // report for claims on the board, and (at most every 5 minutes) the
        // own faction's member names. Neither runs in VIEW.
        void reportHospitalUpdatesToKsServer();
        void fetchKsMemberNames();
      }
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        tornTransportFailureStreak += 1;
        tornStatusBackoffUntil = nowMs() + CONFIG.tornStatusErrorBackoffMs;
        setTornStatusState("error", `Torn: ${normalizeText(error?.message) || "offline"}`, 0);
      }
      return false;
    } finally {
      if (
        requestSerial === tornStatusRequestSerial &&
        credentialEpoch === tornCredentialEpoch &&
        key === effectiveTornApiKey()
      ) tornStatusSyncing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Torn war rows / hospital state
  // ---------------------------------------------------------------------------

  function parseHospitalSecondsFromText(text) {
    const value = normalizeText(text);
    const units = Object.freeze({
      d: 86400,
      day: 86400,
      days: 86400,
      h: 3600,
      hour: 3600,
      hours: 3600,
      m: 60,
      minute: 60,
      minutes: 60,
      s: 1,
      second: 1,
      seconds: 1
    });
    const pattern = /(\d+)\s*(days?|d|hours?|h|minutes?|m|seconds?|s)\b/gi;
    let total = 0;
    let matched = false;
    for (const match of value.matchAll(pattern)) {
      const amount = Number(match[1]);
      const multiplier = units[String(match[2] || "").toLowerCase()];
      if (!Number.isSafeInteger(amount) || !Number.isFinite(multiplier)) return null;
      total += amount * multiplier;
      matched = true;
    }
    return matched && Number.isFinite(total) && total >= 0 ? total : null;
  }

  function isHospitalStatusValue(value) { return /hospital/i.test(normalizeText(value)); }

  let viewMembersState = { factionIds: [], members: new Map(), fetchedAt: 0 };
  let viewMembersInFlight = false;

  function viewMembersCoverCurrentPage() {
    const permitted = viewPermittedFactionIds();
    if (permitted.length === 0) return false;
    return permitted.every(id => viewMembersState.factionIds.includes(id));
  }

  // Reads the members batch for every faction rendered on the current war card
  // and merges them. The column mounts on li.enemy, which is not necessarily the
  // profile faction, so fetching only the URL faction resolved nothing.
  async function fetchViewMembers({ force = false } = {}) {
    if (!viewOnlyMode() || viewMembersInFlight) return false;
    const key = effectiveTornApiKey();
    const factionIds = viewPermittedFactionIds();
    if (!key || factionIds.length === 0 || !runtimeActive || !isRuntimeEligible()) return false;
    if (
      !force &&
      viewMembersCoverCurrentPage() &&
      nowMs() - viewMembersState.fetchedAt < CONFIG.tornStatusPollMs
    ) return true;
    viewMembersInFlight = true;
    try {
      const stillCurrent = () =>
        viewOnlyMode() &&
        runtimeActive &&
        factionIds.every(id => viewPermittedFactionIds().includes(id));
      const merged = new Map();
      const fetched = [];
      for (const factionId of factionIds) {
        if (!stillCurrent()) return false;
        const result = await tornReadWithTransportRetry(
          `/v2/faction/${factionId}/members`,
          key,
          { isCurrent: stillCurrent }
        );
        if (!stillCurrent()) return false;
        if (!result?.ok || result.body?.error) continue;
        const members = normalizeTornMembers(result.body);
        if (!(members instanceof Map)) continue;
        for (const [id, status] of members) merged.set(id, status);
        fetched.push(factionId);
      }
      if (fetched.length === 0) {
        setTornStatusState("error", "Torn: VIEW status unavailable", 0);
        return false;
      }
      viewMembersState = { factionIds: fetched, members: merged, fetchedAt: nowMs() };
      setTornStatusState(
        "online",
        `Torn: VIEW ${merged.size} members / ${fetched.length} factions`,
        merged.size
      );
      void fetchFairFightStats();
      return true;
    } catch {
      return false;
    } finally {
      viewMembersInFlight = false;
    }
  }

  // Returns a reason code as well as the time, so a cell without a countdown can
  // say which cause it hit instead of every cause looking identical.
  function viewHospitalForTarget(targetId) {
    const id = String(targetId || "");
    if (!validTargetId(id)) return null;
    if (viewMembersState.factionIds.length === 0) return null;
    if (
      !Number.isFinite(viewMembersState.fetchedAt) ||
      nowMs() - viewMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs
    ) return null;
    const status = viewMembersState.members.get(id);
    if (!status) return { isHospital: false, seconds: null, source: "torn-api-view", reason: "member-not-in-fetched-rosters" };
    const isHospital =
      isHospitalStatusValue(status.state) ||
      isHospitalStatusValue(status.description) ||
      isHospitalStatusValue(status.details);
    if (!isHospital) return { isHospital: false, seconds: null, source: "torn-api-view", reason: "not-hospital" };
    if (hospitalUntilExpired(status.until)) {
      return { isHospital: false, seconds: null, source: "torn-api-view", reason: "not-hospital" };
    }
    const seconds = hospitalRemainingSeconds(status.until);
    return {
      isHospital: true,
      seconds,
      source: "torn-api-view",
      reason: Number.isFinite(seconds) ? "hospital" : "hospital-without-until"
    };
  }

  function freshOpponentStatusForTarget(targetId) {
    const id = String(targetId || "");
    if (!validTargetId(id) || !validTargetId(opponentFactionId)) return null;
    if (opponentMembersState.factionId !== opponentFactionId) return null;
    if (!Number.isFinite(opponentMembersState.fetchedAt) || nowMs() - opponentMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs) return null;
    return opponentMembersState.members.get(id) || null;
  }

  function freshOpponentActivityForTarget(targetId) {
    return freshOpponentStatusForTarget(targetId)?.activity || null;
  }

  // A release timestamp that has passed means the target is out, whatever a
  // cached or lagging status record still claims. Returns false when there is
  // no usable timestamp, so a genuinely unknown release time is left alone.
  function hospitalUntilExpired(until) {
    const timestamp = Number(until);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
    return timestamp - getTornNowMs() / 1000 <= 0;
  }

  function hospitalRemainingSeconds(until) {
    const timestamp = Number(until);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    // Ceil only. Rounding up is deliberate: showing less than the real wait
    // makes a caller attack early and the hit fails. The extra + 1 that used to
    // sit here was measured against Torn as a full second of overshoot.
    const remaining = Math.ceil(timestamp - getTornNowMs() / 1000);
    return Number.isFinite(remaining) && remaining >= 0 && remaining < CONFIG.maxHospitalSeconds
      ? remaining
      : null;
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
      if (Number.isFinite(remaining)) return { isHospital: true, seconds: remaining, source: "dom-until" };
    }
    const seconds = parseHospitalSecondsFromText(statusCell.textContent || li.textContent);
    return { isHospital: true, seconds, source: "dom-text" };
  }

  function computeHospitalSeconds(row) {
    const apiStatus = freshOpponentStatusForTarget(row?.id);
    if (apiStatus) {
      const apiHospital =
        isHospitalStatusValue(apiStatus.state) ||
        isHospitalStatusValue(apiStatus.description) ||
        isHospitalStatusValue(apiStatus.details);
      if (!apiHospital) return { isHospital: false, seconds: null, source: "torn-api" };
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

  // ---------------------------------------------------------------------------
  // Ranked War countdown reader restored from the PDA-verified v1.5.88 baseline.
  // It handles Torn-generated ::before/::after content and split DD:HH:MM:SS nodes.
  function tornUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return /^(?:www\.)?torn\.com$/i.test(url.hostname) ? url : null;
    } catch {
      return null;
    }
  }

  function idFromSearchParam(value, names) {
    const url = tornUrl(value);
    if (!url) return "";
    for (const name of names) {
      const id = String(url.searchParams.get(name) || "").trim();
      if (validTargetId(id)) return String(Number(id));
    }
    return "";
  }

  function factionIdFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return "";
    const url = tornUrl(link.getAttribute("href") || link.href);
    if (!url || !/\/factions\.php$/i.test(url.pathname)) return "";
    return idFromSearchParam(url.href, ["ID", "id"]);
  }

  function isVisibleSurfaceElement(element) {
    if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  // ONE MAIN CHANGE (v1.1.3): this function asks the browser once instead of
  // once per ancestor.
  //
  // Measured, not assumed. A ten-second Chrome performance recording taken by
  // the owner on a live 195-row ranked war roster, with all three scripts
  // running, attributes 3869 ms of CPU to this userscript -- against 80 ms for
  // War Stuff Enhanced and 33 ms for FF Scouter. 1983 ms of ours, more than
  // half, was inside this one function.
  //
  // The old shape walked from the element to the document root and called
  // getComputedStyle on every ancestor. Reading a computed style forces Chrome
  // to flush style and layout synchronously, so the cost was one forced layout
  // per ancestor per candidate per call -- and the call sites run on every DOM
  // mutation on the page. Every faction chat message is a DOM mutation, which
  // is why the chat rendered in slow motion while this script did work that had
  // nothing to do with the chat.
  //
  // getClientRects() already answers the question the ancestor walk was asking:
  // an element under a display:none ancestor, or detached, has no boxes at all.
  // visibility is inherited, so a hidden ancestor shows up in the element's own
  // computed visibility. What is no longer detected: an ancestor with opacity 0
  // or aria-hidden that is otherwise laid out normally. Neither has ever been
  // observed on Torn's war card, and the trade is one forced layout instead of
  // one per level of the tree.
  function isRenderedRouteSurfaceElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const rects = element.getClientRects();
    if (rects.length === 0) return false;
    const rect = rects[0];
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.visibility !== "collapse";
  }

  function cardFactionIds(card) {
    if (!(card instanceof HTMLElement)) return [];
    return [...new Set(
      [...card.querySelectorAll("a[href]")]
        .map(factionIdFromLink)
        .filter(validTargetId)
    )];
  }

  function pageHasExplicitNoWarMarker() {
    const scope = document.querySelector("main") || document.body;
    if (!(scope instanceof HTMLElement)) return false;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let visited = 0;
    while (walker.nextNode() && visited < 6000) {
      visited += 1;
      const parent = walker.currentNode.parentElement;
      if (!parent || !isVisibleSurfaceElement(parent)) continue;
      if (normalizeText(walker.currentNode.nodeValue).toUpperCase() === "YOUR FACTION IS NOT IN A WAR") return true;
    }
    return false;
  }

  function selectCurrentWarCard(scope = document) {
    const candidates = [];
    for (const card of scope.querySelectorAll("div[data-warid]")) {
      if (!(card instanceof HTMLElement) || !isRenderedRouteSurfaceElement(card)) continue;
      const warId = String(card.dataset.warid || "").trim();
      const factionIds = cardFactionIds(card);
      if (!validTargetId(warId) || factionIds.length !== 2) continue;
      if (validTargetId(selfFactionId) && !factionIds.includes(selfFactionId)) continue;
      const opponentId = validTargetId(selfFactionId)
        ? factionIds.find(id => id !== selfFactionId) || ""
        : "";
      if (validTargetId(selfFactionId) && !validTargetId(opponentId)) continue;
      const countdownSeconds = readRankedWarCountdownSeconds(card);
      const rankedLabel = /ranked\s+war/i.test(normalizeText(card.textContent));
      const score = (Number.isFinite(countdownSeconds) && countdownSeconds > 0 ? 100 : 0) + (rankedLabel ? 20 : 0) + (currentWarSurface?.card === card ? 5 : 0);
      candidates.push({ card, warId: String(Number(warId)), opponentFactionId: opponentId, countdownSeconds, score });
    }
    candidates.sort((left, right) => right.score - left.score || Number(right.warId) - Number(left.warId));
    return candidates[0] || null;
  }

  function canonicalRankedWarSurface() {
    if (!isAnyRankedWarRoute()) return null;
    const roots = [...document.querySelectorAll("#faction_war_list_id")]
      .filter(root => root instanceof HTMLElement && isRenderedRouteSurfaceElement(root));
    if (roots.length !== 1) return null;
    const root = roots[0];
    const enemySurface = root.querySelector(".enemy-faction");
    if (!(enemySurface instanceof HTMLElement) || !isRenderedRouteSurfaceElement(enemySurface)) return null;
    const cards = [...root.querySelectorAll("div[data-warid]")].filter(card => (
      card instanceof HTMLElement &&
      isRenderedRouteSurfaceElement(card) &&
      validTargetId(card.dataset.warid) &&
      cardFactionIds(card).length === 2
    ));
    if (cards.length !== 1) return null;
    const selected = selectCurrentWarCard(root);
    if (!selected || selected.card !== cards[0]) return null;
    return { root, selected };
  }

  function captureCurrentWarSurface() {
    const surface = refreshCurrentWarSurface();
    if (
      !surface?.card?.isConnected ||
      !validTargetId(surface.warId) ||
      !validTargetId(surface.opponentFactionId) ||
      !validTargetId(selfFactionId) ||
      !Number.isInteger(surface.surfaceSerial) ||
      surface.surfaceSerial <= 0
    ) return null;
    return {
      card: surface.card,
      warId: String(Number(surface.warId)),
      opponentFactionId: String(Number(surface.opponentFactionId)),
      selfFactionId: String(Number(selfFactionId)),
      surfaceSerial: surface.surfaceSerial
    };
  }

  function currentWarSurfaceMatchesSnapshot(surface) {
    return Boolean(
      surface &&
      currentWarSurface?.card === surface.card &&
      currentWarSurface?.card?.isConnected &&
      currentWarSurface?.surfaceSerial === surface.surfaceSerial &&
      currentWarSurface?.warId === surface.warId &&
      currentWarSurface?.opponentFactionId === surface.opponentFactionId &&
      selfFactionId === surface.selfFactionId
    );
  }

  function ownWarsStateMatchesSurface(surface = currentWarSurface) {
    if (!surface) return false;
    return Boolean(
      ownWarsState.surfaceSerial === surface.surfaceSerial &&
      ownWarsState.surfaceWarId === String(surface.warId || "") &&
      ownWarsState.surfaceOpponentFactionId === String(surface.opponentFactionId || "") &&
      ownWarsState.opponentFactionId === String(surface.opponentFactionId || "") &&
      ownWarsState.selfFactionId === selfFactionId
    );
  }

  function ownWarsFreshLive(maxAgeMs = CONFIG.tornStatusMaxAgeMs) {
    return Boolean(
      ownWarsState.live === true &&
      ownWarsState.warId === currentWarSurface?.warId &&
      ownWarsStateMatchesSurface() &&
      nowMs() - ownWarsState.fetchedAt <= maxAgeMs
    );
  }

  function refreshCurrentWarSurface({ structural = false, canonical = null } = {}) {
    const routeSurface = canonical || canonicalRankedWarSurface();
    const selected = routeSurface?.selected || null;
    if (!selected) {
      if (currentWarSurface || opponentFactionId) {
        warSurfaceSerial += 1;
        resetLifeState();
        invalidateOwnWarsState();
      }
      currentWarSurface = null;
      opponentFactionId = "";
      return null;
    }

    const selectedOpponentId = validTargetId(selected.opponentFactionId)
      ? String(Number(selected.opponentFactionId))
      : "";
    const changed =
      currentWarSurface?.card !== selected.card ||
      currentWarSurface?.rosterRoot !== routeSurface.root ||
      currentWarSurface?.warId !== selected.warId ||
      currentWarSurface?.opponentFactionId !== selectedOpponentId;
    const previousOpponent = opponentFactionId;
    opponentFactionId = selectedOpponentId;
    if (previousOpponent !== opponentFactionId) {
      opponentMembersState = { factionId: opponentFactionId, members: new Map(), fetchedAt: 0 };
    }
    if (changed) {
      resetLifeState();
      warSurfaceSerial += 1;
      invalidateOwnWarsState();
    }

    const shouldReadPrewarSurface = changed || structural || !currentWarSurface;
    currentWarSurface = {
      ...selected,
      rosterRoot: routeSurface.root,
      opponentFactionId,
      surfaceSerial: warSurfaceSerial,
      noWarMarker: shouldReadPrewarSurface ? pageHasExplicitNoWarMarker() : currentWarSurface.noWarMarker
    };

    if (
      !ownWarsFreshLive() &&
      validTargetId(selfFactionId) &&
      validTargetId(opponentFactionId) &&
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
    // Torn's Ranked War pre-start clock is DD:HH:MM:SS. Deliberately do NOT
    // accept HH:MM:SS here: on PDA the day prefix may be generated separately,
    // and accepting the truncated remainder caused a multi-day war to look minutes away.
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
    try {
      return stripGeneratedContent(getComputedStyle(element, pseudo).content);
    } catch {
      return "";
    }
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
    for (let i = 0; i + 1 < childTexts.length; i += 1) {
      const day = childTexts[i].match(/^\d{1,3}:?$/)?.[0]?.replace(/:$/, "") || "";
      const childClock = threePartClock(childTexts[i + 1]);
      if (day && childClock) add(`${day}:${childClock}`);
    }

    if (childTexts.length >= 4) {
      for (let i = 0; i + 3 < childTexts.length; i += 1) {
        const parts = childTexts.slice(i, i + 4).map(value => value.match(/^\d{1,3}$/)?.[0] || "");
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

  function currentRwPhase() {
    const now = Math.floor(getTornNowMs() / 1000);
    if (ownWarsFreshLive()) {
      if (currentWarSurface?.warId) lockedPrewarWarIds.add(currentWarSurface.warId);
      if (prewarObservation?.warId === currentWarSurface?.warId) prewarObservation = null;
      return { phase: RW_PHASE.LIVE, runwaySeconds: 0, warId: ownWarsState.warId || currentWarSurface?.warId || "" };
    }

    if (prewarObservation && prewarObservation.warId === currentWarSurface?.warId) {
      const runwaySeconds = prewarObservation.startAtSeconds - now;
      if (runwaySeconds > 0 && !lockedPrewarWarIds.has(prewarObservation.warId)) {
        return {
          phase: RW_PHASE.PREWAR,
          runwaySeconds,
          warId: prewarObservation.warId
        };
      }
      lockedPrewarWarIds.add(prewarObservation.warId);
      prewarObservation = null;
    }

    return { phase: RW_PHASE.UNKNOWN, runwaySeconds: null, warId: currentWarSurface?.warId || "" };
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

  function classifyTargetState({ playerId, ownClaim, isHospital, seconds, fairFight, rwPhase, activity = null, lowHp = false }) {
    if (ownClaim) {
      if (ownClaim.targetId === playerId) {
        return { state: TARGET_STATE.CLAIMED, seconds, fairFight, reason: "active-own-dibs", mode: "live" };
      }
      return { state: TARGET_STATE.BLOCKED, seconds, fairFight, reason: "another-active-dibs", mode: "live" };
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
    return decisionForBinding(bindingForTarget(targetId));
  }

  // ---------------------------------------------------------------------------
  // Claim / release.
  // ---------------------------------------------------------------------------

  async function verifyFreshTargetBasicForClaim(targetId, isCurrent = () => true, captureProof = null) {
    const key = effectiveTornApiKey();
    if (!key || !validTargetId(targetId) || !isCurrent()) return false;
    const result = await tornApiRequest(`/v2/user/${targetId}/basic`, key, { cacheBust: true });
    if (!isCurrent() || key !== effectiveTornApiKey()) return false;
    const body = result?.body || {};
    const status = body?.profile?.status ?? body?.status;
    if (!result?.ok || body?.error || !status || typeof status !== "object") return false;
    recordTornClockOffset(result, body);
    const returnedIdentity = body?.profile?.player_id ?? body?.profile?.id ?? body?.player_id ?? body?.id;
    if (returnedIdentity !== undefined && String(Number(returnedIdentity)) !== String(Number(targetId))) return false;
    if (!isHospitalStatusValue(status.state) && !isHospitalStatusValue(status.description)) return false;
    const until = Number(status.until);
    if (!Number.isFinite(until) || until <= 0) return false;
    const seconds = Math.ceil(until - getTornNowMs() / 1000);
    const accepted = Number.isFinite(seconds) && seconds >= 0 && seconds <= CONFIG.gateSeconds;
    if (accepted && typeof captureProof === "function") captureProof({ until, fetchedAt: Number(result.endedAt) || nowMs() });
    return accepted;
  }

  // The server acknowledged a claim as ours, but the page moved on before the
  // answer could be shown. Keep the record so the claim can still be seen and
  // released. `entry` is a queue entry from ksClaimToQueueEntry (seconds).
  // There is no queue on this server, so the record is a plain own claim.
  function persistOwnClaimFromAcknowledgement(entry, targetId) {
    const claimId = normalizeText(entry?.claimId);
    if (!isValidClaimId(claimId) || !validTargetId(targetId)) return false;
    const rawClaimerPlayerId = String(entry?.claimer?.playerId ?? "").trim();
    const expiresAt = Number(entry?.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds()) return false;
    saveOwnClaim({
      claimId,
      targetId,
      claimerPlayerId: /^\d+$/.test(rawClaimerPlayerId) ? rawClaimerPlayerId : "",
      claimerName: selfPlayerName || "You",
      expiresAt,
      cleanupRequired: false,
      createdLocalAt: nowMs()
    });
    return currentOwnClaim()?.claimId === claimId;
  }

  async function claimSharedTarget(playerId, playerName) {
    const targetId = String(playerId || "");
    if (
      !runtimeActive ||
      !isRuntimeEligible() ||
      sharedWriteBusy ||
      ffCredentialChangeBusy() ||
      !effectiveTornApiKey() ||
      !validTargetId(targetId)
    ) return;
    if (currentOwnClaim() || sharedClaimForTarget(targetId)) return;
    // Never write against a target whose claim state could not be read.
    if (sharedClaimsUnreadable.has(targetId) || ksBoardUnknown()) { updateBoundControls(); return; }
    const clickedBinding = bindingForTarget(targetId);
    const clickedOpponentId = opponentFactionId;
    if (!clickedBinding || !validTargetId(clickedOpponentId) || currentWarSurface?.opponentFactionId !== clickedOpponentId) return;
    const eligibility = currentDecisionForTarget(targetId);
    if (!eligibility || eligibility.state !== TARGET_STATE.READY) {
      if (eligibility?.state === TARGET_STATE.FREE) holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
      updateBoundControls(); return;
    }

    const generation = runtimeGeneration;
    const operationSerial = ++sharedWriteOperationSerial;
    const writeKey = sharedApiKey;
    const tornKey = effectiveTornApiKey();
    const credentialEpoch = tornCredentialEpoch;
    const selfAtStart = selfPlayerId;
    const ownsWrite = () => operationSerial === sharedWriteOperationSerial;
    // R5b (0.2.1). Set once the gates below have passed: the wire id of the war
    // they were checked for. From then on the write is only current while the
    // war on screen is still that war, so a claim can never go to a war that
    // was not checked against /v2/faction/wars -- not even when a new sign-in
    // has to be made between the gates and the request.
    let writeWire = null;
    const wireOnScreen = () => { try { return wireWarId(ksWarIdOnScreen()); } catch { return ""; } };
    const writeRuntimeCurrent = () => (
      ownsWrite() &&
      generation === runtimeGeneration &&
      runtimeActive &&
      isRuntimeEligible() &&
      writeKey === sharedApiKey &&
      tornKey === effectiveTornApiKey() &&
      credentialEpoch === tornCredentialEpoch &&
      selfAtStart === selfPlayerId &&
      (writeWire === null || wireOnScreen() === writeWire)
    );
    sharedWriteBusy = true;
    enforceFfCredentialLock();
    claimFlowState = CLAIM_FLOW_STATE.CLAIMING;
    pendingTargetId = targetId;
    setSharedStatus("writing", `War Room: claiming ${normalizeText(playerName) || targetId}…`);
    updateBoundControls();
    let createdClaim = null;

    try {
      if (!(await fetchSharedClaims())) throw new Error("fresh claim board read failed");
      if (currentOwnClaim() || sharedClaimForTarget(targetId)) throw new Error("target already claimed");
      if (sharedClaimsUnreadable.has(targetId) || ksBoardUnknown()) throw new Error("claim state for this target could not be read");
      if (eligibility.fairFight > CONFIG.maxFairFight && !(await waitForLifeClaimReadSlot(targetId, writeRuntimeCurrent))) {
        if (writeRuntimeCurrent()) holdSharedWriteFailure("War Room: claim refused · low life could not be confirmed");
        return;
      }
      if (!(await fetchOwnWars({ force: true })) || !ownWarsFreshLive(CONFIG.ownWarsWriteMaxAgeMs)) {
        throw new Error("fresh own faction wars did not confirm LIVE");
      }
      let targetBasicProof = null;
      if (!(await verifyFreshTargetBasicForClaim(targetId, writeRuntimeCurrent, proof => { targetBasicProof = proof; }))) {
        throw new Error("fresh target basic verification failed");
      }
      if (!writeRuntimeCurrent()) return;
      refreshCurrentWarSurface();
      const finalBinding = bindingForTarget(targetId);
      if (
        finalBinding !== clickedBinding ||
        opponentFactionId !== clickedOpponentId ||
        currentWarSurface?.opponentFactionId !== clickedOpponentId
      ) {
        throw new Error("target identity or opponent relation changed");
      }
      if (freshOpponentActivityForTarget(targetId) === "online") {
        holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
        return;
      }
      if (readRowFairFight(finalBinding.row) > CONFIG.maxFairFight) {
        const life = await readTargetLife(targetId, { forClaim: true, isCurrent: writeRuntimeCurrent });
        if (!writeRuntimeCurrent()) return;
        if (freshOpponentActivityForTarget(targetId) === "online") {
          holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
          return;
        }
        if (!life || life.ratio > CONFIG.lowHpLifeMaxRatio) {
          holdSharedWriteFailure("War Room: claim refused · low life could not be confirmed");
          return;
        }
        const basicSeconds = hospitalRemainingSeconds(targetBasicProof?.until);
        if (!ownWarsFreshLive(CONFIG.ownWarsWriteMaxAgeMs) || !targetBasicProof ||
          nowMs() - targetBasicProof.fetchedAt > CONFIG.tornStatusMaxAgeMs ||
          hospitalUntilExpired(targetBasicProof.until) || !Number.isFinite(basicSeconds) ||
          basicSeconds > CONFIG.gateSeconds || bindingForTarget(targetId) !== finalBinding ||
          opponentFactionId !== clickedOpponentId) throw new Error("target eligibility changed");
      }
      const finalEligibility = decisionForBinding(finalBinding);
      if (finalEligibility?.state === TARGET_STATE.FREE) {
        holdSharedWriteFailure("War Room: claim refused · target is online (free for all)");
        return;
      }
      if (!finalEligibility || finalEligibility.state !== TARGET_STATE.READY) throw new Error("target eligibility changed");
      // The server's claim id input: the wire id of the war this write goes to.
      // From here on writeRuntimeCurrent() also requires this war (R5b).
      writeWire = wireWarId(ksWarIdOnScreen());
      // hospitalUntil in SECONDS, from the fresh Torn reading verified just
      // above (status.until). memberId is never sent: the server takes the
      // Torn id from the sign-in.
      const proofUntil = Number(targetBasicProof?.until);
      const hospitalUntil = Number.isFinite(proofUntil) && proofUntil > 0 ? Math.floor(proofUntil) : 0;
      const result = await ksServerRequest(
        "claim",
        { targetId, hospitalUntil },
        { isCurrent: writeRuntimeCurrent }
      );
      const httpStatus = Number(result?.status) || 0;
      const body = result?.body || null;
      const serverStatus = body ? normalizeText(body.status) : "";
      // The claim the answer carries, converted in the one conversion point --
      // the same function and the same input as the board uses.
      const answered = body && isPlainRecord(body.claim) ? ksClaimToQueueEntry(body.claim, writeWire) : null;
      const acknowledgedOwn = Boolean(
        httpStatus === 200 &&
        body?.ok === true &&
        (serverStatus === "claimed" || serverStatus === "already_claimed") &&
        answered &&
        answered.targetId === targetId &&
        answered.entry.claimer.playerId === String(Number(selfAtStart)) &&
        answered.entry.expiresAt > nowSeconds()
      );
      if (acknowledgedOwn) createdClaim = answered.entry;
      if (!writeRuntimeCurrent()) {
        if (createdClaim) persistOwnClaimFromAcknowledgement(createdClaim, targetId);
        return;
      }
      if (acknowledgedOwn) {
        sharedAuthorityEpoch += 1;
        upsertImmediateSharedClaim(targetId, answered.entry);
        const ownName = selfPlayerName || "You";
        ownClaimMissingReads = 0;
        ownClaimLastConfirmedAt = nowMs();
        saveOwnClaim({
          claimId: answered.entry.claimId,
          targetId,
          claimerPlayerId: answered.entry.claimer.playerId,
          claimerName: ownName,
          expiresAt: answered.entry.expiresAt,
          cleanupRequired: false,
          createdLocalAt: nowMs()
        });
        if (serverStatus === "already_claimed") {
          // Already ours on the server. The time is the server's and was not
          // moved. Held like a failure so the poll does not wipe the line.
          setSharedStatus("online", "War Room: already yours · time unchanged", sharedClaims.size);
          sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
        } else {
          // 1.1.9 printed this line and let the poll in the finally block wipe
          // it within a fraction of a second. Held, so it can be read.
          setSharedStatus("online", `War Room: DIBS ✓ ${ownName}`, sharedClaims.size);
          sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
        }
        return;
      }
      // Not ours. Each answer has its own line, and none of them makes an own
      // record.
      if (httpStatus === 409 && serverStatus === "taken") {
        // Somebody else was first. Show their claim at once.
        if (answered && answered.targetId === targetId) {
          sharedAuthorityEpoch += 1;
          upsertImmediateSharedClaim(targetId, answered.entry);
        }
        const holderName = answered && answered.targetId === targetId ? answered.entry.claimer.name : "another member";
        holdSharedWriteFailure(`War Room: taken by ${holderName}`);
        return;
      }
      if (httpStatus === 409 && serverStatus === "already_holding") {
        // The board is read again in the finally block below.
        holdSharedWriteFailure("War Room: you already hold another target");
        return;
      }
      if (httpStatus === 409 && serverStatus === "unreadable") {
        sharedClaimsUnreadable.add(targetId);
        holdSharedWriteFailure("War Room: cannot verify — try again");
        return;
      }
      throw new Error(ksFailureWords(result?.ksFailure));
    } catch (error) {
      if (createdClaim) persistOwnClaimFromAcknowledgement(createdClaim, targetId);
      if (writeRuntimeCurrent()) {
        holdSharedWriteFailure(`War Room: claim failed · ${normalizeText(error?.message) || "request failed"}`);
      }
    } finally {
      if (ownsWrite()) {
        sharedWriteBusy = false;
        claimFlowState = currentOwnClaim()?.cleanupRequired ? CLAIM_FLOW_STATE.CLEANUP_REQUIRED : CLAIM_FLOW_STATE.IDLE;
        pendingTargetId = "";
        if (writeRuntimeCurrent()) { updateBoundControls(); void fetchSharedClaims(); }
      }
    }
  }

  async function releaseOwnSharedTarget() {
    const own = currentOwnClaim();
    if (
      !runtimeActive ||
      !isRuntimeEligible() ||
      sharedWriteBusy ||
      ffCredentialChangeBusy() ||
      !effectiveTornApiKey() ||
      !own ||
      !isValidClaimId(own.claimId)
    ) return;
    const generation = runtimeGeneration;
    const operationSerial = ++sharedWriteOperationSerial;
    const writeKey = sharedApiKey;
    const ownsWrite = () => operationSerial === sharedWriteOperationSerial;
    const writeRuntimeCurrent = () => (
      ownsWrite() &&
      generation === runtimeGeneration &&
      runtimeActive &&
      isRuntimeEligible() &&
      writeKey === sharedApiKey &&
      currentOwnClaim()?.claimId === own.claimId
    );
    sharedWriteBusy = true;
    enforceFfCredentialLock();
    claimFlowState = CLAIM_FLOW_STATE.RELEASING;
    pendingTargetId = own.targetId;
    setSharedStatus("writing", `War Room: releasing ${own.claimerName || "DIBS"}…`);
    updateBoundControls();
    try {
      // The server releases by target and takes the owner from the sign-in:
      // somebody else's claim cannot be released from here.
      const result = await ksServerRequest(
        "unclaim",
        { targetId: own.targetId },
        { isCurrent: writeRuntimeCurrent }
      );
      if (!writeRuntimeCurrent()) return;
      const httpStatus = Number(result?.status) || 0;
      const body = result?.body || null;
      const serverStatus = body ? normalizeText(body.status) : "";
      if (httpStatus === 409 && serverStatus === "not_owner") {
        // The record stays; the server says the claim is not ours to release.
        holdSharedWriteFailure("War Room: release refused · claim kept");
        return;
      }
      if (httpStatus === 409 && serverStatus === "unreadable") {
        holdSharedWriteFailure("War Room: cannot verify — claim kept");
        return;
      }
      if (httpStatus !== 200 || body?.ok !== true || (serverStatus !== "unclaimed" && serverStatus !== "absent")) {
        throw new Error(ksFailureWords(result?.ksFailure));
      }
      sharedAuthorityEpoch += 1;
      removeImmediateSharedClaim(own.claimId);
      saveOwnClaim(null);
      ownClaimMissingReads = 0;
      ownClaimLastConfirmedAt = 0;
      setSharedStatus("online", "War Room: released", sharedClaims.size);
      sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
    } catch (error) {
      if (writeRuntimeCurrent()) {
        holdSharedWriteFailure(`War Room: release failed · ${normalizeText(error?.message) || "request failed"}`);
      }
    } finally {
      if (ownsWrite()) {
        sharedWriteBusy = false;
        claimFlowState = currentOwnClaim()?.cleanupRequired ? CLAIM_FLOW_STATE.CLEANUP_REQUIRED : CLAIM_FLOW_STATE.IDLE;
        pendingTargetId = "";
        if (writeRuntimeCurrent()) { updateBoundControls(); void fetchSharedClaims(); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-release.
  //
  // Members forget to release a claim after the hit -- it happened right through
  // the previous Ranked War -- and a forgotten claim locks that target for the
  // whole faction until the server-side expiry finally runs out.
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
  // made -- this reads the opponent members batch the script already polls.
  function ownClaimTargetIsBeaten() {
    if (viewOnlyMode()) return false;
    const own = currentOwnClaim();
    if (!own || !validTargetId(own.targetId)) return false;
    // freshOpponentStatusForTarget refuses anything older than
    // CONFIG.opponentMembersMaxAgeMs, so stale data can never release a claim.
    const status = freshOpponentStatusForTarget(own.targetId);
    if (!status) return false;
    const isHospital =
      isHospitalStatusValue(status.state) ||
      isHospitalStatusValue(status.description) ||
      isHospitalStatusValue(status.details);
    if (!isHospital) return false;
    const seconds = hospitalRemainingSeconds(status.until);
    return Number.isFinite(seconds) && seconds > CONFIG.autoReleaseHospitalSeconds;
  }

  function ownClaimTargetIsOnline() {
    if (viewOnlyMode() || !ownWarsFreshLive()) return false;
    const own = currentOwnClaim();
    return Boolean(own && validTargetId(own.targetId) && freshOpponentActivityForTarget(own.targetId) === "online");
  }

  async function maybeAutoReleaseBeatenTarget() {
    if (!runtimeActive || !isRuntimeEligible() || sharedWriteBusy || ffCredentialChangeBusy()) return false;
    const own = currentOwnClaim();
    if (!own || autoReleaseAttemptedClaimId === own.claimId) return false;
    const targetOnline = ownClaimTargetIsOnline();
    if (!targetOnline && !ownClaimTargetIsBeaten()) return false;
    autoReleaseAttemptedClaimId = own.claimId;
    await releaseOwnSharedTarget();
    if (currentOwnClaim()) return false;
    // releaseOwnSharedTarget kicks off a shared poll in its own finally block,
    // and that poll would overwrite the message within about 100 ms. Hold it the
    // same way a write failure is held, so the owner actually sees what happened.
    // 0.2.0: the plain "released" line is held as well now, so drop that hold
    // first; this line says more.
    sharedStatusHoldUntil = 0;
    setSharedStatus("online", targetOnline
      ? "War Room: auto-released · target online (free for all)"
      : "War Room: auto-released \u00b7 target back in hospital", sharedClaims.size);
    sharedStatusHoldUntil = nowMs() + CONFIG.sharedErrorHoldMs;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Hospital report (server-side auto-release).
  //
  // The server stores, with every claim, the target's hospital end time as it
  // was when the claim was taken, and releases the claim when any signed-in
  // client reports an end time more than 180 s later -- the target was put
  // back in hospital. The reporter need not own the claim: the owner may have
  // closed the tab. This covers every claim on the board.
  //
  // Sparse and strict, because the server refuses anything else:
  //   - only when Torn's fresh end time is MORE than 180 s past the stored one
  //   - at most one report per target and end time
  //   - observedAt is the Torn-synchronised time the Torn reading arrived,
  //     never the PC clock; with an uncalibrated Torn clock nothing is sent
  //   - nothing when the reading is older than 30 s by that same clock
  //   - nothing unless the reading was made more than 45 s AFTER the claim was
  //     taken (R1): a reading from before the claim shows a hospital time the
  //     claim was never about, and would release a live claim
  //   - a report the server did not receive is not counted as sent (R2)
  //   - never in VIEW
  // No Torn request is made for this: it reads the opponent members batch the
  // script already polls.
  // ---------------------------------------------------------------------------

  function ksRememberReport(key) {
    ksReportedKeys.add(key);
    while (ksReportedKeys.size > KS_SERVER.reportMemoryMax) {
      ksReportedKeys.delete(ksReportedKeys.values().next().value);
    }
  }

  async function reportHospitalUpdatesToKsServer() {
    if (ksReportRunning || viewOnlyMode() || !runtimeActive || !isRuntimeEligible()) return 0;
    const apiKey = effectiveTornApiKey();
    if (!apiKey || sharedClaims.size === 0 || ksBoardUnknown()) return 0;
    // Torn clock not calibrated: no report.
    if (!Number.isFinite(tornClockLowMs)) return 0;
    if (!validTargetId(opponentFactionId) || opponentMembersState.factionId !== opponentFactionId) return 0;
    const readAtMs = Number(opponentMembersState.fetchedAt);
    if (!Number.isFinite(readAtMs) || readAtMs <= 0) return 0;
    // The moment the Torn reading arrived, on the Torn-synchronised clock.
    const observedAt = Math.floor((readAtMs + tornClockLowMs) / 1000);
    const members = opponentMembersState.members;
    const wire = ksBoardWire;
    const generation = runtimeGeneration;
    let sent = 0;
    let released = false;
    ksReportRunning = true;
    try {
      for (const [targetId, queue] of [...sharedClaims.entries()]) {
        if (
          generation !== runtimeGeneration || !runtimeActive || !isRuntimeEligible() ||
          viewOnlyMode() || apiKey !== effectiveTornApiKey() || ksBoardUnknown() || ksBoardWire !== wire
        ) break;
        if (nowSeconds() - observedAt > KS_SERVER.reportMaxAgeSeconds) break;
        const claim = Array.isArray(queue) ? queue[0] : null;
        // No stored hospital time: the server would never release on it.
        if (!claim || !Number.isSafeInteger(claim.hospitalUntil) || claim.expiresAt <= nowSeconds()) continue;
        // R1: the reading must be from MORE than 45 s after the claim was taken.
        // Strictly more (0.2.2): createdAt is the server's claimedAt rounded
        // down to a whole second, so a reading at exactly createdAt + 45 can be
        // up to 1 s too early by the server's own rule. The server would answer
        // stale_report / before_claim, the report would count as received, and
        // that end time would never be sent again.
        if (!Number.isFinite(claim.createdAt) || observedAt <= claim.createdAt + KS_SERVER.reportMinSecondsAfterClaim) continue;
        const status = members.get(targetId);
        if (!status) continue;
        const isHospital =
          isHospitalStatusValue(status.state) ||
          isHospitalStatusValue(status.description) ||
          isHospitalStatusValue(status.details);
        const until = Number(status.until);
        if (!isHospital || !Number.isSafeInteger(until)) continue;
        if (until <= claim.hospitalUntil + KS_SERVER.reportMarginSeconds) continue;
        const reportKey = `${wire}:${targetId}:${until}`;
        if (ksReportedKeys.has(reportKey)) continue;
        if (ksGate(apiKey)) break;
        ksRememberReport(reportKey);
        const result = await ksServerRequest("report", { targetId, hospitalUntil: until, observedAt });
        if (result?.ksNotSent) {
          // Nothing left this page, so the one report is still owed.
          ksReportedKeys.delete(reportKey);
          break;
        }
        // R2: no answer (status 0), a server error (5xx) or an answer that is
        // not JSON means the server did not receive the report. It is still
        // owed and goes again on a later reading, after the wait ksServerRequest
        // has just set. An answered request (200: released, unchanged,
        // stale_report, no_baseline, absent ...) is received and never resent.
        const reportStatus = Number(result?.status) || 0;
        if (reportStatus === 0 || reportStatus >= 500 || !result?.body) {
          ksReportedKeys.delete(reportKey);
          break;
        }
        sent += 1;
        if (Number(result?.status) === 200 && normalizeText(result?.body?.status) === "released") released = true;
      }
    } catch {
      // A report is a courtesy to the faction. It never breaks anything else.
    } finally {
      ksReportRunning = false;
    }
    if (released && generation === runtimeGeneration && runtimeActive && isRuntimeEligible()) void fetchSharedClaims();
    return sent;
  }

  // ---------------------------------------------------------------------------
  // Native roster binding.
  // FFScouter, Torn Status and every non-Attack cell remain read-only.
  // ---------------------------------------------------------------------------

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

  function sameOriginRowUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return url.origin === location.origin ? url : null;
    } catch {
      return null;
    }
  }

  function normalizedUrlTargetId(url, names) {
    if (!(url instanceof URL)) return "";
    for (const name of names) {
      const value = String(url.searchParams.get(name) || "").trim();
      if (validTargetId(value)) return String(Number(value));
    }
    return "";
  }

  function profileTargetId(link) {
    if (!(link instanceof HTMLAnchorElement)) return "";
    const url = sameOriginRowUrl(link.getAttribute("href") || link.href);
    if (!url || !/\/profiles(?:\.php)?$/i.test(url.pathname)) return "";
    return normalizedUrlTargetId(url, ["XID", "xid", "user2ID", "user2id"]);
  }

  function rowDatasetIdentityMatches(row, targetId) {
    for (const attribute of ROW_IDENTITY_ATTRIBUTES) {
      if (!row.hasAttribute(attribute)) continue;
      const value = String(row.getAttribute(attribute) || "").trim();
      if (!validTargetId(value) || String(Number(value)) !== targetId) return false;
    }
    return true;
  }

  function rowFactionIdentityMatches(row) {
    if (!validTargetId(opponentFactionId)) return true;
    for (const link of row.querySelectorAll("a[href]")) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      const url = sameOriginRowUrl(link.getAttribute("href") || link.href);
      if (!url || !/\/factions\.php$/i.test(url.pathname)) continue;
      const factionId = normalizedUrlTargetId(url, ["ID", "id"]);
      if (validTargetId(factionId) && factionId !== opponentFactionId) return false;
    }
    return true;
  }

  function rowIdentityMatchesTarget(row, targetId) {
    if (!(row instanceof HTMLElement) || !validTargetId(targetId)) return false;
    const profileIds = new Set(
      [...row.querySelectorAll("a[href]")]
        .map(profileTargetId)
        .filter(validTargetId)
    );
    return (
      profileIds.size === 1 &&
      profileIds.has(targetId) &&
      rowDatasetIdentityMatches(row, targetId) &&
      rowFactionIdentityMatches(row)
    );
  }

  function nativeAttackIdentityMatches(attackCell, targetId) {
    const nodes = [...attackCell.childNodes];
    const links = nodes.filter(node => node instanceof Element && node.matches("a[href]"));
    if (links.length > 0) {
      const ids = new Set();
      for (const link of links) {
        const url = sameOriginRowUrl(link.getAttribute("href") || "");
        const sid = normalizeText(url?.searchParams.get("sid")).toLowerCase();
        const attackId = normalizedUrlTargetId(url, ["user2ID", "user2id"]);
        if (!url || sid !== "attack" || !validTargetId(attackId)) return false;
        ids.add(attackId);
      }
      return ids.size === 1 && ids.has(targetId);
    }

    return nodes.some(node =>
      node instanceof HTMLSpanElement &&
      normalizeText(node.textContent).toLowerCase() === "attack"
    );
  }

  function directStatusCell(row) {
    const cell = row.querySelector(":scope > .status");
    return cell instanceof HTMLElement ? cell : row;
  }

  function resolveLiveWarRow(row) {
    if (
      !(row instanceof HTMLElement) ||
      !row.matches("li.enemy") ||
      !(mountedRosterRoot instanceof HTMLElement) ||
      !mountedRosterRoot.contains(row)
    ) {
      return null;
    }

    const attackCell = row.querySelector(":scope > .attack");
    if (!(attackCell instanceof HTMLElement)) return null;

    const profileAnchors = [...row.querySelectorAll("a[href]")].filter(link => validTargetId(profileTargetId(link)));
    const profileIds = new Set(profileAnchors.map(profileTargetId));
    if (profileIds.size !== 1) return null;
    const targetId = String([...profileIds][0] || "");
    if (
      !validTargetId(targetId) ||
      !rowIdentityMatchesTarget(row, targetId) ||
      !nativeAttackIdentityMatches(attackCell, targetId)
    ) {
      return null;
    }

    const profileAnchor = profileAnchors.find(link => profileTargetId(link) === targetId);
    if (!(profileAnchor instanceof HTMLAnchorElement)) return null;
    return {
      id: targetId,
      targetId,
      li: row,
      row,
      statusDiv: directStatusCell(row),
      profileAnchor,
      attackCell
    };
  }

  function layoutPresentation() {
    if (!runtimeActive || !isRuntimeEligible()) return;
    const panel = document.getElementById(SCRIPT.panelId);
    if (panel instanceof HTMLElement) placePanel(panel);
  }

  function schedulePresentationLayout() {
    if (!runtimeActive || !isRuntimeEligible() || presentationLayoutFrame !== null) return;
    presentationLayoutFrame = window.requestAnimationFrame(() => {
      presentationLayoutFrame = null;
      layoutPresentation();
    });
  }

  function cancelPresentationLayout() {
    if (presentationLayoutFrame !== null) window.cancelAnimationFrame(presentationLayoutFrame);
    presentationLayoutFrame = null;
  }

  function retireRowBinding(row) {
    const binding = rowBindings.get(row);
    if (!binding) return false;
    rowBindings.delete(row);
    binding.host.remove();
    return true;
  }

  function removeAllRowPresentations() {
    restoreRosterOrder();
    rosterFirstSeen.clear();
    rosterFirstSeenNext = 0;
    for (const row of [...rowBindings.keys()]) retireRowBinding(row);
    mountedRosterRoot = null;
  }

  // ---------------------------------------------------------------------------
  // DIBS row control
  // ---------------------------------------------------------------------------

  function bindingForHost(host) {
    for (const binding of rowBindings.values()) {
      if (binding.host === host) return binding;
    }
    return null;
  }

  function currentResolvedBinding(binding) {
    if (!binding) return null;
    const current = resolveLiveWarRow(binding.row);
    if (
      !current ||
      current.targetId !== binding.targetId ||
      current.attackCell !== binding.attackCell ||
      !binding.host.isConnected ||
      binding.host.parentElement !== current.row ||
      binding.host.nextElementSibling !== current.attackCell
    ) {
      return null;
    }
    return current;
  }

  // ---------------------------------------------------------------------------
  // Native roster column.
  // The DIBS control is a real roster cell inserted before Torn's native Attack
  // cell. Width is net zero: Torn's Score column is hidden only on rows that
  // actually carry a KS cell, and the KS cell takes the width that frees. The
  // hide rule is scoped with :has() on our own cell, so the stylesheet and the
  // JS mount can never disagree about which side of the roster is affected.
  // FFScouter's FF/Est cell, header, sorting and filtering are never touched.
  // ---------------------------------------------------------------------------

  const NATIVE_COLUMN = Object.freeze({
    defaultWidthPx: 38,
    minWidthPx: 32,
    maxWidthPx: 64,
    defaultHeightPx: 34,
    minHeightPx: 22,
    maxHeightPx: 48,
    // Just under the Status column. Wide enough for "2h 34m" at 9px.
    statusWidthShare: 0.92,
    minMemberWidthPx: 110
  });

  const SCORE_CELL_SELECTORS = Object.freeze([
    ":scope > .points",
    ":scope > [class*='points__']",
    ":scope > .score",
    ":scope > [class*='score__']"
  ]);

  const ATTACK_CELL_SELECTORS = Object.freeze([
    ":scope > .attack",
    ":scope > [class*='attack__']"
  ]);

  const MEMBER_CELL_SELECTORS = Object.freeze([
    ":scope > .member",
    ":scope > [class*='member__']"
  ]);

  const STATUS_CELL_SELECTORS = Object.freeze([
    ":scope > .status",
    ":scope > [class*='status__']"
  ]);

  let rosterColumnWidthPx = NATIVE_COLUMN.defaultWidthPx;
  let rosterColumnHeightPx = NATIVE_COLUMN.defaultHeightPx;
  let rosterMemberWidthPx = 0;
  let rosterStatusWidthPx = 0;
  let rosterHeaderHeightPx = NATIVE_COLUMN.defaultHeightPx;
  let rosterHeaderOffsetPx = 0;
  let rosterHeaderCell = null;

  const DIBS_SORT = Object.freeze({ OFF: "off", ASC: "asc", DESC: "desc" });
  const DIBS_SORT_ARROW = Object.freeze({ off: "", asc: " \u25B2", desc: " \u25BC" });
  let dibsSortMode = DIBS_SORT.OFF;
  let dibsSortSignature = "";

  function clampPx(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return fallback;
    return Math.round(Math.min(max, Math.max(min, number)));
  }

  function firstDirectCell(element, selectors) {
    if (!(element instanceof HTMLElement)) return null;
    for (const selector of selectors) {
      const cell = element.querySelector(selector);
      if (cell instanceof HTMLElement) return cell;
    }
    return null;
  }

  function directScoreCell(element) {
    return firstDirectCell(element, SCORE_CELL_SELECTORS);
  }

  function directMemberCell(element) {
    return firstDirectCell(element, MEMBER_CELL_SELECTORS);
  }

  function directStatusColumnCell(element) {
    return firstDirectCell(element, STATUS_CELL_SELECTORS);
  }

  function directAttackCell(element) {
    return firstDirectCell(element, ATTACK_CELL_SELECTORS);
  }

  function isOwnPresentationNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest?.("[data-ks-twd-cell],[data-ks-twd-header],[data-ks-twd-panel]"));
  }

  // One measurement per roster mount. Never per row, never per frame. This is
  // the only geometry read left in the row presentation path.
  function measureRosterColumn(root) {
    if (!(root instanceof HTMLElement)) return false;
    for (const row of root.querySelectorAll("li.enemy")) {
      if (!(row instanceof HTMLElement)) continue;
      if (row.querySelector(":scope > [data-ks-twd-cell]")) continue;
      const score = directScoreCell(row);
      const attack = directAttackCell(row);
      if (!score || !attack) continue;
      const scoreRect = score.getBoundingClientRect();
      const attackRect = attack.getBoundingClientRect();
      if (!(scoreRect.width > 0) || !(attackRect.height > 0)) continue;
      const scoreWidth = clampPx(scoreRect.width, NATIVE_COLUMN.minWidthPx, NATIVE_COLUMN.maxWidthPx, NATIVE_COLUMN.defaultWidthPx);
      const height = clampPx(attackRect.height, NATIVE_COLUMN.minHeightPx, NATIVE_COLUMN.maxHeightPx, NATIVE_COLUMN.defaultHeightPx);

      // Widen towards the Status column and pay for it out of Members, so the
      // sum of the row's cells is unchanged and no float can wrap.
      const statusCell = directStatusColumnCell(row);
      const memberCell = directMemberCell(row);
      const statusWidth = statusCell ? statusCell.getBoundingClientRect().width : 0;
      const statusTarget = statusWidth > 0 ? Math.round(statusWidth) : 0;
      const memberWidth = memberCell ? memberCell.getBoundingClientRect().width : 0;
      let width = scoreWidth;
      let memberTarget = 0;
      if (statusWidth > 0 && memberWidth > 0) {
        const wanted = clampPx(
          statusWidth * NATIVE_COLUMN.statusWidthShare,
          NATIVE_COLUMN.minWidthPx,
          NATIVE_COLUMN.maxWidthPx,
          scoreWidth
        );
        const donation = wanted - scoreWidth;
        if (donation > 0 && memberWidth - donation >= NATIVE_COLUMN.minMemberWidthPx) {
          width = wanted;
          memberTarget = Math.round(memberWidth - donation);
        }
      }

      const header = measureRosterHeader(root);
      const changed =
        width !== rosterColumnWidthPx ||
        height !== rosterColumnHeightPx ||
        memberTarget !== rosterMemberWidthPx ||
        statusTarget !== rosterStatusWidthPx ||
        header.height !== rosterHeaderHeightPx ||
        header.offset !== rosterHeaderOffsetPx;
      rosterColumnWidthPx = width;
      rosterColumnHeightPx = height;
      rosterMemberWidthPx = memberTarget;
      rosterStatusWidthPx = statusTarget;
      rosterHeaderHeightPx = header.height;
      rosterHeaderOffsetPx = header.offset;
      return changed;
    }
    return false;
  }

  function measureRosterHeader(root) {
    const fallback = { height: rosterHeaderHeightPx, offset: rosterHeaderOffsetPx };
    const header = resolveRosterHeader(root);
    if (!(header instanceof HTMLElement)) return fallback;
    const sibling = directAttackCell(header) || directScoreCell(header);
    if (!(sibling instanceof HTMLElement)) return fallback;
    const headerRect = header.getBoundingClientRect();
    const siblingRect = sibling.getBoundingClientRect();
    if (!(siblingRect.height > 0) || !(headerRect.height > 0)) return fallback;
    return {
      height: clampPx(siblingRect.height, 10, 60, NATIVE_COLUMN.defaultHeightPx),
      offset: Math.max(0, Math.round(siblingRect.top - headerRect.top))
    };
  }

  function rosterStyleText() {
    const scoreCells = ".points, [class*='points__'], .score, [class*='score__']";
    const memberCells = ".member, [class*='member__']";
    const memberRule = rosterMemberWidthPx > 0
      ? `
      :is(li, div):has(> [data-ks-twd-cell="dibs"]) > :is(${memberCells}),
      :is(li, div):has(> [data-ks-twd-header="dibs"]) > :is(${memberCells}) {
        width: ${rosterMemberWidthPx}px !important;
      }`
      : "";
    return `
      :is(li, div):has(> [data-ks-twd-cell="dibs"]) > :is(${scoreCells}),
      :is(li, div):has(> [data-ks-twd-header="dibs"]) > :is(${scoreCells}) {
        display: none !important;
      }
      [data-ks-twd-cell="dibs"],
      [data-ks-twd-header="dibs"] {
        float: left !important;
        display: block !important;
        box-sizing: border-box !important;
        width: ${rosterColumnWidthPx}px !important;
        min-width: ${rosterColumnWidthPx}px !important;
        max-width: ${rosterColumnWidthPx}px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: none !important;
        overflow: visible !important;
      }
      [data-ks-twd-cell="dibs"] {
        height: ${rosterColumnHeightPx}px !important;
      }
      ${memberRule}
      [data-ks-twd-header="dibs"] {
        cursor: default !important;
        user-select: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: ${rosterHeaderHeightPx}px !important;
        margin-top: ${rosterHeaderOffsetPx}px !important;
        color: inherit !important;
        font: 700 11px/1.2 Arial, sans-serif !important;
        text-align: center !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
    `;
  }

  function ensureRosterStyle(root) {
    const changed = measureRosterColumn(root);
    let style = document.getElementById(SCRIPT.rosterStyleId);
    if (style instanceof HTMLStyleElement) {
      if (changed) style.textContent = rosterStyleText();
      return style;
    }
    style?.remove();
    style = document.createElement("style");
    style.id = SCRIPT.rosterStyleId;
    style.textContent = rosterStyleText();
    const styleRoot = document.head || document.documentElement;
    if (!(styleRoot instanceof Element)) return null;
    styleRoot.append(style);
    return style;
  }

  function resolveRosterHeader(root) {
    if (!(root instanceof HTMLElement)) return null;
    const candidates = root.querySelectorAll(
      ".white-grad, .table-header, [class*='headerWrap'], [class*='tableHeader']"
    );
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      if (candidate.matches("li.enemy, li.your")) continue;
      if (!directAttackCell(candidate) || !directScoreCell(candidate)) continue;
      return candidate;
    }
    return null;
  }

  function removeRosterHeaderCell() {
    rosterHeaderCell?.remove();
    rosterHeaderCell = null;
  }

  // The header cell exists only while at least one row cell exists. That keeps
  // the header's hidden Score column and the rows' hidden Score column in step.
  function ensureRosterHeaderCell(root) {
    if (rowBindings.size === 0) {
      removeRosterHeaderCell();
      return null;
    }
    const header = resolveRosterHeader(root);
    const attackHeader = directAttackCell(header);
    if (!(header instanceof HTMLElement) || !(attackHeader instanceof HTMLElement)) {
      removeRosterHeaderCell();
      return null;
    }
    let cell = rosterHeaderCell;
    if (!(cell instanceof HTMLElement) || !cell.isConnected || cell.parentElement !== header) {
      removeRosterHeaderCell();
      cell = document.createElement("div");
      cell.className = "left";
      cell.dataset.ksTwdHeader = "dibs";
      cell.textContent = "DIBS";
      rosterHeaderCell = cell;
    }
    if (cell.nextElementSibling !== attackHeader) header.insertBefore(cell, attackHeader);
    updateSortHeaderLabel();
    return cell;
  }

  // DOM order, not Map insertion order. The signature has to describe what the
  // roster currently looks like, otherwise a reorder by another script is
  // invisible to us.
  function orderedBoundRows() {
    const root = mountedRosterRoot;
    if (!(root instanceof HTMLElement)) return [];
    return [...root.querySelectorAll("li.enemy")].filter(row => rowBindings.has(row));
  }

  function rosterOrderSignature() {
    return orderedBoundRows()
      .map(row => rowBindings.get(row)?.targetId || "")
      .join(",");
  }

  // Sorting is locked OFF in this script: WSE re-sorts ul.members-list on every
  // childList change and would undo a KS sort at once. The header is a plain
  // label -- no arrow, no click, no title.
  function updateSortHeaderLabel() {
    const cell = rosterHeaderCell;
    if (!(cell instanceof HTMLElement)) return;
    const text = `DIBS${DIBS_SORT_ARROW[dibsSortMode] || ""}`;
    if (cell.textContent !== text) cell.textContent = text;
    setTitleIfChanged(cell, "");
  }

  // A sort we did not perform means our arrow no longer describes the roster.
  // Clear it rather than reasserting the old order.
  function reconcileSortIndicator() {
    if (dibsSortMode === DIBS_SORT.OFF) return;
    const signature = rosterOrderSignature();
    if (!signature || signature === dibsSortSignature) return;
    dibsSortMode = DIBS_SORT.OFF;
    dibsSortSignature = "";
    updateSortHeaderLabel();
  }

  // 1.1.9 roster order. See the header note. Restored in removeAllRowPresentations.
  const rosterFirstSeen = new Map();
  let rosterFirstSeenNext = 0;
  let sortedRosterList = null;
  let sortedRosterListPrevious = null;
  const sortedRosterRows = new Set();
  // Every element KS ever wrote an order style to. Lets the roster observer
  // recognise its own style writes after the rows have left sortedRosterRows.
  const rosterOrderTouched = new WeakSet();
  const ROSTER_GROUP = Object.freeze({ OKAY: 0, HOSPITAL: 1, HOSPITAL_UNKNOWN: 2, TRAVEL: 3, OTHER: 4, UNBOUND: 5 });
  const ROSTER_GROUP_RANK = Object.freeze({
    desc: [0, 1, 2, 3, 4, 5],
    // Status up: hospital first. Index = group, value = rank.
    asc: [2, 0, 1, 3, 4, 5]
  });

  // Torn's own header for this list: "off" unless Status is the ONLY active
  // sort column. FFScouter's Stats sort leaves Torn's last icon active and adds
  // its own (measured 2026-10-03), so any active icon outside Status, or any
  // data-ffscouter-sort value, means someone else owns the order. Read only;
  // KS never clicks it.
  function rosterSortMode(list) {
    if (!(list instanceof HTMLElement)) return "off";
    let header = list.previousElementSibling;
    let icons = header instanceof HTMLElement ? [...header.querySelectorAll("[class*='activeIcon']")] : [];
    if (icons.length === 0) {
      icons = [...(list.parentElement?.querySelectorAll("[class*='activeIcon']") || [])]
        .filter(node => !list.contains(node));
      header = icons[0]?.closest(".white-grad, [class*='tableHeader'], [class*='headerWrap']") || list.parentElement;
    }
    if (icons.length === 0) return "off";
    if (header instanceof HTMLElement) {
      const ffSorted = [...header.querySelectorAll("[data-ffscouter-sort]")]
        .some(node => normalizeText(node.getAttribute("data-ffscouter-sort")) !== "");
      if (ffSorted) return "off";
    }
    let mode = "off";
    for (const icon of icons) {
      if (!(icon instanceof HTMLElement)) return "off";
      const column = icon.closest("[class*='tab___']") || icon.parentElement;
      if (!(column instanceof HTMLElement) || !/(^|\s)status(\s|___|$)/.test(column.className)) return "off";
      if (/asc___/.test(icon.className)) mode = "asc";
      else if (/desc___/.test(icon.className)) mode = "desc";
      else return "off";
    }
    return mode;
  }

  // The same Torn data the DIBS cell shows: in VIEW the merged members batch,
  // otherwise the opponent batch; the row text only when there is no API data.
  function rosterApiStatus(targetId) {
    const id = String(targetId || "");
    if (!viewOnlyMode()) return freshOpponentStatusForTarget(id);
    if (
      !Number.isFinite(viewMembersState.fetchedAt) ||
      nowMs() - viewMembersState.fetchedAt > CONFIG.opponentMembersMaxAgeMs
    ) return null;
    return viewMembersState.members.get(id) || null;
  }

  function rosterSortKey(binding) {
    // VIEW: the merged members batch, as the cell uses it. A member missing from
    // that batch falls back to the row's own evidence instead of "not hospital".
    const viewHospital = viewOnlyMode() ? viewHospitalForTarget(binding.targetId) : null;
    const apiHospital = viewHospital?.reason === "member-not-in-fetched-rosters" ? null : viewHospital;
    const hospital = apiHospital || computeHospitalSeconds(binding);
    if (hospital?.isHospital === true) {
      return Number.isFinite(hospital.seconds)
        ? { group: ROSTER_GROUP.HOSPITAL, seconds: hospital.seconds }
        : { group: ROSTER_GROUP.HOSPITAL_UNKNOWN, seconds: 0 };
    }
    const api = rosterApiStatus(binding.targetId);
    // Released: the until time has passed even if the state still says Hospital.
    if (hospital?.source === "torn-api-expired" || (api && isHospitalStatusValue(api.state) && hospitalUntilExpired(api.until))) {
      return { group: ROSTER_GROUP.OKAY, seconds: 0 };
    }
    const statusDiv = binding.statusDiv instanceof HTMLElement ? binding.statusDiv : directStatusCell(binding.row);
    const text = (normalizeText(api?.state) || normalizeText(statusDiv?.textContent)).toLowerCase();
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

  // Returns true when anything visible moved.
  function syncRosterOrder() {
    const rows = orderedBoundRows().filter(row => row.isConnected);
    const list = rows[0]?.parentElement || null;
    if (!(list instanceof HTMLElement) || !rows.every(row => row.parentElement === list)) {
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
      rosterOrderTouched.add(list);
      list.style.display = "flex";
      list.style.flexDirection = "column";
      changed = true;
    }
    const seq = targetId => {
      if (!rosterFirstSeen.has(targetId)) rosterFirstSeen.set(targetId, rosterFirstSeenNext++);
      return rosterFirstSeen.get(targetId);
    };
    const keyed = [];
    for (const row of rows) {
      const binding = rowBindings.get(row);
      if (!binding) continue;
      keyed.push({ row, seq: seq(binding.targetId), ...rosterSortKey(binding) });
    }
    const registered = new Set(keyed.map(item => item.row));
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
        rosterOrderTouched.add(item.row);
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

  // A style record that only differs in what syncRosterOrder writes (order on a
  // row; display/flex-direction on the list) is our own echo, not roster news.
  function rosterStyleWithoutOrder(value, isList) {
    const drop = isList ? /^(display|flex-direction)$/ : /^order$/;
    return String(value || "")
      .split(";")
      .map(part => part.trim())
      .filter(part => part && !drop.test(part.split(":")[0].trim().toLowerCase()))
      .join(";");
  }

  function isOwnRosterOrderMutation(record) {
    if (record?.type !== "attributes" || record.attributeName !== "style") return false;
    const target = record.target;
    if (!(target instanceof HTMLElement) || !rosterOrderTouched.has(target)) return false;
    const isList = target.tagName !== "LI";
    return rosterStyleWithoutOrder(record.oldValue, isList) === rosterStyleWithoutOrder(target.getAttribute("style"), isList);
  }

  // Exact detection contract ported from PDA v1.5.144. These attributes are
  // written by War Stuff Enhanced itself; FFScouter reads the same
  // data-twse-last-action-timestamp, which is why it is a reliable marker.
  function isWarStuffEnhancedPresent() {
    if (document.documentElement?.hasAttribute("data-twse-injected")) return true;
    const root = document.getElementById("faction_war_list_id");
    if (!(root instanceof HTMLElement)) return false;
    return Boolean(root.querySelector([
      "li.enemy[data-twse-last-action-timestamp]",
      "li.your[data-twse-last-action-timestamp]",
      ".twse-copy-btn[data-player-id]",
      ".status[data-twse-overridden]"
    ].join(",")));
  }

  // v0.1.0: War Stuff Enhanced is a coexistence partner, not a blocker. Its
  // presence is still read by isWarStuffEnhancedPresent() and reported on the
  // panel, but nothing is gated on it. The three call sites stay in place.
  function warStuffEnhancedGate() {
    return false;
  }

  function updateModeBadge() {
    const version = document.getElementById(SCRIPT.panelId)?.shadowRoot?.querySelector(".version");
    if (!(version instanceof HTMLElement)) return;
    const text = viewOnlyMode() ? `v${SCRIPT.version} TEST · VIEW` : `v${SCRIPT.version} TEST`;
    if (version.textContent !== text) version.textContent = text;
  }

  function createRowBinding(resolved) {
    const host = document.createElement("div");
    host.id = SCRIPT.rowHostPrefix + resolved.targetId;
    host.dataset.ksTwdPlayerId = resolved.targetId;
    host.dataset.ksTwdCell = "dibs";
    host.className = "left";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>
          :host { display:block; width:100%; height:100%; margin:0; box-sizing:border-box; }
          button { box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; min-width:0; min-height:0; margin:0; padding:1px 2px; border:1px solid #718096; border-radius:4px; background:#1a202c; color:#e2e8f0; font:800 9px/1.05 Arial,sans-serif; text-align:center; white-space:nowrap; touch-action:manipulation; overflow:hidden; cursor:pointer; -webkit-tap-highlight-color:transparent; }
          button.ready { border-color:#38a169; background:#22543d; color:#f0fff4; }
          button.free { border-color:#38b2ac; background:#234e52; color:#e6fffa; }
          button.lowhp { border-color:#d53f8c; background:#702459; color:#fff5f7; }
          button.locked { border-color:#975a16; background:#744210; color:#fefcbf; }
          button.prewar { border-color:#5f6875; background:#3b4048; color:#c5ccd5; filter:saturate(.35); }
          button.prewar:disabled { opacity:.72; }
          button.prewar .sub { color:#b8c0ca; }
          button.unknown { border-color:#9b2c2c; background:#742a2a; color:#fff5f5; }
          button.unavailable { border-color:#4a5568; background:#2d3748; color:#cbd5e0; }
          button.claimed { border-color:#3182ce; background:#2a4365; color:#ebf8ff; }
          button.blocked { border-color:#4a5568; background:#171923; color:#718096; }
          button.shared { border-color:#805ad5; background:#44337a; color:#faf5ff; }
          button.working { border-color:#0ea5e9; background:#0c4a6e; color:#e0f2fe; }
          button.cleanup { border-color:#dc2626; background:#7f1d1d; color:#fff1f2; }
          button:disabled { opacity:.55; cursor:default; }
          .label { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .sub { display:block; max-width:100%; margin-top:1px; overflow:hidden; color:inherit; font:700 6.6px/1 Arial,sans-serif; text-overflow:ellipsis; white-space:nowrap; opacity:.92; }
        </style>
        <button type="button" disabled data-state="loading" data-ready="false"><span class="label">DIBS</span><span class="sub">LOADING</span></button>
      `;
    shadow.querySelector("button")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      registerTrustedInteraction(event);
      if (viewOnlyMode()) return;
      const button = event.currentTarget;
      const binding = bindingForHost(host);
      const current = currentResolvedBinding(binding);
      if (!(button instanceof HTMLButtonElement) || !current) {
        if (binding) reconcileWarRow(binding.row);
        return;
      }

      const own = currentOwnClaim();
      const state = button.dataset.state;
      if ((state === "claimed" || state === "cleanup") && own?.targetId === current.targetId) {
        beginSharedWriteFeedback();
        void releaseOwnSharedTarget();
        return;
      }
      if (button.disabled || button.dataset.ready !== "true") return;
      if (own || sharedWriteBusy || ffCredentialChangeBusy() || !effectiveTornApiKey()) return;
      const playerName = normalizeText(current.profileAnchor.textContent) || current.targetId;
      beginSharedWriteFeedback();
      void claimSharedTarget(current.targetId, playerName);
    });

    const binding = { ...resolved, host };
    if (resolved.attackCell.parentElement !== resolved.row) return null;
    resolved.row.insertBefore(host, resolved.attackCell);
    rowBindings.set(resolved.row, binding);
    return binding;
  }

  function rowPresentationDescriptor(playerId, decision, sharedClaim) {
    const own = currentOwnClaim();
    if (viewOnlyMode()) {
      return { relevant: true, label: "VIEW", className: "unavailable" };
    }
    if (pendingTargetId === playerId) {
      return {
        relevant: true,
        label: claimFlowState === CLAIM_FLOW_STATE.RELEASING ? "RELEASE…" : "CLAIM…"
      };
    }
    if (own?.targetId === playerId) {
      return { relevant: true, label: own.cleanupRequired === true ? "QUEUED" : "RELEASE" };
    }
    if (decision?.state === TARGET_STATE.FREE) return { relevant: true, label: Number.isFinite(decision.seconds) ? formatCellCountdown(decision.seconds) : "FREE", className: "free" };
    if (sharedClaim) return { relevant: true, label: "TAKEN" };
    // A claim for this target arrived unreadable. We cannot say it is free.
    if (sharedClaimsUnreadable.has(playerId)) return { relevant: true, label: "DIBS?", className: "unavailable" };
    // The claim board has not been read: a claimable target is not known to be free.
    if (decision?.state === TARGET_STATE.READY && effectiveTornApiKey() && ksBoardUnknown()) return { relevant: true, label: "DIBS?", className: "unavailable" };
    if (decision?.state === TARGET_STATE.READY) return { relevant: true, label: "READY" };
    if (decision?.state === TARGET_STATE.LOCKED) {
      if (decision.reason === "rw-not-started") return { relevant: true, label: "PREWAR" };
      if (decision.reason === "rw-phase-unverifiable") {
        return { relevant: true, label: "WAIT" };
      }
      if (decision.reason === "hospital-too-early" && Number.isFinite(decision.seconds)) {
        return { relevant: true, label: formatCellCountdown(decision.seconds) || "HOSP" };
      }
      if (
        (decision.reason === "fair-fight-too-low" || decision.reason === "fair-fight-too-high") &&
        Number.isFinite(decision.fairFight)
      ) {
        return { relevant: true, label: `FF${Number(decision.fairFight).toFixed(2)}` };
      }
      return { relevant: true, label: "LOCKED" };
    }
    if (decision?.state === TARGET_STATE.UNKNOWN) {
      if (decision.reason === "hospital-timer-unverifiable") {
        return { relevant: true, label: "HOSP?" };
      }
      if (decision.reason === "fair-fight-unverifiable") {
        return { relevant: true, label: "FF?" };
      }
      return { relevant: true, label: "WAIT", className: "unavailable" };
    }
    if (decision?.state === TARGET_STATE.BLOCKED) {
      return { relevant: true, label: "LOCKED", className: "blocked" };
    }
    return { relevant: false, label: "", className: "unavailable" };
  }

  function renderDibsControl(binding, decision, sharedClaim) {
    const host = binding?.host;
    const button = host?.shadowRoot?.querySelector("button");
    const label = host?.shadowRoot?.querySelector(".label");
    const sub = host?.shadowRoot?.querySelector(".sub");
    if (!button || !label || !sub || !decision) return;
    const playerId = String(binding?.targetId || "");
    const own = currentOwnClaim();
    const presentation = rowPresentationDescriptor(playerId, decision, sharedClaim);
    host.dataset.ksTwdPresentationRelevant = presentation.relevant ? "true" : "false";
    button.dataset.compactLabel = presentation.label;
    button.setAttribute("aria-label", presentation.label ? `DIBS ${presentation.label}` : "DIBS hidden");
    const nextVisibility = presentation.relevant ? "" : "hidden";
    if (host.style.visibility !== nextVisibility) host.style.visibility = nextVisibility;
    button.dataset.ready = "false";
    button.dataset.ksTitle = "";
    // Both values stay reachable on hover in every state, so a locked or
    // already claimed target can still be sized up without switching
    // FFScouter's column back and forth.
    const rowValues = rowValueTooltip(binding);
    if (rowValues) button.dataset.ksTitle = rowValues;

    if (viewOnlyMode()) {
      // Torn does not put the hospital time in the roster, so the value comes
      // from the merged members batch for the factions on screen, with the row
      // itself as a fallback for the day Torn starts rendering it.
      const apiHospital = viewHospitalForTarget(binding.targetId);
      const hospital = apiHospital || computeHospitalSeconds(binding);
      const countdown = hospital.isHospital ? formatCellCountdown(hospital.seconds) : "";
      const reason = apiHospital?.reason || "no-torn-data";
      button.className = "unavailable";
      button.dataset.state = "view";
      button.dataset.viewReason = reason;
      button.dataset.hospitalSeconds = Number.isFinite(hospital.seconds) ? String(hospital.seconds) : "";
      button.disabled = true;
      if (countdown) {
        label.textContent = countdown;
        sub.textContent = complementaryRowValue(binding) || "VIEW";
        button.dataset.ksTitle = `${rowValues ? `${rowValues} · ` : ""}In hospital; the countdown is in the cell. Read-only preview: DIBS is available only on your own faction's active Ranked War.`;
        return;
      }
      const diagnostic = {
        "not-hospital": { label: "OK", title: "Torn reports this member is not in hospital." },
        "hospital-without-until": { label: "HOSP", title: "Torn reports hospital but gave no usable release time." },
        "member-not-in-fetched-rosters": { label: "VIEW", sub: "NO ID", title: "This member is in neither fetched roster. Side resolution failed." },
        "no-torn-data": { label: "VIEW", title: "No Torn status batch yet. A Torn API key is required for VIEW countdowns." }
      }[reason] || { label: "VIEW", title: "Read-only preview." };
      label.textContent = diagnostic.label;
      sub.textContent = diagnostic.sub || "VIEW";
      button.dataset.ksTitle = `${diagnostic.title} Read-only preview: DIBS is available only on your own faction's active Ranked War.`;
      return;
    }

    if (pendingTargetId === playerId) {
      button.className = "working"; button.dataset.state = "working"; button.disabled = true;
      label.textContent = claimFlowState === CLAIM_FLOW_STATE.RELEASING ? "RELEASING" : "CLAIMING"; sub.textContent = "WAIT"; return;
    }
    if (own?.targetId === playerId) {
      const cleanup = own.cleanupRequired === true;
      button.className = cleanup ? "cleanup" : "claimed"; button.dataset.state = cleanup ? "cleanup" : "claimed"; button.disabled = !effectiveTornApiKey() || sharedWriteBusy || ffCredentialChangeBusy();
      label.textContent = cleanup ? "QUEUED" : "DIBBED"; sub.textContent = "RELEASE"; return;
    }
    if (decision.state === TARGET_STATE.FREE) {
      button.className = "free"; button.dataset.state = "free"; button.disabled = true;
      label.textContent = Number.isFinite(decision.seconds) ? formatCellCountdown(decision.seconds) : "FREE";
      sub.textContent = "ONLINE";
      button.dataset.ksTitle = "Online: free for all. DIBS is only for Idle or Offline targets.";
      return;
    }
    if (sharedClaim) {
      const firstName = normalizeText(sharedClaim.first?.claimer?.name) || "UNKNOWN";
      const extraCount = Math.max(0, sharedClaim.queue.length - 1);
      button.className = "shared"; button.dataset.state = "shared"; button.disabled = true; label.textContent = "TAKEN"; sub.textContent = extraCount > 0 ? `${firstName} +${extraCount}` : firstName; return;
    }
    if (sharedClaimsUnreadable.has(playerId)) {
      button.className = "unavailable"; button.dataset.state = "unreadable"; button.disabled = true;
      label.textContent = "DIBS?"; sub.textContent = "UNKNOWN";
      button.dataset.ksTitle = `${rowValues ? `${rowValues} · ` : ""}The KS War Room server could not read the claim for this target. It may already be taken. KS will not guess.`;
      return;
    }

    button.className = presentation.className ||
      (decision.reason === "rw-not-started" || decision.reason === "rw-phase-unverifiable"
        ? "prewar"
        : decision.state);
    button.dataset.state = decision.state;
    label.textContent = presentation.label || "DIBS";

    if (decision.state === TARGET_STATE.BLOCKED) { button.disabled = true; label.textContent = "BLOCKED"; sub.textContent = own?.claimerName || "ACTIVE"; return; }
    if (decision.state === TARGET_STATE.READY) {
      if (!effectiveTornApiKey()) { button.disabled = true; sub.textContent = "SET TORN KEY"; return; }
      // The countdown is what the caller acts on, so it gets the 9px line.
      // "1:23 · FF4.9" did not fit the cell on one 6.6px line and ellipsised.
      const timer = Number.isFinite(decision.seconds) ? formatCellCountdown(decision.seconds) : "";
      if (ksBoardUnknown()) {
        // Fail closed: the KS War Room board has not been read for this war, so
        // nobody can say this target is free. The countdown stays readable.
        button.className = "unavailable"; button.dataset.state = "unreadable"; button.disabled = true;
        label.textContent = timer || "DIBS?"; sub.textContent = timer ? "DIBS?" : "UNKNOWN";
        button.dataset.ksTitle = `${rowValues ? `${rowValues} · ` : ""}The KS War Room claim board has not answered. This target may already be taken. KS will not guess.`;
        return;
      }
      button.disabled = sharedWriteBusy || ffCredentialChangeBusy();
      button.dataset.ready = button.disabled ? "false" : "true";
      label.textContent = timer || "DIBS";
      if (decision.lowHp === true) {
        const life = freshLifeForTarget(playerId);
        if (!life) {
          button.className = "unknown"; button.dataset.state = "unknown";
          button.disabled = true; button.dataset.ready = "false";
          sub.textContent = "CHECKING";
          button.dataset.ksTitle = "Low life reading unavailable";
          return;
        }
        button.className = "lowhp";
        const percentage = life ? Math.round(life.ratio * 100) : null;
        sub.textContent = percentage === null ? "HP ?" : `HP ${percentage}%`;
        button.dataset.ksTitle = life
          ? `Low life ${percentage}% (read ${Math.max(0, Math.floor((nowMs() - life.fetchedAt) / 1000))} s ago) · Fair Fight ${Number(decision.fairFight).toFixed(2)} · allowed FF ${CONFIG.minFairFight.toFixed(2)}–${CONFIG.lowHpMaxFairFight.toFixed(2)} for low-life targets`
          : "Low life reading unavailable";
        return;
      }
      sub.textContent = complementaryRowValue(binding) || `FF${Number(decision.fairFight).toFixed(1)}`;
      const values = rowValueTooltip(binding);
      button.dataset.ksTitle = `${values ? `${values} · ` : ""}allowed FF ${CONFIG.minFairFight.toFixed(2)}-${CONFIG.maxFairFight.toFixed(2)}`;
      return;
    }

    button.disabled = true;
    if (decision.state === TARGET_STATE.LOCKED) {
      if (decision.reason === "rw-not-started" || decision.reason === "rw-phase-unverifiable") {
        if (decision.prewarHospital && Number.isFinite(decision.seconds)) {
          sub.textContent = formatCountdown(decision.seconds) || "HOSP";
        } else if (!decision.prewarHospital) {
          sub.textContent = "";
        } else {
          sub.textContent = "HOSP";
        }

        button.dataset.ksTitle = decision.reason === "rw-not-started"
          ? "DIBS locked until Ranked War starts"
          : "DIBS locked: Ranked War start state cannot be verified";
      } else if (decision.reason === "fair-fight-too-low" || decision.reason === "fair-fight-too-high") {
        sub.textContent = Number.isFinite(decision.fairFight) ? `FF${Number(decision.fairFight).toFixed(2)}` : "LOCKED";
      } else {
        // rowPresentationDescriptor already put the countdown in the label for
        // hospital-too-early, so repeating it in the sub wasted the second line.
        const countdown = formatCellCountdown(decision.seconds);
        sub.textContent = countdown ? "HOSP" : "LOCKED";
        if (Number.isFinite(decision.seconds)) {
          button.dataset.ksTitle = `In hospital; the countdown is in the cell. DIBS unlocks at ${formatCellCountdown(CONFIG.gateSeconds)} remaining.`;
        }
      }
      return;
    }
    if (decision.state === TARGET_STATE.UNKNOWN) {
      sub.textContent = "UNKNOWN";
      return;
    }
    if (decision.state === TARGET_STATE.UNAVAILABLE) { sub.textContent = ""; return; }
    sub.textContent = "LOCKED";
  }

  // Writing the title attribute, even with the same text, makes the browser
  // hide and re-show the native tooltip. Every title the script maintains goes
  // through here so a resting pointer never sees it blink.
  function setTitleIfChanged(element, text) {
    if (!(element instanceof Element)) return;
    const wanted = String(text ?? "");
    if (wanted) {
      if (element.title !== wanted) element.title = wanted;
    } else if (element.hasAttribute("title")) {
      element.removeAttribute("title");
    }
  }

  // The native tooltip is torn down and shown again every time the title
  // attribute is written, so writing it once a second made the tooltip blink
  // once a second while the pointer rested on a cell (owner, 2026-09-03). The
  // render pass now stages the wanted text in a data attribute and the real
  // title is touched only when that text differs from what is already there.
  // Live countdowns are no longer part of the text at all: the cell shows them.
  function updateDibsControl(binding, decision, sharedClaim) {
    renderDibsControl(binding, decision, sharedClaim);
    const button = binding?.host?.shadowRoot?.querySelector("button");
    if (!button) return;
    setTitleIfChanged(button, button.dataset.ksTitle || "");
  }

  function bindingForTarget(targetId) {
    const rawId = String(targetId || "").trim();
    if (!validTargetId(rawId)) return null;
    const id = String(Number(rawId));
    const matches = [];
    for (const binding of rowBindings.values()) {
      if (binding.targetId !== id) continue;
      const current = currentResolvedBinding(binding);
      if (!current) continue;
      binding.id = current.targetId;
      binding.li = current.row;
      binding.statusDiv = current.statusDiv;
      binding.profileAnchor = current.profileAnchor;
      matches.push(binding);
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function decisionForBinding(binding) {
    if (!binding || rowBindings.get(binding.row) !== binding) return null;
    const hospital = computeHospitalSeconds(binding);
    if (
      !validTargetId(selfFactionId) ||
      !validTargetId(opponentFactionId) ||
      currentWarSurface?.opponentFactionId !== opponentFactionId
    ) {
      return {
        state: TARGET_STATE.UNKNOWN,
        seconds: hospital.seconds,
        fairFight: readRowFairFight(binding.row),
        reason: "opponent-unverifiable",
        mode: "unknown"
      };
    }
    return classifyTargetState({
      playerId: binding.targetId,
      ownClaim: currentOwnClaim(),
      isHospital: hospital.isHospital,
      seconds: hospital.seconds,
      fairFight: readRowFairFight(binding.row),
      rwPhase: currentRwPhase(),
      activity: freshOpponentActivityForTarget(binding.targetId),
      lowHp: lowHpForTarget(binding.targetId)
    });
  }

  function updateBoundControls() {
    if (!runtimeActive || !isRuntimeEligible()) return;
    for (const binding of rowBindings.values()) {
      const decision = decisionForBinding(binding);
      if (!decision) continue;
      updateDibsControl(binding, decision, sharedClaimForTarget(binding.targetId));
    }
  }

  function reconcileWarRow(row) {
    if (!(row instanceof HTMLElement)) return null;
    let existing = rowBindings.get(row) || null;
    if (
      existing &&
      (!existing.host.isConnected || existing.host.parentElement !== row)
    ) {
      retireRowBinding(row);
      existing = null;
    }
    let resolved = resolveLiveWarRow(row);

    if (
      existing &&
      (
        !resolved ||
        resolved.targetId !== existing.targetId ||
        resolved.attackCell !== existing.attackCell
      )
    ) {
      retireRowBinding(row);
      resolved = resolveLiveWarRow(row);
    }

    if (!resolved) {
      retireRowBinding(row);
      return null;
    }

    let binding = rowBindings.get(row) || null;
    if (!binding) {
      binding = createRowBinding(resolved);
    } else {
      binding.id = resolved.targetId;
      binding.li = row;
      binding.statusDiv = resolved.statusDiv;
      binding.profileAnchor = resolved.profileAnchor;
    }

    const decision = decisionForBinding(binding);
    if (decision) updateDibsControl(binding, decision, sharedClaimForTarget(binding.targetId));
    return binding;
  }

  function retireMissingRowBindings() {
    for (const row of [...rowBindings.keys()]) {
      if (
        !(mountedRosterRoot instanceof HTMLElement) ||
        !mountedRosterRoot.contains(row) ||
        !row.matches("li.enemy")
      ) {
        retireRowBinding(row);
      }
    }
  }

  function scanWarRows() {
    if (warStuffEnhancedGate()) return;
    if (!runtimeActive || !bridgeMounted) return;
    const root = document.getElementById("faction_war_list_id");
    if (!(root instanceof HTMLElement)) {
      removeAllRowPresentations();
      return;
    }

    if (root !== mountedRosterRoot) {
      removeAllRowPresentations();
      mountedRosterRoot = root;
    }

    ensureRosterStyle(root);
    for (const row of root.querySelectorAll("li.enemy")) reconcileWarRow(row);
    retireMissingRowBindings();
    syncRosterOrder();
    ensureRosterHeaderCell(root);
    reconcileSortIndicator();
    updateModeBadge();
    if (viewOnlyMode()) {
      // The claim board is not read in VIEW, so say that instead of leaving
      // the panel reporting a connection that will never be made.
      if (sharedStatus.state !== "offline" || sharedStatus.message !== "War Room: VIEW read-only") {
        setSharedStatus("offline", "War Room: VIEW read-only", 0);
      }
      void fetchViewMembers();
    }
    schedulePresentationLayout();
  }


  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  function loadPanelMinimizedPreference() {
    try { return localStorage.getItem(SCRIPT.panelMinimizedStorageKey) === "1"; }
    catch { return false; }
  }

  function persistPanelMinimizedPreference() {
    try { localStorage.setItem(SCRIPT.panelMinimizedStorageKey, panelMinimized ? "1" : "0"); }
    catch {}
  }

  function applyPanelMinimizedState(host) {
    if (!(host instanceof HTMLElement) || !host.shadowRoot) return;
    host.dataset.ksTwdPanelMinimized = String(panelMinimized);
    const toggle = host.shadowRoot.querySelector("[data-role='panel-toggle']");
    if (toggle instanceof HTMLButtonElement) {
      toggle.textContent = panelMinimized ? "Expand" : "Minimize";
      toggle.setAttribute("aria-expanded", String(!panelMinimized));
      toggle.setAttribute("aria-label", panelMinimized ? "Expand KS Torn War Dibs PC panel" : "Minimize KS Torn War Dibs PC panel");
      toggle.title = panelMinimized ? "Expand panel" : "Minimize panel";
    }
  }

  function setPanelMinimized(next, host) {
    panelMinimized = Boolean(next);
    persistPanelMinimizedPreference();
    applyPanelMinimizedState(host);
    placePanel(host);
    schedulePresentationLayout();
  }

  const ownedPanelHosts = new WeakSet();

  // Between FFScouter's filter and sort controls and the roster. If FFScouter is
  // not running, fall back to the war block, then to the roster root.
  function resolvePanelAnchor() {
    const roster = mountedRosterRoot?.isConnected
      ? mountedRosterRoot
      : document.getElementById("faction_war_list_id");
    if (!(roster instanceof HTMLElement)) return null;
    const filterBox = document.querySelector("[data-ff-filter-box]");
    if (filterBox instanceof HTMLElement && filterBox.isConnected && filterBox.parentElement) {
      return { parent: filterBox.parentElement, before: filterBox.nextSibling };
    }
    const card = canonicalRankedWarSurface()?.selected?.card || null;
    const warBlock = card?.closest(".faction-war") || roster.querySelector(".faction-war");
    if (warBlock instanceof HTMLElement && warBlock.parentElement) {
      return { parent: warBlock.parentElement, before: warBlock };
    }
    if (roster.parentElement) return { parent: roster.parentElement, before: roster };
    return null;
  }

  function placePanel(host) {
    if (!(host instanceof HTMLElement)) return false;
    const anchor = resolvePanelAnchor();
    if (!anchor) {
      host.style.display = "none";
      return false;
    }
    host.style.display = "block";
    if (anchor.before === host) return true;
    if (host.parentElement !== anchor.parent || host.nextSibling !== anchor.before) {
      anchor.parent.insertBefore(host, anchor.before);
    }
    return true;
  }

  function ensurePanel() {
    if (!isWarPanelPresent()) return null;
    let host = document.getElementById(SCRIPT.panelId);
    if (host instanceof HTMLElement && ownedPanelHosts.has(host)) {
      applyPanelMinimizedState(host);
      placePanel(host);
      return host;
    }
    host?.remove();
    host = document.createElement("div");
    host.id = SCRIPT.panelId;
    host.dataset.ksTwdPanel = "1";
    ownedPanelHosts.add(host);
    // In-flow block, not a floating overlay. Width comes from the content
    // column it is inserted into.
    Object.assign(host.style, {
      display: "block",
      position: "static",
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      margin: "8px 0",
      isolation: "isolate",
      pointerEvents: "auto"
    });
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all:initial; display:block; position:fixed; z-index:2147483647; isolation:isolate; pointer-events:auto; box-sizing:border-box; overflow:visible; }
        .panel { box-sizing:border-box; width:100%; padding:10px 12px 9px; border:1px solid rgba(100,116,139,.55); border-radius:8px; background:rgba(15,23,42,.96); color:#dbe5f1; font-family:system-ui,sans-serif; }
        .top { display:flex; justify-content:space-between; align-items:center; gap:6px; min-width:0; }
        .brand { font:850 13px/1.25 system-ui,sans-serif; color:#f8fafc; }
        .version { font:750 10px/1.25 system-ui,sans-serif; color:#8fa0b4; }
        .top-actions { display:flex; align-items:center; justify-content:flex-end; gap:5px; }
        .compact-brand,.compact-status { display:none; }
        .compact-brand { color:#f8fafc; font:850 12px/1.25 system-ui,sans-serif; white-space:nowrap; }
        .compact-status { min-width:0; align-items:center; gap:5px; color:#cbd5e1; font:800 11px/1.25 system-ui,sans-serif; white-space:nowrap; }
        .panel-toggle { flex:0 0 auto; padding:4px 9px; border:1px solid rgba(148,163,184,.45); border-radius:5px; color:#dbe5f1; font:750 10px/1.25 system-ui,sans-serif; text-decoration:none !important; }
        .status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:6px; margin-top:8px; }
        .status-item { min-width:0; display:flex; align-items:center; gap:6px; padding:6px 8px; border:1px solid rgba(100,116,139,.25); border-radius:6px; background:rgba(2,6,23,.45); }
        .dot { flex:0 0 7px; width:7px; height:7px; border-radius:50%; background:#64748b; }
        [data-state='ready'] .dot,[data-state='online'] .dot { background:#22c55e; }
        [data-state='upcoming'] .dot,[data-state='degraded'] .dot { background:#f59e0b; }
        [data-state='syncing'] .dot,[data-state='writing'] .dot { background:#38bdf8; }
        [data-state='error'] .dot,[data-state='offline'] .dot,[data-state='unknown'] .dot,[data-state='ended'] .dot { background:#ef4444; }
        .status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#cbd5e1; font:700 11px/1.3 system-ui,sans-serif; }
        .controls { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-top:8px; }
        button,a { border:0; padding:0; background:none; color:#94a3b8; font:700 11px/1.3 system-ui,sans-serif; text-decoration:none; cursor:pointer; }
        button:hover,a:hover { color:#fff; text-decoration:underline; }
        button:disabled { opacity:.4; cursor:default; text-decoration:none; }
        .sep { color:#667386; font:700 11px/1 system-ui,sans-serif; }
        .test-toggle { padding:3px 6px; border:1px solid #92400e; border-radius:5px; color:#fbbf24; text-decoration:none !important; }
        .test-toggle.on { border-color:#f59e0b; background:#78350f; color:#fffbeb; }
        .test-toggle[hidden] { display:none; }
        .editor { display:none; align-items:center; gap:5px; margin-top:5px; }
        .editor.open { display:flex; }
        .editor input { min-width:0; flex:1 1 180px; height:28px; box-sizing:border-box; border:1px solid #64748b; border-radius:5px; background:#111827; color:#f8fafc; padding:4px 7px; font:700 10px/1 system-ui,sans-serif; outline:none; }
        .note { margin-top:7px; color:#8794a5; font:600 10px/1.4 system-ui,sans-serif; }
        .api-policy { margin-top:9px; padding-top:8px; border-top:1px solid rgba(148,163,184,.18); color:#9aa9ba; font:600 9px/1.45 system-ui,sans-serif; }
        .api-policy strong { color:#d8e1eb; font-weight:750; }
        .api-policy a { color:#b9d7f2; text-decoration:underline; }
        .warning { color:#fbbf24; }
        :host([data-ks-twd-panel-minimized='true']) .panel { padding:5px 7px; }
        :host([data-ks-twd-panel-minimized='true']) .brand,
        :host([data-ks-twd-panel-minimized='true']) .version,
        :host([data-ks-twd-panel-minimized='true']) .status-grid,
        :host([data-ks-twd-panel-minimized='true']) .controls,
        :host([data-ks-twd-panel-minimized='true']) .editor,
        :host([data-ks-twd-panel-minimized='true']) .note,
        :host([data-ks-twd-panel-minimized='true']) .api-policy { display:none; }
        :host([data-ks-twd-panel-minimized='true']) .compact-brand,
        :host([data-ks-twd-panel-minimized='true']) .compact-status { display:flex; }
        @media (max-width:520px) { .status-grid { grid-template-columns:1fr; } .panel { padding-left:8px; padding-right:8px; } }
      </style>
      <div class="panel">
        <div class="top"><span class="brand">KS Torn War Dibs PC</span><span class="compact-brand" data-role="compact-brand">KS DIBS PC</span><span class="compact-status" data-role="compact-status"><span class="dot"></span><span data-role="compact-status-text">WAIT</span></span><span class="top-actions"><span class="version">v${SCRIPT.version} TEST</span><button class="panel-toggle" type="button" data-role="panel-toggle" aria-expanded="true">Minimize</button></span></div>
        <div class="status-grid">
          <div class="status-item" data-role="shared-item"><span class="dot"></span><span class="status" data-role="status">War Room: CHECKING…</span></div>
          <div class="status-item" data-role="torn-item"><span class="dot"></span><span class="status" data-role="torn-status">Torn: loading…</span></div>
          <div class="status-item" data-role="rw-item"><span class="dot"></span><span class="status" data-role="rw-status">DIBS: checking RW…</span></div>
          <div class="status-item" data-role="ff-item"><span class="dot"></span><span class="status" data-role="ff-status">FF: waiting…</span></div>
          <div class="status-item" data-role="life-item"><span class="dot"></span><span class="status" data-role="life-status">Life: 0 targets read · newest unknown</span></div>
          <div class="status-item" data-role="wse-item"><span class="dot"></span><span class="status" data-role="wse-status">WSE: checking…</span></div>
        </div>
        <div class="controls">
          <button type="button" data-role="key">FFScouter key</button><span class="sep">·</span>
          <button type="button" data-role="torn-key">Torn key</button><span class="sep">·</span>
          <a data-role="create-key" target="_blank" rel="noopener noreferrer">Create custom API key</a><span class="sep">·</span>
          <button type="button" data-role="sync">Sync</button><span class="sep">·</span>
          <button type="button" data-role="forget-ff">Forget FF key</button><span class="sep">·</span>
          <button type="button" data-role="forget-torn">Forget Torn key</button><span class="sep">·</span>
          <button type="button" data-role="release">Release active DIBS</button>
        </div>
        <div class="editor" data-role="key-editor"><input data-role="key-input" type="text" maxlength="16" autocomplete="off" placeholder="16-character FFScouter key"><button type="button" data-role="key-save">Save</button><button type="button" data-role="key-cancel">Cancel</button></div>
        <div class="editor" data-role="torn-key-editor"><input data-role="torn-key-input" type="text" maxlength="16" autocomplete="off" placeholder="16-character Torn API key"><button type="button" data-role="torn-key-save">Save</button><button type="button" data-role="torn-key-cancel">Cancel</button></div>
        <div class="note" data-role="note">LIVE: Hospital ≤2:00 + FF 2.00–3.40. Online targets are free for all. Low life (≤20%): FF up to 4.50. First successful DIBS wins; claimant can RELEASE.</div>
        <div class="api-policy">
          <strong>Torn API key:</strong> stored only locally, encrypted in this browser; sent to api.torn.com and, when signing in, to the KS War Room server, which asks Torn who the key belongs to and does not store or log it. Purpose: key-owner identity, own-faction Ranked War state, one opponent-members status batch while the roster is visible, and one final target basic check immediately before DIBS, and life of opponents who are about to leave hospital (low-life DIBS), and the names of your own faction's members for the DIBS column (one request at most every 5 minutes, kept in memory only). Required selections: faction → members,wars and user → basic, profile.
          <br>
          <strong>KS War Room (shared DIBS):</strong> the claim board, claim and release go to the KS War Room server (ks-war-room-claims.hans-viklund.workers.dev). Signing in returns a temporary sign-in slip that is held only in this page's memory and is never stored. While your own war roster is visible the claim board is read every 2.5 seconds; when a claimed target is back in hospital its new hospital time is reported so the claim can be released. What is sent: your Torn API key (sign-in only), the war ID, target IDs and hospital times. The server keeps claims (target, your Torn ID, times) for less than a day.
          <br>
          Data Storage: Temporary (&lt; 1 day) · Data Sharing: Faction · Purpose of Use: Competitive advantage · Key Storage &amp; Sharing: Not stored/shared · Key Access Level: Public
          <br>
          <strong>FFScouter key/integration:</strong> key stored only locally, encrypted in this browser; sent only to FFScouter's get-stats endpoint for Fair Fight and battle-stat estimates of the opponent roster (one batched request, refreshed at most once a minute). FFScouter is not used for DIBS.
          <a data-role="ff-terms" target="_blank" rel="noopener noreferrer">FFScouter terms/data policy</a> · <a data-role="ff-privacy" target="_blank" rel="noopener noreferrer">Privacy</a>.
          <br>
          <strong>War Stuff Enhanced:</strong> detected read-only. This script never writes to, hides or moves anything War Stuff Enhanced renders.
        </div>
      </div>
    `;
    const byRole = role => shadow.querySelector(`[data-role='${role}']`);
    byRole("create-key").href = SCRIPT.tornCustomKeyUrl;
    byRole("ff-terms").href = SCRIPT.ffscouterTermsUrl;
    byRole("ff-privacy").href = SCRIPT.ffscouterPrivacyUrl;
    byRole("key")?.addEventListener("click", event => { registerTrustedInteraction(event); beginFfCredentialEdit(); });
    byRole("torn-key")?.addEventListener("click", event => { registerTrustedInteraction(event); if (!injectedPdaTornApiKey()) byRole("torn-key-editor")?.classList.add("open"); });
    byRole("key-cancel")?.addEventListener("click", cancelFfCredentialEdit);
    byRole("torn-key-cancel")?.addEventListener("click", () => byRole("torn-key-editor")?.classList.remove("open"));
    byRole("key-save")?.addEventListener("click", () => void saveSharedKeyFromEditor());
    byRole("torn-key-save")?.addEventListener("click", () => void saveTornKeyFromEditor());
    byRole("sync")?.addEventListener("click", event => {
      event.preventDefault(); registerTrustedInteraction(event);
      refreshCurrentWarSurface({ structural: true });
      // One press on Sync allows one sign-in with a Torn key that was refused.
      if (effectiveTornApiKey()) { ksAllowManualSignIn(); void fetchSharedClaims(); }
      if (sharedApiKey) void fetchFairFightStats({ force: true });
      if (effectiveTornApiKey()) void fetchTornStatuses({ force: true });
      scanWarRows();
    });
    byRole("forget-ff")?.addEventListener("click", () => void forgetSharedKey());
    byRole("forget-torn")?.addEventListener("click", () => void forgetTornKey());
    byRole("release")?.addEventListener("click", () => { beginSharedWriteFeedback(); void releaseOwnSharedTarget(); });
    byRole("panel-toggle")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setPanelMinimized(!panelMinimized, host);
    });
    applyPanelMinimizedState(host);
    placePanel(host);
    updatePanel();
    return host;
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

  function updatePanel() {
    if (!runtimeActive || !isRuntimeEligible()) return;
    const host = document.getElementById(SCRIPT.panelId);
    if (!host?.shadowRoot) return;
    const $ = role => host.shadowRoot.querySelector(`[data-role='${role}']`);
    const sharedItem = $("shared-item"); const tornItem = $("torn-item"); const rwItem = $("rw-item");
    if (sharedItem) sharedItem.dataset.state = sharedStatus.state;
    if (tornItem) tornItem.dataset.state = tornStatusState.state;

    const rwState = currentRwPhase();
    if (rwItem) {
      rwItem.dataset.state = rwState.phase === RW_PHASE.LIVE
        ? "online"
        : (rwState.phase === RW_PHASE.PREWAR ? "idle" : "error");
    }
    const compactStatus = $("compact-status");
    const compactStatusText = $("compact-status-text");
    if (compactStatus) {
      compactStatus.dataset.state = rwState.phase === RW_PHASE.LIVE
        ? "online"
        : (rwState.phase === RW_PHASE.PREWAR ? "upcoming" : "unknown");
    }
    if (compactStatusText) {
      compactStatusText.textContent = rwState.phase === RW_PHASE.LIVE
        ? "LIVE"
        : (rwState.phase === RW_PHASE.PREWAR ? "PREWAR" : "WAIT");
    }
    if ($("rw-status")) {
      $("rw-status").textContent = rwState.phase === RW_PHASE.LIVE
        ? "RW: LIVE"
        : (rwState.phase === RW_PHASE.PREWAR ? `RW: PREWAR · ${formatRwRunway(rwState.runwaySeconds)}` : "RW: UNKNOWN");
      setTitleIfChanged($("rw-status"), rwState.phase === RW_PHASE.LIVE ? "Own-faction /wars confirms this Ranked War is live" : "DIBS remains locked until own-faction /wars confirms LIVE");
    }
    if ($("status")) { $("status").textContent = sharedStatus.message; setTitleIfChanged($("status"), sharedStatus.message); }
    if ($("ff-item")) $("ff-item").dataset.state = fairFightStatus.state;
    if ($("ff-status")) {
      if ($("ff-status").textContent !== fairFightStatus.message) $("ff-status").textContent = fairFightStatus.message;
      setTitleIfChanged($("ff-status"), fairFightStatus.message);
    }
    if ($("life-status")) {
      const lifeText = lifeStatusMessage();
      $("life-status").textContent = lifeText;
      setTitleIfChanged($("life-status"), lifeText);
      if ($("life-item")) $("life-item").dataset.state = lifeProfileMissing ? "unknown" : "idle";
    }
    // Read only. Nothing is gated on WSE; the line just says whether it is here.
    const wseText = isWarStuffEnhancedPresent() ? "WSE: detected" : "WSE: not detected";
    if ($("wse-status")) {
      if ($("wse-status").textContent !== wseText) $("wse-status").textContent = wseText;
      setTitleIfChanged($("wse-status"), "War Stuff Enhanced is read-only for this script: nothing it renders is written to, hidden or moved.");
    }
    if ($("torn-status")) { $("torn-status").textContent = tornStatusState.message; setTitleIfChanged($("torn-status"), tornStatusState.message); }
    const ffExternalLock = ffCredentialExternalLockActive();
    const ffChangeBusy = ffCredentialChangeBusy();
    if ($("key")) {
      $("key").textContent = sharedApiKey ? "Change FF key" : "Set FFScouter key";
      $("key").disabled = ffExternalLock || ffChangeBusy;
    }
    if ($("forget-ff")) $("forget-ff").disabled = !sharedApiKey || ffExternalLock || ffChangeBusy;
    if ($("key-input")) $("key-input").disabled = ffExternalLock || ffCredentialChangeState !== FF_CREDENTIAL_STATE.EDITING;
    if ($("key-save")) $("key-save").disabled = ffExternalLock || ffCredentialChangeState !== FF_CREDENTIAL_STATE.EDITING;
    if ($("key-cancel")) $("key-cancel").disabled = ffCredentialChangeState !== FF_CREDENTIAL_STATE.EDITING;
    if ($("torn-key")) {
      if (injectedPdaTornApiKey()) { $("torn-key").textContent = "Torn key: PDA"; $("torn-key").disabled = true; }
      else { $("torn-key").textContent = storedTornApiKey ? "Change Torn key" : "Set Torn key"; $("torn-key").disabled = false; }
    }
    if ($("forget-torn")) $("forget-torn").disabled = !!injectedPdaTornApiKey() || !storedTornApiKey;
    if ($("release")) $("release").disabled = !currentOwnClaim() || !effectiveTornApiKey() || sharedWriteBusy || ffChangeBusy;
    const note = $("note");
    if (note) note.textContent = rwState.phase === RW_PHASE.PREWAR
      ? `PREWAR: DIBS locked · ${formatRwRunway(rwState.runwaySeconds)} to start.`
      : "LIVE requires own /wars confirmation. Hospital ≤2:00 + FF 2.00–3.40. Online targets are free for all. Low life (≤20%): FF up to 4.50. First successful DIBS wins; claimant can RELEASE.";
  }

  async function saveSharedKeyFromEditor() {
    const host = document.getElementById(SCRIPT.panelId);
    const input = host?.shadowRoot?.querySelector("[data-role='key-input']");
    const key = validateFfscouterKey(input?.value);
    // 0.2.0: the FFScouter key governs FF and Est only, so everything this
    // function says goes to the FF line. The War Room line and the claim board
    // are not touched by an FFScouter key change.
    if (!key) { setFairFightStatus("error", "FF: invalid key format"); return; }
    if (ffCredentialChangeState !== FF_CREDENTIAL_STATE.EDITING || ffCredentialExternalLockActive()) {
      enforceFfCredentialLock();
      setFairFightStatus("error", "FF: key change locked while DIBS is active");
      return;
    }

    const oldKey = sharedApiKey;
    const operationSerial = ++ffCredentialChangeSerial;
    const generation = runtimeGeneration;
    const operationOwns = () => (
      operationSerial === ffCredentialChangeSerial &&
      ffCredentialChangeState === FF_CREDENTIAL_STATE.SAVING
    );
    const operationForegroundCurrent = () => (
      operationOwns() &&
      generation === runtimeGeneration &&
      runtimeActive &&
      isRuntimeEligible() &&
      !ffCredentialExternalLockActive()
    );
    ffCredentialChangeState = FF_CREDENTIAL_STATE.SAVING;
    closeFfCredentialEditor();
    invalidateSharedReads();
    updatePanel();
    updateBoundControls();
    const journalReady = await prepareSharedApiChangeJournal(oldKey, operationForegroundCurrent);
    if (!journalReady) {
      if (operationOwns()) ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
      if (generation === runtimeGeneration && runtimeActive) {
        setFairFightStatus("error", "FF: existing key could not be secured for replacement");
        updateBoundControls();
        if (effectiveTornApiKey()) void fetchSharedClaims();
      }
      return;
    }
    const stored = await saveSecureApiKey(key);
    const accepted = stored && operationForegroundCurrent() && commitSharedApiChangeJournal();
    if (!accepted) {
      const recovered = await restoreSharedApiChangeJournal();
      if (operationOwns()) ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
      if (generation === runtimeGeneration && runtimeActive) {
        setFairFightStatus(
          "error",
          recovered
            ? (stored ? "FF: key change cancelled by a new lock" : "FF: key could not be stored securely")
            : "FF: key change cancelled · original key recovery pending"
        );
        updateBoundControls();
        if (effectiveTornApiKey()) void fetchSharedClaims();
      }
      return;
    }

    sharedApiKey = key;
    fairFightStats = new Map();
    fairFightLastFetchAt = 0;
    fairFightEverSucceeded = false;
    ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
    if (input instanceof HTMLInputElement && input.isConnected) input.value = "";
    setFairFightStatus("idle", "FF: key saved securely · syncing…");
    updateBoundControls();
    if (runtimeActive && isRuntimeEligible()) {
      if (effectiveTornApiKey()) void fetchSharedClaims();
      void fetchFairFightStats({ force: true });
    }
  }

  async function saveTornKeyFromEditor() {
    const host = document.getElementById(SCRIPT.panelId);
    const input = host?.shadowRoot?.querySelector("[data-role='torn-key-input']");
    const key = validateTornApiKey(input?.value);
    if (!key) { setTornStatusState("error", "Torn: invalid key format"); return; }
    const operationSerial = ++tornCredentialChangeSerial;
    invalidateTornCredentialRequests();
    if (!(await saveSecureTornApiKey(key))) {
      if (operationSerial === tornCredentialChangeSerial) {
        selfIdentityLastAttemptAt = 0;
        setTornStatusState("error", "Torn: key could not be stored securely");
        if (effectiveTornApiKey()) void fetchSelfIdentity({ force: true });
      }
      return;
    }
    if (operationSerial !== tornCredentialChangeSerial) return;
    storedTornApiKey = key;
    invalidateTornCredentialRequests();
    keyScopeReady = false;
    selfPlayerId = ""; selfPlayerName = ""; selfFactionId = ""; selfIdentityLastAttemptAt = 0;
    if (input instanceof HTMLInputElement && input.isConnected) input.value = "";
    host?.shadowRoot?.querySelector("[data-role='torn-key-editor']")?.classList.remove("open");
    opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
    setTornStatusState("ready", "Torn: key saved · syncing…", 0);
    // 0.2.0: DIBS signs in with the Torn key. A saved key -- the same one or a
    // new one -- lifts a refusal of the old key and allows one new sign-in.
    ksResetForTornKeyChange();
    setSharedStatus("syncing", "War Room: CHECKING…", 0);
    updateBoundControls();
    if (runtimeActive && isRuntimeEligible()) {
      void fetchSharedClaims();
      void fetchTornStatuses({ force: true });
    }
  }

  async function forgetSharedKey() {
    if (!sharedApiKey) return;
    if (ffCredentialChangeBusy() || ffCredentialExternalLockActive()) {
      enforceFfCredentialLock();
      window.alert("Release your active DIBS before forgetting the FFScouter key.");
      return;
    }
    if (!window.confirm("Forget the saved FFScouter key on this device?")) return;
    const oldKey = sharedApiKey;
    const operationSerial = ++ffCredentialChangeSerial;
    const generation = runtimeGeneration;
    const operationOwns = () => (
      operationSerial === ffCredentialChangeSerial &&
      ffCredentialChangeState === FF_CREDENTIAL_STATE.FORGETTING
    );
    const operationForegroundCurrent = () => (
      operationOwns() &&
      generation === runtimeGeneration &&
      runtimeActive &&
      isRuntimeEligible() &&
      !ffCredentialExternalLockActive()
    );
    ffCredentialChangeState = FF_CREDENTIAL_STATE.FORGETTING;
    invalidateSharedReads();
    updatePanel();
    updateBoundControls();
    const journalReady = await prepareSharedApiChangeJournal(oldKey, operationForegroundCurrent);
    if (!journalReady) {
      if (operationOwns()) ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
      if (generation === runtimeGeneration && runtimeActive) {
        setFairFightStatus("error", "FF: existing key could not be secured before forget");
        updateBoundControls();
        if (effectiveTornApiKey()) void fetchSharedClaims();
      }
      return;
    }
    const removed = await deleteSecureApiKey();
    const accepted = removed && operationForegroundCurrent() && commitSharedApiChangeJournal();
    if (!accepted) {
      const recovered = await restoreSharedApiChangeJournal();
      if (operationOwns()) ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
      if (generation === runtimeGeneration && runtimeActive) {
        setFairFightStatus(
          "error",
          recovered
            ? (removed ? "FF: forget cancelled by a new lock" : "FF: saved key could not be removed")
            : "FF: forget cancelled · original key recovery pending"
        );
        updateBoundControls();
        if (effectiveTornApiKey()) void fetchSharedClaims();
      }
      return;
    }
    ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
    // 0.2.0: the claim board does not depend on the FFScouter key and stays.
    sharedApiKey = "";
    fairFightStats = new Map(); fairFightLastFetchAt = 0; fairFightEverSucceeded = false;
    setFairFightStatus("key-required", "FF: key required");
    updateBoundControls();
    if (runtimeActive && isRuntimeEligible() && effectiveTornApiKey()) void fetchSharedClaims();
  }

  async function forgetTornKey() {
    if (injectedPdaTornApiKey()) { setTornStatusState("ready", "Torn: PDA API key is managed by Torn PDA", 0); return; }
    if (!storedTornApiKey || !window.confirm("Forget the saved Torn API key on this device?")) return;
    const operationSerial = ++tornCredentialChangeSerial;
    invalidateTornCredentialRequests();
    if (!(await deleteSecureTornApiKey())) {
      if (operationSerial === tornCredentialChangeSerial) {
        selfIdentityLastAttemptAt = 0;
        setTornStatusState("error", "Torn: saved key could not be removed");
        if (effectiveTornApiKey()) void fetchSelfIdentity({ force: true });
      }
      return;
    }
    if (operationSerial !== tornCredentialChangeSerial) return;
    storedTornApiKey = "";
    invalidateTornCredentialRequests();
    keyScopeReady = false; opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 }; selfPlayerId = ""; selfPlayerName = ""; selfFactionId = ""; opponentFactionId = ""; selfIdentityLastAttemptAt = 0;
    // 0.2.0: without the Torn key there is no sign-in and no DIBS.
    ksResetForTornKeyChange();
    setSharedStatus("key-required", "War Room: KEY REQUIRED — set your Torn API key", 0);
    setTornStatusState("key-required", "Torn: API key required", 0); updateBoundControls();
  }

  async function initializeApiKeyStorage() {
    await migrateLegacyWseVaultKeys();
    let vaultFailed = false;
    try { [sharedApiKey, storedTornApiKey] = await Promise.all([loadSecureApiKey(), loadSecureTornApiKey()]); }
    catch { sharedApiKey = ""; storedTornApiKey = ""; vaultFailed = true; }

    apiKeyStorageReady = true;

    // 0.2.0: the War Room line follows the Torn key. Without it: KEY REQUIRED,
    // and no request is made to the server.
    if (effectiveTornApiKey()) setSharedStatus("syncing", "War Room: CHECKING…", 0); else setSharedStatus("key-required", "War Room: KEY REQUIRED — set your Torn API key", 0);
    setFairFightStatus(sharedApiKey ? "idle" : "key-required", sharedApiKey ? "FF: waiting…" : "FF: key required");
    if (effectiveTornApiKey()) setTornStatusState("ready", injectedPdaTornApiKey() ? "Torn: PDA key loaded" : "Torn: saved key loaded", 0); else setTornStatusState(vaultFailed ? "error" : "key-required", vaultFailed ? "Torn: secure storage unavailable" : "Torn: API key required", 0);
    updatePanel();

    if (runtimeActive) {
      if (sharedApiKey) void fetchFairFightStats({ force: true });
      if (effectiveTornApiKey()) {
        void fetchSharedClaims();
        void fetchTornStatuses({ force: true });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SPA lifecycle / foreground-only runtime
  // ---------------------------------------------------------------------------

  function mutationRow(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    const row = element?.closest?.("li.enemy");
    return row instanceof HTMLElement && mountedRosterRoot?.contains(row) ? row : null;
  }

  function collectRosterMutation(records) {
    for (const record of records) {
      // Our own cell is roster DOM now, so its mutations would feed straight
      // back into this observer. Ignore anything inside a KS-owned cell.
      if (isOwnPresentationNode(record.target)) continue;
      if (isOwnRosterOrderMutation(record)) continue;
      const row = mutationRow(record.target);
      if (row) pendingRows.add(row);

      if (record.type === "characterData") continue;

      if (record.type === "attributes") {
        if (!row) observerNeedsFullScan = true;
        continue;
      }
      if (record.type !== "childList") continue;

      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (isOwnPresentationNode(node)) continue;
        if (node.matches("li.enemy")) {
          observerNeedsFullScan = true;
          if (node.isConnected) pendingRows.add(node);
        }
        const nestedRows = node.querySelectorAll?.("li.enemy") || [];
        if (nestedRows.length) observerNeedsFullScan = true;
        for (const nestedRow of nestedRows) pendingRows.add(nestedRow);
      }
    }
  }

  function queueRosterMutationWork(records, expectedEpoch, expectedGeneration, expectedRoot) {
    if (
      expectedEpoch !== rosterObserverEpoch ||
      expectedGeneration !== runtimeGeneration ||
      expectedRoot !== mountedRosterRoot
    ) return;
    collectRosterMutation(records);
    if (!observerNeedsFullScan && pendingRows.size === 0) return;
    if (observerWorkQueued) return;
    observerWorkQueued = true;
    queueMicrotask(() => {
      if (
        expectedEpoch !== rosterObserverEpoch ||
        expectedGeneration !== runtimeGeneration ||
        expectedRoot !== mountedRosterRoot
      ) return;
      observerWorkQueued = false;
      const fullScan = observerNeedsFullScan;
      observerNeedsFullScan = false;
      const rows = [...pendingRows];
      pendingRows.clear();
      if (
        !runtimeActive ||
        !isRuntimeEligible() ||
        !(mountedRosterRoot instanceof HTMLElement)
      ) return;
      if (warStuffEnhancedGate()) return;
      if (fullScan) scanWarRows();
      else {
        for (const row of rows) reconcileWarRow(row);
        retireMissingRowBindings();
      }
    });
  }

  function startRosterObserver(root) {
    rosterObserver?.disconnect();
    rosterResizeObserver?.disconnect();
    rosterObserver = null;
    rosterResizeObserver = null;
    if (!(root instanceof HTMLElement)) return;
    const expectedEpoch = ++rosterObserverEpoch;
    const expectedGeneration = runtimeGeneration;
    rosterObserver = new MutationObserver(function queueRosterWork(records) {
      queueRosterMutationWork(records, expectedEpoch, expectedGeneration, root);
    });
    const scope = root;
    rosterObserver.observe(scope, {
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "aria-disabled",
        "contenteditable",
        "href",
        "class",
        "hidden",
        "onclick",
        "open",
        "role",
        "style",
        "tabindex",
        "data-profile",
        "data-profile-id",
        "data-user-id",
        "data-player-id",
        "data-target-id",
        "data-xid",
        "data-user2-id",
        "data-user2id",
        "data-faction-id",
        "data-until",
        "data-ff-filter-box",
        "data-mode",
        "data-ffscouter-active-filter",
        "data-ffscouter-attach-mode",
        "data-ffscouter-band-side",
        "data-ffscouter-col-display",
        "data-ffscouter-hidden",
        "data-ffscouter-hide-level",
        "data-ffscouter-hide-score",
        "data-ffscouter-hide-status",
        "data-ffscouter-initialized",
        "data-ffscouter-sort",
        "data-twse-last-action-timestamp",
        "data-twse-overridden"
      ],
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    if (typeof ResizeObserver === "function") {
      rosterResizeObserver = new ResizeObserver(function syncRosterGeometry() {
        if (
          expectedEpoch === rosterObserverEpoch &&
          expectedGeneration === runtimeGeneration &&
          runtimeActive &&
          isRuntimeEligible() &&
          mountedRosterRoot === root
        ) {
          layoutPresentation();
        }
      });
      const geometryTargets = new Set([
        scope,
        root.querySelector(".faction-war"),
        root.querySelector(".enemy-faction"),
        root.querySelector(".enemy-faction ul.members-list"),
        root.querySelector("[data-ff-filter-box] > details")
      ]);
      for (const target of geometryTargets) {
        if (target instanceof HTMLElement) rosterResizeObserver.observe(target);
      }
    }
  }

  function stopRosterObserver() {
    rosterObserverEpoch += 1;
    rosterObserver?.disconnect();
    rosterResizeObserver?.disconnect();
    rosterObserver = null;
    rosterResizeObserver = null;
    observerWorkQueued = false;
    observerNeedsFullScan = false;
    pendingRows.clear();
  }

  function mutationTouchesRouteSurface(records) {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target?.parentElement;
      if (
        target?.closest?.("div[data-warid], #faction_war_list_id") ||
        target?.matches?.("#react-root, .react-war-surface") ||
        target?.querySelector?.("div[data-warid], #faction_war_list_id")
      ) return true;
      if (record.type !== "childList") continue;
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (
          node.matches("div[data-warid], #faction_war_list_id") ||
          node.querySelector("div[data-warid], #faction_war_list_id") ||
          normalizeText(node.textContent).toUpperCase().includes("YOUR FACTION IS NOT IN A WAR")
        ) return true;
      }
    }
    return false;
  }

  function queueRouteReconcile(records) {
    if (
      destroyed ||
      !isPageVisible() ||
      !hasPageFocus() ||
      !isRankedWarRoute() ||
      !mutationTouchesRouteSurface(records) ||
      routeReconcileQueued
    ) return;
    const generation = runtimeGeneration;
    routeReconcileQueued = true;
    queueMicrotask(() => {
      routeReconcileQueued = false;
      if (generation === runtimeGeneration || !runtimeActive) reconcileLifecycle({ structural: true });
    });
  }

  function startRouteObserver() {
    if (!isRuntimeContextEligible() || routeObserver || !(document.body instanceof HTMLElement)) return;
    routeObserver = new MutationObserver(queueRouteReconcile);
    // characterData is deliberately absent. Measured 2026-09-13 in the owner's
    // Chrome: with only this script enabled the faction chat rendered in slow
    // motion while the Torn window had focus, and recovered the instant it lost
    // focus -- the point where queueRouteReconcile's own guard stops the work.
    // Every character typed anywhere on the page produced a characterData
    // record here, and mutationTouchesRouteSurface ran closest() and
    // querySelector() on each one before discarding it.
    // Nothing is lost: the only text-reading branch in that filter is guarded by
    // record.type !== "childList", so characterData records could never reach
    // it. Route changes still arrive as childList and attribute records.
    routeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-hidden", "class", "data-warid", "hidden", "href", "style"],
      childList: true,
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
    const canonical = canonicalRankedWarSurface();
    if (!canonical) {
      suspendRuntime();
      if (isRuntimeContextEligible()) startRouteObserver();
      return false;
    }
    const previousOpponentId = opponentFactionId;
    const presentationMissing = document.getElementById(SCRIPT.layerId)?.parentElement !== document.body;
    refreshCurrentWarSurface({ structural, canonical });
    const rosterRoot = canonical.root;
    const rootChanged = rosterRoot !== mountedRosterRoot;

    if (rootChanged) {
      stopRosterObserver();
      removeAllRowPresentations();
      if (rosterRoot) {
        mountedRosterRoot = rosterRoot;
        startRosterObserver(rosterRoot);
      }
    }

    const hasPrimary = currentWarSurface?.card?.isConnected === true;
    if (!hasPrimary && !rosterRoot) {
      bridgeMounted = false;
      removeOwnUi();
      return false;
    }

    bridgeMounted = true;
    const panel = ensurePanel();
    if (panel) placePanel(panel);

    if (
      runtimeActive &&
      isRuntimeEligible() &&
      rosterRoot &&
      (rootChanged || presentationMissing || previousOpponentId !== opponentFactionId)
    ) {
      scanWarRows();
    } else if (runtimeActive && isRuntimeEligible()) {
      updateBoundControls();
    }
    return true;
  }

  function clearTimers() {
    if (displayTickTimer !== null) window.clearTimeout(displayTickTimer);
    if (sharedPollTimer !== null) window.clearInterval(sharedPollTimer);
    if (tornStatusTimer !== null) window.clearTimeout(tornStatusTimer);
    if (routeHeartbeatTimer !== null) window.clearInterval(routeHeartbeatTimer);
    if (fairFightRetryTimer !== null) window.clearTimeout(fairFightRetryTimer);
    displayTickTimer = sharedPollTimer = fairFightRetryTimer = null;
    tornStatusTimer = routeHeartbeatTimer = null;
  }

  function removeOwnUi() {
    cancelPresentationLayout();
    removeAllRowPresentations();
    removeRosterHeaderCell();
    document.getElementById(SCRIPT.rosterStyleId)?.remove();
    document.getElementById(SCRIPT.layerId)?.remove();
    document.getElementById(SCRIPT.panelId)?.remove();
  }

  function mountBridge() {
    return reconcileRoute({ structural: true });
  }

  function unmountBridge() {
    bridgeMounted = false;
    stopRosterObserver();
    removeAllRowPresentations();
    removeOwnUi();
  }

  function reconcileLifecycle({ structural = false } = {}) {
    if (destroyed) return false;
    if (warStuffEnhancedGate()) return false;
    if (!isRuntimeContextEligible()) {
      if (runtimeActive) suspendRuntime();
      else {
        stopRouteObserver();
        unmountBridge();
      }
      return false;
    }
    if (!canonicalRankedWarSurface()) {
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
  // changes its digits in the same instant Torn's own clock does. A free
  // interval starts at an arbitrary phase and leaves the number up to a second
  // stale, which is indistinguishable from a wrong clock when compared against
  // a live Torn countdown.
  function scheduleDisplayTick() {
    if (displayTickTimer !== null) {
      window.clearTimeout(displayTickTimer);
      displayTickTimer = null;
    }
    if (destroyed) return;
    const sinceBoundary = ((getTornNowMs() % 1000) + 1000) % 1000;
    const delay = Math.min(CONFIG.displayTickMs, Math.max(20, CONFIG.displayTickMs - sinceBoundary));
    displayTickTimer = window.setTimeout(() => {
      displayTickTimer = null;
      if (runtimeActive && isRuntimeEligible()) {
        void maybeAutoReleaseBeatenTarget();
        updatePanel();
        updateBoundControls();
        syncRosterOrder();
      }
      if (runtimeActive) scheduleDisplayTick();
    }, delay);
  }

  // Same endpoints, same average rate -- only the moment inside the second
  // moves. A fixed 10 s period is exactly ten whole seconds, so every sample
  // lands at the same phase and the intervals never intersect down to anything
  // narrow. The jitter is what makes the intersection work.
  function scheduleTornStatusPoll() {
    const jitter = (Math.random() * 2 - 1) * CONFIG.tornStatusPollJitterMs;
    const delay = Math.max(1000, Math.round(CONFIG.tornStatusPollMs + jitter));
    tornStatusTimer = window.setTimeout(() => {
      tornStatusTimer = null;
      if (effectiveTornApiKey() && runtimeActive && isRuntimeEligible()) {
        if (viewOnlyMode()) {
          void fetchViewMembers();
        } else {
          void fetchTornStatuses();
          if (!selfPlayerId) void fetchSelfIdentity();
        }
      }
      if (runtimeActive) scheduleTornStatusPoll();
    }, delay);
  }

  function startRuntimeTimers() {
    clearTimers();
    scheduleDisplayTick();
    sharedPollTimer = window.setInterval(() => { if (effectiveTornApiKey() && runtimeActive && isRuntimeEligible()) void fetchSharedClaims(); }, CONFIG.sharedPollMs);
    scheduleTornStatusPoll();
    routeHeartbeatTimer = window.setInterval(() => {
      if (!runtimeActive) return;
      reconcileLifecycle();
    }, CONFIG.routeHeartbeatMs);
  }

  function suspendRuntime() {
    if (!runtimeActive) return;
    const hasValidatedIdentity = validTargetId(selfPlayerId) && validTargetId(selfFactionId) && keyScopeReady;
    runtimeActive = false;
    runtimeGeneration += 1;
    resetLifeState();
    lastTrustedScrollIntentAt = Number.NEGATIVE_INFINITY;
    clearTimers();
    stopRouteObserver();
    unmountBridge();

    sharedRequestSerial += 1;
    sharedSyncing = false;
    sharedAuthorityEpoch += 1;
    selfIdentityRequestSerial += 1;
    selfIdentitySyncing = false;
    tornStatusRequestSerial += 1;
    tornStatusSyncing = false;
    ownWarsRequestSerial += 1;
    sharedClaims = new Map(); sharedClaimsUnreadable = new Set();
    // 0.2.0: the board must be read again before any target is shown as free.
    ksBoardVerifiedAt = 0;
    fairFightRequestSerial += 1;
    fairFightSyncing = false;
    fairFightStats = new Map();
    fairFightLastFetchAt = 0;
    ownWarsState = emptyOwnWarsState();
    opponentMembersState = { factionId: "", members: new Map(), fetchedAt: 0 };
    currentWarSurface = null;
    opponentFactionId = "";
    if (!hasValidatedIdentity) {
      selfPlayerId = "";
      selfPlayerName = "";
      selfFactionId = "";
      keyScopeReady = false;
      selfIdentityLastAttemptAt = 0;
    }
    prewarObservation = null;
    if (ffCredentialChangeState === FF_CREDENTIAL_STATE.EDITING) {
      ffCredentialChangeSerial += 1;
      ffCredentialChangeState = FF_CREDENTIAL_STATE.IDLE;
    }
  }

  function resumeRuntime() {
    if (destroyed || runtimeActive || !isRuntimeContextEligible() || !canonicalRankedWarSurface()) return;
    runtimeActive = true;
    runtimeGeneration += 1;
    mountBridge();
    if (!runtimeActive || !bridgeMounted) return;
    startRouteObserver();
    startRuntimeTimers();

    if (apiKeyStorageReady) {
      if (sharedApiKey) void fetchFairFightStats({ force: true });
      if (effectiveTornApiKey()) {
        void fetchSharedClaims();
        void fetchTornStatuses({ force: true });
      }
    }
  }

  function destroy() {
    if (destroyed) return;
    if (runtimeActive) suspendRuntime();
    destroyed = true;
    runtimeActive = false;
    runtimeGeneration += 1;
    resetLifeState();
    clearTimers();
    stopRouteObserver();
    unmountBridge();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("hashchange", onRouteLocationChange);
    window.removeEventListener("popstate", onRouteLocationChange);
    for (const eventName of ["pointerdown", "wheel", "touchstart", "keydown"]) {
      document.removeEventListener(eventName, onTrustedActivity, true);
    }
    document.removeEventListener("scroll", onTrustedScroll, true);
    window.removeEventListener("resize", onViewportChange);
    if (wrappedHistoryPushState && history.pushState === wrappedHistoryPushState) {
      history.pushState = nativeHistoryPushState;
    }
    if (wrappedHistoryReplaceState && history.replaceState === wrappedHistoryReplaceState) {
      history.replaceState = nativeHistoryReplaceState;
    }
    delete window[SCRIPT.instanceKey];
  }

  function onVisibilityChange() {
    if (!isPageVisible()) {
      suspendRuntime();
      return;
    }
    if (hasPageFocus()) reconcileLifecycle();
  }

  function onWindowBlur() {
    suspendRuntime();
  }

  function onWindowFocus() {
    if (isPageVisible()) queueFocusedResume();
  }

  function onRouteLocationChange() {
    if (!destroyed) reconcileLifecycle({ structural: true });
  }

  function onTrustedActivity(event) {
    registerTrustedInteraction(event);
  }

  function onTrustedScroll(event) {
    registerTrustedScroll(event);
  }

  function onViewportChange() {
    if (runtimeActive && isRuntimeEligible()) schedulePresentationLayout();
  }

  function onPageHide(event) {
    if (event.persisted) suspendRuntime();
    else destroy();
  }

  function onPageShow() {
    if (!destroyed && isPageVisible() && hasPageFocus()) reconcileLifecycle({ structural: true });
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

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("hashchange", onRouteLocationChange);
  window.addEventListener("popstate", onRouteLocationChange);
  for (const eventName of ["pointerdown", "wheel", "touchstart", "keydown"]) {
    document.addEventListener(eventName, onTrustedActivity, { capture: true, passive: true });
  }
  document.addEventListener("scroll", onTrustedScroll, { capture: true, passive: true });
  window.addEventListener("resize", onViewportChange, { passive: true });
  installHistoryLifecycleHooks();

  function boot() {
    if (isPageVisible() && hasPageFocus()) reconcileLifecycle({ structural: true });
  }

  void initializeApiKeyStorage();
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();