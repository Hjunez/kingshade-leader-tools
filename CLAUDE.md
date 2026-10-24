# CLAUDE.md — kingshade-leader-tools

Gäller varje Claude-session i det här repot, även i molnet. Kingshade fattar besluten, testar i verkligheten och står till svars utåt. Du är utföraren.
Står två regler mot varandra går ett uttryckligt beslut från Kingshade före en allmän regel; mellan två av hans beslut gäller det senaste. Säg i svaret vilka två det var.

## 1. Vad repot är
- GitHub Pages-sajten https://hjunez.github.io/kingshade-leader-tools/ med sidor för faktionen PoIitically Incorrect och de userscripts som medlemmarna installerar och uppdaterar via `@updateURL`/`@downloadURL`.
- Alla KS-skript publiceras här, gren main. Varje fil på main är live direkt för alla som har skriptet.
- Måste ligga kvar: `KS_War_Tools_Torn_PDA.user.js` (tomt pensionsskript som tystar gamla installationer) och de fyra bilderna som `war-dibs-guide.html` använder.
- Gamla installationer från det avvecklade repot Kingshade-Torn-Suite hämtar sina uppdateringar härifrån. Ändra aldrig ett filnamn som ett skript eller en sådan brygga pekar på.
- Ingen fil tas bort eller byter namn utan att Kingshade sagt det uttryckligen.
- `KS_Torn_War_Dibs_PDA_test.user.js` hör till ett annat arbete och rörs bara när uppdraget säger det.

## 2. Arbetssätt
- Aldrig push till main. Alltid egen gren och en pull request. Aldrig merge — bara Kingshade slår ihop en PR. Aldrig force push, `reset --hard` eller omskriven historik.
- En huvudändring per PR. Ingen ny version innan den nuvarande prövats i verklig körning; rättningar av en oprövad version görs i samma version.
- Berör ändringen ett skript: höj `@version` och ändra inget annat skript. `@updateURL` och `@downloadURL` ändras aldrig utan att uppdraget säger det.
- Orsaken okänd: mät, bygg inte. En hypotes i taget, och säg vad som skulle motbevisa den. "Det är nog cache", "installera om" och "rensa lagring" är aldrig första steget.
- Tre misslyckade försök på samma spår: skriv en fullständig handoff och stoppa. Inget fjärde försök.
- Kör eller simulera själv allt som går och lägg till ett regressionstest för det som ändrats. Be Kingshade bara om det som kräver hans telefon eller PC, riktig Torn-data eller riktiga spelare.
- Allt som byggs är på engelska: gränssnitt, kod, kommentarer, commit-meddelanden, PR-texter, README och CHANGELOG. Commit-rubriken skrivs "<Skript> <version> <ändring>", under 50 tecken.
- PR-texten (engelska) innehåller: vad som ändrats; status per plattform, t.ex. `PC: CANDIDATE · PDA: CANDIDATE`; numrerade teststeg som går att följa utan att gissa. Ditt svar till Kingshade ger teststegen på svenska, en plattform i taget.
- Lägesord: VERIFIERAT · CANDIDATE · PLANERAT · ANTAGANDE. Molnet kan som mest nå CANDIDATE: syntetiska tester räcker aldrig för att påstå att något fungerar, och verklig körning sker på Kingshades enheter.

## 3. Torns regler går först
Torns Scripting Abuse-regel (påföljd: game ban), i korthet:
- Skript får bara använda data från Torns API eller från en sida som spelaren själv har laddat och aktivt tittar på.
- Inga extra icke-API-anrop till Torn, ingen skrapning av sidor som inte visas, inget försök att kringgå CAPTCHA, ingen data ur sidor utan fokus som skickas vidare, ger larm eller drar uppmärksamhet till sig själv eller ett annat fönster.
- Icke-API-anrop som inte startas direkt och manuellt av användaren är förbjudna och kan spåras.
- Skadlig eller odokumenterad funktionalitet är förbjuden. API-verktyg ska följa Torns API-villkor (torn.com/api.html — hämtas inte av Claude).

