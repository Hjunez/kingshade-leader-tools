// ==UserScript==
// @name         Kingshade Scout for Torn PDA
// @namespace    https://kingshade.tools/
// @version      0.9.5
// @downloadURL  https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/Kingshade_Scout_Torn_PDA.user.js
// @updateURL    https://raw.githubusercontent.com/Hjunez/kingshade-leader-tools/main/Kingshade_Scout_Torn_PDA.user.js
// @description  KS Scout for Torn PDA: FF/EST, live faction status, countdowns, filters and sorting. Never runs on Ranked War lists.
// @author       Kingshade
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @connect      ffscouter.com
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @noframes
// ==/UserScript==
//
// 0.9.5: Words on the screen only, after the first run on a computer (Chrome + Tampermonkey, 2026-10-24). No logic, request,
// storage or layout changes.
//
// FIXED
// - On a computer the panel said "KS · PDA · v0.9.4". The sub line now names where the script runs: "KS · PDA" in Torn PDA,
//   "KS · PC" anywhere else (read once at start: Torn PDA provides PDA_httpGet before userscripts run, Tampermonkey does not).
// - Switching tab or window while "Save & load data" / "Retry FFScouter" was loading showed "Saved, but the data did not load.
//   Tap Retry FFScouter." Nothing had failed: requests wait while the page is hidden or unfocused. The line now reads
//   "Paused · this tab is not active. The data loads when you come back to it." and goes away by itself once the data has loaded.
// CHANGED
// - The footer and the "Data storage" disclosure say "this browser" on a computer and "this Torn PDA webview" in Torn PDA.
// KNOWN ISSUES
// - Seen once on a computer: one travelling member kept Torn's own "Traveling" text (cut to "Trav...") and was not counted
//   under Travel. The cause is not proven (possibly Torn's faction data did not show the trip yet), so nothing is changed for it.
// VERIFICATION
// - Synthetic only (KS PDA Testrigg). Acceptance test:
// - 1. Torn PDA: update KS Scout to 0.9.5. The sub line in the panel reads "KS · PDA · v0.9.5". FF circles, names and statuses
//      look as in 0.9.4.
// - 2. Computer (Tampermonkey): update KS Scout to 0.9.5. The sub line reads "KS · PC · v0.9.5".
// - 3. Computer: open the gear, press "Save & load data", and at once click another tab. Come back after 30 seconds: the line
//      reads "Paused · this tab is not active. ..." or has already gone; FF fills in by itself, no "Retry FFScouter".
//
// HISTORY. The text of 0.9.4, which this version replaces:
//
// 0.9.4: One change after the phone test of 0.9.3: the order of Soonest.
//
// CHANGED
// - Soonest puts hospital first, shortest time first. Three groups, in this order, in both directions: members in hospital with
//   a running countdown; then members with another running countdown (jail, travelling with an estimated time, federal with a
//   time); then members without a countdown (Okay, Abroad, "~?" without a time, unknown status), in Torn's order. Inside the
//   first two groups the arrow decides: "Soonest ▲" shortest time first, "Soonest ▼" longest time first. Equal times keep
//   Torn's order. The direction never turns the groups round: hospital stays on top, members without a timer stay last.
// - A hospital stay that has ended moves to the last group the next time the list is drawn.
// - The spoken names are "Soonest, hospital first, shortest time first" and "Soonest, hospital first, longest time first". The
//   button text and the arrows are as before. The filter "Soon" and "Soon within" are not touched. Status sorting is not touched.
// KNOWN ISSUES
// - Not run on a phone yet; synthetic tests only (KS PDA Testrigg).
// VERIFICATION
// - Synthetic only (KS PDA Testrigg, a test page that copies the measured row). Not yet run on the phone. Acceptance test on Torn PDA:
// - 1. In Torn PDA's script manager: turn OFF KS Scout 0.9.3. Add 0.9.4 the same way and turn it ON.
// - 2. Open a faction's member list where at least one member is in hospital (your own or another faction's).
// - 3. The sub line in the panel reads "KS · PDA · v0.9.4".
// - 4. Tap Soonest so that it reads "Soonest ▲". Members in hospital are on top, the shortest time left first. After them come
//      travelling and jailed members with a time, shortest first. Last come those without a countdown.
// - 5. Tap Soonest again: "Soonest ▼". Hospital is still on top, now the longest time first.
// - 6. If nobody is in hospital, step 4 shows travelling members with the shortest time on top.
//
// HISTORY. The text of 0.9.3, which this version replaces:
//
// 0.9.3: One change after the phone test of 0.9.2: where the FF mark and the name sit in the name cell. The place and the sizes
// come from measurements of the real page on the phone (KS Row Measure, viewport 375 x 686), not from assumptions.
//
// FIXED
// - Player names were cut to two to four letters on Torn PDA. The cause, measured: 0.9.2 put the FF mark inside Torn's honor slot,
//   which is a fixed 100 px wide, so the name got what was left of it (about 30 px). The FF mark now stands in Torn's name box as
//   its own child in front of the honor slot, and with "Show names as text" the honor slot takes all the room that is left.
// - With "Show names as text" off, the honor bar was pushed about 32 px out of the name column, into the Lvl column. The honor
//   bar now ends inside the name box, in front of the Lvl column.
// CHANGED
// - The FF circle is 22 px (was 26) and stands directly in front of the name. The faction icon slot is hidden in both modes (it
//   took 25 px for nothing). The tap area is 40 x 40 px, with no part over the name link or the Lvl column.
// - The estimate ("1.24M", or a manual Battle stats value) is a small grey line under the name (was a separate mark). A player
//   without an estimate has no such line and the name is centred.
// KNOWN ISSUES
// - Very long names end with "..." (an ellipsis) in the room that is left; the full name is in the member card.
// - Not run on a phone yet. The place of the mark and the layout numbers are measured on the page, but this version has only
//   been run against a test page built from those measurements. If Torn's name box (the element whose class starts with
//   "userInfoBox") is missing, the mark is put in front of the name link as in 0.9.2 and the reason is written once to the debug
//   log (localStorage "kingshade-scout:debug" = "1", prefix [KS Scout PDA]).
// - A manual value saved with 0.9.0 that holds the estimate is not cleaned up automatically. Open the member card and
//   press "Clear custom".
// VERIFICATION
// - Synthetic only (KS PDA Testrigg, a test page that copies the measured row). Not yet run on the phone. Acceptance test on Torn PDA:
// - 1. In Torn PDA's script manager: turn OFF KS Scout 0.9.2. Add 0.9.3 the same way and turn it ON.
// - 2. Gear -> turn ON "Show names as text" -> Done.
// - 3. The sub line in the panel reads "KS · PDA · v0.9.3".
// - 4. Every row: the status dot, one round FF circle, then the name in blue with the estimate in small text under it. Names
//      like Jul1an494 and RabiddogofWar show in full. No empty space between the dot and the circle.
// - 5. Tap a name: the profile opens. Go back.
// - 6. Tap an FF circle: the card opens. Tap Close.
// - 7. Gear -> turn OFF "Show names as text" -> Done. Honor bars with the whole name, the circle in front, nothing reaches into the
//      Lvl column. Turn it ON again.
// - 8. Tap FF in the panel: "FF ▲", lowest FF on top. Tap again: "FF ▼", highest on top. Members without FF are last both times.
// - 9. Do the same with Status and Soonest: the second tap reverses the order.
// - 10. Tap FF until it reads "FF ▼". Reload the page with the refresh arrow at the top right of Torn PDA: "FF ▼" is still chosen.
//
// HISTORY. The text of 0.9.2, which this version replaces:
//
// 0.9.2: Two changes after the phone test of 0.9.1 (a narrower FF mark in front of the name, and a sort direction), with the
// status colours and the travel destinations that were ordered with them.
//
// FIXED
// - The FF mark in the level column (0.9.1) was wider than the column and pushed the level number over the honor bar. Nothing
//   is put into the level column any more: it looks exactly as Torn draws it.
// ADDED
// - A round FF mark (26 px, the FF colour, FF with one decimal, "20+" above 20, "?" without FF) and a small stats mark (the
//   estimate, e.g. "1.24M") in front of the name, in the flow of the name area. A manual FF has a white ring, an old estimate
//   is faded. The whole mark is the tap area (at least 40 x 40 px, reaching up and down, never into the name link).
// - Setting "Show names as text" (on by default, in the settings view under Display). While it is on, the honor bar and the
//   faction icon of a row are hidden with CSS (nothing is removed from the page) and the name is shown as plain text inside
//   Torn's own name link, so a tap on the name still opens the profile. A row where no name can be read keeps its honor bar.
//   With the setting off the honor bar and the faction icon show as before and only the FF circle stands in front of the name.
// - Status colours in the status cell (only this script's own label and countdown; Torn's own texts keep their colour):
//   hospital red, amber when less than a minute is left, travelling and abroad light blue, jail light violet, federal, fallen
//   and unknown grey.
// - Travel destinations in the status cell: "→ HAW" for a player on the way out from Torn, "← HAW" on the way home, "IN HAW" for a player
//   abroad (no countdown, Torn's "Abroad" text is hidden like the other compact labels). The code is read from Torn's status
//   description; when it cannot be read safely the cell says "TRAVEL" (or keeps Torn's "Abroad") as before. The countdown's
//   title carries the full description.
// - Sort direction: tap the chosen sort (FF, Status, Soonest) again to reverse it. The chosen button shows "FF ▲" (lowest
//   first) or "FF ▼" (highest first). Players without a value are always last. "Reset filters and sort" sets it back to rising.
// CHANGED
// - The new FF mark replaces the two-line mark of 0.9.1 (FF value and estimate on top of each other).
// - Travel countdowns are light blue (they were grey); hospital and jail countdowns are coloured (they were white).
// KNOWN ISSUES
// - Not run on a phone yet. Every layout number comes from the synthetic test rig. ASSUMPTIONS about Torn's markup that no
//   capture on disk can confirm: that the player's name link is the first link with a player id in the row and its parent is the
//   name area; that the honor bar is an image (img, svg, canvas) inside that link; that the faction icon is a link to a faction
//   page that holds a picture and no text (or an image with "factiontag" in its address); that the status cell has a ".ellipsis"
//   element for the compact label. Which way the name text is shown (Torn's own text element, or one of our own) is written
//   once to the debug log (localStorage "kingshade-scout:debug" = "1", prefix [KS Scout PDA]).
// - A manual value saved with 0.9.0 that holds the estimate is not cleaned up automatically. Open the member card and
//   press "Clear custom".
// - Rows that are shorter than 40 px share their touch area with the next row where the areas overlap; the lower
//   row wins in the overlap.
// VERIFICATION
// - Synthetic only (KS PDA Testrigg). Not yet run on the phone. Acceptance test on Torn PDA:
// - 1. In Torn PDA's script manager: turn OFF KS Scout 0.9.1. Add 0.9.2 the same way and turn it ON.
// - 2. Open your faction's page, the tab with the member list.
// - 3. The sub line in the panel reads "KS · PDA · v0.9.2".
// - 4. In front of every name there is a round coloured FF circle (e.g. "4.2") and a small stats mark (e.g. "1.24M"). The
//      names are plain text, no honor bars. The Lvl and Days columns look as in Torn without the script.
// - 5. Tap a name: the profile opens. Go back.
// - 6. Tap an FF circle: the card opens. Tap Close.
// - 7. Gear -> turn OFF "Show names as text" -> Done. The honor bars are back and only the FF circle stands in front of the
//      name. Turn it ON again.
// - 8. Status column: HOSP and the time are red, and turn amber when less than a minute is left. Travellers show e.g. "→ HAW"
//      or "← HAW" in light blue with the time below. Players abroad show e.g. "IN HAW". Tap a traveller's time: the card shows
//      the full text.
// - 9. Tap FF in the panel: the button reads "FF ▲" and the lowest FF is on top. Tap FF again: "FF ▼" and the highest FF is
//      on top. Members without FF are last both times.
// - 10. Do the same with Status and Soonest: the second tap reverses the order.
// - 11. Tap Torn's header Days: the panel switches to Original and Torn sorts.
// - 12. Tap FF until the button reads "FF ▼". Reload the page with the refresh arrow at the top right of Torn PDA: "FF ▼" is
//      still chosen and the highest FF is on top.
//
// HISTORY. The text of 0.9.1, which 0.9.2 replaced:
//
// 0.9.1: Corrections after the first run on the phone, and the interface changes ordered after that run. No new features.
//
// FIXED
// - Old status was shown as current. With a dead key the member line counted "17 Travel" out of a status snapshot that
//   was 986 hours old. A snapshot older than 90 s is no longer used for status, end times, travel estimates or counters
//   (neither the one in memory nor the stored one). Torn's own row status is used instead, and a traveller without a
//   fresh snapshot shows "~?". The snapshot is not deleted: it is used again as soon as a fresh answer arrives. The
//   marker shows STALE or OFFLINE. The learned travel history is not touched.
// - The FF mark covered half of the member name. It now sits in the level column, under the level number, in the flow
//   of the row (no overlap). Without a level column it sits at the left edge of the name area as one line.
// - The member card put the estimate into "Battle stats", and Save then stored it as a manual value for good. The
//   field is now filled only from an existing manual value; Save with the custom FF off and the other two fields empty
//   removes the manual entry instead of saving an empty one.
// - The card said "Okay · Okay" and "Traveling · Traveling from Hawaii to Torn": the status word is not repeated when
//   the description starts with it. The line "not calibrated yet" is shown only when the departure was inferred from
//   the last action (the only case where the calibration is used).
// - Torn's own column headers (Lvl, Days, Status ...) did not work: the order jumped back, also with Original chosen.
//   Original now means that this script never moves a row, and it follows the order Torn has at the moment.
// - A forced refresh that came while a Torn request was running waited 30 s instead of 10 s.
// - PDA_httpGet had no time limit. It now gives up after 30 s (counted as a failed attempt; a late answer is ignored).
// - A scan that was cut off could keep the next mount from scanning.
// - A registration cut off after the request was sent showed "Paused while Torn is not visible" or a technical error.
// ADDED
// - Tapping one of Torn's own column headers in the member list (Lvl, Days, Status, Members ...) while FF, Status or
//   Soonest sorting is chosen switches KS Scout to Original sorting, so that Torn's sorting is the one you see.
//   (One passive listener; it clicks nothing and stops nothing.)
// - Row colour fade: the colour is strongest in the middle of the row and fades out towards both edges.
// CHANGED
// - Compact panel: Easy max FF and Soon within moved into the settings view (gear). The compliance text is a folded
//   line "What KS Scout reads and stores" (text unchanged).
// - The FF mark shows "FF 20+" for FF above 20. The exact value stays in the card, in the title of the mark, in
//   sorting, the Easy filter and the colour.
// - Status text on a coloured row has a dark background (same colour and radius as the FF mark).
// - Row colour is drawn on one layer only (was two or three on top of each other): alpha 0.28 at the middle for FF
//   colours, 0.18 for the neutral estimate-only colour.
// KNOWN ISSUES
// - Not run on a phone yet. Every layout number comes from the synthetic test rig. The level column is found by the
//   class "lvl" or, failing that, as the first cell after the name cell whose text is a whole number 1-100; both are
//   ASSUMPTIONS about Torn's markup that no capture on disk can confirm.
// - A manual value saved with 0.9.0 that holds the estimate is not cleaned up automatically. Open the member card and
//   press "Clear custom".
// - The log line that names the badge placement is written only with the debug log on (prefix [KS Scout PDA]).
// - Rows that are shorter than 40 px share their touch area with the next row where the areas overlap; the lower
//   row wins in the overlap. The FF mark in the level column makes a row taller (the mark is at least 40 px high).
// VERIFICATION
// - Synthetic only (KS PDA Testrigg). Not yet run on the phone. Acceptance test on Torn PDA:
// - 1. In Torn PDA's script manager, where you added 0.9.0: turn OFF KS Scout 0.9.0 (the test copy). Add 0.9.1 and
//      turn it ON. Leave the old Scout entry turned off.
// - 2. Open your faction's page, the tab with the member list.
// - 3. The sub line in the panel reads "KS · PDA · v0.9.1".
// - 4. The panel is shorter: no Easy max FF / Soon within in the panel, and at the bottom only one line "What KS Scout
//      reads and stores". Tap it: the text unfolds. Tap again: it folds.
// - 5. Tap the gear: Easy max FF and Soon within are there and can be changed. Close the settings.
// - 6. The FF mark stands in the level column, under the level number. Every member name can be read in full. Members
//      with FF over 20 show "FF 20+".
// - 7. The row colour is strongest in the middle of the row and fades out towards both edges. The status text (Okay,
//      Abroad, TRAVEL ...) stands on a dark background and can be read.
// - 8. Tap FF in the panel so that FF sorting is selected. Then tap Torn's header Days above the list: the list is
//      sorted by Days, and Original is now marked in the panel. Tap Days again: Torn reverses the order, and it stays.
// - 9. Tap Travel in the panel: only members who are travelling or abroad show. Tap All.
// - 10. Tap the FF mark of a member you have not saved anything for: the Battle stats field is empty. Tap Close.
// - 11. Tap a member who is travelling: the status line has no repeated word (not "Traveling · Traveling ...").
// - 12. Open https://www.torn.com/factions.php?step=your&type=1#/war/rank: no KS SCOUT panel.
//
// HISTORY. The text of 0.9.0, which this version replaces:
//
// 0.9.0: ONE MAIN CHANGE: Scout and War Tools are now ONE script, KS Scout, with a new user interface.
//
// FIXED
// - Scout and War Tools both worked on every member list, including the Ranked War list that War Dibs owns.
//   War Tools sorted, hid and put timers into the very rows War Dibs draws on (read in the code of War Dibs,
//   not measured on a phone). KS Scout now never mounts on, reads, or changes a Ranked War list (see RANKED WAR
//   GUARD below) and makes no request there.
// - The disclosure did not say that the key is stored unencrypted. It now says plainly that the key is stored
//   unencrypted in this Torn PDA webview.
// - The old product name is gone from every text the user sees. The script is called KS Scout.
// - Corrections after the review of 0.9.0 (same version, never installed before):
//   - No request is sent after the panel was taken down. Every request, Torn and FFScouter, checks just before it is
//     sent that the page is visible and focused, the panel is mounted, the route is not blocked and the work still
//     belongs to the same generation: the FFScouter retry waits, every flight-window runner, the Premium check, every
//     get-stats batch and the faction directory. An answer that arrives after the panel was taken down is thrown away
//     and never drawn, cached or stored. (Torn PDA's GET cannot be aborted, so this check is what stops them.)
//   - Torn requests are no more frequent than the floor allows, counted from the last request SENT, whether it worked or
//     not: 25 s apart, 10 s apart for a forced one (a countdown that ran out, Refresh), 30 s after a failed one. Several
//     countdowns that run out together give one request. Error code 5 (60 s pause) and the key errors (stop) are as before.
//   - Saving or removing the key takes down the work in progress, so an answer for the old key is never kept.
//   - The status marker no longer stays on CHECKING on a list in which no row has a player id.
//   - The Ranked War surface is not read on other routes either: its links are not counted when the faction id is
//     looked for, and changes inside it do not start a scan.
//   - The version is shown as "v0.9.0" (it was upper-cased to "V0.9.0").
//   - The key section and the disclosure open by themselves when SETUP arises after the settings view was built.
//   - The stored status snapshot is read only when the one in memory does not match; rows that Torn replaced are let go of.
//   - The learned travel history is no longer deleted when the key is removed or data is switched off. Only
//     "Clear cached data" removes it, as before 0.9.0.
// ADDED
// - One panel above the member list: status marker (LIVE, CHECKING, STALE, PAUSED, SETUP, OFFLINE), member
//   counts, filters (All, Okay, Easy, Soon, Hospital, Travel, No data), sorting, Easy max FF and Soon within
//   step buttons, a settings view and a compliance footer.
// - A member card (tap the FF mark or a countdown) with the status details and the manual FF fields.
// - Setting "Colour rows by FF" (on by default). Off = only the mark is coloured.
// - After a Torn "too many requests" answer (error code 5) all Torn requests pause for 60 s and the panel says so.
// - A Torn answer that rejects the key (error codes 2, 10, 13, 18) stops further Torn requests until the key is
//   saved again.
// - Debug log, off by default: set localStorage "kingshade-scout:debug" to "1". Lines start with [KS Scout PDA].
//   The key is never logged.
// CHANGED
// - Scout and War Tools are merged into this one script. All data, all requests and all timers are unchanged:
//   the same endpoints, parameters, comments, intervals, caches and travel estimates as before. The user
//   interface is new. The floating button, Control Center, toolbar, intro box, edit box and info box are gone.
// - Filter, sort, Easy max FF, Soon within and the collapsed state move from the War Tools settings key into
//   the Scout settings key (schemaVersion 2). The old War Tools key is left untouched.
// - Rows are tinted at alpha 0.18 (was 0.34) and Torn's own text colour is kept.
// - An estimate older than 14 days is marked "old" instead of "?".
// - Touch targets are at least 40 x 40 px and no text is smaller than 10 px.
// - If an older War Tools instance is alive on the page, KS Scout shuts it down so that only one panel exists.
// KNOWN ISSUES
// - Not run on a phone yet. Every layout number comes from the synthetic test rig.
// - The divider line under the header is a plain hairline with a diamond; it does not fade out, because only one
//   fill effect is allowed in this file and the header row uses it.
// - Rows that are shorter than 40 px share their touch area with the next row where the areas overlap; the lower
//   row wins in the overlap.
// VERIFICATION
// - Synthetic only (KS PDA Testrigg). Not yet run on the phone.
//
// API key, data use and privacy disclosure:
// - Network requests run only while the manually opened Torn page is visible and focused and this script's panel is
//   mounted; they pause when hidden or unfocused. Nothing is requested on a Ranked War list.
// - The entered key is sent over HTTPS to FFScouter for a user-triggered /register request and documented /check-key, /get-stats and /player-flights requests; visible target IDs are sent where those lookups require them.
// - The entered key is also sent over HTTPS to Torn's official API for faction/basic member status and mapping.
// - KS Scout stores the key (unencrypted), settings, manual values, notes and caches only in this Torn PDA webview.
// - KS Scout has no developer-operated server and its developer cannot access users' keys or data.
// - FFScouter is an independent third-party service and may store/use registered keys and related data under its own terms and data policy.
// - Direct Torn API use by KS Scout is limited to faction/basic. Full-access keys are not required.
// - KS Scout does not automate attacks, clicks, travel, purchases or any other Torn action.
// - Torn API terms: https://www.torn.com/api.html
// - Torn scripting rules: https://www.torn.com/rules.php
// - FFScouter terms/data policy: https://ffscouter.com/
// - FFScouter privacy policy: https://ffscouter.com/privacy
//
// RANKED WAR GUARD (checked on every route change and before every scan, before anything else):
// 1. If the hash path of the address is "/war/rank" (whatever the step), nothing is mounted, no row is read and no
//    request is made. A panel left from an earlier view is disposed.
// 2. Whatever the route, a member list that is inside, or contains, #faction_war_list_id, .enemy-faction,
//    .faction-war or [data-warid] is never used.
// 3. This script never touches the elements, storage or databases of War Dibs.
// 4. Torn error code 5 pauses every Torn request for 60 s (shown as OFFLINE), then resumes.