Ur Torns API-villkor:
- 100 anrop/minut över alla nycklar. Gränsen kan ändras utan förvarning — håll den i EN konstant.
- Ett verktyg som ber om en nyckel ska upplysa om syfte, lagring, lagringstid, delning, nyckelhantering och åtkomstnivå.
- Torn-lösenord efterfrågas aldrig.
- Service-cache upp till 30 s; global cache (itemmarket, properties, rentals, companies, bazaar, bounties) går inte att kringgå. Cachade svar drar inte kvot — använd aldrig cache-buster.
- En nyckel som felar som avstängd (kod 2/10/13/18) tas bort och används inte igen. Kod 5/9/17 betyder "försök senare".
- Custom-nycklar börjar med bara `timestamp` och `lookup`. Dokumentera exakt vilka selections som krävs, annars får användaren kod 16 som ser ut som en bugg.
- Inget verktyg utför handlingar åt en annan spelare; delade verktyg visar data, agerar aldrig. En hittad exploit rapporteras, den används inte.

Compliance-baslinjen:
1. Endast Torn-API eller data på den manuellt öppnade och aktivt visade sidan.
2. Inga extra fetch/XHR/WebSocket mot Torns spelsidor.
3. Ingen bakgrundsövervakning eller larm baserat på skrapad siddata.
4. Inga dolda eller off-screen iframes.
5. Inga automatiska klick eller navigering.
6. En användarinput ger högst en åtgärd.
7. Custom API Key obligatorisk för nya API-baserade skript.
8. FFScouter Premium får aldrig bli ett obligatoriskt betalberoende.
9. Captcha rörs aldrig — läses, döljs, klickas bort eller autofylls aldrig. Skriptet pausar sin egen UI medan en captcha visas.
10. Ingen odokumenterad funktionalitet: varje släppt skript upplyser om vad det gör, vilka nätanrop det gör, vad det lagrar, vad som delas och vilken nyckelnivå det kräver.

## 4. Plattformar och skript
- PC: Tampermonkey i Chrome. Uppdatering: Tampermonkey-ikonen → Utilities → Check for userscript updates. Klicka aldrig Reinstall för en version som redan är installerad.
- Torn PDA: appens egen skripthanterare, Settings → Advanced browser settings → Manage scripts. Uppdatering: pennan vid skriptet → Configure (raden "Remote load/update") → Check for Update → Update. Ordet Tampermonkey hör bara till PC.
- PC och PDA är likvärdiga; ingen är primär. De är separata filer och separata leveranser. Bevis från den ena plattformen säger ingenting om den andra; status anges per plattform.
- Algoritmer och rena datamodeller får delas. DOM, UI, livscykel, selektorer och navigation är plattformsspecifika.
- Torn PDA lägger inte till ett skript med samma `@name` som ett befintligt, men visar ändå "Script successfully added!". Ett testbygge för PDA får därför eget `@name`.
- Torn PDA (v3.17.0, PDA_httpGet/PDA_httpPost) svarar inte alls på ett identiskt anrop som skickas inom 2 s efter det första. Ska samma POST skickas om, vänta över 2 s.
- Varje userscript börjar direkt med `// ==UserScript==` — ingen banner, ingen "use strict", ingen sourcemap före.
- Nätanrop bara till api.torn.com och värdarna i skriptets `@connect`. En ny värd kräver Kingshades godkännande. Ingen pollning eller övervakning i bakgrunden.
- Undantag godkänt av Torn staff (IceBlueFire): honor bar-bilder får laddas direkt från torn.com/images/honors/<id>/f.png, utan kopiering eller lagring; honor_id läses ur user profile i API:t.
- Extern data (API, sidan, FFScouter) valideras och saneras innan den visas.
- Skydd mot dubbelinjicering med en instansnyckel på window; samma lyssnare installeras aldrig två gånger. Observers, timers och anrop stoppas när sidan lämnas. Ett gammalt svar skriver aldrig över ett nyare.
- Lagring har eget namnrum och versionsnummer. Ändrat format migreras; gammal data raderas inte. Uppdateringar bevarar användarens inställningar och nycklar.
- Cache sparar värde, tidpunkt, källa och schemaversion. Gamla värden behandlas aldrig som färska.
- Fail-closed: visa WAIT, UNKNOWN, STALE, OFFLINE eller CHECKING hellre än att gissa. Ett fel visas aldrig som ett giltigt värde. Det gäller det som visas som beslut; datainsamlingen fortsätter.
- Läs `@version` i filen, inte README, innan du påstår något om aktuell version.

## 5. Fasta beslut — rivs bara upp av Kingshade
- Kingshade-Torn-Suite är avvecklat och rörs aldrig. Bryggfilerna där pekar hit med `@updateURL` och måste fortsätta fungera.
- FFScouter Premium köps aldrig och föreslås aldrig som lösning. FFScouters skript ändras aldrig av oss.
- Andras Torn-nycklar lagras aldrig på en KS-server.
- Resekapaciteten heter "Item slots" i allt KS bygger, aldrig "Seats".
- Sjukhustid över 48 timmar visas som tid (t.ex. "Hosp 2d10h") och "Locked", lika överallt. Bara visningen: DIBS-regeln och maxHospitalSeconds (48 h) ändras inte.
- KS FFScouter Call Guard och KS War Tools for Torn PDA är avvecklade. War Tools ingår i KS Scout från 0.9.0; Scout rör aldrig Ranked War-listorna.
- War Dibs: inga nya versioner under ett pågående krig, utom akut rättning av fel som hindrar DIBS. Undantag (2026-10-24): stoppet hävt för kriget mot Reckless Pirate Co; det gäller igen från nästa krig.
- På PC gäller KS eget skript tillsammans med FF Scouter och War Stuff Enhanced. WSE äger radordningen i Torns roster — KS sorterar aldrig den listan. Sortering och filter på FF och stats i krigslistan byggs bara för War Dibs PDA.
- DIBS-UI bevaras inte vid blur: hela bryggan avmonteras och native Attack-celler återställs. Ett syntetiskt scroll-event får aldrig återaktivera.
- Est-rutan: FF och stats visas som små färgade märken före namnet i KS Scout och War Dibs, samordnat så att samma värde inte visas två gånger.
- Market Advisor är pausad i väntan på ett ombygge. Bygg inte vidare på den utan Kingshades beslut.
- Medlemmarna uppdaterar när Kingshade säger till. Anta aldrig att en ny version inte hinner ut till faktionen.

## 6. Hemligheter och nät
- Nycklar, tokens och lösenord hamnar aldrig i kod, repo, commit, PR-text, loggar eller svar. Lösenord efterfrågas aldrig.
- Filer som håller nycklar (`.env` och liknande) läses aldrig ut, skrivs aldrig ut och kopieras aldrig.
- Hämta ingenting från torn.com eller *.torn.com och öppna ingen torn.com-sida. api.torn.com anropas bara när uppdraget uttryckligen säger det. Behövs något från Torn: ge Kingshade hela länken och säg exakt vad han ska hämta.
- Tester körs mot sparade sidor och testdata; anrop till *.torn.com i tester blockeras eller mockas.
- Capture-fixturer innehåller aldrig andras privata data. De är sanerade och verifierade sanerade innan de läggs i repot, minimerade till selektorer och strukturell metadata.

## 7. Svar till Kingshade
- Svenska. Kort. Första konkreta steget inom fem rader. Frågar han: svara bara på frågan.
- Inga kodblock, kommandon, diffar eller checksummor i svaret — utom det han ska klistra in, som alltid ligger i ett kopierbart kodblock.
- Instruktioner numreras. Stegkedjan slutar vid första punkten där han ska rapportera tillbaka. Skriv vad han gör och vad han ska se; hänvisa aldrig till tester med nummer.
- Varje instruktion slutar med en rad "Kontrollerat mot: …" som säger exakt var steget är kontrollerat. Går det inte: "Inte kontrollerat: …" och varför.
- En orsak skrivs aldrig som fakta utan bevis. VERIFIERAT och ANTAGANDE står var för sig, med vad som skulle avgöra saken.
- Säg aldrig "klart" eller "fungerar" om något som inte prövats i verklig körning.
- Instruktioner för PC och för telefonen ges aldrig i samma svar. Knapp- och menynamn skrivs på det språk hans skärm visar. Länkar skrivs hela (https://…).
- Be honom aldrig göra om något han redan gjort eller svarat på. Han får bara en uppgift när inget annat underlag kan ge samma svar.