(() => {
    "use strict";

    const INSTANCE_KEY = "__kingshadeScoutActive";
    const LEGACY_WAR_TOOLS_KEY = "__ksWarToolsActive";
    const LEGACY_ONBOARDING_KEYS = [
        "__ksSuiteOnboardingPatchTest",
        "__ksSuiteOnboardingIntegratedTest",
        "__ksSuiteOnboarding"
    ];

    // An older instance of this script on the same page is shut down first (it removes its own panel and rows).
    if (window[INSTANCE_KEY]) {
        try { window[INSTANCE_KEY].destroy?.(); } catch {}
    }

    const NAME = "KS Scout";
    const VERSION = "0.9.5";
    // Where the script runs, read once at start: Torn PDA injects PDA_httpGet (and its flutter bridge) before userscripts run;
    // Tampermonkey on a computer has neither. Only used for words on the screen ("PDA" / "PC", "this browser").
    const ON_TORN_PDA = typeof window.PDA_httpGet === "function" || typeof window.flutter_inappwebview !== "undefined";
    const PLATFORM_LABEL = ON_TORN_PDA ? "PDA" : "PC";
    const STORE_PLACE = ON_TORN_PDA ? "this Torn PDA webview" : "this browser";
    const API_BASE = "https://ffscouter.com/api/v1";
    const TORN_API_BASE = "https://api.torn.com";
    const PREFIX = "kingshade-scout:";
    const SETTINGS_KEY = `${PREFIX}settings`;
    const API_KEY_STORAGE = `${PREFIX}ff-api-key`;
    const MANUAL_PREFIX = `${PREFIX}manual:`;
    const LEGACY_PROFILE_EST_PREFIX = `${PREFIX}profile-estimate:`;
    const CACHE_PREFIX = `${PREFIX}cache:`;
    const STATUS_STORAGE_KEY = `${PREFIX}status-core`;
    const TRAVEL_ACTIVE_KEY = `${PREFIX}travel-active`;
    const TRAVEL_HISTORY_KEY = `${PREFIX}travel-history`;
    const DEBUG_KEY = `${PREFIX}debug`;
    // The old War Tools settings. Read once by the migration, never written and never deleted.
    const LEGACY_WAR_SETTINGS_KEY = "kingshade-war-tools:settings";
    const SCHEMA_VERSION = 2;

    const CACHE_MS = 60 * 60 * 1000;
    const FACTION_DIRECTORY_MS = 5 * 60 * 1000;
    const STATUS_REFRESH_MS = 30 * 1000;
    const FF_KEY_STATUS_MS = 5 * 60 * 1000;
    const FF_FLIGHT_CACHE_MS = 60 * 1000;
    const FF_FLIGHT_ERROR_CACHE_MS = 15 * 1000;
    const FF_FLIGHT_CONCURRENCY = 4;
    const OLD_ESTIMATE_SECONDS = 14 * 24 * 60 * 60;

    // Added with the merge of Scout and War Tools (presentation and safety only).
    const TORN_LIMIT_PAUSE_MS = 60 * 1000;
    // Least time between two Torn requests (every Torn request counts, whatever sent it): 25 s for an ordinary one,
    // 10 s for a forced one (a countdown that ran out, Refresh), 30 s after one that failed.
    const TORN_NORMAL_GAP_MS = 25 * 1000;
    const TORN_FORCED_GAP_MS = 10 * 1000;
    const TORN_FAILURE_GAP_MS = 30 * 1000;
    const STATUS_LIVE_SECONDS = 45;
    const STATUS_STALE_SECONDS = 90;
    // A Torn request through PDA_httpGet gives up after this long (it cannot be aborted).
    const HTTP_TIMEOUT_MS = 30 * 1000;
    // The FF circle says "20+" above this value.
    const FF_BADGE_CAP = 20;
    const UI_TICK_MS = 5000;
    const ROUTE_HEARTBEAT_MS = 1000;
    const DETECT_PROBE_MS = 250;
    const DETECT_PROBE_MAX = 60;
    const EASY_MAX_FF_RANGE = Object.freeze({ min: 0.1, max: 20, step: 0.1 });
    const SOON_MINUTES_RANGE = Object.freeze({ min: 15, max: 1440, step: 15 });

    const RW_HASH_PATH = "/war/rank";
    const RW_SURFACE_SELECTOR = "#faction_war_list_id,.enemy-faction,.faction-war,[data-warid]";

    const PANEL_ID = "kss-panel";
    const CARD_ID = "kss-card";
    const STYLE_ID = "kss-styles";

    const CREATE_KEY_URL = "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=Kingshade%20Scout%20FFScouter&user=basic,battlestats,hof,attacks,personalstats&faction=basic";

    const FILTERS = new Set(["all", "ready", "easy", "soon", "hospital", "travel", "unknown"]);
    const SORTS = new Set(["original", "ff", "status", "soon"]);
    // sort direction. "asc" = lowest FF / Okay first / soonest first; "desc" the other way round.
    const SORT_DIRS = new Set(["asc", "desc"]);
    // the status colours (the values are tokens on :root, see TOKENS_CSS) turn amber when a hospital stay has
    // less than this many seconds left.
    const HOSPITAL_SOON_SECONDS = 60;

    const DEFAULTS = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        showUnknown: true,
        colorRows: true,
        // show the member name as plain text (honor bar and faction icon hidden). A missing value counts as true.
        namesAsText: true,
        filter: "all",
        sort: "original",
        sortDir: "asc",
        maxFF: 3.0,
        soonMinutes: 60,
        collapsed: false,
        // Not used since the merge. Kept so that nothing a user saved is deleted.
        buttonStyle: "crest",
        buttonX: null,
        buttonY: null,
        controlTab: "overview",
        apiDisclosureAccepted: false
    });

    // ---------------------------------------------------------------------------------------------
    // Debug log. Off unless localStorage "kingshade-scout:debug" is "1". The key is never logged.
    // ---------------------------------------------------------------------------------------------

    function debugEnabled() {
        try { return localStorage.getItem(DEBUG_KEY) === "1"; } catch { return false; }
    }

    function dlog(...args) {
        if (!debugEnabled()) return;
        try { console.log("[KS Scout PDA]", ...args); } catch {}
    }

    // ---------------------------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------------------------

    let settings = null; // loaded below, after the helpers it needs exist
    let destroyed = false;
    let mounted = false;
    let panelEl = null;
    let cardEl = null;
    let cardOpenedAt = 0;
    let view = "main";
    let generation = 0;

    let observer = null;
    let observerRoot = null;
    let observerConnected = false;
    let scanTimer = null;
    let statusTimer = null;
    let ffRetryTimer = null;
    let detectProbeTimer = null;
    let uiTimer = null;
    let heartbeatTimer = null;
    let routeTimer = null;
    let clockTimer = null;
    let tctClockObserver = null;
    let tctClockNode = null;
    let lastTctSecond = null;
    let tickRaf = null;
    let lastHref = location.href;

    let scanRunning = false;
    let rescanRequested = false;
    let resumeScanWhenVisible = false;
    let statusRequestRunning = false;
    let applying = false;

    let ffDataState = "idle";
    let ffLoadedCount = 0;
    let ffLoadedFactionId = null;
    let ffKeyStatusCache = { key: "", expires: 0, isRegistered: false, isPremium: false };

    let snapshot = null;
    let activeSnap = null; // the status snapshot that may be used (fresh enough), or null
    let activeSnapUpdatedAt = 0; // when the snapshot of this faction was made, even if it is too old to use
    let lastInfos = [];
    let lastScan = { kind: "none", http: 0, members: 0, at: 0 };
    let tornPausedUntil = 0;
    let lastStatusAttemptAt = 0;
    let lastStatusAttemptFailed = false;
    let statusForcePending = false;
    let statusForceAfterRun = false;
    let tornKeyRejectedFor = "";
    const failures = { status: "", ff: "", torn: "" };
    let statusLine = { text: "", tone: "", source: "auto" };
    let setupOpenedOnce = false;
    let setupSectionsOpened = false;
    let registerRunning = false;
    let saveRunning = false;

    const memoryCache = new Map();
    const factionDirectoryCache = new Map();
    const ffFlightCache = new Map();
    const activeRequestAborts = new Set();
    const ffData = new Map();
    const identityByRow = new WeakMap();
    const originalOrder = new WeakMap();
    const touchedRows = new Set();
    const touchedBodies = new Set();
    // Member-list bodies in which THIS script has moved rows (Original sorting never moves any).
    const reorderedBodies = new Set();
    const retryRows = new WeakSet();
    // row -> the generation whose scan is fetching for it (a scan of an older generation must not hold a row back).
    const pendingRows = new WeakMap();

    const OBSERVER_OPTIONS = { childList: true, subtree: true };

    // ---------------------------------------------------------------------------------------------
    // Older instances (War Tools, the onboarding module) must not draw a second panel.
    // ---------------------------------------------------------------------------------------------

    function retireLegacyWarTools() {
        const legacy = window[LEGACY_WAR_TOOLS_KEY];
        if (!legacy || String(legacy.version) === VERSION) return;
        try { legacy.destroy?.(); } catch {}
        dlog("shut down an older War Tools instance");
    }

    function retireLegacyModules() {
        for (const key of LEGACY_ONBOARDING_KEYS) {
            if (window[key]?.destroy) {
                try { window[key].destroy(); } catch {}
            }
        }
    }

    // Containers and style sheets of the old interface. Rows are never touched here.
    function removeLegacyDom() {
        try {
            document.querySelectorAll(
                ".ks6-fab,.ks6-panel,.ks6-modal,.ks6-toast,#kswt-toolbar,#kswt-timer-info,#ksob-prompt,#ksob-guide," +
                "#ks6-styles,#kswt-styles,#ksob-style"
            ).forEach(element => element.remove());
        } catch {}
    }


    // ---------------------------------------------------------------------------------------------
    // Page, focus and route helpers
    // ---------------------------------------------------------------------------------------------

    function pageHasFocus() {
        try {
            return typeof document.hasFocus === "function" && document.hasFocus();
        } catch {
            return false;
        }
    }

    function isPageVisible() {
        return document.visibilityState === "visible" && !document.hidden && pageHasFocus();
    }

    function isFactionPath() {
        return /\/factions\.php\/?$/i.test(location.pathname);
    }

    // The hash path of the address, normalised exactly as War Dibs does it: without "#", without "?...", without
    // trailing slashes.
    function rankedWarHashPath(value = location.href) {
        try {
            const url = new URL(value, location.href);
            return String(url.hash || "").slice(1).split("?", 1)[0].replace(/\/+$/, "");
        } catch {
            return "";
        }
    }

    // Guard 1. Whatever the step, this hash path is the Ranked War route.
    function isRankedWarRoute() {
        return rankedWarHashPath() === RW_HASH_PATH;
    }

    // Guard 2. A list inside, or containing, a Ranked War surface is never a list for this script. Fails closed.
    function isRankedWarList(list) {
        try {
            return Boolean(list.closest(RW_SURFACE_SELECTOR) || list.querySelector(RW_SURFACE_SELECTOR));
        } catch {
            return true;
        }
    }

    // True when this script must not touch the page at all.
    function blockedRoute() {
        return !isFactionPath() || isRankedWarRoute();
    }

    function factionMemberLists() {
        if (blockedRoute()) return [];
        return Array.from(document.querySelectorAll(".members-list")).filter(list =>
            list instanceof HTMLElement && list.querySelector(".table-body") && !isRankedWarList(list)
        );
    }

    function hasFactionMemberList() {
        return factionMemberLists().length > 0;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function hiddenPageError() {
        const error = new Error("KS Scout paused because the Torn page is not visible and focused.");
        error.code = "KS_PAGE_HIDDEN";
        return error;
    }

    function isHiddenPageError(error) {
        return error?.code === "KS_PAGE_HIDDEN";
    }

    function requireVisiblePage() {
        if (!isPageVisible()) throw hiddenPageError();
    }

    // Requests are made only while the panel of this script is mounted on a member list.
    function requireMounted() {
        if (destroyed || !mounted || blockedRoute()) {
            const error = new Error("KS Scout is not mounted on a member list.");
            error.code = "KS_NOT_MOUNTED";
            throw error;
        }
    }

    function isNotMountedError(error) {
        return error?.code === "KS_NOT_MOUNTED";
    }

    // The work that started in this generation was taken down (DISPOSE, a new key) or never belonged to the page now shown.
    function requireCurrentGeneration(gen) {
        if (gen !== generation) throw hiddenPageError();
    }

    // Runs immediately before every request (Torn and FFScouter, every path): page visible and focused, panel mounted,
    // route not blocked, and the generation is the one the work started in. Otherwise nothing is sent.
    function requestGate(gen) {
        requireVisiblePage();
        requireMounted();
        requireCurrentGeneration(gen);
    }

    function isStopError(error) {
        return isHiddenPageError(error) || isNotMountedError(error);
    }

    function abortActiveRequests() {
        for (const abort of Array.from(activeRequestAborts)) {
            try { abort(); } catch {}
        }
        activeRequestAborts.clear();
    }

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    // ---------------------------------------------------------------------------------------------
    // Settings (schemaVersion 2) and the one-time migration of the War Tools settings
    // ---------------------------------------------------------------------------------------------

    function normalizeSettingsValues(value, base = DEFAULTS) {
        const candidate = { ...base, ...(value && typeof value === "object" ? value : {}) };
        const maxFF = Number(candidate.maxFF);
        const soonMinutes = Number(candidate.soonMinutes);
        return {
            ...candidate,
            showUnknown: Boolean(candidate.showUnknown),
            colorRows: Boolean(candidate.colorRows),
            namesAsText: candidate.namesAsText !== false,
            filter: FILTERS.has(candidate.filter) ? candidate.filter : DEFAULTS.filter,
            sort: SORTS.has(candidate.sort) ? candidate.sort : DEFAULTS.sort,
            sortDir: SORT_DIRS.has(candidate.sortDir) ? candidate.sortDir : DEFAULTS.sortDir,
            maxFF: Number.isFinite(maxFF) && maxFF > 0 ? Math.min(20, maxFF) : DEFAULTS.maxFF,
            soonMinutes: Number.isFinite(soonMinutes) && soonMinutes > 0
                ? Math.min(1440, Math.max(1, Math.round(soonMinutes)))
                : DEFAULTS.soonMinutes,
            collapsed: Boolean(candidate.collapsed),
            apiDisclosureAccepted: Boolean(candidate.apiDisclosureAccepted)
        };
    }

    function readLegacyWarSettings() {
        try {
            const parsed = JSON.parse(localStorage.getItem(LEGACY_WAR_SETTINGS_KEY) || "null");
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch {}
    }

    // Runs once: when schemaVersion is below 2. Copies filter, sort, maxFF, soonMinutes and collapsed out of the
    // War Tools settings. The War Tools key is left as it is. The API key and the manual values are not touched.
    function loadSettings() {
        let saved = {};
        try {
            const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
        } catch {}
        delete saved.showStripe;
        if (!["overview", "scout", "war", "data"].includes(saved.controlTab)) delete saved.controlTab;

        let next = normalizeSettingsValues(saved);
        if (!(Number(saved.schemaVersion) >= SCHEMA_VERSION)) {
            const legacy = readLegacyWarSettings();
            if (legacy) {
                const picked = {};
                for (const field of ["filter", "sort", "maxFF", "soonMinutes", "collapsed"]) {
                    if (Object.prototype.hasOwnProperty.call(legacy, field)) picked[field] = legacy[field];
                }
                next = normalizeSettingsValues(picked, next);
            }
            next.schemaVersion = SCHEMA_VERSION;
            settings = next;
            saveSettings();
            dlog("settings migrated to schemaVersion 2");
        }
        return next;
    }

    function updateSettings(partial = {}) {
        settings = normalizeSettingsValues(partial, settings);
        saveSettings();
        return settings;
    }

    // ---------------------------------------------------------------------------------------------
    // Key, acceptance and what is stored
    // ---------------------------------------------------------------------------------------------

    function getApiKey() {
        try {
            return localStorage.getItem(API_KEY_STORAGE) || "";
        } catch {
            return "";
        }
    }

    function setApiKey(value) {
        try {
            const clean = String(value || "").trim();
            if (clean) localStorage.setItem(API_KEY_STORAGE, clean);
            else localStorage.removeItem(API_KEY_STORAGE);
        } catch {}
    }

    function apiDisclosureAccepted() {
        return Boolean(settings.apiDisclosureAccepted);
    }

    function requireApiDisclosureAcceptance() {
        if (!apiDisclosureAccepted()) {
            throw new Error("API disclosure acceptance is required. Open the settings (gear), read the disclosure, and tick the acceptance box.");
        }
    }

    // Nothing is requested and nothing is shown until a key exists AND the disclosure is accepted.
    function suiteDataEnabled() {
        return Boolean(getApiKey() && apiDisclosureAccepted());
    }

    // The learned travel history is never removed here (not when the key is removed, not when data is switched off):
    // only "Clear cached data" removes it.
    function removeApiDerivedStorage() {
        const keys = [];
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index) || "";
                if (
                    key.startsWith(CACHE_PREFIX) ||
                    key === STATUS_STORAGE_KEY ||
                    key === TRAVEL_ACTIVE_KEY
                ) keys.push(key);
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch {}
        return keys.length;
    }

    function disableDataDisplay({ purgeApiCache = true } = {}) {
        clearTimeout(statusTimer);
        statusTimer = null;
        clearTimeout(ffRetryTimer);
        ffRetryTimer = null;
        abortActiveRequests();
        memoryCache.clear();
        factionDirectoryCache.clear();
        ffFlightCache.clear();
        ffData.clear();
        ffKeyStatusCache = { key: "", expires: 0, isRegistered: false, isPremium: false };
        if (purgeApiCache) removeApiDerivedStorage();
        snapshot = null;
        ffDataState = "disabled";
        ffLoadedCount = 0;
        ffLoadedFactionId = null;
        failures.status = "";
        failures.ff = "";
        failures.torn = "";
        clearRendered();
        updatePanel();
    }

    let setupDisabledApplied = false;

    function reconcileDataState({ purgeApiCache = true } = {}) {
        const enabled = suiteDataEnabled();
        if (!enabled) {
            if (!setupDisabledApplied) {
                setupDisabledApplied = true;
                disableDataDisplay({ purgeApiCache });
            } else {
                // Torn can replace the member-list DOM while setup is missing. Re-clear what was drawn.
                clearRendered();
            }
            return false;
        }

        setupDisabledApplied = false;
        if (ffDataState === "disabled") ffDataState = "idle";
        return true;
    }

    // ---------------------------------------------------------------------------------------------
    // Torn answers: code 5 pauses every Torn request, key codes stop them until the key is saved again.
    // ---------------------------------------------------------------------------------------------

    function tornPaused() {
        return Date.now() < tornPausedUntil;
    }

    function tornKeyIsRejected() {
        return Boolean(tornKeyRejectedFor) && tornKeyRejectedFor === getApiKey();
    }

    function tornRequestsBlocked() {
        return tornPaused() || tornKeyIsRejected();
    }

    function clearTornFailure() {
        const hadLimit = failures.torn.startsWith("Torn API limit");
        failures.torn = "";
        if (hadLimit && statusLine.text.startsWith("Torn API limit")) setStatusLine("", "");
    }

    // Returns "limit", "key", "other" or "" (no error in the answer).
    function handleTornError(payload) {
        const raw = payload?.error;
        if (raw === undefined || raw === null) return "";
        const code = Number(typeof raw === "object" ? raw.code : NaN);
        if (code === 5) {
            tornPausedUntil = Date.now() + TORN_LIMIT_PAUSE_MS;
            failures.torn = "Torn API limit reached · paused 60 s";
            setStatusLine(failures.torn, "stop");
            dlog("Torn error code 5: Torn requests paused for 60 s");
            scheduleStatusRefresh(TORN_LIMIT_PAUSE_MS + 500);
            return "limit";
        }
        if ([2, 10, 13, 18].includes(code)) {
            tornKeyRejectedFor = getApiKey();
            failures.torn = `Torn rejected the key (code ${code}) · check the key`;
            setStatusLine(failures.torn, "stop");
            dlog("Torn error code", code, ": Torn requests stopped until the key is saved again");
            return "key";
        }
        return "other";
    }


    // ---------------------------------------------------------------------------------------------
    // Data layer. Everything between here and "Rows and timers" is the earlier logic, unchanged except where
    // marked: storage helpers, HTTP, FFScouter register / check-key / flights, cache, FF fetch, player ids,
    // route times, travel estimates and the status snapshot.
    // ---------------------------------------------------------------------------------------------

    function getManual(playerId) {
        try {
            return JSON.parse(localStorage.getItem(`${MANUAL_PREFIX}${playerId}`) || "null");
        } catch {
            return null;
        }
    }

    function setManual(playerId, value) {
        try {
            if (!value) localStorage.removeItem(`${MANUAL_PREFIX}${playerId}`);
            else localStorage.setItem(`${MANUAL_PREFIX}${playerId}`, JSON.stringify(value));
        } catch {}
    }

    function normalizeEstimateText(value) {
        const text = String(value || "")
            .replace(/\s+/g, " ")
            .replace(/\s*(?:-|–|to)\s*/gi, "–")
            .trim();

        if (!text || /^(?:unk|unknown|n\/a|none|\?)$/i.test(text)) return "";

        return text
            .replace(/(\d(?:[.,]\d+)?)\s*([kmb])\b/gi, (_, number, unit) => `${number}${unit.toUpperCase()}`)
            .replace(/^<\s+/, "<");
    }

    function extractEstimateFragment(value) {
        const text = String(value || "").replace(/\s+/g, " ").trim();
        const match = text.match(/(?:<\s*)?\d+(?:[.,]\d+)?\s*[KMB](?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?\s*[KMB])?/i);
        return normalizeEstimateText(match?.[0] || "");
    }

    function compactParts(total) {
        const n = Number(total);
        if (!Number.isFinite(n) || n <= 0) return { value: "", unit: "K" };
        if (n >= 1e9) return { value: +(n / 1e9).toFixed(2), unit: "B" };
        if (n >= 1e6) return { value: +(n / 1e6).toFixed(2), unit: "M" };
        return { value: +(n / 1e3).toFixed(2), unit: "K" };
    }

    function parseCompact(value, unit) {
        const n = Number(String(value || "").replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) return null;
        return n * (unit === "B" ? 1e9 : unit === "M" ? 1e6 : 1e3);
    }

    function formatCompact(total) {
        const parts = compactParts(total);
        return parts.value ? `${parts.value}${parts.unit}` : "?";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizedText(element) {
        return String(element?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function normalizeResponse(resp) {
        if (!resp) return { status: 0, responseText: "" };
        if (typeof resp === "string") return { status: 200, responseText: resp };
        return {
            status: Number(resp.status ?? resp.statusCode ?? 200),
            responseText: String(resp.responseText ?? resp.body ?? resp.response ?? "")
        };
    }

    // Torn PDA's GET cannot be aborted and has no time limit of its own. This gives up after HTTP_TIMEOUT_MS: the caller
    // gets an ordinary network error (a failed attempt), and an answer that comes later is ignored.
    function pdaGetWithTimeout(url) {
        return new Promise((resolve, reject) => {
            let done = false;
            let timer = null;
            const finish = (settle, value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                settle(value);
            };
            timer = setTimeout(() => finish(reject, new Error("Request timed out")), HTTP_TIMEOUT_MS);
            try {
                Promise.resolve(window.PDA_httpGet(url, {})).then(response => finish(resolve, response), error => finish(reject, error));
            } catch (error) {
                finish(reject, error);
            }
        });
    }

    // Same request paths as the earlier version. Added with the merge: every request starts with the request gate and a
    // response that arrives after the work was taken down (another generation) is thrown away, never handed on.
    async function httpGet(url, gen) {
        requestGate(gen);

        if (typeof window.PDA_httpGet === "function") {
            const response = await pdaGetWithTimeout(url);
            requireVisiblePage();
            requireCurrentGeneration(gen);
            return normalizeResponse(response);
        }

        if (typeof GM_xmlhttpRequest === "function") {
            return new Promise((resolve, reject) => {
                let settled = false;
                let request = null;

                const finish = (callback, value) => {
                    if (settled) return;
                    settled = true;
                    activeRequestAborts.delete(abort);
                    callback(value);
                };

                const abort = () => {
                    if (settled) return;
                    try { request?.abort?.(); } catch {}
                    finish(reject, hiddenPageError());
                };

                activeRequestAborts.add(abort);
                request = GM_xmlhttpRequest({
                    method: "GET",
                    url,
                    timeout: 30000,
                    onload: response => {
                        if (!isPageVisible() || gen !== generation) {
                            abort();
                            return;
                        }
                        finish(resolve, normalizeResponse(response));
                    },
                    onerror: error => finish(reject, error instanceof Error ? error : new Error("Network request failed")),
                    ontimeout: () => finish(reject, new Error("Request timed out")),
                    onabort: () => finish(reject, hiddenPageError())
                });
            });
        }

        const controller = new AbortController();
        let settled = false;
        const abort = () => {
            if (settled) return;
            controller.abort();
        };
        activeRequestAborts.add(abort);

        try {
            const response = await fetch(url, { credentials: "omit", signal: controller.signal });
            requireVisiblePage();
            requireCurrentGeneration(gen);
            const responseText = await response.text();
            requireCurrentGeneration(gen);
            return { status: response.status, responseText };
        } catch (error) {
            if (controller.signal.aborted || !isPageVisible() || gen !== generation) throw hiddenPageError();
            throw error;
        } finally {
            settled = true;
            activeRequestAborts.delete(abort);
        }
    }

    async function httpPostJson(url, payload, gen, onSent) {
        requestGate(gen);
        const body = JSON.stringify(payload ?? {});

        if (typeof GM_xmlhttpRequest === "function") {
            return new Promise((resolve, reject) => {
                let settled = false;
                let request = null;

                const finish = (callback, value) => {
                    if (settled) return;
                    settled = true;
                    activeRequestAborts.delete(abort);
                    callback(value);
                };

                const abort = () => {
                    if (settled) return;
                    try { request?.abort?.(); } catch {}
                    finish(reject, hiddenPageError());
                };

                activeRequestAborts.add(abort);
                if (onSent) onSent();
                request = GM_xmlhttpRequest({
                    method: "POST",
                    url,
                    headers: { "Content-Type": "application/json" },
                    data: body,
                    timeout: 30000,
                    onload: response => {
                        if (!isPageVisible() || gen !== generation) {
                            abort();
                            return;
                        }
                        finish(resolve, normalizeResponse(response));
                    },
                    onerror: error => finish(reject, error instanceof Error ? error : new Error("Network request failed")),
                    ontimeout: () => finish(reject, new Error("Request timed out")),
                    onabort: () => finish(reject, hiddenPageError())
                });
            });
        }

        const controller = new AbortController();
        let settled = false;
        const abort = () => {
            if (settled) return;
            controller.abort();
        };
        activeRequestAborts.add(abort);

        try {
            if (onSent) onSent();
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "omit",
                body,
                signal: controller.signal
            });
            requireVisiblePage();
            requireCurrentGeneration(gen);
            const responseText = await response.text();
            requireCurrentGeneration(gen);
            return { status: response.status, responseText };
        } catch (error) {
            if (controller.signal.aborted || !isPageVisible() || gen !== generation) throw hiddenPageError();
            throw error;
        } finally {
            settled = true;
            activeRequestAborts.delete(abort);
        }
    }

    async function registerFfScouterKey(key, gen, onSent) {
        const cleanKey = String(key || "").trim();
        if (!/^[A-Za-z0-9]{16}$/.test(cleanKey)) {
            throw new Error("Enter a valid 16-character Torn API key first.");
        }

        const response = await httpPostJson(`${API_BASE}/register`, {
            key: cleanKey,
            agree_to_data_policy: true,
            signup_source: "KingshadeScout"
        }, gen, onSent);

        let payload = null;
        try { payload = JSON.parse(response.responseText || "null"); } catch {}

        if (response.status === 200 && payload?.success) {
            ffKeyStatusCache = { key: "", expires: 0, isRegistered: false, isPremium: false };
            return "FFScouter registration complete.";
        }

        if (response.status === 409 && Number(payload?.code) === 8) {
            ffKeyStatusCache = { key: "", expires: 0, isRegistered: false, isPremium: false };
            return "This key is already registered with FFScouter.";
        }

        const message = String(payload?.error || payload?.message || `FFScouter registration failed (HTTP ${response.status || 0}).`);
        throw new Error(message);
    }


    // Same retry steps as before (now, +700 ms, +1800 ms). Added: the request gate runs after every wait.
    async function getFfScouterResponse(url, gen) {
        let lastError = null;
        const delays = [0, 700, 1800];

        for (let attempt = 0; attempt < delays.length; attempt++) {
            requireVisiblePage();
            if (delays[attempt]) await wait(delays[attempt]);
            requestGate(gen);

            try {
                const response = await httpGet(url, gen);
                if (response.status !== 0 || attempt === delays.length - 1) return response;
            } catch (error) {
                if (isStopError(error)) throw error;
                lastError = error;
                if (attempt === delays.length - 1) throw error;
            }
        }

        if (lastError) throw lastError;
        return { status: 0, responseText: "" };
    }


    async function ffPremiumAvailable(key, gen) {
        const cleanKey = String(key || "").trim();
        if (!cleanKey) return false;

        const now = Date.now();
        if (ffKeyStatusCache.key === cleanKey && ffKeyStatusCache.expires > now) {
            return Boolean(ffKeyStatusCache.isRegistered && ffKeyStatusCache.isPremium);
        }

        try {
            requestGate(gen);
            const query = new URLSearchParams({ key: cleanKey });
            const response = await getFfScouterResponse(`${API_BASE}/check-key?${query}`, gen);
            if (response.status !== 200) {
                ffKeyStatusCache = {
                    key: cleanKey,
                    expires: now + FF_FLIGHT_ERROR_CACHE_MS,
                    isRegistered: false,
                    isPremium: false
                };
                return false;
            }

            const payload = JSON.parse(response.responseText || "null");
            const isRegistered = Boolean(payload?.is_registered);
            const isPremium = Boolean(payload?.is_premium);
            ffKeyStatusCache = {
                key: cleanKey,
                expires: now + FF_KEY_STATUS_MS,
                isRegistered,
                isPremium
            };
            return Boolean(isRegistered && isPremium);
        } catch (error) {
            if (isStopError(error)) throw error;
            ffKeyStatusCache = {
                key: cleanKey,
                expires: now + FF_FLIGHT_ERROR_CACHE_MS,
                isRegistered: false,
                isPremium: false
            };
            return false;
        }
    }

    function flightRouteMatches(tornDescription, ffDescription) {
        const torn = parseTravelDescription(tornDescription);
        const ff = parseTravelDescription(ffDescription);
        const tornDestination = normalizeDestination(torn.destination).toLowerCase();
        const ffDestination = normalizeDestination(ff.destination).toLowerCase();

        if (tornDestination && ffDestination && tornDestination !== ffDestination) return false;
        if (
            torn.direction !== "unknown" &&
            ff.direction !== "unknown" &&
            torn.direction !== ff.direction
        ) return false;
        return true;
    }

    function ffFlightTravelValue(playerId, tornTravel, current, fetchedAt) {
        if (!current || typeof current !== "object") return null;

        const statusDescription = String(current.status_description || "").trim();
        const tornDescription = String(tornTravel?.description || "").trim();
        if (statusDescription && tornDescription && !flightRouteMatches(tornDescription, statusDescription)) {
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        const earliest = Number(current.earliest_arrival_time) || 0;
        const latest = Number(current.latest_arrival_time) || 0;
        if (!earliest && !latest) return null;
        if (latest && latest <= now) return null;

        const low = earliest || latest;
        const high = latest || earliest;
        const landingEta = low && high ? Math.round((low + high) / 2) : (low || high);
        let eta = landingEta;
        if (eta <= now && high > now) eta = high;
        if (!eta || eta <= now) return null;

        const takeoff = Number(current.takeoff_time) || null;
        const route = parseTravelDescription(statusDescription || tornDescription);
        const uncertainty = low && high ? Math.max(30, Math.round((high - low) / 2)) : 60;
        const travelMethod = String(current.travel_method || "Unknown").trim() || "Unknown";
        const book = typeof current.book_likely_being_used === "boolean"
            ? current.book_likely_being_used
            : null;

        return {
            ...(tornTravel || {}),
            playerId,
            description: tornDescription || statusDescription,
            destination: tornTravel?.destination || route.destination,
            direction: tornTravel?.direction || route.direction,
            departedAt: takeoff,
            departureSource: "ffscouter-flight",
            eta,
            landingEta: landingEta || null,
            etaLow: low || null,
            etaHigh: high || null,
            estimateSource: "ffscouter-flight",
            unavailableReason: "",
            durationSeconds: takeoff && eta > takeoff ? eta - takeoff : null,
            uncertaintySeconds: uncertainty,
            confidence: "ffscouter-window",
            exact: false,
            travelMethod,
            bookLikelyBeingUsed: book,
            ffscouterFetchedAt: Math.floor(fetchedAt / 1000)
        };
    }

    async function fetchFfFlightTravel(playerId, tornTravel, key, gen) {
        const cacheKey = `${key}:${playerId}`;
        const routeDescription = String(tornTravel?.description || "").trim();
        const cached = ffFlightCache.get(cacheKey);
        const nowMs = Date.now();

        if (
            cached &&
            cached.expires > nowMs &&
            cached.routeDescription === routeDescription
        ) {
            return cached.value;
        }

        try {
            requestGate(gen);
            const query = new URLSearchParams({ key, target: String(playerId) });
            const response = await getFfScouterResponse(`${API_BASE}/player-flights?${query}`, gen);

            if (response.status === 403) {
                ffKeyStatusCache = {
                    key,
                    expires: nowMs + FF_FLIGHT_ERROR_CACHE_MS,
                    isRegistered: true,
                    isPremium: false
                };
            }

            if (response.status !== 200) {
                ffFlightCache.set(cacheKey, {
                    expires: nowMs + FF_FLIGHT_ERROR_CACHE_MS,
                    routeDescription,
                    value: null
                });
                return null;
            }

            const payload = JSON.parse(response.responseText || "null");
            const value = ffFlightTravelValue(playerId, tornTravel, payload?.current, nowMs);
            ffFlightCache.set(cacheKey, {
                expires: nowMs + (value ? FF_FLIGHT_CACHE_MS : FF_FLIGHT_ERROR_CACHE_MS),
                routeDescription,
                value
            });
            return value;
        } catch (error) {
            if (isStopError(error)) throw error;
            ffFlightCache.set(cacheKey, {
                expires: nowMs + FF_FLIGHT_ERROR_CACHE_MS,
                routeDescription,
                value: null
            });
            return null;
        }
    }

    async function runWithConcurrency(items, limit, worker) {
        let index = 0;
        const count = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
        const runners = Array.from({ length: count }, async () => {
            while (index < items.length) {
                const currentIndex = index++;
                await worker(items[currentIndex]);
            }
        });
        await Promise.all(runners);
    }

    async function enrichSnapshotWithFfFlights(snapshot, gen) {
        if (!snapshot?.members || typeof snapshot.members !== "object") return snapshot;
        const travelers = Object.values(snapshot.members).filter(member =>
            String(member?.status?.state || "").toLowerCase() === "traveling"
        );
        if (!travelers.length) return snapshot;

        const key = getApiKey();
        if (!key || !apiDisclosureAccepted()) return snapshot;
        if (!(await ffPremiumAvailable(key, gen))) return snapshot;

        await runWithConcurrency(travelers, FF_FLIGHT_CONCURRENCY, async member => {
            requestGate(gen);
            const ffTravel = await fetchFfFlightTravel(member.id, member.travel, key, gen);
            if (ffTravel) member.travel = ffTravel;
        });
        return snapshot;
    }

    function readCacheRecord(playerId) {
        try {
            const parsed = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${playerId}`) || "null");
            return parsed?.value ? parsed : null;
        } catch {
            return null;
        }
    }

    function getCached(playerId) {
        const memory = memoryCache.get(playerId);
        if (memory?.value && Number(memory.expires) > Date.now()) return memory.value;
        if (memory) memoryCache.delete(playerId);

        const parsed = readCacheRecord(playerId);
        if (!parsed || Number(parsed.expires) <= Date.now()) return null;
        memoryCache.set(playerId, { expires: Number(parsed.expires), value: parsed.value });
        return parsed.value;
    }

    function getStaleCached(playerId) {
        return readCacheRecord(playerId)?.value || null;
    }

    function emptyFfValue(playerId, transient = false) {
        return {
            player_id: playerId,
            fair_fight: null,
            last_updated: null,
            bs_estimate: null,
            bs_estimate_human: "",
            bss_public: null,
            source: "",
            available_estimates: null,
            premium_insights_available: false,
            distribution: null,
            spies: [],
            _transient: Boolean(transient)
        };
    }

    function setCached(playerId, value) {
        const expires = Date.now() + CACHE_MS;
        memoryCache.set(playerId, { expires, value });
        try {
            localStorage.setItem(`${CACHE_PREFIX}${playerId}`, JSON.stringify({
                expires,
                value
            }));
        } catch {}
    }

    // Same logic as the earlier version. Changed: the request is refused unless the panel is mounted and the generation
    // is the one the scan started in (checked before every batch), the texts name KS Scout, and a non-200 answer
    // carries its HTTP status.
    async function fetchPlayers(ids, gen) {
        requestGate(gen);
        if (!suiteDataEnabled()) {
            throw new Error("KS Scout setup is required before FF/EST data can be used.");
        }
        const result = new Map();
        const stale = new Map();
        const missing = [];

        for (const id of ids) {
            const cached = getCached(id);
            if (cached) {
                result.set(id, cached);
                continue;
            }

            const staleValue = getStaleCached(id);
            if (staleValue) stale.set(id, staleValue);
            missing.push(id);
        }

        if (!missing.length) return result;

        const key = getApiKey();
        if (!key) throw new Error("No Torn / FFScouter API key is saved. Open the settings (gear) and paste your key.");
        requireApiDisclosureAcceptance();

        result.ksTransientFailure = false;
        result.ksNeedsRetryIds = new Set();

        for (let i = 0; i < missing.length; i += 100) {
            requestGate(gen);
            const batch = missing.slice(i, i + 100);
            const query = new URLSearchParams({ key, targets: batch.join(",") });

            let response;
            try {
                response = await getFfScouterResponse(`${API_BASE}/get-stats?${query}`, gen);
            } catch (error) {
                if (isStopError(error)) throw error;
                response = { status: 0, responseText: "" };
            }

            if (response.status === 0) {
                result.ksTransientFailure = true;
                for (const id of batch) {
                    const fallback = stale.get(id);
                    result.set(id, fallback ? { ...fallback, _transient: true, _stale: true } : emptyFfValue(id, true));
                    result.ksNeedsRetryIds.add(id);
                }
                continue;
            }

            if (response.status !== 200) {
                const error = new Error(`FFScouter returned HTTP ${response.status}`);
                error.httpStatus = response.status;
                throw error;
            }

            let rows;
            try {
                rows = JSON.parse(response.responseText);
            } catch {
                throw new Error("FFScouter returned invalid data.");
            }

            if (!Array.isArray(rows)) {
                throw new Error(rows?.error || "Unexpected response from FFScouter.");
            }

            const returned = new Set();

            for (const row of rows) {
                const playerId = Number(row?.player_id);
                if (!playerId) continue;

                const value = {
                    player_id: playerId,
                    fair_fight: Number(row.fair_fight),
                    last_updated: Number(row.last_updated),
                    bs_estimate: Number(row.bs_estimate),
                    bs_estimate_human: String(row.bs_estimate_human || ""),
                    bss_public: Number(row.bss_public),
                    source: String(row.source || "bss"),
                    available_estimates: row.available_estimates && typeof row.available_estimates === "object"
                        ? row.available_estimates
                        : null,
                    premium_insights_available: Boolean(row.premium_insights_available),
                    distribution: row.distribution || null,
                    spies: Array.isArray(row.spies) ? row.spies : []
                };

                returned.add(playerId);
                result.set(playerId, value);
                setCached(playerId, value);
            }

            for (const id of batch) {
                if (!returned.has(id)) {
                    const value = emptyFfValue(id, false);
                    result.set(id, value);
                    setCached(id, value);
                }
            }
        }

        return result;
    }

    function playerIdFromUrl(rawHref) {
        const href = String(rawHref || "").replaceAll("&amp;", "&");
        if (!href) return null;

        try {
            const url = new URL(href, location.origin);
            const path = url.pathname.toLowerCase();
            const isProfilePath = path.includes("/profiles");

            for (const key of ["XID", "user2ID", "userId"]) {
                const value = url.searchParams.get(key);
                if (/^\d+$/.test(value || "") && (isProfilePath || key !== "XID")) {
                    return Number(value);
                }
            }
        } catch {}

        const explicit = href.match(/[?&](?:XID|user2ID|userId)=(\d+)/i);
        if (explicit && /profiles|user2ID|userId/i.test(href)) return Number(explicit[1]);
        return null;
    }

    function extractPlayerId(anchor) {
        return playerIdFromUrl(anchor?.getAttribute?.("href") || anchor?.href || "");
    }

    function extractPlayerIdFromRow(row) {
        for (const anchor of row.querySelectorAll("a[href]")) {
            const id = extractPlayerId(anchor);
            if (id) return { id, anchor };
        }

        const html = String(row.outerHTML || "");
        const match = html.match(/(?:XID|user2ID|userId)(?:=|%3D|&quot;:\s*&quot;|["']?\s*[:]\s*["']?)(\d+)/i);
        if (match) return { id: Number(match[1]), anchor: null };

        return { id: null, anchor: null };
    }

    function normalizePlayerName(value) {
        return String(value || "")
            .normalize("NFKC")
            .replace(/^view\s+/i, "")
            .replace(/[’']s\s+(?:profile|honor bar).*$/i, "")
            .replace(/\s+(?:profile|honor bar)$/i, "")
            .replace(/^player\s+/i, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function rowNameCandidates(row) {
        const scope = row.querySelector(".member") || row;
        const values = new Set();
        const add = value => {
            const text = String(value || "").trim();
            if (text && text.length <= 100) values.add(text);
        };

        add(scope.textContent);
        for (const element of scope.querySelectorAll("img[alt], [title], [aria-label], [data-name], [data-username]")) {
            add(element.getAttribute("alt"));
            add(element.getAttribute("title"));
            add(element.getAttribute("aria-label"));
            add(element.getAttribute("data-name"));
            add(element.getAttribute("data-username"));
            add(element.textContent);
        }

        return Array.from(values).map(value => ({ raw: value, normalized: normalizePlayerName(value) }));
    }


    // Same as before. Added: a link inside a Ranked War surface is not counted (the enemy faction's id must never
    // be taken for the id of the faction on screen).
    function detectFactionId() {
        const current = String(location.href || "");
        const direct = current.match(/[?&#](?:ID|factionID|factionId)=(\d+)/i);
        if (direct) return Number(direct[1]);

        const counts = new Map();
        document.querySelectorAll('a[href*="factions.php"][href*="ID="]').forEach(anchor => {
            if (anchor.closest(RW_SURFACE_SELECTOR)) return;
            const href = String(anchor.getAttribute("href") || "").replaceAll("&amp;", "&");
            const match = href.match(/[?&]ID=(\d+)/i);
            if (!match) return;
            const id = Number(match[1]);
            counts.set(id, (counts.get(id) || 0) + 1);
        });

        let bestId = null;
        let bestCount = 0;
        for (const [id, count] of counts) {
            if (count > bestCount) {
                bestId = id;
                bestCount = count;
            }
        }
        return bestId;
    }

    const TRAVEL_TIMES_MINUTES = Object.freeze({
        Mexico: { standard: 26, light_aircraft: 18, wlt: 13, business: 8 },
        "Cayman Islands": { standard: 35, light_aircraft: 25, wlt: 18, business: 11 },
        Canada: { standard: 41, light_aircraft: 29, wlt: 20, business: 12 },
        Hawaii: { standard: 134, light_aircraft: 94, wlt: 67, business: 40 },
        "United Kingdom": { standard: 159, light_aircraft: 111, wlt: 80, business: 48 },
        Argentina: { standard: 167, light_aircraft: 117, wlt: 83, business: 50 },
        Switzerland: { standard: 175, light_aircraft: 123, wlt: 88, business: 53 },
        Japan: { standard: 225, light_aircraft: 158, wlt: 113, business: 68 },
        China: { standard: 242, light_aircraft: 169, wlt: 121, business: 72 },
        "United Arab Emirates": { standard: 271, light_aircraft: 190, wlt: 135, business: 81 },
        "South Africa": { standard: 297, light_aircraft: 208, wlt: 149, business: 89 }
    });

    function readStoredJson(key, fallback = null) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    function writeStoredJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {}
    }

    function factionMemberEntries(payload) {
        if (!payload?.members) return [];
        return Array.isArray(payload.members)
            ? payload.members.map(member => [member?.id ?? member?.player_id, member])
            : Object.entries(payload.members);
    }

    function normalizedStatus(raw) {
        const status = raw && typeof raw === "object" ? raw : {};
        return {
            description: String(status.description || ""),
            details: String(status.details || ""),
            state: String(status.state || "Unknown"),
            color: String(status.color || ""),
            until: Number(status.until) || 0,
            plane_image_type: String(status.plane_image_type || "")
        };
    }

    function normalizeDestination(value) {
        const clean = String(value || "").replace(/\s+/g, " ").trim();
        if (!clean) return "";
        return /^UAE$/i.test(clean) ? "United Arab Emirates" : clean;
    }

    function parseTravelDescription(description) {
        const text = String(description || "").replace(/\s+/g, " ").trim();
        const patterns = [
            [/^Traveling from Torn to (.+)$/i, "outbound"],
            [/^Traveling from (.+) to Torn$/i, "return"],
            [/^Returning to Torn from (.+)$/i, "return"],
            [/^Traveling to (.+)$/i, "outbound"]
        ];

        for (const [pattern, direction] of patterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    description: text,
                    destination: normalizeDestination(match[1]),
                    direction
                };
            }
        }

        return { description: text, destination: "", direction: "unknown" };
    }

    function normalizePlaneType(value) {
        const raw = String(value || "").toLowerCase();
        if (raw === "light_aircraft") return "light_aircraft";
        if (raw === "wlt" || raw === "private_jet") return "wlt";
        return "airliner";
    }

    function travelTableColumn(planeType) {
        return planeType === "light_aircraft" ? "light_aircraft" : planeType === "wlt" ? "wlt" : "standard";
    }

    function travelTableSeconds(destination, planeType) {
        const row = TRAVEL_TIMES_MINUTES[destination];
        if (!row) return null;
        const minutes = Number(row[travelTableColumn(planeType)]);
        return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
    }

    function median(values) {
        const numbers = values.map(Number).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
        if (!numbers.length) return null;
        const middle = Math.floor(numbers.length / 2);
        return numbers.length % 2 ? numbers[middle] : Math.round((numbers[middle - 1] + numbers[middle]) / 2);
    }

    function medianSigned(values) {
        const numbers = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        if (!numbers.length) return null;
        const middle = Math.floor(numbers.length / 2);
        return numbers.length % 2 ? numbers[middle] : Math.round((numbers[middle - 1] + numbers[middle]) / 2);
    }

    function medianAbsoluteDeviation(values, center) {
        const numbers = values.map(Number).filter(Number.isFinite);
        if (!numbers.length || !Number.isFinite(center)) return null;
        return median(numbers.map(value => Math.abs(value - center)).filter(value => value > 0)) ?? 0;
    }

    function historyValues(history, key) {
        return Array.isArray(history?.[key])
            ? history[key].map(Number).filter(Number.isFinite)
            : [];
    }

    function pushHistoryValue(history, key, value, limit = 16) {
        const number = Number(value);
        if (!Number.isFinite(number)) return;
        const list = historyValues(history, key);
        list.push(Math.round(number));
        history[key] = list.slice(-limit);
    }

    function travelDurationKey(destination, planeType) {
        return `duration|${destination}|${planeType}`;
    }

    function travelActionOffsetKey(destination, planeType) {
        return `action-offset|${destination}|${planeType}`;
    }

    function travelGlobalActionOffsetKey(planeType) {
        return `action-offset-global|${planeType}`;
    }

    function buildTravelEstimate(playerId, member, previousMember, activeTravels, history, now) {
        const status = normalizedStatus(member?.status);
        const state = status.state.toLowerCase();
        const previousState = String(previousMember?.status?.state || "").toLowerCase();
        const active = activeTravels[playerId];

        if (state !== "traveling") {
            if (active) {
                const tableSeconds = travelTableSeconds(active.destination, active.planeType);
                const arrivedAt = now;

                // Only learn actual route duration when Scout saw the change into Traveling.
                // A startup/last-action estimate does not have a trustworthy departure timestamp.
                if (
                    active.departureSource === "observed-transition" &&
                    Number(active.departedAt) > 0
                ) {
                    const observedDuration = arrivedAt - Number(active.departedAt);
                    const plausibleMin = tableSeconds ? Math.round(tableSeconds * 0.75) : 60;
                    const plausibleMax = tableSeconds ? Math.round(tableSeconds * 1.25) : 8 * 60 * 60;
                    if (
                        active.destination &&
                        observedDuration >= plausibleMin &&
                        observedDuration <= plausibleMax
                    ) {
                        pushHistoryValue(
                            history,
                            travelDurationKey(active.destination, active.planeType),
                            observedDuration
                        );
                    }
                }

                // If the flight was first seen mid-air, arrival observation lets Scout learn
                // how far the player's last_action timestamp usually sits after/before departure.
                if (
                    active.departureSource === "last-action-fallback" &&
                    Number(active.lastActionAt) > 0 &&
                    tableSeconds
                ) {
                    const estimatedActualDeparture = arrivedAt - tableSeconds;
                    const offset = Number(active.lastActionAt) - estimatedActualDeparture;
                    const plausibleOffset = Math.min(45 * 60, Math.round(tableSeconds * 0.65));

                    if (Math.abs(offset) <= plausibleOffset) {
                        pushHistoryValue(
                            history,
                            travelActionOffsetKey(active.destination, active.planeType),
                            offset
                        );
                        pushHistoryValue(
                            history,
                            travelGlobalActionOffsetKey(active.planeType),
                            offset
                        );
                    }
                }

                delete activeTravels[playerId];
            }
            return null;
        }

        const route = parseTravelDescription(status.description);
        const planeType = normalizePlaneType(status.plane_image_type);
        const tableSeconds = travelTableSeconds(route.destination, planeType);
        const sameFlight = active && active.description === route.description;

        let departedAt = sameFlight ? Number(active.departedAt) : 0;
        let departureSource = sameFlight ? String(active.departureSource || "observed") : "";
        let lastActionAt = sameFlight ? Number(active.lastActionAt || 0) : 0;
        let appliedActionOffset = sameFlight ? Number(active.appliedActionOffset || 0) : 0;
        let actionOffsetSamples = sameFlight ? Number(active.actionOffsetSamples || 0) : 0;
        let uncertaintySeconds = sameFlight ? Number(active.uncertaintySeconds || 0) : 0;
        let confidence = sameFlight ? String(active.confidence || "low") : "low";

        if (!departedAt) {
            const lastAction = Number(member?.last_action?.timestamp) || 0;
            const sawPreFlightState = previousMember && previousState && previousState !== "traveling";

            if (sawPreFlightState) {
                // Scout polled this member before and after departure, so departure is known
                // within one status refresh interval.
                departedAt = now;
                departureSource = "observed-transition";
                uncertaintySeconds = 30;
                confidence = "high";
            } else if (lastAction > 0 && tableSeconds) {
                const routeOffsets = historyValues(
                    history,
                    travelActionOffsetKey(route.destination, planeType)
                );
                const globalOffsets = historyValues(
                    history,
                    travelGlobalActionOffsetKey(planeType)
                );
                const selectedOffsets = routeOffsets.length ? routeOffsets : globalOffsets;
                const learnedOffset = medianSigned(selectedOffsets) ?? 0;
                const spread = medianAbsoluteDeviation(selectedOffsets, learnedOffset) ?? 0;

                lastActionAt = lastAction;
                appliedActionOffset = learnedOffset;
                actionOffsetSamples = selectedOffsets.length;

                const inferred = lastAction - learnedOffset;
                const earliestStillTraveling = now - tableSeconds + 1;
                departedAt = Math.max(earliestStillTraveling, Math.min(now, inferred));
                departureSource = "last-action-fallback";

                if (selectedOffsets.length >= 3) {
                    uncertaintySeconds = Math.max(90, Math.round(spread * 2.5));
                    confidence = "medium";
                } else if (selectedOffsets.length > 0) {
                    uncertaintySeconds = Math.max(4 * 60, Math.round(tableSeconds * 0.12));
                    confidence = "low";
                } else {
                    // No public departure timestamp exists. A 20% route-time uncertainty
                    // correctly reflects that last_action can occur before or after departure.
                    uncertaintySeconds = Math.min(
                        20 * 60,
                        Math.max(5 * 60, Math.round(tableSeconds * 0.20))
                    );
                    confidence = "low";
                }
            } else {
                departedAt = now;
                departureSource = previousState === "traveling"
                    ? "startup-observation"
                    : "observed-transition";
                uncertaintySeconds = tableSeconds
                    ? Math.min(20 * 60, Math.max(5 * 60, Math.round(tableSeconds * 0.25)))
                    : 15 * 60;
                confidence = "low";
            }

            activeTravels[playerId] = {
                playerId,
                destination: route.destination,
                direction: route.direction,
                description: route.description,
                planeType,
                departedAt,
                departureSource,
                lastActionAt,
                appliedActionOffset,
                actionOffsetSamples,
                uncertaintySeconds,
                confidence
            };
        }

        const durationSamples = historyValues(
            history,
            travelDurationKey(route.destination, planeType)
        ).filter(value => value > 0);
        const observedSeconds = median(durationSamples);
        const estimatedDuration = observedSeconds || tableSeconds;

        if (!estimatedDuration || !departedAt) {
            const unavailableReason = !route.destination
                ? "destination-not-exposed"
                : !estimatedDuration
                    ? "route-time-unavailable"
                    : "departure-unavailable";
            return {
                destination: route.destination,
                direction: route.direction,
                planeType,
                departedAt: departedAt || null,
                departureSource,
                eta: null,
                estimateSource: "unavailable",
                unavailableReason,
                confidence: "low",
                uncertaintySeconds: uncertaintySeconds || null,
                exact: false
            };
        }

        const eta = departedAt + estimatedDuration;
        const remaining = Math.max(0, eta - now);
        const uncertainty = Math.max(30, Number(uncertaintySeconds) || Math.round(estimatedDuration * 0.10));
        const lowRemaining = Math.max(0, remaining - uncertainty);
        const highRemaining = Math.max(lowRemaining, remaining + uncertainty);

        return {
            destination: route.destination,
            direction: route.direction,
            planeType,
            departedAt,
            departureSource,
            lastActionAt: lastActionAt || null,
            appliedActionOffset,
            actionOffsetSamples,
            eta: eta > now ? eta : null,
            etaLow: now + lowRemaining,
            etaHigh: now + highRemaining,
            estimateSource: observedSeconds ? "observed-history" : "published-table",
            unavailableReason: eta > now ? "" : "estimate-expired-while-still-traveling",
            historyCount: durationSamples.length,
            durationSeconds: estimatedDuration,
            uncertaintySeconds: uncertainty,
            confidence,
            exact: false
        };
    }

    function processFactionStatusPayload(payload, factionId) {
        const storedPrevious = readStoredJson(STATUS_STORAGE_KEY, { members: {} });
        const resolvedFactionId = Number(factionId) || Number(payload?.ID) || null;
        const previous = Number(storedPrevious?.factionId) === Number(resolvedFactionId)
            ? storedPrevious
            : { members: {} };
        const activeTravels = readStoredJson(TRAVEL_ACTIVE_KEY, {});
        const history = readStoredJson(TRAVEL_HISTORY_KEY, {});
        const now = Math.floor(Date.now() / 1000);
        const members = {};

        for (const [rawId, member] of factionMemberEntries(payload)) {
            const id = Number(member?.id ?? member?.player_id ?? rawId);
            if (!id) continue;
            const status = normalizedStatus(member?.status);
            const lastAction = member?.last_action && typeof member.last_action === "object"
                ? {
                    status: String(member.last_action.status || ""),
                    timestamp: Number(member.last_action.timestamp) || 0,
                    relative: String(member.last_action.relative || "")
                }
                : null;
            const travel = buildTravelEstimate(id, { ...member, status, last_action: lastAction }, previous?.members?.[id], activeTravels, history, now);

            members[id] = {
                id,
                name: String(member?.name || member?.player_name || ""),
                level: Number(member?.level) || null,
                status,
                lastAction,
                travel
            };
        }

        writeStoredJson(TRAVEL_ACTIVE_KEY, activeTravels);
        writeStoredJson(TRAVEL_HISTORY_KEY, history);

        return {
            version: VERSION,
            updatedAt: now,
            factionId: resolvedFactionId,
            members
        };
    }

    function publishStatusSnapshot(next) {
        snapshot = next;
        writeStoredJson(STATUS_STORAGE_KEY, next);
    }

    function loadPublishedStatusSnapshot() {
        if (!suiteDataEnabled()) {
            snapshot = null;
            return;
        }
        const stored = readStoredJson(STATUS_STORAGE_KEY, null);
        if (stored?.members && typeof stored.members === "object") snapshot = stored;
    }

    // The status snapshot that belongs to the faction on screen, whatever its age, or null. The stored copy is read
    // (and parsed) only when the one in memory does not match.
    function currentSnapshotRecord() {
        if (snapshotMatchesCurrent(snapshot)) return snapshot;
        const stored = readStoredJson(STATUS_STORAGE_KEY, null);
        return snapshotMatchesCurrent(stored) ? stored : null;
    }

    // Fail closed: a snapshot older than STATUS_STALE_SECONDS is not used for status, end times, travel
    // estimates or counters. It is not deleted; it is used again as soon as a fresh answer replaces it.
    function snapshotIsFresh(candidate) {
        const updatedAt = Number(candidate?.updatedAt);
        if (!Number.isFinite(updatedAt) || updatedAt <= 0) return false;
        return Date.now() / 1000 - updatedAt <= STATUS_STALE_SECONDS;
    }

    // The snapshot that may be used for status, or null.
    function matchingSnapshot() {
        const record = currentSnapshotRecord();
        return record && snapshotIsFresh(record) ? record : null;
    }

    // Sets activeSnap (usable for status, or null) and activeSnapUpdatedAt (its age is shown even when it is too old to use).
    function refreshActiveSnapshot() {
        const record = currentSnapshotRecord();
        activeSnapUpdatedAt = Number(record?.updatedAt) || 0;
        activeSnap = record && snapshotIsFresh(record) ? record : null;
        return activeSnap;
    }

    function snapshotMatchesCurrent(candidate) {
        if (!candidate?.members || typeof candidate.members !== "object") return false;

        const currentFactionId = detectFactionId();
        const snapshotFactionId = positiveNumber(candidate.factionId);
        if (currentFactionId && snapshotFactionId) {
            return Number(currentFactionId) === Number(snapshotFactionId);
        }

        const ids = displayedPlayerIds();
        if (!ids.length) return false;
        return ids.some(id => candidate.members[id] || candidate.members[String(id)]);
    }

    function displayedPlayerIds(limit = 20) {
        const ids = [];
        for (const list of factionMemberLists()) {
            for (const row of rowsInList(list)) {
                const id = rowIdentity(row)?.id;
                if (id && !ids.includes(id)) ids.push(id);
                if (ids.length >= limit) return ids;
            }
        }
        return ids;
    }

    // Milliseconds still to wait before a Torn request may be sent (0 = now). Counted from the last request that was
    // SENT, whether it worked or not: 25 s for an ordinary one, 10 s for a forced one, 30 s after a failed one.
    function tornSendWaitMs(force) {
        if (!lastStatusAttemptAt) return 0;
        const gap = lastStatusAttemptFailed ? TORN_FAILURE_GAP_MS : force ? TORN_FORCED_GAP_MS : TORN_NORMAL_GAP_MS;
        return Math.max(0, lastStatusAttemptAt + gap - Date.now());
    }

    // Every Torn request goes through here. The attempt is written down at the moment the request is sent, and counts
    // as a failure until the caller has an answer it can use.
    function tornGet(url, gen) {
        requestGate(gen);
        lastStatusAttemptAt = Date.now();
        lastStatusAttemptFailed = true;
        return httpGet(url, gen);
    }

    // Same request as before (path, selections, comment, every 30 s). Added: an error answer from Torn is read
    // (code 5 pauses all Torn requests, the key codes stop them), a failure is remembered for the status marker,
    // nothing is requested unless the panel is mounted, and no Torn request goes out less than 25 s (forced: 10 s,
    // after a failure: 30 s) after the last one.
    async function refreshStatusCore(force = false) {
        if (destroyed || !isPageVisible() || !mounted || blockedRoute() || !hasFactionMemberList()) return;
        if (statusRequestRunning) {
            // Remembered: when the running request is done, ONE forced refresh follows (several forced ones give one).
            if (force) statusForceAfterRun = true;
            return;
        }

        const key = getApiKey();
        if (!key || !apiDisclosureAccepted()) return;

        if (tornRequestsBlocked()) {
            if (tornPaused()) scheduleStatusRefresh(tornPausedUntil - Date.now() + 500);
            updatePanel();
            return;
        }
        if (failures.torn.startsWith("Torn API limit")) clearTornFailure();

        const waitMs = tornSendWaitMs(force);
        if (waitMs > 0) {
            scheduleStatusRefresh(waitMs + 25, force);
            return;
        }

        const existing = matchingSnapshot();
        const now = Math.floor(Date.now() / 1000);
        if (!force && existing?.updatedAt) {
            const ageSeconds = now - Number(existing.updatedAt);
            if (ageSeconds < 25) {
                scheduleStatusRefresh(Math.max(1000, (25 - ageSeconds) * 1000));
                return;
            }
        }

        const gen = generation;
        statusRequestRunning = true;
        updatePanel();
        try {
            const factionId = detectFactionId();
            const path = factionId ? `/faction/${factionId}` : "/faction/";
            const query = new URLSearchParams({
                selections: "basic",
                key,
                comment: "KingshadeScoutStatus"
            });
            dlog("status request", path);
            const response = await tornGet(`${TORN_API_BASE}${path}?${query}`, gen);
            if (gen !== generation || !hasFactionMemberList()) return;
            if (response.status !== 200) {
                failures.status = `Torn status unavailable (HTTP ${response.status || 0})`;
                return;
            }
            const payload = JSON.parse(response.responseText || "null");
            if (!payload) {
                failures.status = "Torn status unavailable";
                return;
            }
            if (payload.error) {
                const kind = handleTornError(payload);
                if (kind === "other") failures.status = "Torn status unavailable";
                return;
            }
            if (!payload.members) {
                failures.status = "Torn status unavailable";
                return;
            }

            const currentFactionId = detectFactionId();
            if (factionId && currentFactionId && Number(factionId) !== Number(currentFactionId)) return;

            const next = processFactionStatusPayload(payload, factionId);
            await enrichSnapshotWithFfFlights(next, gen);
            if (gen !== generation || !isPageVisible() || !hasFactionMemberList()) return;
            lastStatusAttemptFailed = false;
            publishStatusSnapshot(next);
            failures.status = "";
            if (!tornRequestsBlocked()) clearTornFailure();
            decorate();
        } catch (error) {
            // Status failures never interrupt FF/EST rendering.
            if (!isHiddenPageError(error) && !isNotMountedError(error)) failures.status = "Torn status request failed";
        } finally {
            // Only the generation that set the flag clears it (a new generation reset it when the work was taken down).
            if (gen === generation) {
                statusRequestRunning = false;
                const forceAgain = statusForceAfterRun;
                statusForceAfterRun = false;
                if (tornPaused()) scheduleStatusRefresh(tornPausedUntil - Date.now() + 500, forceAgain);
                else if (!tornKeyIsRejected()) {
                    // The floor of tornSendWaitMs, counted on the outcome of the request that just ended
                    // (it worked: 10 s after it was sent; it failed: 30 s).
                    if (forceAgain) scheduleStatusRefresh(tornSendWaitMs(true) + 25, true);
                    else scheduleStatusRefresh(STATUS_REFRESH_MS);
                }
                refreshAutoStatusLine();
                updatePanel();
            }
        }
    }

    // A forced request (a countdown that ran out, Refresh) is remembered while it waits, so that it keeps its shorter wait.
    function scheduleStatusRefresh(delay = STATUS_REFRESH_MS, force = false) {
        clearTimeout(statusTimer);
        statusTimer = null;
        if (force) statusForcePending = true;
        if (destroyed || !mounted || !suiteDataEnabled() || !isPageVisible() || blockedRoute() || !hasFactionMemberList()) return;
        statusTimer = setTimeout(() => {
            statusTimer = null;
            const forced = statusForcePending;
            statusForcePending = false;
            refreshStatusCore(forced);
        }, delay);
    }

    function directoryFromStatusSnapshot(factionId) {
        const current = snapshot;
        if (!current?.members || typeof current.members !== "object") return null;
        if (factionId && current.factionId && Number(factionId) !== Number(current.factionId)) return null;

        const byName = new Map();
        const byId = new Map();

        for (const member of Object.values(current.members)) {
            const id = Number(member?.id);
            const name = String(member?.name || "").trim();
            if (!id || !name) continue;

            const normalized = normalizePlayerName(name);
            if (!normalized) continue;

            byId.set(id, { id, name, status: member.status || null, lastAction: member.lastAction || null });
            const existing = byName.get(normalized);
            if (!existing) {
                byName.set(normalized, {
                    id,
                    name,
                    status: member.status || null,
                    lastAction: member.lastAction || null,
                    ambiguous: false
                });
            } else if (existing.id !== id) {
                byName.set(normalized, { id: null, name, ambiguous: true });
            }
        }

        return byId.size ? { factionId: Number(current.factionId) || Number(factionId) || null, byName, byId } : null;
    }

    // Same request as before (comment KingshadeScout, cached 5 min). Added: refused when the panel is not mounted
    // or Torn requests are paused, an error answer from Torn is read, and it keeps the same 25 s (after a failure
    // 30 s) distance to the last Torn request as the status request.
    async function fetchFactionDirectory(gen) {
        requestGate(gen);
        const key = getApiKey();
        if (!key || !apiDisclosureAccepted()) return null;
        if (tornRequestsBlocked()) return null;

        const factionId = detectFactionId();
        const sharedDirectory = directoryFromStatusSnapshot(factionId);
        if (sharedDirectory) return sharedDirectory;

        const cacheKey = factionId ? String(factionId) : "self";
        const cached = factionDirectoryCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) return cached.value;
        if (tornSendWaitMs(false) > 0) return null;

        const path = factionId ? `/faction/${factionId}` : "/faction/";
        const query = new URLSearchParams({
            selections: "basic",
            key,
            comment: "KingshadeScout"
        });

        try {
            dlog("directory request", path);
            const response = await tornGet(`${TORN_API_BASE}${path}?${query}`, gen);
            if (response.status !== 200) return null;

            const payload = JSON.parse(response.responseText || "null");
            if (payload?.error) {
                handleTornError(payload);
                return null;
            }
            if (!payload || !payload.members) return null;
            lastStatusAttemptFailed = false;

            const byName = new Map();
            const byId = new Map();
            const entries = Array.isArray(payload.members)
                ? payload.members.map(member => [member?.id ?? member?.player_id, member])
                : Object.entries(payload.members);

            for (const [rawId, member] of entries) {
                const id = Number(member?.id ?? member?.player_id ?? rawId);
                const name = String(member?.name || member?.player_name || "").trim();
                if (!id || !name) continue;

                const normalized = normalizePlayerName(name);
                if (!normalized) continue;

                byId.set(id, { id, name, status: normalizedStatus(member?.status), lastAction: member?.last_action || null });
                const existing = byName.get(normalized);
                if (!existing) byName.set(normalized, { id, name, status: normalizedStatus(member?.status), lastAction: member?.last_action || null, ambiguous: false });
                else if (existing.id !== id) byName.set(normalized, { id: null, name, ambiguous: true });
            }

            const value = { factionId, byName, byId };
            factionDirectoryCache.set(cacheKey, { expires: Date.now() + FACTION_DIRECTORY_MS, value });
            return value;
        } catch (error) {
            if (isHiddenPageError(error) || isNotMountedError(error)) throw error;
            return null;
        }
    }

    function matchRowByName(row, directory) {
        if (!directory?.byName?.size) return null;
        const candidates = rowNameCandidates(row);

        for (const candidate of candidates) {
            const exact = directory.byName.get(candidate.normalized);
            if (exact && !exact.ambiguous && exact.id) return exact;
        }

        for (const candidate of candidates) {
            if (!candidate.normalized) continue;
            const matches = [];
            for (const [normalized, member] of directory.byName) {
                if (member.ambiguous || !member.id || normalized.length < 4) continue;
                if (candidate.normalized.includes(normalized)) matches.push(member);
            }
            if (matches.length === 1) return matches[0];
        }

        return null;
    }

    // Same row search as before, on the member lists this script may use (never a Ranked War list).
    async function findRows(gen) {
        requireVisiblePage();
        const map = new Map();
        const memberLists = factionMemberLists();
        const candidates = [];

        for (const membersList of memberLists) {
            for (const row of membersList.querySelectorAll(".table-body > .table-row, .enemy, .your")) {
                if (!candidates.includes(row)) candidates.push(row);
            }
        }

        let directIds = 0;
        let nameIds = 0;
        const unresolved = [];

        for (const row of candidates) {
            const direct = extractPlayerIdFromRow(row);
            if (direct.id && !map.has(direct.id)) {
                const anchor = direct.anchor || row.querySelector(".member a[href], a[href]") || row;
                map.set(direct.id, { id: direct.id, row, anchor });
                identityByRow.set(row, { id: direct.id, anchor });
                directIds++;
            } else {
                unresolved.push(row);
            }
        }

        if (unresolved.length) {
            const directory = await fetchFactionDirectory(gen);
            if (directory) {
                for (const row of unresolved) {
                    const member = matchRowByName(row, directory);
                    if (!member?.id || map.has(member.id)) continue;
                    const anchor = row.querySelector(".member a[href], .member, a[href]") || row;
                    map.set(member.id, { id: member.id, row, anchor, resolvedName: member.name });
                    identityByRow.set(row, { id: member.id, anchor, resolvedName: member.name });
                    nameIds++;
                }
            }
        }

        return {
            rows: map,
            memberLists: memberLists.length,
            candidateRows: candidates.length,
            directIds,
            nameIds
        };
    }

    const FF_PALETTE = [
        "#1734e8", "#1788e8", "#17dbe8", "#17e8a1", "#17e84e",
        "#34e817", "#88e817", "#dbe817", "#e8a117", "#e84e17", "#e81734"
    ];

    function hexToRgba(hex, alpha) {
        const clean = String(hex || "").replace("#", "");
        const value = clean.length === 3
            ? clean.split("").map(ch => ch + ch).join("")
            : clean.padEnd(6, "0").slice(0, 6);

        const number = Number.parseInt(value, 16);
        const r = (number >> 16) & 255;
        const g = (number >> 8) & 255;
        const b = number & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // the colour of the text inside the round FF mark. The assignment said dark text on palette index 2-8; the contrast
    // check (>= 4.5:1) showed that index 1 (#1788e8, white 3.67:1) and index 9 (#e84e17, white 3.80:1) need dark text too, so
    // dark text is used on 1-9 and white on 0 and 10 (#e81734: white 4.56:1, dark only 4.33:1).
    const FF_INK_DARK = "#0C0A08";
    const FF_INK_LIGHT = "#FFFFFF";
    const FF_NO_DATA_COLOR = "#666666";

    function ffStyle(ff) {
        const value = Number(ff);
        if (!Number.isFinite(value) || value <= 0) return { color: FF_NO_DATA_COLOR, label: "UNKNOWN", index: -1, ink: FF_INK_LIGHT };

        const clamped = Math.max(1, Math.min(5, value));
        const index = Math.floor(((clamped - 1) / 4) * 10);

        let label;
        if (value <= 1) label = "EXTREMELY EASY";
        else if (value <= 2) label = "EASY";
        else if (value <= 3.5) label = "MODERATE";
        else if (value <= 4.5) label = "DIFFICULT";
        else label = "MAY BE IMPOSSIBLE";

        return {
            color: FF_PALETTE[index] || FF_NO_DATA_COLOR,
            label,
            index,
            ink: index >= 1 && index <= 9 ? FF_INK_DARK : FF_INK_LIGHT
        };
    }

    // the destination codes of the status cell. Keys are exactly those of TRAVEL_TIMES_MINUTES.
    const TRAVEL_CODES = Object.freeze({
        Mexico: "MEX",
        "Cayman Islands": "CAY",
        Canada: "CAN",
        Hawaii: "HAW",
        "United Kingdom": "UK",
        Argentina: "ARG",
        Switzerland: "SWI",
        Japan: "JPN",
        China: "CHN",
        "United Arab Emirates": "UAE",
        "South Africa": "SA"
    });

    // The code of a destination name ("Hawaii" -> "HAW"), or "" when the name is not one of the eleven (no guessing).
    function travelCodeFor(destination) {
        const wanted = normalizeDestination(destination).toLowerCase();
        if (!wanted) return "";
        const key = Object.keys(TRAVEL_CODES).find(name => name.toLowerCase() === wanted);
        return key ? TRAVEL_CODES[key] : "";
    }

    // What the status cell says for a traveller or a player abroad, read from Torn's status description:
    // "Traveling from Torn to Hawaii" -> out/HAW, "Returning to Torn from Hawaii" -> back/HAW, "In Hawaii" -> abroad/HAW.
    // { direction: "out" | "back" | "abroad", code } or null when the description cannot be read safely.
    function travelLabelParts(status, description) {
        const text = normalizeText(description);
        if (!text) return null;
        if (status === "abroad") {
            const match = text.match(/^In (.+)$/i);
            const code = match ? travelCodeFor(match[1]) : "";
            return code ? { direction: "abroad", code } : null;
        }
        if (status === "traveling") {
            const parsed = parseTravelDescription(text);
            const code = travelCodeFor(parsed.destination);
            if (!code || (parsed.direction !== "outbound" && parsed.direction !== "return")) return null;
            return { direction: parsed.direction === "outbound" ? "out" : "back", code };
        }
        return null;
    }

    function positiveNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    function resolveEstimate(data) {
        const source = String(data?.source || "");
        const candidate = source && data?.available_estimates
            ? data.available_estimates[source]
            : null;

        return {
            source: source || "bss",
            fairFight: positiveNumber(candidate?.fair_fight) ?? positiveNumber(data?.fair_fight),
            battleStats: positiveNumber(candidate?.bs_estimate) ?? positiveNumber(data?.bs_estimate),
            battleStatsHuman: normalizeEstimateText(candidate?.bs_estimate_human || data?.bs_estimate_human || ""),
            lastUpdated: positiveNumber(candidate?.last_updated) ?? positiveNumber(data?.last_updated)
        };
    }

    function sourceLabel(source) {
        switch (String(source || "").toLowerCase()) {
            case "spies": return "SPY";
            case "premium": return "PREMIUM";
            case "bss": return "BSS";
            case "manual": return "MANUAL";
            default: return String(source || "FFS").toUpperCase();
        }
    }

    function estimateAge(lastUpdated) {
        const timestamp = positiveNumber(lastUpdated);
        if (!timestamp) return { label: "", old: false };

        const ageSeconds = Math.max(0, Date.now() / 1000 - timestamp);
        const old = ageSeconds > OLD_ESTIMATE_SECONDS;

        if (ageSeconds < 24 * 60 * 60) return { label: "today", old };
        const days = Math.max(1, Math.round(ageSeconds / (24 * 60 * 60)));
        return { label: `${days}d old`, old };
    }


    // ---------------------------------------------------------------------------------------------
    // Rows and timers (the War Tools logic, now part of this script)
    // ---------------------------------------------------------------------------------------------

    // Exact status timers use the same integer second the player sees in Torn's
    // visible TCT clock. Device diagnostics verified that getCurrentTimestamp()
    // leads that visible clock by 500 ms in Torn PDA and must not be used as the
    // phase source for DIBS/hit timing.
    function tctDisplayedSecond() {
        const clock = document.querySelector(".tc-clock-tooltip");
        const text = normalizeText(clock?.textContent || "");
        const match = text.match(/(?:^|\s)(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2,4})(?:\s|$)/);
        if (match) {
            const [, hh, mm, ss, dd, mo, yyRaw] = match;
            const yy = Number(yyRaw);
            const year = yy < 100 ? 2000 + yy : yy;
            const epoch = Date.UTC(year, Number(mo) - 1, Number(dd), Number(hh), Number(mm), Number(ss)) / 1000;
            if (Number.isFinite(epoch)) return epoch;
        }

        // Fail-safe only. The diagnostic device tracked the visible TCT
        // change with Date.now() within about 59 ms.
        return Math.floor(Date.now() / 1000);
    }

    function timerNow(kind) {
        return kind === "exact" ? tctDisplayedSecond() : Math.floor(Date.now() / 1000);
    }

    function infoNow(info) {
        return timerNow(info?.timerKind);
    }

    function disconnectTctClockObserver() {
        tctClockObserver?.disconnect();
        tctClockObserver = null;
        tctClockNode = null;
        lastTctSecond = null;
    }

    function applyFilterVisibility() {
        for (const info of lastInfos) {
            if (matchesFilter(info)) info.row.style.removeProperty("display");
            else info.row.style.setProperty("display", "none", "important");
        }
    }

    function updateExactTimersAt(now) {
        if (destroyed || !mounted || !isPageVisible() || !Number.isFinite(now)) return;

        let expired = false;
        document.querySelectorAll('.kss-timer[data-until][data-kind="exact"]').forEach(timer => {
            const until = Number(timer.dataset.until);
            const remaining = until - now;

            if (!Number.isFinite(until) || remaining <= 0) {
                timer.remove();
                expired = true;
                return;
            }

            const nextText = formatCountdown(remaining);
            if (timer.textContent !== nextText) timer.textContent = nextText;
            refreshTimerTone(timer, remaining);
        });

        if (settings.filter === "soon") applyFilterVisibility();

        if (expired) {
            refreshStatusCore(true);
            scheduleApply(100);
        }
    }

    function connectTctClockObserver() {
        if (destroyed || !mounted || !isPageVisible()) return false;
        const clock = document.querySelector(".tc-clock-tooltip");
        if (!clock) {
            disconnectTctClockObserver();
            return false;
        }

        if (tctClockObserver && tctClockNode === clock) return true;

        disconnectTctClockObserver();
        tctClockNode = clock;
        lastTctSecond = tctDisplayedSecond();
        tctClockObserver = new MutationObserver(() => {
            if (destroyed || !isPageVisible()) return;
            const now = tctDisplayedSecond();
            if (!Number.isFinite(now) || now === lastTctSecond) return;
            lastTctSecond = now;
            // Direct DOM write in the clock mutation microtask: no 100 ms poll
            // wait and no requestAnimationFrame phase delay.
            updateExactTimersAt(now);
        });
        tctClockObserver.observe(clock, {
            childList: true,
            characterData: true,
            subtree: true
        });
        return true;
    }

    function playerIdFromHref(rawHref) {
        const href = String(rawHref || "").replaceAll("&amp;", "&");
        if (!href) return null;

        try {
            const url = new URL(href, location.origin);
            for (const key of ["XID", "user2ID", "userId"]) {
                const value = url.searchParams.get(key);
                if (/^\d+$/.test(value || "")) return Number(value);
            }
        } catch {}

        const match = href.match(/[?&](?:XID|user2ID|userId)=(\d+)/i);
        return match ? Number(match[1]) : null;
    }

    function plainText(value) {
        const raw = String(value || "");
        if (!raw) return "";
        if (!/[<&]/.test(raw)) return normalizeText(raw);

        try {
            const template = document.createElement("template");
            template.innerHTML = raw;
            return normalizeText(template.content.textContent || "");
        } catch {
            return normalizeText(raw.replace(/<[^>]*>/g, " "));
        }
    }

    function profileLinkFromStatusHtml(value) {
        const raw = String(value || "");
        if (!raw) return null;

        const candidates = [raw];
        try {
            const decoder = document.createElement("textarea");
            decoder.innerHTML = raw;
            const decoded = decoder.value;
            if (decoded && decoded !== raw) candidates.push(decoded);
        } catch {}

        for (const candidate of candidates) {
            if (!/<a\b/i.test(candidate)) continue;

            try {
                const template = document.createElement("template");
                template.innerHTML = candidate;

                for (const anchor of template.content.querySelectorAll("a[href]")) {
                    const id = playerIdFromHref(anchor.getAttribute("href") || "");
                    const name = normalizeText(anchor.textContent);
                    if (!id || !name) continue;
                    return {
                        id,
                        name,
                        href: `/profiles.php?XID=${id}`
                    };
                }
            } catch {}
        }

        return null;
    }

    function rowsInList(list) {
        const body = list.querySelector(".table-body");
        if (!body) return [];
        return Array.from(body.children).filter(row =>
            row instanceof HTMLElement &&
            (row.matches(".table-row") || row.matches(".enemy") || row.matches(".your"))
        );
    }

    // The identity of a row: set by the last scan, or read straight off the row.
    function rowIdentity(row) {
        const known = identityByRow.get(row);
        if (known?.id) return known;
        const direct = extractPlayerIdFromRow(row);
        if (direct.id) {
            const identity = { id: direct.id, anchor: direct.anchor || row.querySelector(".member a[href], a[href]") || row };
            identityByRow.set(row, identity);
            return identity;
        }
        return null;
    }

    function sharedMember(playerId, source) {
        if (!playerId || !source?.members) return null;
        return source.members[playerId] || source.members[String(playerId)] || null;
    }

    function getStatusElement(row) {
        const direct = row.querySelector(".table-cell.status");
        if (direct) return direct;

        const candidates = Array.from(row.querySelectorAll("*")).filter(element => {
            if (element.closest("[data-kss]")) return false;
            const text = normalizeText(element.textContent);
            return /^(?:okay|hospital|jail|federal|traveling|travelling|abroad|fallen)$/i.test(text);
        });

        return candidates.sort((a, b) => a.children.length - b.children.length)[0] || null;
    }

    function normalizeStatusState(value) {
        const raw = normalizeText(value).toLowerCase();
        if (raw === "travelling") return "traveling";
        if (["okay", "hospital", "jail", "federal", "traveling", "abroad", "fallen"].includes(raw)) return raw;
        return "unknown";
    }

    function statusFromRow(row) {
        const element = getStatusElement(row);
        const raw = normalizeText(element?.textContent || row.textContent).toLowerCase();
        if (/\btravelling\b/.test(raw)) return "traveling";
        for (const status of ["okay", "hospital", "jail", "federal", "traveling", "abroad", "fallen"]) {
            if (new RegExp(`\\b${status}\\b`, "i").test(raw)) return status;
        }
        return "unknown";
    }

    function parseAbsoluteTimestamp(value) {
        if (value === null || value === undefined || value === "") return null;
        const text = String(value).trim();
        if (!text) return null;
        if (/^\d{10,13}$/.test(text)) {
            const number = Number(text);
            return text.length >= 13 ? Math.floor(number / 1000) : number;
        }
        const parsed = Date.parse(text);
        return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
    }

    function domStatusUntil(row) {
        const statusElement = getStatusElement(row);
        const candidates = [
            statusElement?.dataset?.until,
            statusElement?.dataset?.timestamp,
            statusElement?.getAttribute?.("data-until"),
            statusElement?.getAttribute?.("data-timestamp"),
            row.dataset?.until,
            row.dataset?.timestamp,
            row.dataset?.statusUntil,
            row.getAttribute("data-until"),
            row.getAttribute("data-status-until")
        ];

        const timeElement = statusElement?.querySelector?.("time") || row.querySelector("time");
        if (timeElement) {
            candidates.push(
                timeElement.getAttribute("datetime"),
                timeElement.getAttribute("data-until"),
                timeElement.getAttribute("data-timestamp")
            );
        }

        const now = tctDisplayedSecond();
        for (const candidate of candidates) {
            const timestamp = parseAbsoluteTimestamp(candidate);
            if (timestamp && timestamp >= now - 5) return timestamp;
        }
        return null;
    }

    function resolveStatus(playerId, row, source) {
        const member = sharedMember(playerId, source);
        const apiStatus = member?.status || null;
        const apiState = normalizeStatusState(apiStatus?.state);
        const status = apiState !== "unknown" ? apiState : statusFromRow(row);
        const now = tctDisplayedSecond();
        const exactUntil = positiveNumber(apiStatus?.until) ?? domStatusUntil(row);
        const travelEta = status === "traveling" ? positiveNumber(member?.travel?.eta) : null;
        const until = exactUntil && exactUntil > now ? exactUntil : travelEta && travelEta > now ? travelEta : null;
        const timerKind = exactUntil && exactUntil > now
            ? "exact"
            : travelEta && travelEta > now
                ? "estimate"
                : status === "traveling"
                    ? "estimate-unavailable"
                    : null;

        const rawDescription = String(apiStatus?.description || "");
        const rawDetails = String(apiStatus?.details || "");
        const linkedPlayer =
            profileLinkFromStatusHtml(rawDetails) ??
            profileLinkFromStatusHtml(rawDescription);

        return {
            status,
            until,
            timerKind,
            description: plainText(rawDescription),
            details: plainText(rawDetails),
            linkedPlayer,
            travel: member?.travel || null,
            level: positiveNumber(member?.level),
            hasStatusData: Boolean(member)
        };
    }

    function formatCompactDuration(totalSeconds) {
        const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.max(0, Math.round((seconds % 3600) / 60));
        if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
        return `${minutes}m`;
    }

    function formatCountdown(totalSeconds) {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
        return `${minutes}m ${String(secs).padStart(2, "0")}s`;
    }

    function formatTctClock(timestamp) {
        const value = positiveNumber(timestamp);
        if (!value) return "";
        const date = new Date(value * 1000);
        const hours = String(date.getUTCHours()).padStart(2, "0");
        const minutes = String(date.getUTCMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    // The FF / estimate side of a row: manual value first, then what FFScouter returned.
    function resolveCoreValues(playerId) {
        const entry = playerId ? ffData.get(playerId) : null;
        const data = entry?.value || null;
        const manual = playerId ? getManual(playerId) : null;
        const resolved = resolveEstimate(data);
        const manualFF = positiveNumber(manual?.ff);
        const ff = manualFF ?? resolved.fairFight;
        const battleStats = positiveNumber(manual?.battleStats) ?? resolved.battleStats;
        const estimateText = normalizeText(resolved.battleStatsHuman || "");

        return {
            ff,
            battleStats,
            estimateText,
            hasCoreData: Boolean(data || manual),
            hasManualFF: Boolean(manualFF),
            data,
            manual,
            resolved
        };
    }

    function rowInfo(row, originalIndex = 0, source = null) {
        const identity = rowIdentity(row);
        const playerId = identity?.id ?? null;
        const core = resolveCoreValues(playerId);
        const status = resolveStatus(playerId, row, source);
        return { row, identity, playerId, originalIndex, ...core, ...status };
    }

    function ensureOriginalOrder(body, rows) {
        let map = originalOrder.get(body);
        if (!map) {
            map = new Map();
            originalOrder.set(body, map);
        }
        for (const row of rows) {
            if (!map.has(row)) map.set(row, map.size);
        }
        return map;
    }

    // Original sorting: Torn owns the order, so "the original order" is the order the rows have right now.
    // Read again from the page on every redraw; no row is moved.
    function rememberCurrentOrder(body, rows) {
        const map = new Map();
        rows.forEach((row, index) => map.set(row, index));
        originalOrder.set(body, map);
        return map;
    }

    // Coming back to Original from FF / Status / Soonest: the rows first go back to the order Torn last had
    // (the one remembered while Original was chosen); rows that came in meanwhile go last.
    function restoreOriginalOrder(body, rows) {
        const map = originalOrder.get(body);
        if (map) {
            const rank = row => (map.has(row) ? map.get(row) : map.size + rows.indexOf(row));
            reorderBody(body, [...rows].sort((a, b) => rank(a) - rank(b)));
        }
        reorderedBodies.delete(body);
    }

    // Sorting (with a direction). Only the main key is turned round when the direction is "desc" (the FF value, the
    // status rank, the time). A row WITHOUT a value (no FF, no time, unknown status) is always last, in both directions, and
    // equal values keep Torn's order (originalIndex, rising) in both directions. Soonest is the exception to the first rule: it has
    // three groups (hospital, other countdowns, none) that stay in that order in both directions.
    const STATUS_RANK = { okay: 0, hospital: 1, jail: 2, traveling: 3, abroad: 4, federal: 5, fallen: 6 };

    function compareRows(a, b) {
        const dir = settings.sortDir === "desc" ? -1 : 1;
        const byValue = (x, y) => {
            const hasX = x !== null && x !== undefined;
            const hasY = y !== null && y !== undefined;
            if (hasX && hasY) return dir * (x - y);
            if (hasX) return -1;
            if (hasY) return 1;
            return 0;
        };
        switch (settings.sort) {
            case "ff":
                return byValue(a.ff, b.ff) || a.originalIndex - b.originalIndex;
            case "status":
                return byValue(STATUS_RANK[a.status], STATUS_RANK[b.status]) ||
                    byValue(a.until, b.until) ||
                    a.originalIndex - b.originalIndex;
            case "soon": {
                // Three groups that the direction never turns round: hospital with a running countdown, other running
                // countdowns, no countdown. Only the time inside the first two groups follows the direction.
                const groupOf = info => {
                    const running = Boolean(info.until && info.until > infoNow(info));
                    return running ? (info.status === "hospital" ? 1 : 2) : 3;
                };
                const groupA = groupOf(a);
                const groupB = groupOf(b);
                if (groupA !== groupB) return groupA - groupB;
                if (groupA === 3) return a.originalIndex - b.originalIndex;
                return dir * (a.until - b.until) || a.originalIndex - b.originalIndex;
            }
            default:
                return a.originalIndex - b.originalIndex;
        }
    }

    function isTravelStatus(status) {
        return status === "traveling" || status === "abroad";
    }

    function matchesFilter(info) {
        const now = infoNow(info);
        const soonLimit = Number(settings.soonMinutes) * 60;
        switch (settings.filter) {
            case "ready":
                return info.status === "okay";
            case "easy":
                return Boolean(info.status === "okay" && info.ff && info.ff <= Number(settings.maxFF));
            case "soon":
                return Boolean(info.until && info.until > now && info.until - now <= soonLimit);
            case "hospital":
                return info.status === "hospital";
            case "travel":
                return isTravelStatus(info.status);
            case "unknown":
                return !info.ff && !info.battleStats && !info.estimateText;
            default:
                return true;
        }
    }

    function removeTimer(row) {
        row.querySelectorAll(".kss-timer").forEach(element => element.remove());
        row.querySelectorAll(".kss-status-host").forEach(element => {
            element.classList.remove("kss-status-host", "kss-compact");
            delete element.dataset.kssLabel;
            delete element.dataset.kssTone;
            delete element.dataset.kssState;
        });
    }

    // The explanation lines for a countdown. The same facts War Tools gave in its info box.
    function timerDetailParts(info) {
        if (info.timerKind === "estimate-unavailable") {
            const reason = String(info.travel?.unavailableReason || "");
            const reasonText = reason === "destination-not-exposed"
                ? "Torn did not expose the destination"
                : reason === "route-time-unavailable"
                    ? "No verified route time is available"
                    : reason === "estimate-expired-while-still-traveling"
                        ? "The previous estimate expired while Torn still reports Traveling"
                        : "KS Scout could not establish a trustworthy departure estimate";
            return [
                info.description || "Traveling",
                "ETA unavailable",
                reasonText,
                "Torn exposes no exact arrival timestamp"
            ].filter(Boolean);
        }
        if (info.timerKind === "exact") {
            return [info.description, info.details, "Exact Torn status end time"].filter(Boolean);
        }
        if (info.timerKind === "estimate") {
            if (info.travel?.estimateSource === "ffscouter-flight") {
                const eta = positiveNumber(info.travel?.eta);
                const landingEta = positiveNumber(info.travel?.landingEta) ?? eta;
                const low = positiveNumber(info.travel?.etaLow);
                const high = positiveNumber(info.travel?.etaHigh);
                const method = normalizeText(info.travel?.travelMethod);
                const book = info.travel?.bookLikelyBeingUsed;
                const landing = landingEta ? `landing ~${formatTctClock(landingEta)} TCT` : "";
                const flightWindow = low && high
                    ? `window ${formatTctClock(low)}–${formatTctClock(high)} TCT`
                    : "";
                const methodText = method ? `method ${method}` : "";
                const bookText = book === true
                    ? "Book likely active"
                    : book === false
                        ? "Book likely not active"
                        : "";
                return [
                    info.description,
                    "FFScouter flight estimate",
                    landing,
                    flightWindow,
                    methodText,
                    bookText,
                    "Estimated from public game data; not an exact Torn arrival timestamp"
                ].filter(Boolean);
            }

            const source = info.travel?.estimateSource === "observed-history"
                ? `Route time learned from ${Number(info.travel?.historyCount) || 1} observed flight(s)`
                : "Published route time";
            const departure = info.travel?.departureSource === "last-action-fallback"
                ? "departure inferred from last action"
                : "departure observed by KS Scout";
            const confidence = String(info.travel?.confidence || "low");
            const uncertainty = positiveNumber(info.travel?.uncertaintySeconds);
            const range = uncertainty
                ? `likely remaining range ${formatCompactDuration(Math.max(0, (info.until || 0) - Math.floor(Date.now() / 1000) - uncertainty))}–${formatCompactDuration(Math.max(0, (info.until || 0) - Math.floor(Date.now() / 1000) + uncertainty))}`
                : "";
            // The calibration is used only when the departure was inferred from the last action.
            const calibration = info.travel?.departureSource !== "last-action-fallback"
                ? ""
                : Number(info.travel?.actionOffsetSamples) > 0
                    ? `calibrated from ${Number(info.travel.actionOffsetSamples)} completed flight(s)`
                    : "not calibrated yet";
            return [
                info.description,
                source,
                departure,
                `${confidence} confidence`,
                range,
                calibration,
                "Torn exposes no exact arrival timestamp"
            ].filter(Boolean);
        }
        return [];
    }

    // The short word in the status cell. A traveller says where to ("→ HAW" out from Torn, "← HAW" home to Torn) and a
    // player abroad "IN HAW"; when the destination cannot be read safely it stays "TRAVEL" (fail-closed, no guessing).
    function compactStatusLabel(info) {
        const status = info.status;
        const labels = {
            hospital: "HOSP",
            jail: "JAIL",
            federal: "FED",
            traveling: "TRAVEL",
            fallen: "FALLEN"
        };
        if (status === "traveling" || status === "abroad") {
            const parts = travelLabelParts(status, info.description);
            if (parts) return parts.direction === "abroad" ? `IN ${parts.code}` : `${parts.direction === "back" ? "\u2190" : "\u2192"} ${parts.code}`;
        }
        return labels[status] || String(status || "").toUpperCase();
    }

    // The colour family of the KS label and countdown in the status cell (the colours are tokens in the style sheet).
    // A hospital stay turns amber when less than HOSPITAL_SOON_SECONDS are left. Checked at every second tick.
    function statusTone(status, remaining) {
        switch (status) {
            case "hospital":
                return Number.isFinite(remaining) && remaining < HOSPITAL_SOON_SECONDS ? "hosp-soon" : "hosp";
            case "traveling":
            case "abroad":
                return "travel";
            case "jail":
                return "jail";
            default:
                return "grey";
        }
    }

    function refreshTimerTone(timer, remaining) {
        const host = timer.parentElement;
        if (!host || host.dataset.kssState !== "hospital") return;
        const tone = statusTone("hospital", remaining);
        if (host.dataset.kssTone !== tone) host.dataset.kssTone = tone;
    }

    // A player abroad: the compact label "IN HAW" and no countdown. Torn's own "Abroad" text is hidden by the same rule
    // as the other compact labels. When the place cannot be read from the status description, or the cell has no text element of
    // its own to hide, nothing is drawn and Torn's text stays.
    function renderAbroadLabel(info, statusElement) {
        const row = info.row;
        const parts = travelLabelParts("abroad", info.description);
        if (!parts || !statusElement.querySelector(".ellipsis")) {
            removeTimer(row);
            return;
        }
        row.querySelectorAll(".kss-timer").forEach(element => element.remove());
        statusElement.classList.add("kss-status-host", "kss-compact");
        statusElement.dataset.kssLabel = compactStatusLabel(info);
        statusElement.dataset.kssState = "abroad";
        statusElement.dataset.kssTone = statusTone("abroad", null);
    }

    // Countdown in the status cell: exact from Torn's status.until, "~" before an estimate, "~?" when unknown.
    function renderTimer(info) {
        const row = info.row;
        if (info.status === "okay") {
            removeTimer(row);
            return;
        }

        const statusElement = getStatusElement(row);
        if (!statusElement) {
            removeTimer(row);
            return;
        }
        if (info.status === "abroad") {
            renderAbroadLabel(info, statusElement);
            return;
        }

        const isUnavailableTravel = info.timerKind === "estimate-unavailable";
        const remaining = info.until
            ? info.until - infoNow(info)
            : null;
        if (!isUnavailableTravel && (!info.until || remaining <= 0)) {
            removeTimer(row);
            return;
        }

        statusElement.classList.add("kss-status-host");
        const statusText = statusElement.querySelector(".ellipsis");
        if (statusText) {
            statusElement.classList.add("kss-compact");
            statusElement.dataset.kssLabel = compactStatusLabel(info);
        }
        statusElement.dataset.kssState = info.status;
        statusElement.dataset.kssTone = statusTone(info.status, remaining);

        let timer = Array.from(statusElement.children).find(child => child.classList?.contains("kss-timer")) || null;
        row.querySelectorAll(".kss-timer").forEach(element => { if (element !== timer) element.remove(); });
        if (!timer) {
            timer = document.createElement("span");
            timer.setAttribute("data-kss", "1");
            timer.setAttribute("role", "button");
            timer.tabIndex = 0;
            statusElement.appendChild(timer);
        }

        timer.className = `kss-timer ${
            info.timerKind === "estimate"
                ? "estimated"
                : isUnavailableTravel
                    ? "unavailable"
                    : "exact"
        }`;
        if (info.until) timer.dataset.until = String(info.until);
        else delete timer.dataset.until;
        timer.dataset.kind = String(info.timerKind || "");
        const detail = timerDetailParts(info).join(" · ");
        timer.dataset.info = detail;
        timer.setAttribute("aria-label", detail || "Countdown");
        // The whole status description ("Traveling from Torn to Hawaii") is the tooltip of the countdown.
        if (info.description) timer.title = info.description;
        else timer.removeAttribute("title");
        const text = isUnavailableTravel
            ? "~?"
            : `${info.timerKind === "estimate" ? "~" : ""}${formatCountdown(remaining)}`;
        if (timer.textContent !== text) timer.textContent = text;
    }

    function reorderBody(body, sortedRows) {
        const current = Array.from(body.children).filter(node => sortedRows.includes(node));
        const same = current.length === sortedRows.length && current.every((row, index) => row === sortedRows[index]);
        if (same) return;

        reorderedBodies.add(body);
        for (const row of sortedRows) row.dataset.kssMutating = "1";
        const fragment = document.createDocumentFragment();
        for (const row of sortedRows) fragment.appendChild(row);
        body.appendChild(fragment);
        setTimeout(() => {
            for (const row of sortedRows) {
                if (row.dataset.kssMutating === "1") delete row.dataset.kssMutating;
            }
        }, 0);
    }

    // Torn's own element that carries the status text, when it is an element of its own inside the cell (the
    // ".ellipsis" of the status cell, or the element a text search found). The whole cell is never returned: when the
    // text sits directly in the cell, Torn's text is left alone and only the KS countdown gets the dark background.
    function statusTextElement(statusElement) {
        if (!statusElement) return null;
        if (!statusElement.matches(".table-cell,.table-row,.enemy,.your")) return statusElement;
        return statusElement.querySelector(".ellipsis:not([data-kss])");
    }

    // Marks the element that carries Torn's status text on a tinted row (the style sheet gives it the dark background).
    function renderStatusBackdrop(row) {
        const target = row.classList.contains("kss-tinted") ? statusTextElement(getStatusElement(row)) : null;
        row.querySelectorAll(".kss-statustext").forEach(element => { if (element !== target) element.classList.remove("kss-statustext"); });
        if (target) target.classList.add("kss-statustext");
    }

    // Takes back everything the name area got: the host classes of the mark (measured-row layout: the name box, the honor slot, the hidden faction
    // slot) and, with "Show names as text", the hidden honor bar / faction icon, the text name, the stats line under it and the
    // classes on the link. The leftovers of the older placement in the level cell (kss-levelhost, the line break) are cleared too,
    // should an older instance have left any.
    function releaseNameArea(row) {
        row.classList.remove("kss-astext");
        for (const name of ["kss-namehost", "kss-namecell", "kss-uib", "kss-honorwrap", "kss-factwrap", "kss-namelink", "kss-nametext", "kss-namewrap", "kss-facticon", "kss-levelhost"]) {
            row.querySelectorAll(`.${name}`).forEach(element => element.classList.remove(name));
        }
        row.querySelectorAll(".kss-tname,.kss-levelbr,.kss-stline").forEach(element => element.remove());
    }

    function clearRowVisuals(row) {
        row.removeAttribute("data-kss-row");
        row.classList.remove("kss-tinted");
        row.style.removeProperty("--kss-tint");
        row.style.removeProperty("--kss-tint0");
        row.style.removeProperty("display");
        row.querySelectorAll(".kss-fftag").forEach(element => element.remove());
        row.querySelectorAll(".kss-statustext").forEach(element => element.classList.remove("kss-statustext"));
        releaseNameArea(row);
        removeTimer(row);
    }

    // Takes away everything this script drew or changed in member rows. Works from the rows it touched, so it
    // never searches the page.
    function clearRendered() {
        for (const body of touchedBodies) {
            // Rows this script never moved are left where Torn put them.
            if (!reorderedBodies.has(body)) continue;
            const original = originalOrder.get(body);
            if (!original) continue;
            const rows = Array.from(body.children).filter(row =>
                row instanceof HTMLElement && original.has(row)
            );
            rows.sort((a, b) => (original.get(a) ?? 0) - (original.get(b) ?? 0));
            reorderBody(body, rows);
        }
        reorderedBodies.clear();
        for (const row of touchedRows) clearRowVisuals(row);
        touchedRows.clear();
        touchedBodies.clear();
        manageClock(false);
        lastInfos = [];
    }

    function manageClock(needed) {
        if (needed) {
            connectTctClockObserver();
            if (!clockTimer) {
                // Fallback/reconnect path only. Exact timer phase is driven by
                // the TCT MutationObserver above; this interval cannot advance
                // an exact timer before the visible TCT second changes.
                clockTimer = setInterval(() => {
                    if (destroyed || !isPageVisible()) return;
                    connectTctClockObserver();
                    tickTimers();
                }, 250);
            }
        } else {
            disconnectTctClockObserver();
            if (clockTimer) {
                clearInterval(clockTimer);
                clockTimer = null;
            }
            if (tickRaf) cancelAnimationFrame(tickRaf);
            tickRaf = null;
        }
    }

    function tickTimers() {
        if (destroyed) return;
        if (tickRaf) return;

        tickRaf = requestAnimationFrame(() => {
            tickRaf = null;
            if (destroyed || !mounted) return;

            let expired = false;

            document.querySelectorAll(".kss-timer[data-until]").forEach(timer => {
                const until = Number(timer.dataset.until);
                const kind = String(timer.dataset.kind || "");
                const remaining = until - timerNow(kind);

                if (!Number.isFinite(until) || remaining <= 0) {
                    timer.remove();
                    expired = true;
                    return;
                }

                const nextText =
                    `${kind === "estimate" ? "~" : ""}${formatCountdown(remaining)}`;
                if (timer.textContent !== nextText) timer.textContent = nextText;
                refreshTimerTone(timer, remaining);
            });

            if (settings.filter === "soon") applyFilterVisibility();

            if (expired) {
                refreshStatusCore(true);
                scheduleApply(100);
            }
        });
    }


    // ---------------------------------------------------------------------------------------------
    // Drawing: FF mark and row tint, then sort, filter, countdowns and the panel
    // ---------------------------------------------------------------------------------------------

    let applyTimer = null;
    let nameTextLogged = "";
    let scanSerial = 0;
    let scanWaiters = [];
    // The last name found for a name link. Kept so that the name stays known while this script's own text name is in the link.
    const nameByAnchor = new WeakMap();

    // The name area of a row. measured-row layout: Torn's name cell holds one flex box (class "userInfoBox", hash suffix: always matched with
    // [class*=...] and by structure) whose direct children are the status dot, the faction slot (factionWrap) and the honor slot
    // (honorWrap, the child that holds the name link). The FF mark goes into the flow of that box as its own child, directly in front
    // of the honor slot, and the faction slot is hidden. Without such a box (not seen on a real page) the earlier place is used: the
    // parent of the name link, in front of the link. Without a link of its own the first cell with the class "member" is used.
    // Returns null when the row has no usable place (then no mark is drawn).
    function nameAreaFor(row, identity) {
        const link = identity?.anchor;
        if (link && link !== row && link.parentElement && row.contains(link)) {
            const box = link.closest('[class*="userInfoBox"]');
            if (box && box !== row && row.contains(box) && box !== link) {
                let honor = link;
                while (honor.parentElement && honor.parentElement !== box) honor = honor.parentElement;
                if (honor.parentElement === box) {
                    let cell = box;
                    while (cell.parentElement && cell.parentElement !== row) cell = cell.parentElement;
                    const icons = factionIconElements(row, link);
                    const factionSlots = Array.from(box.children).filter(child =>
                        child !== honor && !child.hasAttribute("data-kss") &&
                        (String(child.getAttribute("class") || "").includes("factionWrap") || icons.some(icon => child.contains(icon)))
                    );
                    return { box, honor, factionSlots, host: box, link, cell: cell.parentElement === row ? cell : null };
                }
            }
            const host = link.parentElement;
            let cell = host;
            while (cell.parentElement && cell.parentElement !== row) cell = cell.parentElement;
            return { host, link, cell: cell.parentElement === row ? cell : null };
        }
        const cell = row.querySelector(".member");
        return cell ? { host: cell, link: null, cell } : null;
    }

    // What the mark on a row says. The values are those of the earlier version: manual FF first, then FFScouter's FF, then an
    // estimate alone, then nothing. The mark is a round FF circle (FF with ONE decimal, "20+" above FF_BADGE_CAP, "?" without FF);
    // measured-row layout: the estimate ("1.24M") is no mark of its own any more but a small line under the name (see renderRowName). Row colour: one layer, strongest in the middle of the
    // row: --kss-tint is the colour at the middle (alpha 0.28 for the FF colours, 0.18 for the neutral one), --kss-tint0 the same
    // colour at alpha 0.
    function badgeModel(info) {
        const manual = info.manual;
        const resolved = info.resolved;
        const manualFF = positiveNumber(manual?.ff);
        const activeFF = manualFF ?? resolved.fairFight;
        const hasManualFF = Boolean(manualFF);

        const apiEstimateHuman =
            resolved.battleStatsHuman ||
            (resolved.battleStats ? formatCompact(resolved.battleStats) : "");
        const manualEstimateHuman = manual?.battleStats ? formatCompact(manual.battleStats) : "";
        const fallbackEstimate =
            manualEstimateHuman ||
            apiEstimateHuman ||
            "";

        if (activeFF) {
            const style = ffStyle(activeFF);
            const age = estimateAge(hasManualFF ? null : resolved.lastUpdated);
            // Above FF_BADGE_CAP the circle says "20+" (the exact value stays in the card, the title and in sorting/filter/colour).
            const shown = activeFF > FF_BADGE_CAP ? `${FF_BADGE_CAP}+` : activeFF.toFixed(1);
            return {
                kind: "ff",
                circle: shown,
                stats: fallbackEstimate,
                edge: style.color,
                ink: style.ink,
                manual: hasManualFF,
                old: !hasManualFF && age.old,
                tint: hexToRgba(style.color, 0.28),
                tint0: hexToRgba(style.color, 0),
                title: [
                    `${hasManualFF ? "Manual" : "FF Scouter"} FF ${activeFF.toFixed(2)}`,
                    hasManualFF ? "MANUAL" : sourceLabel(resolved.source),
                    age.label,
                    fallbackEstimate ? `Estimated stats ${fallbackEstimate}` : "",
                    manual?.note || ""
                ].filter(Boolean).join(" · ")
            };
        }

        if (fallbackEstimate) {
            // A real estimate is useful, but it is not a Fair Fight score.
            // Keep the row neutral so it cannot be mistaken for the FF color scale.
            return {
                kind: "est",
                circle: "?",
                stats: fallbackEstimate,
                edge: FF_NO_DATA_COLOR,
                ink: FF_INK_LIGHT,
                manual: false,
                old: false,
                tint: hexToRgba("#7C7772", 0.18),
                tint0: hexToRgba("#7C7772", 0),
                title: [
                    `Estimated stats ${fallbackEstimate}`,
                    manualEstimateHuman ? "MANUAL" : apiEstimateHuman ? sourceLabel(resolved.source) : "",
                    manual?.note || ""
                ].filter(Boolean).join(" · ")
            };
        }

        if (!settings.showUnknown) return null;
        return {
            kind: "none",
            circle: "?",
            stats: "",
            edge: FF_NO_DATA_COLOR,
            ink: FF_INK_LIGHT,
            manual: false,
            old: false,
            tint: "",
            tint0: "",
            title: manual?.note || "No FF score or estimated stats"
        };
    }

    function removeRowFf(row) {
        row.querySelectorAll(".kss-fftag").forEach(element => element.remove());
        for (const name of ["kss-namehost", "kss-namecell", "kss-uib", "kss-honorwrap", "kss-factwrap"]) {
            row.querySelectorAll(`.${name}`).forEach(element => element.classList.remove(name));
        }
        row.classList.remove("kss-tinted");
        row.style.removeProperty("--kss-tint");
        row.style.removeProperty("--kss-tint0");
    }

    function renderRowFf(info) {
        const row = info.row;
        if (!info.playerId || !info.identity) return;
        const model = info.hasCoreData ? badgeModel(info) : null;
        const area = model ? nameAreaFor(row, info.identity) : null;
        info.model = area ? model : null;
        if (!model || !area) {
            removeRowFf(row);
            return;
        }
        row.setAttribute("data-kss-row", "1");

        let badge = row.querySelector(`.kss-fftag[data-player-id="${info.playerId}"]`);
        row.querySelectorAll(".kss-fftag").forEach(element => { if (element !== badge) element.remove(); });
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "kss-fftag";
            badge.setAttribute("data-kss", "1");
            badge.setAttribute("role", "button");
            badge.tabIndex = 0;
            badge.dataset.playerId = String(info.playerId);
        }
        // In the flow, in front of the honor slot (measured-row layout) or of the name link (reserve place); never absolute, nothing in the level cell.
        const before = area.honor || area.link || (area.host.firstChild !== badge ? area.host.firstChild : null);
        if (badge.parentNode !== area.host || (before && badge.nextSibling !== before)) area.host.insertBefore(badge, before);
        if (area.box) {
            // measured-row layout: the faction slot is hidden in both modes; the box and the honor slot get the classes of the new layout.
            area.box.classList.add("kss-uib");
            area.honor.classList.add("kss-honorwrap");
            const slots = new Set(area.factionSlots);
            row.querySelectorAll(".kss-factwrap").forEach(element => { if (!slots.has(element)) element.classList.remove("kss-factwrap"); });
            slots.forEach(element => element.classList.add("kss-factwrap"));
        } else {
            logPlacement("name area: no userInfoBox around the name link, the earlier place (in front of the link) is used");
        }
        if (area.host !== row) area.host.classList.add("kss-namehost");
        if (area.cell) area.cell.classList.add("kss-namecell");

        // The circle is the whole mark. A leftover stats mark of an earlier version (an older instance) makes the mark be built again.
        const signature = [model.kind, model.circle].join("|");
        if (badge.dataset.sig !== signature || badge.children.length !== 1) {
            badge.dataset.sig = signature;
            badge.textContent = "";
            const circle = document.createElement("span");
            circle.className = "kss-ffc";
            circle.setAttribute("data-kss", "1");
            circle.textContent = model.circle;
            badge.appendChild(circle);
        }
        delete badge.dataset.stats;
        badge.title = model.title;
        badge.setAttribute("aria-label", model.title || model.circle);
        badge.style.setProperty("--kss-edge", model.edge);
        badge.style.setProperty("--kss-ink", model.ink);
        if (model.manual) {
            badge.dataset.manual = "1";
            badge.style.setProperty("--kss-ring", "#FFFFFF");
        } else {
            delete badge.dataset.manual;
            badge.style.removeProperty("--kss-ring");
        }
        if (model.old) badge.dataset.old = "1";
        else delete badge.dataset.old;

        if (settings.colorRows && model.tint) {
            row.classList.add("kss-tinted");
            row.style.setProperty("--kss-tint", model.tint);
            row.style.setProperty("--kss-tint0", model.tint0);
        } else {
            row.classList.remove("kss-tinted");
            row.style.removeProperty("--kss-tint");
            row.style.removeProperty("--kss-tint0");
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Names as text: the honor bar and the faction icon of a row are hidden with CSS (a class on the row, nothing is removed
    // from the page) and the name is shown as plain text inside Torn's own name link, so a tap on it still opens the profile.
    // ---------------------------------------------------------------------------------------------

    function cleanNameText(value) {
        return normalizeText(value)
            .replace(/^view\s+/i, "")
            .replace(/[’']s\s+(?:profile|honor bar).*$/i, "")
            .replace(/\s+(?:profile|honor bar)$/i, "")
            .trim();
    }

    function isMediaElement(element) {
        return /^(?:IMG|SVG|PICTURE|CANVAS)$/i.test(element.tagName);
    }

    // The name that belongs to a link: the directory name, the link's own text, its title or label, the alt text of its image;
    // else the name seen last time. "" when nothing can be read (then the honor bar stays for that row).
    function textNameFor(link, identity) {
        const candidates = [
            identity?.resolvedName,
            elementTextWithoutOwn(link),
            link.getAttribute("title"),
            link.getAttribute("aria-label"),
            link.querySelector("img[alt]")?.getAttribute("alt"),
            link.querySelector("img[title]")?.getAttribute("title")
        ];
        for (const candidate of candidates) {
            const clean = cleanNameText(candidate);
            if (clean && clean.length <= 60 && !/^(?:profile|view profile)$/i.test(clean)) {
                nameByAnchor.set(link, clean);
                return clean;
            }
        }
        return nameByAnchor.get(link) || "";
    }

    // Torn's own text element with the name, if it has one that is shown: the link itself or an element inside it that holds nothing
    // but the name (media elements are not counted).
    function tornNameElement(link, name) {
        const wanted = name.toLowerCase();
        const isTextLeaf = element =>
            !element.hasAttribute("data-kss") &&
            !isMediaElement(element) &&
            Array.from(element.children).every(isMediaElement) &&
            cleanNameText(Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.nodeValue).join(" ")).toLowerCase() === wanted;
        return [link, ...Array.from(link.querySelectorAll("*"))].find(element => {
            if (!isTextLeaf(element)) return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        }) || null;
    }

    // The faction icon of a row (the same picture on every row of a faction's member list): a link to a faction page that holds a
    // picture and no text, or a picture that is plainly a faction tag. Anything less certain is left alone.
    function factionIconElements(row, link) {
        const found = new Set();
        const outside = element => !element.hasAttribute("data-kss") && !element.closest("[data-kss]") && (!link || (!link.contains(element) && !element.contains(link)));
        row.querySelectorAll('a[href*="factions.php"]').forEach(anchor => {
            if (!outside(anchor) || extractPlayerId(anchor)) return;
            if (anchor.querySelector("img,svg") && !normalizeText(anchor.textContent)) found.add(anchor);
        });
        row.querySelectorAll('img[src*="factiontag" i],img[src*="faction_tag" i],img[class*="faction" i]').forEach(image => {
            if (!outside(image)) return;
            const anchor = image.closest("a");
            found.add(anchor && outside(anchor) && !extractPlayerId(anchor) && !normalizeText(anchor.textContent) ? anchor : image);
        });
        return Array.from(found);
    }

    let placementLogged = "";
    function logPlacement(text) {
        if (placementLogged === text) return;
        placementLogged = text;
        dlog(text);
    }

    function logNameTextPath(path) {
        if (nameTextLogged === path) return;
        nameTextLogged = path;
        dlog("name as text:", path);
    }

    // The stats line (measured-row layout): one small line UNDER the name, a sibling after the name link's slot inside the honor slot, with the
    // manual Battle stats or else the estimate in compact form. No estimate (or no honor slot to put it in): no line.
    function syncStatsLine(row, link, text) {
        const honor = row.querySelector(".kss-honorwrap");
        let slot = null;
        if (honor && link && text) {
            slot = link;
            while (slot.parentElement && slot.parentElement !== honor) slot = slot.parentElement;
            if (slot.parentElement !== honor) slot = null;
        }
        const lines = Array.from(row.querySelectorAll(".kss-stline"));
        if (!slot) {
            lines.forEach(element => element.remove());
            return;
        }
        let line = lines.find(element => element.parentElement === honor) || null;
        lines.forEach(element => { if (element !== line) element.remove(); });
        if (!line) {
            line = document.createElement("span");
            line.className = "kss-stline";
            line.setAttribute("data-kss", "1");
        }
        if (line.previousElementSibling !== slot) slot.after(line);
        if (line.textContent !== text) line.textContent = text;
    }

    // Brings the name area of one row in line with the setting. On: honor bar and faction icon hidden, name shown as text.
    // Off, or no name found: everything this script did to the area is taken back (the honor bar stays for that row).
    function renderRowName(info) {
        const row = info.row;
        const link = info.identity?.anchor;
        const usable = settings.namesAsText && link && link !== row && row.contains(link) && link.tagName === "A";
        const name = usable ? textNameFor(link, info.identity) : "";
        if (!usable || !name) {
            row.classList.remove("kss-astext");
            row.querySelectorAll(".kss-namelink,.kss-nametext,.kss-namewrap,.kss-facticon").forEach(element => element.classList.remove("kss-namelink", "kss-nametext", "kss-namewrap", "kss-facticon"));
            row.querySelectorAll(".kss-tname").forEach(element => element.remove());
            syncStatsLine(row, null, "");
            return;
        }
        syncStatsLine(row, link, info.model?.stats || "");

        // Already drawn for this name: only the faction icon is looked at again (no layout is read on a repeat).
        const shown = link.classList.contains("kss-nametext") ? link : link.querySelector(".kss-nametext");
        if (row.classList.contains("kss-astext") && shown && cleanNameText(shown.textContent).toLowerCase() === name.toLowerCase()) {
            factionIconElements(row, link).forEach(element => element.classList.add("kss-facticon"));
            return;
        }

        // Torn's own text element, unless the one we already put in is there.
        const own = Array.from(link.children).find(child => child.classList.contains("kss-tname")) || null;
        let textElement = own ? null : tornNameElement(link, name);
        if (textElement) {
            logNameTextPath("Torn's own text element is shown");
        } else {
            textElement = own;
            if (!textElement) {
                textElement = document.createElement("span");
                textElement.className = "kss-tname";
                textElement.setAttribute("data-kss", "1");
                link.appendChild(textElement);
                logNameTextPath("own text element (kss-tname) put into the link");
            }
            if (textElement.textContent !== name) textElement.textContent = name;
        }

        row.classList.add("kss-astext");
        link.classList.add("kss-namelink");
        row.querySelectorAll(".kss-nametext,.kss-namewrap").forEach(element => { if (element !== textElement) element.classList.remove("kss-nametext", "kss-namewrap"); });
        textElement.classList.add("kss-nametext");
        // The wrappers between the link and the text element (Torn may fix their width or position) just pass the width on.
        if (textElement !== link) for (let wrapper = textElement.parentElement; wrapper && wrapper !== link; wrapper = wrapper.parentElement) wrapper.classList.add("kss-namewrap");
        const icons = new Set(factionIconElements(row, link));
        row.querySelectorAll(".kss-facticon").forEach(element => { if (!icons.has(element)) element.classList.remove("kss-facticon"); });
        icons.forEach(element => element.classList.add("kss-facticon"));
    }

    function countsFor(infos) {
        const soonLimit = Number(settings.soonMinutes) * 60;
        const count = test => infos.filter(test).length;
        const known = ["okay", "hospital", "jail", "traveling", "abroad"];
        return {
            all: infos.length,
            ready: count(info => info.status === "okay"),
            easy: count(info => info.status === "okay" && info.ff && info.ff <= Number(settings.maxFF)),
            soon: count(info => {
                const now = infoNow(info);
                return Boolean(info.until && info.until > now && info.until - now <= soonLimit);
            }),
            hospital: count(info => info.status === "hospital"),
            travel: count(info => isTravelStatus(info.status)),
            unknown: count(info => !info.ff && !info.battleStats && !info.estimateText),
            jail: count(info => info.status === "jail"),
            other: count(info => !known.includes(info.status)),
            core: count(info => info.hasCoreData),
            status: count(info => info.hasStatusData),
            exact: count(info => info.timerKind === "exact"),
            estimate: count(info => info.timerKind === "estimate"),
            estimateUnavailable: count(info => info.timerKind === "estimate-unavailable")
        };
    }

    function scheduleApply(delay = 120) {
        clearTimeout(applyTimer);
        applyTimer = setTimeout(() => {
            applyTimer = null;
            decorate();
        }, delay);
    }

    // Draws everything for the rows in the member lists this script may use. Synchronous; no request is made.
    function decorate() {
        if (destroyed || applying || !mounted || blockedRoute() || !isPageVisible()) return;
        if (!suiteDataEnabled()) {
            clearRendered();
            updatePanel();
            return;
        }
        const lists = factionMemberLists();
        if (!lists.length) return;

        // Rows that Torn has replaced are let go of.
        for (const row of touchedRows) {
            if (!row.isConnected) touchedRows.delete(row);
        }

        applying = true;
        try {
            refreshActiveSnapshot();
            const allInfo = [];

            for (const list of lists) {
                const body = list.querySelector(".table-body");
                if (!body) continue;
                const rows = rowsInList(list);
                const keepTornOrder = settings.sort === "original";
                let original;
                if (keepTornOrder) {
                    // Torn owns the order: nothing is moved, and the order is read again from the page every time.
                    // Coming back from another sorting, the rows first go back to the order Torn last had.
                    if (reorderedBodies.has(body)) restoreOriginalOrder(body, rows);
                    original = rememberCurrentOrder(body, rowsInList(list));
                } else {
                    original = ensureOriginalOrder(body, rows);
                }
                const infos = rows.map(row => rowInfo(row, original.get(row) ?? 0, activeSnap));
                if (!keepTornOrder) {
                    infos.sort(compareRows);
                    reorderBody(body, infos.map(info => info.row));
                }
                touchedBodies.add(body);

                for (const info of infos) {
                    touchedRows.add(info.row);
                    renderRowFf(info);
                    renderRowName(info);
                    if (matchesFilter(info)) info.row.style.removeProperty("display");
                    else info.row.style.setProperty("display", "none", "important");
                    renderTimer(info);
                    renderStatusBackdrop(info.row);
                    allInfo.push(info);
                }
            }

            lastInfos = allInfo;
            updatePanel();
            manageClock(allInfo.some(info => info.until && info.until > infoNow(info)));
        } finally {
            applying = false;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Scan: find rows, read FF/EST for the rows that need it, then draw
    // ---------------------------------------------------------------------------------------------

    function ffEntryFresh(id) {
        const entry = ffData.get(id);
        return Boolean(entry && entry.expires > Date.now());
    }

    function formatFfError(error) {
        const http = Number(error?.httpStatus);
        if (http) {
            return `FFScouter returned HTTP ${http}${[400, 401, 403].includes(http) ? " · check the key and try again" : ""}`;
        }
        return normalizeText(error instanceof Error ? error.message : String(error)) || "FFScouter request failed";
    }

    function finishScan(serial) {
        const ready = scanWaiters.filter(waiter => waiter.minSerial <= serial);
        scanWaiters = scanWaiters.filter(waiter => waiter.minSerial > serial);
        ready.forEach(waiter => waiter.resolve({ ...lastScan }));
    }

    // Resolves when a scan that STARTS after this call has finished.
    function runScanNow() {
        return new Promise(resolve => {
            scanWaiters.push({ minSerial: scanSerial + 1, resolve });
            scheduleScan(0);
        });
    }

    async function scan() {
        scanTimer = null;
        if (destroyed) return;
        // First of all: the Ranked War guard.
        if (blockedRoute()) {
            disposeContent({ disconnectObserverToo: true });
            return;
        }
        retireLegacyWarTools();

        const lists = factionMemberLists();
        if (!lists.length) {
            if (mounted) disposeContent();
            return;
        }
        if (!isPageVisible()) {
            resumeScanWhenVisible = true;
            updatePanel();
            return;
        }
        if (scanRunning) {
            rescanRequested = true;
            return;
        }

        scanRunning = true;
        const serial = ++scanSerial;
        const gen = generation;

        try {
            requireVisiblePage();
            ensurePanel(lists[0]);

            if (!reconcileDataState({ purgeApiCache: true })) {
                lastScan = { kind: "setup", http: 0, members: 0, at: Date.now() };
                updatePanel();
                return;
            }

            scheduleStatusRefresh(0);

            const result = await findRows(gen);
            requireVisiblePage();
            if (gen !== generation) return;
            const rows = result.rows;

            if (!result.memberLists) {
                disposeContent();
                return;
            }

            ffDataState = "loading";
            ffLoadedCount = 0;
            ffLoadedFactionId = detectFactionId();
            updatePanel();

            if (!rows.size) {
                // A list without one player id is a finished (empty) load, not a load that is still going on.
                ffDataState = "loaded";
                ffLoadedCount = 0;
                lastScan = { kind: "norows", http: 0, members: 0, at: Date.now() };
                decorate();
                return;
            }

            const fresh = [];
            for (const entry of rows.values()) {
                const needs = retryRows.has(entry.row) || !ffEntryFresh(entry.id);
                if (!needs) continue;
                if (pendingRows.get(entry.row) === gen) continue;
                pendingRows.set(entry.row, gen);
                retryRows.delete(entry.row);
                fresh.push(entry);
            }

            if (!fresh.length) {
                ffDataState = "loaded";
                ffLoadedCount = rows.size;
                ffLoadedFactionId = detectFactionId();
                failures.ff = "";
                lastScan = { kind: "loaded", http: 0, members: rows.size, at: Date.now() };
                decorate();
                return;
            }

            try {
                dlog("FF request for", fresh.length, "players");
                const data = await fetchPlayers(fresh.map(entry => entry.id), gen);
                requireVisiblePage();
                if (gen !== generation) return;

                for (const entry of fresh) {
                    const value = data.get(entry.id);
                    const transient = Boolean(value?._transient || data.ksNeedsRetryIds?.has?.(entry.id));
                    ffData.set(entry.id, {
                        value,
                        expires: transient ? 0 : (memoryCache.get(entry.id)?.expires || Date.now() + CACHE_MS)
                    });
                    if (transient) retryRows.add(entry.row);
                }

                if (data.ksTransientFailure) {
                    ffDataState = "degraded";
                    ffLoadedCount = 0;
                    failures.ff = "FFScouter temporarily unavailable";
                    lastScan = { kind: "degraded", http: 0, members: rows.size, at: Date.now() };
                    clearTimeout(ffRetryTimer);
                    ffRetryTimer = setTimeout(() => {
                        ffRetryTimer = null;
                        scheduleScan(0);
                    }, 5000);
                } else {
                    ffDataState = "loaded";
                    ffLoadedCount = rows.size;
                    ffLoadedFactionId = detectFactionId();
                    failures.ff = "";
                    lastScan = { kind: "loaded", http: 0, members: rows.size, at: Date.now() };
                }
                decorate();
            } catch (error) {
                if (gen !== generation) return;
                if (isHiddenPageError(error) || !isPageVisible()) {
                    resumeScanWhenVisible = true;
                } else if (!isNotMountedError(error)) {
                    ffDataState = "error";
                    ffLoadedCount = 0;
                    failures.ff = formatFfError(error);
                    lastScan = { kind: "error", http: Number(error?.httpStatus) || 0, members: rows.size, at: Date.now() };
                    decorate();
                }
            } finally {
                for (const entry of fresh) if (pendingRows.get(entry.row) === gen) pendingRows.delete(entry.row);
            }
        } catch (error) {
            if (isHiddenPageError(error) || !isPageVisible()) {
                resumeScanWhenVisible = true;
            } else if (!isNotMountedError(error)) {
                failures.ff = formatFfError(error);
                lastScan = { kind: "error", http: Number(error?.httpStatus) || 0, members: 0, at: Date.now() };
            }
        } finally {
            // Only the generation that set the flag clears it (disposeContent cleared it for a scan that was cut off).
            if (gen === generation) {
                scanRunning = false;
                refreshAutoStatusLine();
                updatePanel();
            }
            finishScan(serial);
            if (rescanRequested) {
                rescanRequested = false;
                scheduleScan(80);
            }
        }
    }

    function scheduleScan(delay = 120) {
        clearTimeout(scanTimer);
        scanTimer = null;
        if (destroyed) return;
        if (blockedRoute()) return;
        if (!isPageVisible()) {
            resumeScanWhenVisible = true;
            return;
        }
        resumeScanWhenVisible = false;
        scanTimer = setTimeout(scan, delay);
    }

    // ---------------------------------------------------------------------------------------------
    // Lifecycle: BOOT -> DETECT -> INITIALIZE -> RENDER -> OBSERVE -> UPDATE -> DISPOSE
    // ---------------------------------------------------------------------------------------------

    function stopDetectProbe() {
        clearInterval(detectProbeTimer);
        detectProbeTimer = null;
    }

    function startDetectProbe() {
        stopDetectProbe();
        if (destroyed || !isPageVisible() || blockedRoute()) return;

        let attempts = 0;
        detectProbeTimer = setInterval(() => {
            attempts += 1;

            if (destroyed || !isPageVisible() || blockedRoute() || attempts >= DETECT_PROBE_MAX) {
                stopDetectProbe();
                return;
            }

            if (!hasFactionMemberList()) return;

            scheduleScan(0);
            if (mounted) stopDetectProbe();
        }, DETECT_PROBE_MS);
    }

    function observerTarget() {
        return document.getElementById("factions") || document.getElementById("mainContainer") || document.body;
    }

    function connectObserver() {
        if (!observer || observerConnected || destroyed || !document.body || !isPageVisible() || blockedRoute()) return;
        const root = observerTarget();
        if (!root) return;
        observer.observe(root, OBSERVER_OPTIONS);
        observerRoot = root;
        observerConnected = true;
    }

    function disconnectObserver() {
        observer?.disconnect();
        observerConnected = false;
        observerRoot = null;
    }

    function isRelevantMutationNode(node) {
        const isElement = node instanceof Element;
        if (!isElement && !(node instanceof DocumentFragment)) return false;

        if (isElement && node.closest?.("[data-kss],[data-kss-mutating]")) return false;
        // Nothing that happens inside a Ranked War surface is a reason to scan.
        if (isElement && node.closest?.(RW_SURFACE_SELECTOR)) return false;

        // Torn PDA may insert the first member list through a DocumentFragment.
        return Boolean(
            (isElement && node.matches(".members-list,.table-body,.table-row")) ||
            node.querySelector?.(".members-list,.table-body,.table-row") ||
            (isElement && node.closest?.(".members-list .table-row"))
        );
    }

    function startUiTick() {
        clearInterval(uiTimer);
        uiTimer = setInterval(() => {
            if (destroyed || !mounted) return;
            const wasUsable = Boolean(activeSnap);
            refreshActiveSnapshot();
            // The snapshot just grew too old to use: the rows go back to Torn's own status at once.
            if (wasUsable && !activeSnap) decorate();
            else updatePanel();
        }, UI_TICK_MS);
    }

    function stopUiTick() {
        clearInterval(uiTimer);
        uiTimer = null;
    }

    // Takes down everything this script put on the page for the current list: observers of the countdown clock,
    // requests, timers, the panel, the card and the row decorations. Route listeners stay so a list can come back.
    function disposeContent({ disconnectObserverToo = false } = {}) {
        generation += 1;
        clearTimeout(scanTimer);
        scanTimer = null;
        clearTimeout(applyTimer);
        applyTimer = null;
        clearTimeout(statusTimer);
        statusTimer = null;
        statusForcePending = false;
        statusForceAfterRun = false;
        statusRequestRunning = false;
        scanRunning = false;
        rescanRequested = false;
        clearTimeout(ffRetryTimer);
        ffRetryTimer = null;
        stopUiTick();
        stopDetectProbe();
        abortActiveRequests();
        disconnectHeaderListener();
        closeCard();
        clearRendered();
        removePanelNode();
        // The style sheet goes too: nothing of this script stays on a page it has left (it is added again on the next mount).
        document.getElementById(STYLE_ID)?.remove();
        if (mounted) dlog("disposed");
        mounted = false;
        ffDataState = ffDataState === "disabled" ? "disabled" : "idle";
        ffLoadedCount = 0;
        if (disconnectObserverToo) disconnectObserver();
    }

    function onVisibilityChange() {
        if (destroyed) return;
        if (!isPageVisible()) {
            resumeScanWhenVisible = true;
            clearTimeout(scanTimer);
            scanTimer = null;
            clearTimeout(applyTimer);
            applyTimer = null;
            clearTimeout(statusTimer);
            statusTimer = null;
            clearTimeout(ffRetryTimer);
            ffRetryTimer = null;
            stopUiTick();
            stopDetectProbe();
            disconnectObserver();
            manageClock(false);
            abortActiveRequests();
            updatePanel();
            return;
        }

        if (blockedRoute()) return;
        retireLegacyWarTools();
        connectObserver();
        if (mounted) {
            startUiTick();
            scheduleStatusRefresh(0);
        }
        scheduleScan(resumeScanWhenVisible ? 0 : 80);
        startDetectProbe();
        updatePanel();
    }

    function onRouteChange() {
        if (destroyed) return;
        lastHref = location.href;
        clearTimeout(statusTimer);
        statusTimer = null;

        // Guard first: a Ranked War route removes everything and stops watching the page.
        if (blockedRoute()) {
            disposeContent({ disconnectObserverToo: true });
            return;
        }

        retireLegacyWarTools();
        connectObserver();
        clearTimeout(routeTimer);
        routeTimer = setTimeout(() => {
            routeTimer = null;
            if (destroyed || blockedRoute()) return;
            if (mounted && !hasFactionMemberList()) disposeContent();
            scheduleScan(0);
            scheduleStatusRefresh(0);
            startDetectProbe();
        }, 120);
    }

    // Checks the address and the observer root once a second. It reads no rows.
    function routeHeartbeat() {
        if (destroyed) return;
        retireLegacyWarTools();
        if (location.href !== lastHref) {
            onRouteChange();
            return;
        }
        if (blockedRoute()) {
            if (mounted || observerConnected) disposeContent({ disconnectObserverToo: true });
            return;
        }
        if (observerConnected && observerRoot && !observerRoot.isConnected) {
            disconnectObserver();
            connectObserver();
            scheduleScan(0);
        }
    }

    function suiteDiagnostics() {
        const dataEnabled = suiteDataEnabled();
        const current = dataEnabled ? currentSnapshotRecord() : null;
        const members = current?.members && typeof current.members === "object"
            ? Object.keys(current.members).length
            : 0;
        return {
            scoutVersion: VERSION,
            apiKeyConfigured: Boolean(getApiKey()),
            apiDisclosureAccepted: apiDisclosureAccepted(),
            dataEnabled,
            ffDataState,
            ffLoadedCount,
            ffLoadedFactionId,
            panelStatus: pillState().word,
            snapshotAge: formatSnapshotAge(current?.updatedAt),
            members,
            factionId: Number(current?.factionId) || null,
            mounted,
            data: localDataCounts()
        };
    }


    // ---------------------------------------------------------------------------------------------
    // Theme (KS UI theme, spec v1, with the PDA rules): tokens on :root, no Shadow DOM, so every declaration in
    // the panel, the card and the row decorations carries !important. Two fill effects (the header row and, since
    // the second version, the row colour fade: the owner's decision of 2026-10-20), one frame shadow, nothing animated, no web fonts,
    // no images, no external resources.
    // ---------------------------------------------------------------------------------------------

    /*CSS-START*/
    const TOKENS_CSS = `:root{
        --ks-gold:#D4AF37;--ks-gold-bright:#F2D98B;--ks-gold-dim:#7A6224;
        --ks-bg:#0C0A08;--ks-bg-2:#141110;--ks-bg-3:#1B1715;--ks-hairline:#2A2420;
        --ks-text:#EDE9E3;--ks-muted:#9A948C;
        --ks-go:#3FBF7F;--ks-wait:#E8833A;--ks-stop:#E4574C;--ks-unknown:#7C7772;
        --ks-hosp:#FF6F61;--ks-hosp-soon:#F2B23A;--ks-travel:#6EC3F5;--ks-jail:#D9A2FF;--ks-name:#8EC3F0;--ks-stline:#BDB7AF;
        --ks-serif:Georgia,"Times New Roman",Times,serif;
        --ks-sans:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;
    }`;

    // [selector, declarations]. Declarations are separated by ";" and get !important when the sheet is built.
    const CSS_RULES = [
        // Frame: outer line = the border, black gap = first inset ring, inner gold line (the token --ks-gold at 42 %,
        // written as rgba) = second inset ring. This is the only frame shadow in the file.
        [".ksui", `box-sizing:border-box;position:relative;display:block;width:100%;max-width:100%;margin:8px 0;padding:0;
            overflow:hidden;background:var(--ks-bg);color:var(--ks-text);border:1px solid var(--ks-gold-dim);border-radius:3px;
            box-shadow:inset 0 0 0 1px #000,inset 0 0 0 2px rgba(212,175,55,.42);
            font:400 13px/1.4 var(--ks-sans);text-align:left;letter-spacing:normal;text-transform:none;-webkit-text-size-adjust:100%`],
        [".ksui *,.ksui *::before,.ksui *::after", `box-sizing:border-box`],
        [".ksui [hidden]", `display:none`],
        [".ksui button,.ksui input,.ksui select,.ksui summary", `font-family:var(--ks-sans);letter-spacing:normal;text-transform:none;margin:0`],

        // Header row: one of the two fill effects of the file (the other one is the row colour fade below).
        [".ksui-head", `display:flex;align-items:center;gap:6px;padding:8px;background:linear-gradient(to bottom,#191411,#0E0B09);border-bottom:1px solid var(--ks-hairline)`],
        [".ksui-mark", `flex:0 0 26px;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--ks-gold);border-radius:2px;background:var(--ks-bg-3);color:var(--ks-gold-bright);font:600 12px/1 var(--ks-serif);letter-spacing:.04em`],
        [".kss-headtext", `flex:1 1 auto;min-width:0`],
        [".ksui-title", `margin:0;color:var(--ks-gold-bright);font:600 15px/1.2 var(--ks-serif);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap`],
        // The version line is never cut off with an ellipsis: it wraps instead.
        [".ksui-sub", `margin:1px 0 0;color:var(--ks-muted);font:400 10px/1.35 var(--ks-sans);letter-spacing:.18em;text-transform:uppercase;white-space:normal;overflow-wrap:anywhere`],
        // The version stays in lower case ("v0.9.4") inside the upper-case sub line.
        [".ksui-sub .kss-ver", `text-transform:none`],

        // Status marker: one shape for all states.
        [".ksui-pill", `flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:3px 6px;border:1px solid var(--ks-unknown);border-radius:2px;
            background:var(--ks-bg-3);color:var(--ks-unknown);font:700 10px/1.2 var(--ks-sans);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap`],
        [".ksui-pill::before", `content:"";flex:0 0 6px;width:6px;height:6px;border-radius:50%;background:currentColor`],
        [".ksui-pill.go", `border-color:var(--ks-go);background:rgba(63,191,127,.12);color:var(--ks-go)`],
        [".ksui-pill.wait", `border-color:var(--ks-wait);background:rgba(232,131,58,.12);color:var(--ks-wait)`],
        [".ksui-pill.stop", `border-color:var(--ks-stop);background:rgba(228,87,76,.12);color:var(--ks-stop)`],
        [".ksui-pill.unknown", `border-color:var(--ks-unknown);background:rgba(124,119,114,.12);color:var(--ks-unknown)`],

        // Buttons: at least 40 x 40 px.
        [".kss-btn", `display:flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;padding:4px 10px;border:1px solid var(--ks-hairline);border-radius:2px;
            background:var(--ks-bg-3);color:var(--ks-text);font:600 12px/1.2 var(--ks-sans);text-align:center;cursor:pointer;touch-action:manipulation;
            -webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent`],
        [".kss-btn:active", `border-color:var(--ks-gold)`],
        [".kss-btn[disabled]", `opacity:.55`],
        [".kss-icon", `flex:0 0 40px;width:40px;height:40px;padding:0;border-color:var(--ks-gold);color:var(--ks-gold-bright);font:600 18px/1 var(--ks-sans)`],
        [".kss-wide", `width:100%;margin-top:8px`],
        [".kss-primary", `border-color:var(--ks-gold);color:var(--ks-gold-bright)`],
        [".kss-danger", `border-color:var(--ks-stop);color:var(--ks-stop)`],

        [".kss-body", `padding:8px`],
        [".ksui[data-collapsed=\"1\"] .kss-body", `display:none`],
        [".ksui-meta", `color:var(--ks-muted);font:400 11px/1.5 var(--ks-sans);font-variant-numeric:tabular-nums;overflow-wrap:anywhere`],
        [".ksui-meta .kss-n", `color:var(--ks-text);font-weight:600`],

        // Divider: exactly one per panel. A hairline with a diamond.
        [".ksui-div", `position:relative;height:5px;margin:8px 0`],
        [".ksui-div::before", `content:"";position:absolute;left:0;right:0;top:2px;height:1px;background:var(--ks-gold-dim)`],
        [".ksui-div::after", `content:"";position:absolute;left:50%;top:0;width:3px;height:3px;margin-left:-2px;border:1px solid var(--ks-gold);background:var(--ks-bg);transform:rotate(45deg)`],

        // Filters and sort.
        [".kss-chips", `display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px`],
        [".kss-chip", `display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;min-height:40px;padding:3px 2px;border:1px solid var(--ks-hairline);border-radius:2px;
            background:var(--ks-bg-3);color:var(--ks-text);cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent`],
        [".kss-chip .kss-lbl", `display:block;max-width:100%;color:var(--ks-text);font:600 11px/1.2 var(--ks-sans);white-space:nowrap;overflow:hidden`],
        [".kss-chip .kss-num", `display:block;color:var(--ks-text);font:700 12px/1.2 var(--ks-sans);font-variant-numeric:tabular-nums`],
        [".kss-chip[aria-pressed=\"true\"]", `border-color:var(--ks-gold)`],
        [".kss-chip[aria-pressed=\"true\"] .kss-lbl", `color:var(--ks-gold-bright)`],
        [".kss-seg", `display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:6px`],
        [".kss-segbtn", `min-width:0;min-height:40px;padding:3px 2px;border:1px solid var(--ks-hairline);border-radius:2px;background:var(--ks-bg-3);color:var(--ks-text);
            font:600 12px/1.2 var(--ks-sans);white-space:nowrap;cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent`],
        [".kss-arrow", `white-space:pre`],
        [".kss-segbtn[aria-pressed=\"true\"]", `border-color:var(--ks-gold);color:var(--ks-gold-bright)`],
        [".kss-step", `display:flex;align-items:center;gap:6px;margin-top:6px`],
        [".kss-steplbl", `flex:1 1 auto;min-width:0;color:var(--ks-muted);font:400 10px/1.3 var(--ks-sans);letter-spacing:.18em;text-transform:uppercase`],
        [".kss-stepval", `flex:0 0 auto;min-width:64px;text-align:center;color:var(--ks-text);font:700 14px/1.2 var(--ks-sans);font-variant-numeric:tabular-nums`],

        // Compliance footer: always there (one folded line, the text unchanged inside), folds away with the panel.
        [".ksui-foot", `margin-top:8px;border-top:1px solid var(--ks-hairline);color:var(--ks-muted);font:400 11px/1.4 var(--ks-sans)`],
        [".ksui-foot > summary", `display:flex;align-items:center;min-height:40px;color:var(--ks-muted);font:600 11px/1.3 var(--ks-sans);cursor:pointer;list-style:none;touch-action:manipulation`],
        [".ksui-foot > summary::-webkit-details-marker", `display:none`],
        [".ksui-foot > summary::before", `content:"+";flex:0 0 18px;color:var(--ks-gold-bright)`],
        [".ksui-foot[open] > summary::before", `content:"\\2212"`],
        [".kss-foottext", `padding:0 0 8px`],

        // Settings view.
        [".kss-sethead", `display:flex;align-items:center;justify-content:space-between;gap:8px`],
        [".ksui-label", `color:var(--ks-muted);font:400 10px/1.3 var(--ks-sans);letter-spacing:.18em;text-transform:uppercase`],
        [".kss-h", `margin:12px 0 6px`],
        [".kss-sec", `margin-top:8px;border:1px solid var(--ks-hairline);border-radius:2px;background:var(--ks-bg-2)`],
        [".kss-sec > summary", `display:flex;align-items:center;min-height:40px;padding:0 10px;color:var(--ks-gold-bright);font:700 12px/1.3 var(--ks-sans);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;list-style:none;touch-action:manipulation`],
        [".kss-sec > summary::-webkit-details-marker", `display:none`],
        [".kss-sec > summary::before", `content:"+";flex:0 0 18px;color:var(--ks-gold-bright)`],
        [".kss-sec[open] > summary::before", `content:"\\2212"`],
        [".kss-secbody", `padding:2px 10px 10px`],
        [".kss-field", `display:block;margin-top:8px`],
        [".kss-field input,.kss-field select", `display:block;width:100%;height:40px;margin-top:4px;padding:0 10px;border:1px solid var(--ks-hairline);border-radius:2px;background:var(--ks-bg-2);color:var(--ks-text);font:400 14px/1.2 var(--ks-sans);-webkit-appearance:none;appearance:none`],
        [".kss-field input:focus,.kss-field select:focus,.kss-input:focus", `border-color:var(--ks-gold);outline:none`],
        [".kss-link", `display:flex;align-items:center;min-height:40px;min-width:40px;color:var(--ks-gold-bright);font:600 12px/1.3 var(--ks-sans);text-decoration:underline`],
        [".kss-item", `margin-top:6px;padding:8px;border:1px solid var(--ks-hairline);border-radius:2px;background:var(--ks-bg-3)`],
        [".kss-item strong", `display:block;color:var(--ks-text);font:700 11px/1.3 var(--ks-sans)`],
        [".kss-item p", `margin:3px 0 0;color:var(--ks-muted);font:400 11px/1.4 var(--ks-sans);overflow-wrap:anywhere`],
        [".kss-check", `position:relative;display:flex;align-items:center;gap:10px;min-height:40px;margin-top:8px;padding:6px 8px;border:1px solid var(--ks-hairline);border-radius:2px;background:var(--ks-bg-3);cursor:pointer`],
        [".kss-check input", `position:absolute;left:-1px;top:-1px;width:calc(100% + 2px);height:calc(100% + 2px);margin:0;opacity:0;cursor:pointer`],
        [".kss-box", `flex:0 0 22px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid var(--ks-gold);border-radius:2px;background:var(--ks-bg);color:var(--ks-gold-bright);font:700 14px/1 var(--ks-sans)`],
        [".kss-check input:checked + .kss-box::after", `content:"\\2713"`],
        [".kss-checktext", `flex:1 1 auto;min-width:0;color:var(--ks-text);font:600 12px/1.4 var(--ks-sans)`],
        [".kss-statusline", `margin-top:8px;padding:8px;border-left:3px solid var(--ks-hairline);background:var(--ks-bg-2);color:var(--ks-text);font:400 12px/1.4 var(--ks-sans);overflow-wrap:anywhere`],
        [".kss-statusline[data-tone=\"go\"]", `border-left-color:var(--ks-go)`],
        [".kss-statusline[data-tone=\"wait\"]", `border-left-color:var(--ks-wait)`],
        [".kss-statusline[data-tone=\"stop\"]", `border-left-color:var(--ks-stop)`],
        [".kss-statusline[data-tone=\"unknown\"]", `border-left-color:var(--ks-unknown)`],
        [".kss-dl", `color:var(--ks-muted);font:400 12px/1.6 var(--ks-sans);font-variant-numeric:tabular-nums;overflow-wrap:anywhere`],
        [".kss-dl .kss-n", `color:var(--ks-text);font-weight:600`],

        // Member rows.
        // The name area, reserve place: the element that holds Torn's name link is one line (flex, no wrapping) and the FF mark sits in it,
        // in the flow, in front of the link. The mark's tap area reaches up and down past the row (never sideways), so the cell must
        // not clip it. The link takes what is left and cuts a long name instead of pushing anything out.
        [".kss-namehost", `display:flex;flex-wrap:nowrap;align-items:center;min-width:0;overflow:visible`],
        [".kss-namecell", `overflow:visible`],
        [".kss-namehost > .kss-namelink", `flex:0 1 auto;min-width:0;overflow:hidden`],
        // The FF mark: a round FF circle (22 px) centred in a box that is the tap area. Reserve place (no userInfoBox, the earlier layout):
        // 40 px wide, 26 px high plus 7 px up and 7 px down by the pseudo-element, negative vertical margin so the name area (and so the
        // row) does not grow.
        [".kss-fftag", `position:relative;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:26px;margin:-4px 0;padding:0;
            font:700 10px/1 var(--ks-sans);white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:none;text-decoration:none;cursor:pointer;touch-action:manipulation`],
        [".kss-fftag::after", `content:"";position:absolute;left:0;right:0;top:-7px;bottom:-7px`],
        [".kss-ffc", `box-sizing:border-box;flex:0 0 22px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border:2px solid var(--kss-ring,transparent);border-radius:50%;
            background:var(--kss-edge,var(--ks-unknown));color:var(--kss-ink,var(--ks-text));font:700 10px/1 var(--ks-sans);text-align:center;overflow:hidden`],
        [".kss-fftag[data-old=\"1\"] .kss-ffc", `opacity:.6`],
        // measured-row layout, in Torn's own name box (class kss-uib on the userInfoBox): the faction slot is hidden, the mark is a direct child in front
        // of the honor slot, as high as the row (35 px, the vertical margin of -1 px keeps the box from growing) and 33 px wide (honor bar
        // shown). Its tap area is 40 x 40: 2.5 px up and down, 7 px to the LEFT over the status dot (a graphic, no link there), never over
        // the name link or the Lvl cell. With names as text (kss-astext on the row) the mark is 40 px wide and the tap area has no side extension.
        [".kss-factwrap", `display:none`],
        [".kss-uib > .kss-fftag", `flex:0 0 33px;width:33px;min-width:0;height:35px;margin:-1px 0`],
        [".kss-uib > .kss-fftag::after", `left:-7px;right:0;top:-2.5px;bottom:-2.5px`],
        [".kss-astext .kss-uib > .kss-fftag", `flex-basis:40px;width:40px`],
        [".kss-astext .kss-uib > .kss-fftag::after", `left:0;right:0`],
        // The honor slot. Honor bar shown: Torn's own 100 px stay (it must not be pressed narrower), only the gap to the mark is 3 px.
        [".kss-honorwrap", `flex:0 0 auto;margin-left:3px`],
        // Names as text: honor bar and faction icon are hidden (the row class kss-astext), the name is plain text inside the link.
        [".kss-astext .kss-facticon", `display:none`],
        [".kss-astext .kss-namelink img,.kss-astext .kss-namelink picture,.kss-astext .kss-namelink svg,.kss-astext .kss-namelink canvas", `display:none`],
        [".kss-astext .kss-namelink,.kss-astext .kss-namelink *:not([data-kss])", `background-image:none`],
        [".kss-astext .kss-namelink", `text-decoration:none`],
        [".kss-astext .kss-namewrap", `position:static;display:block;float:none;width:auto;max-width:100%;min-width:0;height:auto;margin:0;padding:0;overflow:hidden`],
        [".kss-astext .kss-nametext", `position:static;display:block;float:none;width:auto;max-width:100%;min-width:0;height:auto;margin:0;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            color:var(--ks-name);font:400 14px/1.3 var(--ks-sans);text-decoration:none;text-shadow:none;text-indent:0;letter-spacing:normal;text-transform:none;opacity:1;visibility:visible`],
        // measured-row layout, names as text in Torn's own name box: the honor slot becomes a column that takes what is left of the box (flex 1 1 0,
        // so it can never push anything out), name on top, the stats line under it. Both are cut with an ellipsis inside the column.
        [".kss-astext .kss-honorwrap", `width:auto;min-width:0;max-width:none;height:auto;flex:1 1 0;margin-left:4px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;overflow:hidden`],
        [".kss-astext .kss-honorwrap .honor-text-svg:not(.kss-nametext)", `display:none`],
        [".kss-astext .kss-honorwrap .kss-namelink", `flex:0 0 auto;width:auto;max-width:100%;min-width:0;height:auto;margin:0;padding:0;overflow:hidden`],
        [".kss-astext .kss-honorwrap .kss-namewrap", `flex:0 1 auto`],
        [".kss-astext .kss-honorwrap .kss-nametext", `flex:0 1 auto;font:400 13px/15px var(--ks-sans)`],
        [".kss-stline", `display:block;flex:0 0 auto;box-sizing:border-box;max-width:100%;min-width:0;margin:0;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            color:var(--ks-stline);font:400 10px/12px var(--ks-sans);text-decoration:none;text-shadow:none;letter-spacing:normal;text-transform:none`],
        // Row colour: ONE layer, on the row itself, strongest in the middle and gone at both edges (--kss-tint0 is the
        // same colour at alpha 0, so the fade does not pass through grey). Everything under the row is transparent so that
        // Torn's own cell backgrounds do not cover it; the KS marks (data-kss) keep their own backgrounds.
        [".kss-tinted", `background-image:linear-gradient(90deg,var(--kss-tint0) 0%,var(--kss-tint) 50%,var(--kss-tint0) 100%)`],
        [".kss-tinted *:not([data-kss])", `background-color:transparent`],
        // Status text on a coloured row: a dark background (the colour and radius of the FF mark). Torn's text colour is kept.
        [".kss-tinted .kss-timer,.kss-tinted .kss-statustext", `background-color:var(--ks-bg);padding:2px 6px;border-radius:2px`],
        [".kss-tinted .kss-status-host.kss-compact::before", `background-color:var(--ks-bg);padding:2px 6px;border-radius:2px`],
        [".kss-status-host", `position:relative;overflow:visible`],
        [".kss-status-host.kss-compact", `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center`],
        [".kss-status-host.kss-compact > .ellipsis", `display:none`],
        [".kss-status-host.kss-compact::before", `content:attr(data-kss-label);display:block;color:inherit;font:800 10px/1.1 var(--ks-sans);letter-spacing:.15px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis`],
        [".kss-timer", `position:relative;display:block;margin:0;color:var(--ks-text);font:800 10px/1.15 var(--ks-sans);font-variant-numeric:tabular-nums;white-space:nowrap;text-shadow:none;cursor:pointer;touch-action:manipulation`],
        [".kss-timer::after", `content:"";position:absolute;left:-14px;right:-14px;top:-15px;bottom:-15px`],
        // Status colours: label and countdown in the same colour; only this script's own elements, never Torn's text.
        [".kss-status-host[data-kss-tone=\"hosp\"].kss-compact::before,.kss-status-host[data-kss-tone=\"hosp\"] > .kss-timer", `color:var(--ks-hosp)`],
        [".kss-status-host[data-kss-tone=\"hosp-soon\"].kss-compact::before,.kss-status-host[data-kss-tone=\"hosp-soon\"] > .kss-timer", `color:var(--ks-hosp-soon)`],
        [".kss-status-host[data-kss-tone=\"travel\"].kss-compact::before,.kss-status-host[data-kss-tone=\"travel\"] > .kss-timer", `color:var(--ks-travel)`],
        [".kss-status-host[data-kss-tone=\"jail\"].kss-compact::before,.kss-status-host[data-kss-tone=\"jail\"] > .kss-timer", `color:var(--ks-jail)`],
        [".kss-status-host[data-kss-tone=\"grey\"].kss-compact::before,.kss-status-host[data-kss-tone=\"grey\"] > .kss-timer", `color:var(--ks-muted)`],
        [".kss-status-host > .kss-timer.unavailable", `color:var(--ks-muted)`],

        // Member card, fixed above Torn PDA's own bottom bar.
        [".kss-card", `position:fixed;left:8px;right:8px;bottom:max(78px,calc(env(safe-area-inset-bottom) + 78px));z-index:2147483647;width:auto;max-width:520px;margin:0 auto;
            max-height:calc(100vh - 100px);overflow-y:auto;padding:10px;-webkit-overflow-scrolling:touch`],
        [".kss-name", `display:flex;align-items:center;min-height:40px;color:var(--ks-gold-bright);font:700 16px/1.3 var(--ks-sans);text-decoration:underline`],
        [".kss-line", `margin-top:3px;color:var(--ks-text);font:400 12px/1.45 var(--ks-sans);overflow-wrap:anywhere`],
        [".kss-line.kss-dim", `color:var(--ks-muted)`],
        [".kss-block", `margin-top:8px;padding:8px;border:1px solid var(--ks-hairline);border-left:3px solid var(--ks-unknown);border-radius:2px;background:var(--ks-bg-2)`],
        [".kss-block .kss-link", `display:inline-flex;min-height:40px;font-size:12px`],
        [".kss-twin", `display:flex;gap:6px;align-items:flex-end`],
        [".kss-twin .kss-field", `flex:1 1 auto;min-width:0`],
        [".kss-twin .kss-unit", `flex:0 0 72px`],
        [".kss-actions", `display:flex;gap:6px;margin-top:10px`],
        [".kss-actions .kss-btn", `flex:1 1 0;min-width:0`]
    ];
    /*CSS-END*/

    function buildStyleSheet() {
        const rules = CSS_RULES.map(([selector, declarations]) => {
            const body = declarations
                .split(";")
                .map(part => part.trim())
                .filter(Boolean)
                .map(part => `${part}!important`)
                .join(";");
            return `${selector}{${body}}`;
        });
        return `${TOKENS_CSS}\n${rules.join("\n")}`;
    }

    // Added once per mount (not per render) and only when the panel is mounted: a Ranked War page gets nothing.
    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.setAttribute("data-kss", "1");
        style.textContent = buildStyleSheet();
        (document.head || document.documentElement).appendChild(style);
    }


    // ---------------------------------------------------------------------------------------------
    // Panel: one panel above the first member list
    // ---------------------------------------------------------------------------------------------

    const FOOTER_TEXT = `Reads the faction page you have open, Torn's official API (faction basic) and FFScouter. Requests only while this page is open and focused, and never on a Ranked War list. Never clicks, attacks or navigates for you. Your key, settings, manual values and a short cache stay unencrypted in ${STORE_PLACE}. KS has no server and receives nothing.`;

    const CHIPS = [
        ["all", "All"],
        ["ready", "Okay"],
        ["easy", "Easy"],
        ["soon", "Soon"],
        ["hospital", "Hospital"],
        ["travel", "Travel"],
        ["unknown", "No data"]
    ];

    const SORT_BUTTONS = [
        ["original", "Original"],
        ["ff", "FF"],
        ["status", "Status"],
        ["soon", "Soonest"]
    ];

    // The spoken name of a chosen sort button, first for the rising direction, then for the falling one.
    const SORT_ARIA = {
        ff: ["FF, lowest first", "FF, highest first"],
        status: ["Status, Okay first", "Status, Okay last"],
        soon: ["Soonest, hospital first, shortest time first", "Soonest, hospital first, longest time first"]
    };

    const DISCLOSURE_ITEMS = [
        ["Data storage", `KS Scout stores the key, settings, manual values, notes, cached FF/EST response data (including estimate/source/spy metadata), status data and travel data locally in ${STORE_PLACE} until cleared or removed. The key is stored unencrypted in ${STORE_PLACE}. FFScouter separately stores/uses registered key data under its own policy.`],
        ["Data sharing", "Torn API receives the key for faction/basic. FFScouter receives the key for a registration request you explicitly trigger, plus /check-key, /get-stats and /player-flights; visible target IDs are included for stats and flight lookups. KS Scout has no server and its developer receives nothing."],
        ["Purpose of use", "Register a new key with FFScouter only when you press the registration button; display FF/EST values; check FFScouter registration status/premium entitlement; show estimated flight landing/window/method; map visible faction members; and show faction status/timers, filters and sorting."],
        ["Key storage & sharing", "KS Scout stores the key locally and sends it over HTTPS only to Torn API and FFScouter. FFScouter key storage/access is governed by its own terms and data policy."],
        ["Key access level", "Custom key selections: user/basic, battlestats, hof, attacks, personalstats and faction/basic. Limited or Full access is not required."],
        ["Active page & automation", "New requests pause whenever Torn is hidden or unfocused, and nothing is requested on a Ranked War list. No attacks, clicks, travel, purchases, crimes or other Torn actions are performed."]
    ];

    const DISCLOSURE_LINKS = [
        [CREATE_KEY_URL, "Create custom API key"],
        ["https://www.torn.com/api.html", "Torn API terms"],
        ["https://www.torn.com/rules.php", "Torn scripting rules"],
        ["https://ffscouter.com/", "FFScouter terms & data policy"],
        ["https://ffscouter.com/privacy", "FFScouter privacy"]
    ];

    function panelHtml() {
        const chips = CHIPS.map(([key, label]) =>
            `<button type="button" class="kss-chip" data-filter="${key}" aria-pressed="false"><span class="kss-lbl">${label}</span><span class="kss-num" data-count="${key}">0</span></button>`
        ).join("");
        const sorts = SORT_BUTTONS.map(([key, label]) =>
            `<button type="button" class="kss-segbtn" data-sort="${key}" aria-pressed="false"><span class="kss-sortlbl">${label}</span><span class="kss-arrow" aria-hidden="true"></span></button>`
        ).join("");

        return `
            <div class="ksui-head">
                <span class="ksui-mark" aria-hidden="true">KS</span>
                <div class="kss-headtext">
                    <div class="ksui-title">KS SCOUT</div>
                    <div class="ksui-sub">KS · ${PLATFORM_LABEL} · <span class="kss-ver">v${VERSION}</span></div>
                </div>
                <span class="ksui-pill unknown" data-k="pill" role="status">CHECKING</span>
                <button type="button" class="kss-btn kss-icon" data-act="gear" aria-label="Settings" aria-expanded="false">⚙︎</button>
                <button type="button" class="kss-btn kss-icon" data-act="collapse" aria-label="Collapse panel" aria-expanded="true">−</button>
            </div>
            <div class="kss-body">
                <div class="ksui-meta"><div data-k="meta1"></div><div data-k="meta2"></div></div>
                <div class="ksui-div"></div>
                <div data-k="main">
                    <div class="kss-chips" role="group" aria-label="Filter">${chips}</div>
                    <div class="kss-seg" role="group" aria-label="Sort">${sorts}</div>
                </div>
                <div data-k="settings" hidden></div>
                <details class="ksui-foot" data-k="foot">
                    <summary>What KS Scout reads and stores</summary>
                    <div class="kss-foottext">${escapeHtml(FOOTER_TEXT)}</div>
                </details>
            </div>
        `;
    }

    function settingsHtml() {
        const open = suiteDataEnabled() ? "" : " open";
        const items = DISCLOSURE_ITEMS.map(([title, text]) =>
            `<div class="kss-item"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`
        ).join("");
        const links = DISCLOSURE_LINKS.map(([href, label]) =>
            `<a class="kss-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        ).join("");

        return `
            <div class="kss-sethead"><span class="ksui-label">Settings</span><button type="button" class="kss-btn" data-act="done">Done</button></div>
            <div class="kss-statusline" data-k="statusline" role="status" hidden></div>
            <details class="kss-sec" data-k="keysec"${open}>
                <summary>API key</summary>
                <div class="kss-secbody">
                    <label class="kss-field"><span class="ksui-label">Torn / FFScouter API key</span>
                        <input data-k="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
                    <details class="kss-sec" data-k="discsec"${open}>
                        <summary>Required API key and data disclosure</summary>
                        <div class="kss-secbody">${items}${links}</div>
                    </details>
                    <label class="kss-check"><input data-k="consent" type="checkbox"><span class="kss-box"></span><span class="kss-checktext">I have read the disclosure above and the linked FFScouter terms/data policy, and I agree to this data use. Network requests remain disabled until this is checked.</span></label>
                    <button type="button" class="kss-btn kss-wide" data-act="register">Register key with FFScouter</button>
                    <button type="button" class="kss-btn kss-wide kss-primary" data-act="save">Save &amp; load data</button>
                </div>
            </details>
            <div class="ksui-label kss-h">Display</div>
            <label class="kss-check"><input data-k="showUnknown" type="checkbox"><span class="kss-box"></span><span class="kss-checktext">Show players with no data</span></label>
            <label class="kss-check"><input data-k="colorRows" type="checkbox"><span class="kss-box"></span><span class="kss-checktext">Colour rows by FF</span></label>
            <label class="kss-check"><input data-k="namesAsText" type="checkbox"><span class="kss-box"></span><span class="kss-checktext">Show names as text</span></label>
            <div class="kss-step">
                <span class="kss-steplbl">Easy max FF</span>
                <button type="button" class="kss-btn" data-step="maxFF-" aria-label="Lower Easy max FF">−</button>
                <span class="kss-stepval" data-k="maxFF">3.0</span>
                <button type="button" class="kss-btn" data-step="maxFF+" aria-label="Raise Easy max FF">+</button>
            </div>
            <div class="kss-step">
                <span class="kss-steplbl">Soon within</span>
                <button type="button" class="kss-btn" data-step="soon-" aria-label="Lower Soon within">−</button>
                <span class="kss-stepval" data-k="soon">60 min</span>
                <button type="button" class="kss-btn" data-step="soon+" aria-label="Raise Soon within">+</button>
            </div>
            <div class="ksui-label kss-h">Data</div>
            <div class="kss-dl" data-k="datacount"></div>
            <button type="button" class="kss-btn kss-wide kss-danger" data-act="clear">Clear cached data</button>
            <button type="button" class="kss-btn kss-wide" data-act="reset">Reset filters and sort</button>
            <div class="ksui-label kss-h">About</div>
            <div class="kss-dl" data-k="about"></div>
        `;
    }

    function ensurePanel(firstList) {
        if (panelEl && panelEl.isConnected && panelEl.parentNode === firstList.parentNode) return panelEl;

        ensureStyles();

        // Never two panels: anything left under our id is taken away first.
        document.querySelectorAll(`#${PANEL_ID}`).forEach(element => { if (element !== panelEl) element.remove(); });

        if (!panelEl) {
            panelEl = document.createElement("section");
            panelEl.id = PANEL_ID;
            panelEl.className = "ksui";
            panelEl.setAttribute("data-ks-app", "scout");
            panelEl.setAttribute("data-kss", "1");
            panelEl.innerHTML = panelHtml();
            panelEl.addEventListener("click", onPanelClick);
            panelEl.addEventListener("change", onPanelChange);
            if (!suiteDataEnabled() && !setupOpenedOnce) {
                view = "settings";
                setupOpenedOnce = true;
            }
        }
        firstList.parentNode.insertBefore(panelEl, firstList);
        mounted = true;
        connectHeaderListener();
        startUiTick();
        dlog("panel mounted");
        updatePanel();
        return panelEl;
    }

    function removePanelNode() {
        if (panelEl) panelEl.remove();
        panelEl = null;
    }

    function setStatusLine(text, tone = "", source = "auto") {
        statusLine = { text: String(text || ""), tone, source };
        renderStatusLine();
    }

    function renderStatusLine() {
        const element = panelEl?.querySelector('[data-k="statusline"]');
        if (!element) return;
        if (element.textContent !== statusLine.text) element.textContent = statusLine.text;
        element.dataset.tone = statusLine.tone || "";
        element.hidden = !statusLine.text;
    }

    function failureText() {
        return failures.torn || failures.status || failures.ff || "";
    }

    // A problem the user should see: shown in the settings status line until it is gone.
    function refreshAutoStatusLine() {
        const problem = failureText();
        if (problem) {
            if (statusLine.text !== problem) setStatusLine(problem, "stop", "auto");
        } else if (statusLine.source === "auto" && statusLine.text) {
            setStatusLine("", "", "auto");
        }
    }

    function snapshotAgeSeconds() {
        const updatedAt = Number(activeSnapUpdatedAt);
        if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
        return Math.max(0, Math.floor(Date.now() / 1000 - updatedAt));
    }

    function formatAgo(seconds) {
        if (seconds === null) return "";
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    function formatSnapshotAge(updatedAt) {
        const timestamp = Number(updatedAt);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return "No status snapshot";
        const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
        if (seconds < 60) return `${seconds}s old`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
        return `${Math.floor(seconds / 3600)}h old`;
    }

    // Exactly one word. Order of precedence: SETUP, PAUSED, OFFLINE, LIVE, CHECKING, STALE.
    function pillState() {
        if (!suiteDataEnabled()) return { word: "SETUP", cls: "wait" };
        if (!isPageVisible()) return { word: "PAUSED", cls: "wait" };
        if (failureText()) return { word: "OFFLINE", cls: "stop" };
        const age = snapshotAgeSeconds();
        if (age !== null && age < STATUS_LIVE_SECONDS && ffDataState === "loaded") return { word: "LIVE", cls: "go" };
        if (statusRequestRunning || scanRunning || ffDataState === "loading" || ffDataState === "idle") {
            return { word: "CHECKING", cls: "unknown" };
        }
        if (age !== null && age > STATUS_STALE_SECONDS) return { word: "STALE", cls: "unknown" };
        return { word: "CHECKING", cls: "unknown" };
    }

    function setIfChanged(element, text) {
        if (element && element.textContent !== text) element.textContent = text;
    }

    function setHtmlIfChanged(element, html) {
        if (element && element.dataset.h !== html) {
            element.dataset.h = html;
            element.innerHTML = html;
        }
    }

    function formatMaxFF(value) {
        const number = Number(value);
        return Number.isInteger(number) ? number.toFixed(1) : String(+number.toFixed(2));
    }

    function numSpan(value) {
        return `<span class="kss-n">${escapeHtml(value)}</span>`;
    }

    function localDataCounts() {
        const counts = { cache: 0, manual: 0 };
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index) || "";
                if (key.startsWith(CACHE_PREFIX)) counts.cache += 1;
                else if (key.startsWith(MANUAL_PREFIX)) counts.manual += 1;
            }
        } catch {}
        return counts;
    }

    function flightWindowsActive() {
        const key = getApiKey();
        return Boolean(
            key &&
            ffKeyStatusCache.key === key &&
            ffKeyStatusCache.expires > Date.now() &&
            ffKeyStatusCache.isRegistered &&
            ffKeyStatusCache.isPremium
        );
    }

    function ensureSettingsBuilt() {
        const host = panelEl?.querySelector('[data-k="settings"]');
        if (!host || host.dataset.built === "1") return;
        host.dataset.built = "1";
        host.innerHTML = settingsHtml();
        const keyInput = host.querySelector('[data-k="key"]');
        const consentInput = host.querySelector('[data-k="consent"]');
        if (keyInput) keyInput.value = getApiKey();
        if (consentInput) consentInput.checked = apiDisclosureAccepted();
        renderStatusLine();
    }

    function updateSettingsDynamic() {
        const panel = panelEl;
        if (!panel) return;
        const $ = key => panel.querySelector(`[data-k="${key}"]`);
        const showUnknown = $("showUnknown");
        const colorRows = $("colorRows");
        if (showUnknown && showUnknown.checked !== settings.showUnknown) showUnknown.checked = settings.showUnknown;
        if (colorRows && colorRows.checked !== settings.colorRows) colorRows.checked = settings.colorRows;
        const namesAsText = $("namesAsText");
        if (namesAsText && namesAsText.checked !== settings.namesAsText) namesAsText.checked = settings.namesAsText;

        // As long as setup is missing, the key section and the disclosure are open. Done when SETUP arises (the view may
        // have been built while the data was on); after that the user may fold them.
        const inSetup = !suiteDataEnabled();
        if (inSetup && !setupSectionsOpened) {
            const keySection = $("keysec");
            const disclosure = $("discsec");
            if (keySection) keySection.open = true;
            if (disclosure) disclosure.open = true;
        }
        setupSectionsOpened = inSetup;

        const counts = localDataCounts();
        setHtmlIfChanged(
            $("datacount"),
            `${numSpan(counts.cache)} cached players · ${numSpan(counts.manual)} manual values`
        );

        const pill = pillState();
        const age = snapshotAgeSeconds();
        const members = activeSnap?.members && typeof activeSnap.members === "object"
            ? Object.keys(activeSnap.members).length
            : 0;
        setHtmlIfChanged($("about"), [
            `<div>Version ${numSpan(`v${VERSION}`)}</div>`,
            `<div>Status ${numSpan(pill.word)}</div>`,
            `<div>Last status ${numSpan(age === null ? "none yet" : formatAgo(age))} · ${numSpan(members)} members</div>`,
            `<div>${flightWindowsActive() ? "Flight estimates: FFScouter Premium active" : "Flight estimates: route table only"}</div>`
        ].join(""));
    }

    // Brings every part of the panel in line with the current state. Cheap; called often.
    function updatePanel() {
        const panel = panelEl;
        if (!panel || !panel.isConnected) return;
        const $ = key => panel.querySelector(`[data-k="${key}"]`);
        const enabled = suiteDataEnabled();

        const pill = pillState();
        const pillElement = $("pill");
        const pillClass = `ksui-pill ${pill.cls}`;
        if (pillElement.className !== pillClass) pillElement.className = pillClass;
        setIfChanged(pillElement, pill.word);
        const problem = failureText();
        if (pillElement.title !== problem) pillElement.title = problem;

        const collapsed = Boolean(settings.collapsed);
        if (panel.dataset.collapsed !== (collapsed ? "1" : "0")) panel.dataset.collapsed = collapsed ? "1" : "0";
        const collapseButton = panel.querySelector('[data-act="collapse"]');
        setIfChanged(collapseButton, collapsed ? "+" : "−");
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", collapsed ? "Expand panel" : "Collapse panel");

        const showSettings = view === "settings";
        panel.querySelector('[data-act="gear"]').setAttribute("aria-expanded", String(showSettings));
        $("main").hidden = showSettings;
        $("settings").hidden = !showSettings;
        if (showSettings) {
            ensureSettingsBuilt();
            updateSettingsDynamic();
        }

        // Meta rows.
        const counts = countsFor(lastInfos);
        let line1;
        let line2;
        if (!enabled) {
            line1 = "Setup required";
            line2 = "Open the gear and add your API key to load FF and status data.";
        } else {
            line1 = `${numSpan(counts.all)} members · ${numSpan(counts.ready)} Okay · ${numSpan(counts.hospital)} Hospital · ${numSpan(counts.travel)} Travel · ${numSpan(counts.jail)} Jail`
                + (counts.other ? ` · ${numSpan(counts.other)} Other` : "");
            const age = snapshotAgeSeconds();
            line2 = `FF ${numSpan(`${counts.core}/${counts.all}`)} · status ${age === null ? "loading…" : numSpan(formatAgo(age))}`
                + (problem && pill.word === "OFFLINE" ? ` · ${escapeHtml(problem)}` : "");
        }
        setHtmlIfChanged($("meta1"), line1);
        setHtmlIfChanged($("meta2"), line2);

        // Filter chips, sort and steppers.
        panel.querySelectorAll("[data-filter]").forEach(button => {
            const key = button.dataset.filter;
            const pressed = String(settings.filter === key);
            if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
            setIfChanged(button.querySelector(".kss-num"), String(counts[key] ?? 0));
        });
        panel.querySelectorAll("[data-sort]").forEach(button => {
            const key = button.dataset.sort;
            const chosen = settings.sort === key;
            const pressed = String(chosen);
            if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
            // The chosen button (not Original: Torn owns that order) shows the direction after its word.
            const directional = chosen && key !== "original";
            const falling = settings.sortDir === "desc";
            setIfChanged(button.querySelector(".kss-arrow"), directional ? (falling ? " \u25BC" : " \u25B2") : "");
            const spoken = directional ? SORT_ARIA[key][falling ? 1 : 0] : "";
            if (spoken) {
                if (button.getAttribute("aria-label") !== spoken) button.setAttribute("aria-label", spoken);
            } else if (button.hasAttribute("aria-label")) {
                button.removeAttribute("aria-label");
            }
        });
        setIfChanged($("maxFF"), formatMaxFF(settings.maxFF));
        setIfChanged($("soon"), `${settings.soonMinutes} min`);
    }

    function onPanelClick(event) {
        // Taps inside the panel never reach Torn's own handlers.
        event.stopPropagation();
        const origin = event.target instanceof Element ? event.target : null;
        const control = origin?.closest("[data-act],[data-filter],[data-sort],[data-step]");
        if (!control || !panelEl?.contains(control)) return;

        if (control.dataset.filter) {
            updateSettings({ filter: control.dataset.filter });
            decorate();
            return;
        }
        if (control.dataset.sort) {
            const key = control.dataset.sort;
            if (key === settings.sort) {
                // Tapping the chosen sort turns the direction round. Original has none (Torn owns the order): nothing happens.
                if (key === "original") return;
                updateSettings({ sortDir: settings.sortDir === "desc" ? "asc" : "desc" });
            } else {
                updateSettings({ sort: key, sortDir: "asc" });
            }
            decorate();
            return;
        }
        if (control.dataset.step) {
            stepSetting(control.dataset.step);
            return;
        }

        switch (control.dataset.act) {
            case "gear":
                view = view === "settings" ? "main" : "settings";
                updatePanel();
                break;
            case "done":
                view = "main";
                updatePanel();
                break;
            case "collapse":
                updateSettings({ collapsed: !settings.collapsed });
                updatePanel();
                break;
            case "register":
                registerKey();
                break;
            case "save":
                saveAndLoad();
                break;
            case "clear":
                clearCachedDataWithConfirmation();
                break;
            case "reset":
                updateSettings({
                    filter: DEFAULTS.filter,
                    sort: DEFAULTS.sort,
                    sortDir: DEFAULTS.sortDir,
                    maxFF: DEFAULTS.maxFF,
                    soonMinutes: DEFAULTS.soonMinutes
                });
                decorate();
                setStatusLine("Filters and sort reset.", "go", "manual");
                break;
            default:
        }
    }

    function onPanelChange(event) {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        if (!input) return;
        if (input.dataset.k === "showUnknown") {
            updateSettings({ showUnknown: input.checked });
            decorate();
        } else if (input.dataset.k === "colorRows") {
            updateSettings({ colorRows: input.checked });
            decorate();
        } else if (input.dataset.k === "namesAsText") {
            updateSettings({ namesAsText: input.checked });
            decorate();
        }
    }

    // Easy max FF: step 0.1, limits 0.1-20. Soon within: step 15, limits 15-1440. Saved and applied at once.
    function stepSetting(step) {
        const direction = step.endsWith("+") ? 1 : -1;
        if (step.startsWith("maxFF")) {
            const next = Math.round((Number(settings.maxFF) + direction * EASY_MAX_FF_RANGE.step) * 10) / 10;
            updateSettings({ maxFF: Math.min(EASY_MAX_FF_RANGE.max, Math.max(EASY_MAX_FF_RANGE.min, next)) });
        } else if (step.startsWith("soon")) {
            const next = Number(settings.soonMinutes) + direction * SOON_MINUTES_RANGE.step;
            updateSettings({ soonMinutes: Math.min(SOON_MINUTES_RANGE.max, Math.max(SOON_MINUTES_RANGE.min, next)) });
        }
        decorate();
    }

    // ---------------------------------------------------------------------------------------------
    // Setup actions
    // ---------------------------------------------------------------------------------------------

    function withTimeout(promise, ms) {
        return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
    }

    // Registration: ONE request to FFScouter (POST /register) and nothing else.
    async function registerKey() {
        if (registerRunning || !panelEl) return;
        const keyInput = panelEl.querySelector('[data-k="key"]');
        const consentInput = panelEl.querySelector('[data-k="consent"]');
        const button = panelEl.querySelector('[data-act="register"]');
        const cleanKey = String(keyInput?.value || "").trim();

        if (!consentInput?.checked) {
            setStatusLine("Read and accept the disclosure and linked FFScouter terms/data policy first.", "wait", "manual");
            return;
        }
        if (!/^[A-Za-z0-9]{16}$/.test(cleanKey)) {
            setStatusLine("Enter a valid 16-character Torn API key first.", "wait", "manual");
            return;
        }

        registerRunning = true;
        if (button) button.disabled = true;
        setStatusLine("Registering this key with FFScouter…", "unknown", "manual");
        let sent = false;
        try {
            requireVisiblePage();
            requireMounted();
            const message = await registerFfScouterKey(cleanKey, generation, () => { sent = true; });
            setStatusLine(`${message} Tap Save & load data to load the data.`, "go", "manual");
        } catch (error) {
            if (isStopError(error)) {
                // The work was taken down (page hidden, panel gone, new key). Before the request was sent nothing happened;
                // after it, the answer was thrown away and FFScouter may have registered the key. Never a technical text.
                setStatusLine(
                    sent
                        ? "Registration was interrupted. It may already have gone through — tap Save & load data to check."
                        : "Registration failed: Paused while Torn is not visible or focused. Try again.",
                    "wait",
                    "manual"
                );
            } else {
                const message = error instanceof Error ? error.message : String(error);
                setStatusLine(`Registration failed: ${message}`, "stop", "manual");
            }
        } finally {
            registerRunning = false;
            if (button) button.disabled = false;
        }
    }

    function persistCredentials(keyValue, accepted) {
        const previousKey = getApiKey();
        setApiKey(keyValue);
        updateSettings({ apiDisclosureAccepted: accepted });
        if (previousKey !== getApiKey()) factionDirectoryCache.clear();
        tornKeyRejectedFor = "";
        clearTornFailure();
        failures.status = "";
        failures.ff = "";
        setupDisabledApplied = false;
        // Work that started with the old key is taken down first: an answer that still arrives is thrown away and
        // never reaches ffData, the cache or the screen.
        generation += 1;
        abortActiveRequests();
        statusRequestRunning = false;
        statusForcePending = false;
        statusForceAfterRun = false;
        memoryCache.clear();
        ffData.clear();
        clearRendered();
        reconcileDataState({ purgeApiCache: true });
        updatePanel();
    }

    // Saves the key and the acceptance, then loads the data. One retry when FFScouter answers HTTP 400.
    async function saveAndLoad() {
        if (saveRunning || !panelEl) return;
        const keyInput = panelEl.querySelector('[data-k="key"]');
        const consentInput = panelEl.querySelector('[data-k="consent"]');
        const button = panelEl.querySelector('[data-act="save"]');
        const keyValue = String(keyInput?.value || "").trim();
        const consent = Boolean(consentInput?.checked);

        if (!keyValue && !getApiKey()) {
            setStatusLine("Paste your API key first.", "wait", "manual");
            keyInput?.focus?.();
            return;
        }
        if (!keyValue) {
            persistCredentials("", consent);
            setStatusLine("Key removed · FF and status data are off.", "wait", "manual");
            return;
        }
        if (!consent) {
            persistCredentials(keyValue, false);
            setStatusLine("Key saved · read the disclosure and tick the acceptance box to load data.", "wait", "manual");
            return;
        }

        saveRunning = true;
        if (button) button.disabled = true;
        try {
            persistCredentials(keyValue, true);
            setStatusLine("Saving and loading data…", "unknown", "manual");
            let outcome = await withTimeout(runScanNow(), 20000);
            if (outcome?.kind === "error" && outcome.http === 400) {
                setStatusLine("FFScouter did not accept the first request · retrying once…", "wait", "manual");
                await wait(800);
                outcome = await withTimeout(runScanNow(), 20000);
            }

            if (!suiteDataEnabled()) {
                setStatusLine("Setup was not saved. Check the API key and the acceptance box.", "stop", "manual");
            } else if (outcome?.kind === "loaded" && outcome.members > 0) {
                setStatusLine(`Saved · ${outcome.members} members loaded`, "go", "manual");
                setIfChanged(button, "Save & load data");
            } else if (outcome?.kind === "norows") {
                setStatusLine("Saved · no member rows on this page to load yet", "wait", "manual");
            } else if (outcome?.kind === "degraded") {
                setStatusLine("Saved · FFScouter is temporarily unavailable · trying again shortly", "wait", "manual");
            } else if (outcome?.kind === "error") {
                setStatusLine(failures.ff || "FFScouter request failed", "stop", "manual");
                setIfChanged(button, "Retry FFScouter");
            } else if (!isPageVisible()) {
                // The tab or the window lost focus while loading: every request waits until the page is in front again, so
                // nothing failed. Shown as an automatic line, so it goes away by itself once the data has loaded.
                setStatusLine("Paused · this tab is not active. The data loads when you come back to it.", "wait", "auto");
                setIfChanged(button, "Save & load data");
            } else {
                setStatusLine("Saved, but the data did not load. Tap Retry FFScouter.", "stop", "manual");
                setIfChanged(button, "Retry FFScouter");
            }
        } finally {
            saveRunning = false;
            if (button) button.disabled = false;
        }
    }

    function clearCachedData() {
        const keys = [];
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index) || "";
                if (
                    key.startsWith(CACHE_PREFIX) ||
                    key.startsWith(LEGACY_PROFILE_EST_PREFIX) ||
                    key === STATUS_STORAGE_KEY ||
                    key === TRAVEL_ACTIVE_KEY ||
                    key === TRAVEL_HISTORY_KEY
                ) keys.push(key);
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch {}
        memoryCache.clear();
        factionDirectoryCache.clear();
        ffFlightCache.clear();
        ffData.clear();
        snapshot = null;
        activeSnap = null;
        activeSnapUpdatedAt = 0;
        clearRendered();
        scheduleStatusRefresh(0);
        scheduleScan(0);
        return keys.length;
    }

    function clearCachedDataWithConfirmation() {
        if (!window.confirm("Clear cached FF, profile, status and travel data? Manual values, notes, API key and preferences will be kept.")) return;
        const removed = clearCachedData();
        setStatusLine(`Cleared ${removed} cached record${removed === 1 ? "" : "s"}.`, "go", "manual");
        updatePanel();
    }

    // ---------------------------------------------------------------------------------------------
    // Member card: the FF details, the status details and the manual FF fields
    // ---------------------------------------------------------------------------------------------

    function elementTextWithoutOwn(element) {
        if (!element) return "";
        try {
            const clone = element.cloneNode(true);
            clone.querySelectorAll("[data-kss]").forEach(node => node.remove());
            return normalizeText(clone.textContent);
        } catch {
            return "";
        }
    }

    function getPlayerDisplayName(identity, playerId) {
        const anchor = identity?.anchor;
        const candidates = [
            identity?.resolvedName,
            elementTextWithoutOwn(anchor),
            anchor?.getAttribute?.("title"),
            anchor?.getAttribute?.("aria-label"),
            anchor?.querySelector?.("img[alt]")?.getAttribute("alt"),
            anchor?.querySelector?.("img[title]")?.getAttribute("title"),
            nameByAnchor.get(anchor)
        ];

        for (const candidate of candidates) {
            const clean = String(candidate || "").replace(/\s+/g, " ").trim();
            if (clean && !/^(profile|view profile)$/i.test(clean)) return clean;
        }

        return `Player ${playerId}`;
    }

    function appendLinkedMessage(content, message, linkedPlayer) {
        const name = normalizeText(linkedPlayer?.name);
        const id = positiveNumber(linkedPlayer?.id);
        const index = name ? message.toLowerCase().indexOf(name.toLowerCase()) : -1;

        if (!id || !name || index < 0) {
            content.append(document.createTextNode(message));
            return;
        }

        content.append(document.createTextNode(message.slice(0, index)));

        const link = document.createElement("a");
        link.className = "kss-link";
        link.href = `https://www.torn.com/profiles.php?XID=${id}`;
        link.textContent = message.slice(index, index + name.length) || name;
        link.setAttribute("aria-label", `Open ${name}'s Torn profile`);
        content.append(link);

        content.append(document.createTextNode(message.slice(index + name.length)));
    }

    function capitalise(value) {
        const text = String(value || "");
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    function cardHtml(info, playerName) {
        const manual = info.manual;
        const resolved = info.resolved;
        // Only an existing manual value is put into the field. The estimate is shown above, never saved by accident.
        const hasManualBs = Boolean(positiveNumber(manual?.battleStats));
        const bs = hasManualBs ? compactParts(manual.battleStats) : { value: "", unit: "M" };
        const age = estimateAge(resolved.lastUpdated);
        const source = sourceLabel(resolved.source);

        const ffSummary = resolved.fairFight
            ? `${resolved.fairFight.toFixed(2)} · ${source}${age.label ? ` · ${age.label}` : ""}`
            : "No FF score";

        const estimateHuman =
            resolved.battleStatsHuman ||
            (resolved.battleStats ? formatCompact(resolved.battleStats) : "") ||
            "No estimate";

        const estimateSource = resolved.battleStats || resolved.battleStatsHuman
            ? source
            : "";

        return `
            <a class="kss-name" href="https://www.torn.com/profiles.php?XID=${info.playerId}">${escapeHtml(playerName)}</a>
            <div class="kss-line kss-dim">FF Scouter: ${escapeHtml(ffSummary)}</div>
            <div class="kss-line kss-dim">Estimated stats: ${escapeHtml(estimateHuman)}${estimateSource ? ` · ${escapeHtml(estimateSource)}` : ""}</div>
            <div class="kss-block" data-k="statusblock"></div>
            <label class="kss-check"><input data-k="c-use" type="checkbox"${Number(manual?.ff) > 0 ? " checked" : ""}><span class="kss-box"></span><span class="kss-checktext">Use custom Fair Fight</span></label>
            <label class="kss-field"><span class="ksui-label">Custom Fair Fight</span>
                <input data-k="c-ff" type="number" inputmode="decimal" min="0.1" max="20" step="0.01" value="${Number(manual?.ff) > 0 ? manual.ff : ""}"></label>
            <div class="kss-twin">
                <label class="kss-field"><span class="ksui-label">Battle stats (optional)</span>
                    <input data-k="c-bs" type="number" inputmode="decimal" min="0.1" step="0.1" placeholder="e.g. 1.2" value="${bs.value}"></label>
                <label class="kss-field kss-unit"><span class="ksui-label">Unit</span>
                    <select data-k="c-unit">
                        <option value="K"${bs.unit === "K" ? " selected" : ""}>K</option>
                        <option value="M"${bs.unit === "M" ? " selected" : ""}>M</option>
                        <option value="B"${bs.unit === "B" ? " selected" : ""}>B</option>
                    </select></label>
            </div>
            <label class="kss-field"><span class="ksui-label">Note (optional)</span>
                <input data-k="c-note" type="text" value="${escapeHtml(manual?.note || "")}"></label>
            <div class="kss-actions">
                <button type="button" class="kss-btn" data-act="card-clear">Clear custom</button>
                <button type="button" class="kss-btn" data-act="card-close">Close</button>
                <button type="button" class="kss-btn kss-primary" data-act="card-save">Save</button>
            </div>
        `;
    }

    function fillStatusBlock(block, info) {
        block.textContent = "";
        const label = info.status === "unknown" ? "Status unknown" : capitalise(info.status);
        const description = info.description || info.details;
        // The status word is not repeated when the description already starts with it ("Travelling" = "Traveling").
        const fold = value => normalizeText(value).toLowerCase().replace(/^travelling/, "traveling");
        const foldedLabel = fold(label);
        const foldedDescription = fold(description);
        const repeated = Boolean(foldedDescription) && foldedDescription.startsWith(foldedLabel) &&
            !/[a-z]/.test(foldedDescription.charAt(foldedLabel.length));
        const first = document.createElement("div");
        first.className = "kss-line";
        appendLinkedMessage(first, (repeated ? [description] : [label, description]).filter(Boolean).join(" · "), info.linkedPlayer);
        block.append(first);

        if (info.until) {
            const end = document.createElement("div");
            end.className = "kss-line";
            end.textContent = info.timerKind === "estimate"
                ? `Arrives ~${formatTctClock(info.until)} TCT`
                : `Ends ${formatTctClock(info.until)} TCT`;
            block.append(end);
        }

        for (const part of timerDetailParts(info)) {
            if (part === info.description || part === info.details) continue;
            const line = document.createElement("div");
            line.className = "kss-line kss-dim";
            line.textContent = part;
            block.append(line);
        }
    }

    function cardHasFocus() {
        const active = document.activeElement;
        return Boolean(
            cardEl && active && cardEl.contains(active) &&
            /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)
        );
    }

    function openCard(row) {
        const identity = rowIdentity(row);
        if (!identity?.id) return;
        closeCard();

        const info = rowInfo(row, 0, activeSnap || matchingSnapshot());
        const playerName = getPlayerDisplayName(identity, identity.id);

        cardEl = document.createElement("section");
        cardEl.id = CARD_ID;
        cardEl.className = "ksui kss-card";
        cardEl.setAttribute("data-ks-app", "scout");
        cardEl.setAttribute("data-kss", "1");
        cardEl.setAttribute("role", "dialog");
        cardEl.setAttribute("aria-label", "Member details");
        cardEl.innerHTML = cardHtml(info, playerName);
        fillStatusBlock(cardEl.querySelector('[data-k="statusblock"]'), info);
        cardEl.addEventListener("click", event => {
            event.stopPropagation();
            const origin = event.target instanceof Element ? event.target : null;
            const control = origin?.closest("[data-act]");
            if (!control || !cardEl?.contains(control)) return;
            if (control.dataset.act === "card-close") closeCard();
            else if (control.dataset.act === "card-clear") clearCustomFromCard(row, identity.id);
            else if (control.dataset.act === "card-save") saveCustomFromCard(row, identity.id);
        });
        cardOpenedAt = Date.now();
        document.body.appendChild(cardEl);
    }

    function closeCard() {
        cardEl?.remove();
        cardEl = null;
    }

    // Same save and clear logic as the old edit box.
    function clearCustomFromCard(row, playerId) {
        setManual(playerId, null);
        closeCard();
        decorate();
    }

    function saveCustomFromCard(row, playerId) {
        if (!cardEl) return;
        const use = cardEl.querySelector('[data-k="c-use"]').checked;
        const ff = Number(cardEl.querySelector('[data-k="c-ff"]').value);
        const battleStats = parseCompact(
            cardEl.querySelector('[data-k="c-bs"]').value,
            cardEl.querySelector('[data-k="c-unit"]').value
        );
        const note = cardEl.querySelector('[data-k="c-note"]').value.trim();

        const useFF = use && Number.isFinite(ff) && ff > 0 ? ff : null;
        // Nothing to keep (custom FF off or empty, no battle stats, no note): the manual entry is removed, not saved empty.
        if (!useFF && !battleStats && !note) setManual(playerId, null);
        else setManual(playerId, { ff: useFF, battleStats, note });

        closeCard();
        decorate();
    }

    // A tap on the FF mark or on a countdown opens the card. Registered once, in the capture phase, so the tap
    // never also follows a link the mark sits inside.
    function onDocumentClick(event) {
        if (destroyed || !mounted) return;
        const origin = event.target instanceof Element ? event.target : null;
        const mark = origin?.closest?.(".kss-fftag,.kss-timer");
        if (!mark) return;
        event.preventDefault();
        event.stopPropagation();
        const row = mark.closest(".table-body > *");
        if (row) openCard(row);
    }

    // A tap on one of Torn's own column headers of a member list (Lvl, Days, Status, Members ...) while FF, Status or
    // Soonest sorting is chosen: this script goes to Original and lets Torn sort. It calls neither preventDefault nor
    // stopPropagation and makes no click of its own. Never inside a Ranked War surface and never on a blocked route.
    let headerListenerOn = false;

    function onDocumentHeaderTap(event) {
        if (destroyed || !mounted || blockedRoute() || settings.sort === "original") return;
        const origin = event.target instanceof Element ? event.target : null;
        if (!origin || origin.closest(RW_SURFACE_SELECTOR)) return;
        const header = origin.closest(".table-header");
        if (!header || !factionMemberLists().some(list => list.contains(header))) return;
        updateSettings({ sort: "original" });
        dlog("a Torn column header was tapped: sorting is now Original");
        // Right away (before Torn sorts on this same tap): the rows go back to the order Torn last had, then Torn sorts them.
        decorate();
    }

    function connectHeaderListener() {
        if (headerListenerOn) return;
        headerListenerOn = true;
        document.addEventListener("pointerup", onDocumentHeaderTap, true);
    }

    function disconnectHeaderListener() {
        if (!headerListenerOn) return;
        headerListenerOn = false;
        document.removeEventListener("pointerup", onDocumentHeaderTap, true);
    }

    function onDocumentPointerDown(event) {
        if (!cardEl) return;
        const origin = event.target instanceof Element ? event.target : null;
        if (origin && (cardEl.contains(origin) || origin.closest(".kss-fftag,.kss-timer"))) return;
        // The phone's keyboard stays up while a field has focus: the first tap outside only lets go of the field.
        if (cardHasFocus()) {
            try { document.activeElement.blur(); } catch {}
            return;
        }
        closeCard();
    }

    function onDocumentScroll(event) {
        if (!cardEl) return;
        const origin = event.target instanceof Node ? event.target : null;
        if (origin && cardEl.contains(origin)) return;
        // Opening a field makes the phone scroll the page; that must not close the card. Neither must the
        // tail of a flick that was still running when the card opened.
        if (cardHasFocus() || Date.now() - cardOpenedAt < 500) return;
        closeCard();
    }


    // ---------------------------------------------------------------------------------------------
    // Start and stop
    // ---------------------------------------------------------------------------------------------

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        settings = loadSettings();
        retireLegacyModules();
        retireLegacyWarTools();
        removeLegacyDom();
        reconcileDataState({ purgeApiCache: true });
        loadPublishedStatusSnapshot();

        observer = new MutationObserver(mutations => {
            if (destroyed) return;
            retireLegacyWarTools();
            if (blockedRoute() || !isPageVisible()) return;

            // A removed node is no longer inside its surface, so the place of the change is checked too.
            const relevant = mutations.some(mutation =>
                !(mutation.target instanceof Element && mutation.target.closest(RW_SURFACE_SELECTOR)) &&
                [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some(isRelevantMutationNode)
            );

            if (relevant) scheduleScan();
        });

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", onVisibilityChange);
        window.addEventListener("blur", onVisibilityChange);
        window.addEventListener("hashchange", onRouteChange);
        window.addEventListener("popstate", onRouteChange);
        window.navigation?.addEventListener?.("currententrychange", onRouteChange);
        document.addEventListener("click", onDocumentClick, true);
        document.addEventListener("pointerdown", onDocumentPointerDown, true);
        document.addEventListener("scroll", onDocumentScroll, { capture: true, passive: true });
        heartbeatTimer = setInterval(routeHeartbeat, ROUTE_HEARTBEAT_MS);

        // DETECT. On a Ranked War route nothing is watched and nothing is read.
        if (!blockedRoute()) {
            connectObserver();
            scheduleScan(0);
            startDetectProbe();
        }

        window[INSTANCE_KEY] = {
            version: VERSION,
            component: NAME,
            getStatusSnapshot: () => snapshot || null,
            getSettings: () => ({ ...settings }),
            getSuiteStatus: suiteDiagnostics,
            refreshStatus: () => refreshStatusCore(false),
            forceStatusRefresh: () => refreshStatusCore(true),
            destroy
        };
        dlog("started on", location.pathname, blockedRoute() ? "(no list work on this route)" : "");
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        disposeContent({ disconnectObserverToo: true });
        clearTimeout(routeTimer);
        routeTimer = null;
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        manageClock(false);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("focus", onVisibilityChange);
        window.removeEventListener("blur", onVisibilityChange);
        window.removeEventListener("hashchange", onRouteChange);
        window.removeEventListener("popstate", onRouteChange);
        window.navigation?.removeEventListener?.("currententrychange", onRouteChange);
        document.removeEventListener("click", onDocumentClick, true);
        document.removeEventListener("pointerdown", onDocumentPointerDown, true);
        document.removeEventListener("scroll", onDocumentScroll, true);
        document.getElementById(STYLE_ID)?.remove();
        if (window[INSTANCE_KEY]?.destroy === destroy) delete window[INSTANCE_KEY];
    }

    init();
})();
