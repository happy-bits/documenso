# Beroenden mellan paket — förklarat enkelt

En lättläst version av [Workspace Dependency Graph](./workspace-dependencies.md). Samma slutsatser, men utan tabellerna och utan att du behöver veta vad Turborepo är i förväg. Alla siffror kommer från originaldokumentet.

## Bakgrund: vad är det vi tittar på?

Projektet är en **monorepo** — ett enda git-repo som innehåller 15 separata "paket": två appar under `apps/` och tretton bibliotek under `packages/`. Tanken med uppdelningen är att varje paket ska ha ett tydligt ansvar och bara använda de andra paket det faktiskt behöver.

Några av de viktigaste:

| Paket | Ansvar |
| --- | --- |
| `apps/remix` | Själva webbappen — det användaren ser |
| `packages/ui` | Delade React-komponenter (knappar, formulär, dialoger) |
| `packages/lib` | Affärslogiken — vad som faktiskt händer när ett dokument skickas |
| `packages/trpc` | API-lagret mellan webbläsare och server |
| `packages/prisma` | Databasen och dess schema |
| `packages/ee` | Betalfunktioner ("enterprise edition") |
| `packages/auth` | Inloggning och sessioner |
| `packages/signing` | Den kryptografiska signeringen av PDF:er |

Dokumentet svarar på en enda fråga: **vem använder vem, egentligen?**

## Huvudpoängen: två kartor som inte stämmer överens

Det finns två sätt att ta reda på beroendena, och de ger olika svar.

**Den deklarerade kartan** är vad varje paket *säger* att det behöver. Det står i filen `package.json` i varje paket — en lista över vilka andra paket det är beroende av.

**Den verkliga kartan** är vad koden *faktiskt* importerar, alltså vad som står högst upp i filerna när man läser dem.

Av 42 verkliga beroenden är **20 inte deklarerade någonstans**.

Koden fungerar ändå. Det beror på att npm lägger alla paket i en gemensam mapp (`node_modules/@documenso/`) där allt kan hitta allt, oavsett vad som står i listorna. Men det betyder att bygget fungerar av en lycklig omständighet snarare än enligt plan.

Varför det spelar roll: **Turborepo**, verktyget som bestämmer i vilken ordning saker byggs och vad som kan återanvändas från cachen, läser bara den deklarerade kartan. De 20 odeklarerade beroendena är osynliga för det.

> En liknelse: tänk på en organisationsplan där hälften av de faktiska rapporteringsvägarna saknas. Det fungerar i praktiken eftersom alla sitter i samma rum och pratar med varandra ändå — men planen ljuger, och den som försöker planera efter den blir lurad.

## `lib` är navet — och flaskhalsen

`packages/lib` är inblandat i 11 av de 15 tyngsta beroendena. Nästan allt annat använder det, och det använder självt nästan allt annat.

Orsaken är att `lib` innehåller väldigt olika saker på en gång:

- serverlogik (282 filer under `server-only/`)
- bakgrundsjobb (73 filer under `jobs/`)
- React-komponenter som körs i webbläsaren (`client-only/`)
- delade konstanter och hjälpfunktioner

Den praktiska konsekvensen: **ändrar du något i `lib` måste nästan hela projektet byggas om.** Även om din ändring bara rörde en serverfunktion så vet inte byggverktyget det — det ser bara att `lib` har ändrats, och att `trpc`, `api`, `auth`, `ee`, `ui` och båda apparna alla beror på `lib`.

Lösningen som föreslås är att dela upp `lib` längs de gränser som **redan finns i mappstrukturen**: `server-only`, `client-only` och `universal`. Då kan varje paket bero på bara den del det använder. Det är inte en omskrivning, mer en flytt.

## Cirkulära beroenden

Ett cirkulärt beroende är när A använder B *och* B använder A. Det är oftast ett tecken på att ansvarsgränsen mellan dem är otydlig.

Det finns **12 sådana par**. Men de är inte lika allvarliga, och lösningen skiljer sig — därför delar dokumentet upp dem i fyra grupper.

### 1. Ofarliga — låt dem vara

Tre av cirklarna består av ett enda `import type`. Det betyder att ett paket lånar en *typ* från appen — information som bara TypeScript använder för att kontrollera koden, och som försvinner helt när koden kompileras. Ingenting av det finns kvar i den färdiga produkten.

Det är priset för att ha typsäkerhet hela vägen från databas till webbläsare, vilket är en av de större fördelarna med den här sortens uppsättning. Värt att behålla — men inte värt att låta växa.

### 2. Bara i utvecklingsläge — enkelt att lösa

`packages/prisma` (databasen) använder `lib` (affärslogiken), vilket är bakvänt: databaslagret ska ligga längst ner och inte känna till lagren ovanför.

Men nästan allt kommer från **seed-skripten** — de skript som fyller databasen med testdata när man sätter upp en utvecklingsmiljö. De anropar affärslogiken för att skapa realistiska testdokument, vilket är rimligt i sig. Koden hamnar aldrig i produktion.

Lösning: flytta `prisma/seed/` till ett eget paket som får bero på både `prisma` och `lib`. Då försvinner två cirklar utan att någon logik behöver ändras.

### 3. Den som verkligen bör fixas

`lib` importerar från `ui` (komponentbiblioteket) i 10 filer. Den här kör i produktion, till skillnad från de två grupperna ovan.

Det tydligaste enskilda symptomet: **`packages/lib/server-only/document/send-document.ts` importerar från `ui`.** Det är serverkoden som skickar ut dokument för signering — den har ingen rimlig anledning att veta något om knappar och formulär.

Orsaken är att `lib` innehåller React-komponenter som egentligen hör hemma i `ui` (bland annat `client-only/providers/` och `universal/field-renderer/`). Eftersom de ligger i `lib` ärver hela `lib` deras beroenden.

Åt andra hållet finns samma problem i mindre skala: fyra komponenter i `ui` hämtar sin egen data via `trpc` istället för att få den skickad till sig. Det är också förklaringen till att just de komponenterna är svåra att återanvända — de går inte att placera var som helst, eftersom de drar med sig ett API-anrop.

Den här gruppen löser sig till stor del av sig själv om man gör uppdelningen av `lib` som beskrevs ovan.

### 4. Enterprise-koden läcker nedåt

`packages/ee` innehåller betalfunktionerna. Tanken är att det ska vara ett löv längst ut i grafen — något appen väljer att använda, medan kärnprodukten inte känner till att det finns.

Men fyra paket sträcker sig *uppåt* in i `ee`: `lib`, `trpc`, `ui` och `api`. Det handlar om kontroller av licenser, platsantal och fakturering, insprängda i logik som annars är gemensam.

Värst: **`document-router/create-document.ts`** — alltså grundflödet för att skapa ett dokument, den mest centrala funktionen i hela produkten — har ett inbyggt beroende till betalfunktionerna.

Dessutom finns här den enda *äkta* tvåvägscirkeln: `auth` anropar `ee`, och `ee` anropar tillbaka in i `auth`. Båda i kod som körs i produktion.

Standardlösningen kallas *beroendeinvertering*: `lib` definierar ett gränssnitt för vad det behöver veta (typ "får den här organisationen skapa fler dokument?"), `ee` implementerar det, och appen kopplar ihop dem vid uppstart. Då pekar alla pilar nedåt igen. Det tar bort fyra beroenden på en gång.

## Småsaker

**Sju deklarerade beroenden används aldrig i koden.** Sex av dem är dock helt korrekta — de används i konfigurationsfiler istället för i vanlig kod (Tailwind-konfiguration via `require`, och TypeScript-konfiguration via `extends`). Ett automatiskt verktyg skulle flagga dem felaktigt.

**Ett är verkligt skräp:** `lib → assets`. Paketet `@documenso/assets` förekommer ingenstans i `packages/lib` utöver i dess egen `package.json`. Det kan tas bort direkt.

**`app-tests` står medvetet utanför hela grafen.** Playwright-testerna deklarerar inga beroenden till andra paket alls — de pratar med appen över HTTP och med databasen över rå SQL, precis som en riktig användare eller ett externt system skulle göra. Det är ett medvetet val, och skälet står redan skrivet i koden (`e2e/fixtures/database.ts`).

## Förslagen, i ordning

1. **Deklarera de 20 saknade beroendena** (eller ta bort dem)
2. **Ta bort det döda `lib → assets`**
3. **Flytta ut `prisma/seed/`** till eget paket — tar bort två cirklar
4. **Vänd på `ee`-beroendena** bakom ett gränssnitt — tar bort fyra beroenden, inklusive den enda äkta tvåvägscirkeln
5. **Dela upp `lib`** längs `server-only` / `client-only` / `universal` — tar bort de återstående cirklarna och krymper ombyggnaderna

Punkt 1 är billigast och ger mest. Den gör inte koden bättre i sig — men den gör problemen **synliga i `package.json`**, där de dyker upp i kodgranskningar. Just nu är de osynliga om man inte läser igenom alla filer.

## Vill du kontrollera själv?

Originaldokumentet innehåller kommandot som producerar siffrorna, plus två varningar om vad som räknas fel om man gör mätningen naivt. Se [Workspace Dependency Graph](./workspace-dependencies.md#reproducing-this).

## FAQ

### Hur definierar du "paket" (i "15 separata paket")?

Ett paket är en mapp som har en egen `package.json` och som ligger under ett av mönstren i `workspaces`-fältet i repots rot-`package.json`:

```json
"workspaces": ["apps/*", "packages/*"]
```

npm:s egen term för detta är *workspace*. Jag skriver "paket" i den här texten eftersom det är mer bekant, men det är samma sak.

Räkningen blir 15: två under `apps/` (`remix`, `openpage-api`) och tretton under `packages/` (`api`, `app-tests`, `assets`, `auth`, `ee`, `email`, `lib`, `prisma`, `signing`, `tailwind-config`, `trpc`, `tsconfig`, `ui`).

En fallgrop: alla paket vars namn börjar med `@documenso/` är **inte** interna. `@documenso/nodemailer-resend` är ett publicerat npm-paket som hämtas från internet — det bara delar namnrymd med de interna. Man kan alltså inte avgöra om något är internt genom att titta på namnet, utan måste jämföra mot `workspaces`-listan.

### Vilka är de två apparna?

**`apps/remix`** är huvudprodukten — hela webbappen som användare loggar in i, laddar upp dokument i och signerar i. Byggd på React Router (tidigare känt som Remix). Det är i praktiken hela Documenso; den importerar från åtta andra paket och står för de tyngsta beroendena i grafen.

**`apps/openpage-api`** är en separat, mycket liten tjänst. Den importerar bara `prisma` och gör det på tre ställen. Namnet syftar på att den levererar öppna, publika mätvärden (open metrics/statistik) om instansen.

Att den ena appen är enorm och den andra nästan tom är värt att notera: `openpage-api` är den enda som håller sig till *ett* beroende, och det är just därför den aldrig nämns i problemavsnitten.

### Vad är tRPC?

(Stavas `tRPC` — litet t, sedan RPC.)

RPC står för *Remote Procedure Call*: idén att man anropar en funktion som råkar köra på en annan dator, men skriver anropet som om funktionen låg lokalt.

tRPC är ett bibliotek som gör exakt det för TypeScript. Utan tRPC skulle man behöva:

1. definiera ett API-format på servern
2. skriva serverkoden
3. skriva typer för anropet på klienten
4. skriva klientkoden som anropar över HTTP

...och hålla steg 1, 3 och 4 i synk manuellt. Missar man det upptäcker man felet först när något kraschar i produktion.

Med tRPC skriver man serverfunktionen en gång, och klienten kan anropa den direkt med full typkontroll. Ändrar du serverfunktionen får du ett kompileringsfel på klienten *innan* koden körs.

I det här projektet är `packages/trpc` alltså mellanlagret mellan webbläsaren och servern. Det innehåller 215 sådana serverfunktioner (kallade *procedures*), organiserade i "routers" per område — `document-router`, `envelope-router`, `admin-router` och så vidare.

Priset för den här typsäkerheten syns i grafen: det är därför `trpc` och appen lånar typer av varandra, vilket ger några av de ofarliga cirklarna.

### Att 20 beroenden inte är deklarerade — är det ett stort problem, och är det svårt att lösa?

**Litet problem just nu. Mycket enkelt att lösa. Bör lösas ändå.**

Varför det är litet: ingenting är trasigt. Bygget fungerar, appen fungerar. Se nästa fråga för mekanismen.

Varför det bör lösas ändå: det är ett problem som *tystar sig självt*. Så länge det fungerar får ingen veta att det finns, och samtidigt blir det gradvis mer sant att bygget vilar på en slump. Den dagen någon byter paketverktyg (till pnpm eller Yarn med striktare regler), aktiverar strikta beroenderegler, eller försöker bygga ett enskilt paket isolerat — då slutar det fungera på ett svårbegripligt sätt, och det gör det vid ett tillfälle som ingen valt.

Den andra kostnaden är att problemen är osynliga. Att `lib` beror på `ee` är en arkitekturfråga värd en diskussion, men just nu står det inte i någon `package.json` — det syns bara om man läser igenom alla filer. Deklarerar man beroendet hamnar det i en fil som granskas vid varje ändring.

Hur svårt: att lägga till 20 rader i tretton `package.json`-filer. Ingen kodändring, ingen risk. Det är den billigaste punkten på hela åtgärdslistan, vilket är varför den ligger först.

### Om Turborepo bara läser den deklarerade kartan, varför funkar det ändå?

Tre skäl som råkar sammanfalla.

**1. npm lägger allt i samma mapp ändå.** Vid installation skapar npm en symlänk för varje workspace in i repots rot: `node_modules/@documenso/lib`, `node_modules/@documenso/ui`, och så vidare. Det kallas *hoisting*. När byggverktyget sedan letar efter `@documenso/ui` hittar det den mappen — oavsett om det importerande paketet hade deklarerat beroendet eller inte. Deklarationen kontrolleras alltså aldrig vid själva importen.

**2. `lib` finns redan i nästan varje deklarerad kedja.** De flesta odeklarerade beroenden går till eller från `lib`, och nästan allt beror på `lib` *deklarerat*. När `lib` ändras byggs allt om ändå. Turborepo bygger alltså om för mycket, inte för lite. Att bygga om i onödan är slöseri med tid — men det ger aldrig fel resultat.

**3. Cachen kan vara för bred utan att vara fel.** Turborepos garanti är "har ingenting i dina beroenden ändrats får du använda cachen". Med ett odeklarerat beroende *kan* garantin brytas i teorin. I praktiken räddas den av punkt 2.

Sammanfattat: bygget är korrekt, men korrektheten kommer från npm:s mappstruktur i stället för från den deklarerade grafen. Det är rätt svar av fel anledning. Det håller ända till dess att någon ändrar en förutsättning som ingen skrivit ner.

### Att `packages/lib` är inblandad i väldigt många saker — är det bra eller dåligt?

Både, och det är värt att hålla isär de två.

**Att den är central är bra och avsiktligt.** `lib` innehåller affärslogiken: vad som faktiskt händer när ett dokument skickas, signeras eller avbryts. Att den logiken finns på *ett* ställe är själva poängen. Alternativet — att varje ingång (webbappen, API:et, bakgrundsjobben) har sin egen kopia av reglerna — är betydligt värre. Då hamnar man i läget där ett dokument som signeras via API:et beter sig annorlunda än ett som signeras i webbläsaren. För en e-signeringsprodukt vore det allvarligt.

**Att den är *stor* är dåligt.** Problemet är inte antalet beroenden utan att `lib` innehåller fyra olika sorters kod som inget har med varandra att göra:

- serverlogik som bara körs på servern
- React-hooks och providers som bara körs i webbläsaren
- bakgrundsjobb
- konstanter och hjälpfunktioner som körs på båda ställen

Eftersom byggverktyget bara ser paketet, inte mapparna inuti, får varje användare av `lib` bära hela paketet. Konkret: ändrar du en serverfunktion byggs `ui` om, trots att `ui` aldrig rör serverkod.

Det är också härifrån de allvarligaste cirklarna kommer. React-providern i `lib` behöver komponenter från `ui` — helt rimligt för en React-komponent — men eftersom den ligger i `lib` beror nu *hela* `lib` på `ui`, inklusive serverkoden.

Kort: rätt att logiken är samlad, fel att fyra olika sorters kod delar paket.

### Beskriv mappstrukturen: `server-only`, `client-only`, `universal`

Namnen anger **var koden får köra**. Det är en konvention som upprätthålls av utvecklarna, inte av verktygen.

**`server-only/`** — 282 filer, den största delen. Kod som *bara* får köra på servern. Här ligger affärslogiken, organiserad i 38 domänmappar (`document/`, `recipient/`, `envelope/`, `team/`, `user/`, `webhooks/`, …). Det är också det enda lagret som ska prata med databasen. Filerna heter det de gör: `cancel-document.ts`, `send-document.ts`, `get-recipient-by-token.ts`.

Att den *måste* stanna på servern är inte en stilfråga. Den har direkt databasåtkomst och läser hemligheter ur miljövariabler. Hamnade den i webbläsarpaketet skulle den läcka.

**`client-only/`** — 34 filer. Kod som bara fungerar i webbläsaren, för att den behöver saker som bara finns där (`window`, `document`, React-tillstånd). Här ligger React-hooks (`use-debounced-value.ts`, `use-window-size.ts`) och providers (`session.tsx`, `organisation.tsx`).

**`universal/`** — 35 filer. Kod som fungerar på båda ställena, eftersom den inte rör varken databasen eller webbläsarens API:er. Exempel: `base64.ts`, `id.ts`, `unit-convertions.ts`, och `field-renderer/` som ritar upp fält både i webbläsarens förhandsvisning och i den slutgiltiga PDF:en på servern. Att kunna rita fält med *exakt* samma kod på båda ställena är ett verkligt värde — det är så man garanterar att förhandsvisningen stämmer med resultatet.

Utöver dessa tre finns `jobs/` (73 filer, bakgrundsjobb), `utils/`, `types/`, `constants/` och `translations/`.

Uppdelningen är alltså **redan gjord och redan meningsfull** — den är bara inte uttryckt på ett sätt som verktygen förstår. Det är därför förslaget att dela upp `lib` i separata paket är billigt: gränserna behöver inte hittas, bara flyttas upp en nivå.

### Hur kan cirkulära beroenden uppstå överhuvudtaget — borde det inte vara omöjligt?

Bra fråga, och svaret förklarar varför de är mindre dramatiska än de låter.

Nyckeln: **cirkeln finns mellan paket, inte mellan filer.**

Ett paket är bara en mapp med hundratals filer. När vi säger "`lib` beror på `ui`" är det en sammanfattning av något mer precist:

- någon fil i `lib` importerar någon fil i `ui`
- någon *annan* fil i `ui` importerar någon *annan* fil i `lib`

Ingen enskild fil väntar på sig själv. Ritar man grafen på filnivå i stället för paketnivå är den (i huvudsak) helt utan cirklar. Cirkeln uppstår först när man slår ihop hundratals filer till en enda nod och säger "det här är ett paket".

Två saker till gör det ofarligt i praktiken:

**Buntaren bryr sig inte om paketgränser.** Vid bygget läses alla filer in i en enda stor graf, och paketgränserna försvinner. Buntaren ser bara filer som importerar filer, och den grafen har ingen cirkel att fastna i.

**`import type` finns inte i den färdiga koden.** Flera av cirklarna består bara av typimporter. TypeScript använder dem för att kontrollera koden och kastar dem sedan. De existerar aldrig när programmet körs.

**Men:** det *går* att skapa en äkta cirkel på filnivå, och då blir det ett riktigt problem. Om `a.ts` och `b.ts` importerar varandra måste en av dem köras först, och då kan den andra vara halvfärdig — man får `undefined` där man väntade sig en funktion, ofta bara i produktionsbygget och inte lokalt. Det är den sortens bugg som kostar en dag att hitta.

Så: paketcirklar är en varningssignal om otydligt ansvar, inte ett fel i sig. De är värda att åtgärda för att koden blir lättare att förstå och bygga — inte för att något är trasigt idag.

### Vad är problemet med att databasen beror på affärslogiken?

Poängen med att ha `prisma` längst ner i grafen är att det ska vara det *billigaste* paketet att använda. Vill man bara läsa en rad ur databasen ska man kunna importera `prisma` och inget annat.

Beror `prisma` på `lib` gäller inte det längre. `lib` drar i sin tur in `email`, `signing` och `ee` — så "jag vill bara läsa en rad" blir i teorin "jag drar in hela affärslogiken, e-postutskick och den kryptografiska signeringen".

`apps/openpage-api` är det konkreta exemplet: den importerar `prisma` och absolut ingenting annat. Precis så ska ett bottenlager kunna användas.

Det andra problemet är riktningen. Databaslagret ska beskriva *hur data lagras*. Affärslogiken beskriver *vilka regler som gäller*. Reglerna ändras ofta, lagringen sällan. Låter man det som ändras sällan bero på det som ändras ofta får man ombyggnader och samberoenden som ingen bad om.

**Men — i det här fallet är det till stor del begränsat**, och det är värt att vara tydlig med:

Nästan allt kommer från `prisma/seed/` — skripten som fyller databasen med testdata i utvecklingsmiljön. De anropar affärslogiken för att skapa realistiska testdokument, vilket är helt rimligt. Den koden körs aldrig i produktion och buntas inte in i något som levereras. `openpage-api` drar alltså inte in affärslogiken i verkligheten, eftersom den importerar andra filer ur `prisma` än seed-skripten.

Det är därför den här punkten ligger som nummer tre på åtgärdslistan och inte som nummer ett: strukturen är fel, konsekvensen är liten, och åtgärden är en ren flytt av en mapp.

### Vad är den största nackdelen med att `send-document` importerar från `ui`?

Först en precisering, för formuleringen i originaldokumentet är hårdare än vad koden motiverar. Importen ser ut så här:

```ts
// packages/lib/server-only/document/send-document.ts
import { checkboxValidationSigns } from '@documenso/ui/primitives/document-flow/field-items-advanced-settings/constants';
```

Det är alltså **inte** en React-komponent. Det är en konstant — en lista över giltiga jämförelsetecken för kryssrutevalidering (`>=`, `<=` och liknande) — som råkar ligga i en `constants.ts` inne i komponentbiblioteket. Samma mönster gäller de andra filerna: `field-renderer/` hämtar CSS-klassnamn och färgdefinitioner, inte komponenter.

Så det är inte "React körs på servern". Den största nackdelen är i stället:

**Konstanten ligger på fel sida av en gräns som ska betyda något.** Om reglerna för hur en kryssruta valideras hör hemma i komponentbiblioteket, då är komponentbiblioteket också en ägare av affärsregler — och då finns det ingen plats i systemet där man kan läsa alla regler för dokumentvalidering. Just den här konstanten avgör vad som är ett *giltigt dokument*, vilket är en domänfråga.

Den praktiska konsekvensen: en utvecklare som ändrar valideringstecknen tror att den ändrar presentation, men ändrar serverns valideringsbeteende. Ingenting varnar, eftersom filen heter `constants.ts` och ligger bland komponenter.

Den sekundära nackdelen är byggkedjan. Hela `lib` — även den rena serverlogiken — kan inte byggas eller typkontrolleras utan att `ui` finns. Det låser ihop två paket som annars kunde byggas parallellt, och det stänger dörren för att låta serverkoden köra i miljöer där komponentbiblioteket inte är relevant.

Åtgärden är trivial och behöver inte vänta på någon större omstrukturering: flytta konstanterna till `packages/lib/constants/` och låt `ui` importera dem därifrån. Då pekar pilen rätt väg, och båda paketen får sin konstant från samma ställe.

### Varför är det dåligt att `create-document.ts` beror på betalfunktionerna?

Documenso är öppen källkod med en betald edition ovanpå. Hela `packages/ee` ("enterprise edition") finns för att hålla isär de två. Antagandet är att kärnprodukten fungerar utan `ee`, och att `ee` lägger till saker.

`document-router/create-document.ts` är den mest centrala funktionen i produkten — att skapa ett dokument. Att just den importerar från `ee` bryter antagandet på tre sätt.

**Den öppna produkten kan inte längre byggas utan betalkoden.** "Valfritt" är det bara om det går att ta bort. Kan man inte det är uppdelningen dokumentation, inte arkitektur.

**Betalregler hamnar i ett flöde där de är svåra att se.** Kontrollerna handlar om licenser, platsantal och kvoter. Nu är de invävda i grundflödet, vilket betyder att den som felsöker "varför kunde användaren inte skapa ett dokument?" måste leta i två paket och förstå faktureringsmodellen för att läsa kärnflödet.

**Riktningen är fel, och det syns i cirkeln.** `lib` och `ee` importerar varandra. `auth` och `ee` likaså — en äkta tvåvägscirkel i produktionskod. Ingen kan byggas eller testas utan den andra.

En nyans som är värd att ha med: **inte alla `ee`-importer är lika allvarliga.** `lib/utils/organisations-claims.ts` importerar bara två numeriska konstanter (`DEFAULT_RECIPIENT_COUNT` och liknande). Den fixas genom att flytta konstanterna till `lib`. Men `lib/server-only/organisation/create-organisation.ts` anropar `createCustomer` i Stripe-koden — det är verkligt beteendeberoende, och det är den sortens fall som kräver inversionen i nästa fråga.

### Beskriv hur dependency inversion skulle fungera mellan `lib` och `ee`

Grundidén: **det undre lagret bestämmer vad det behöver, det övre lagret levererar det.** Pilen pekar nedåt igen, trots att koden som körs finns ovanför.

Så ser det ut idag — `lib` sträcker sig uppåt och hämtar Stripe-kod direkt:

```ts
// packages/lib/server-only/organisation/create-organisation.ts  — NU
import { createCustomer } from '@documenso/ee/server-only/stripe/create-customer';

export const createOrganisation = async ({ userId, name }) => {
  const customer = await createCustomer({ name, email });  // ← lib känner till Stripe
  // ...
};
```

**Steg 1 — `lib` definierar vad det behöver, i egna termer.** Notera att Stripe inte nämns. `lib` behöver ett faktureringskonto, inte specifikt ett Stripe-konto:

```ts
// packages/lib/types/billing-port.ts  — NY FIL, ägs av lib
export type BillingPort = {
  createBillingAccount: (opts: { name: string; email: string }) => Promise<{ id: string }>;
  getSeatLimit: (opts: { organisationId: number }) => Promise<number>;
};
```

Det här kallas ett *port* eller *interface*. Det är bara typer — ingen implementation, inga beroenden.

**Steg 2 — `lib` tar emot den utifrån i stället för att importera den:**

```ts
// packages/lib/server-only/organisation/create-organisation.ts  — EFTER
import type { BillingPort } from '../../types/billing-port';

export const createOrganisation = async ({ userId, name, billing }: {
  userId: number;
  name: string;
  billing: BillingPort;   // ← skickas in
}) => {
  const account = await billing.createBillingAccount({ name, email });
  // ...
};
```

`lib` importerar nu ingenting från `ee`.

**Steg 3 — `ee` implementerar porten.** Här är pilen omvänd: `ee` beror på `lib` för att veta vilken form implementationen ska ha. Det beroendet fanns redan (111 importer), så ingen ny kant tillkommer:

```ts
// packages/ee/server-only/billing/stripe-billing-port.ts
import type { BillingPort } from '@documenso/lib/types/billing-port';
import { createCustomer } from '../stripe/create-customer';

export const stripeBillingPort: BillingPort = {
  createBillingAccount: (opts) => createCustomer(opts),
  getSeatLimit: ({ organisationId }) => /* ... */,
};
```

**Steg 4 — appen kopplar ihop dem.** Appen är det enda stället som får känna till båda, eftersom den redan gör det:

```ts
// apps/remix — vid uppstart
import { stripeBillingPort } from '@documenso/ee/server-only/billing/stripe-billing-port';

await createOrganisation({ userId, name, billing: stripeBillingPort });
```

**Vad man vinner.** Alla pilar pekar nedåt: `remix → ee → lib`. Cirkeln `lib ↔ ee` försvinner, och samma grepp på `auth` tar bort den äkta tvåvägscirkeln `auth ↔ ee`. Fyra beroenden borta.

Dessutom går det nu att bygga och köra kärnprodukten helt utan `ee` — man skickar in en gratisversion i stället:

```ts
export const freeBillingPort: BillingPort = {
  createBillingAccount: async () => ({ id: 'free' }),
  getSeatLimit: async () => 1,
};
```

Det är den punkt där uppdelningen mellan öppen och betald edition går från att vara en beskrivning till att bli något verktygen faktiskt upprätthåller. Och som bonus blir `createOrganisation` testbar utan Stripe — man skickar in en attrapp.

**Var man börjar.** Inte överallt på en gång. De importer som bara hämtar konstanter (`organisations-claims.ts`) fixas genom att flytta konstanterna ner till `lib` — ingen port behövs. Portmönstret sparar man till de ställen där `lib` faktiskt anropar beteende: Stripe-kunder, platsgränser och kvotkontroller.

### Vem är intresserad av mätvärden från `openpage-api`?

Allmänheten. Det är inte kundanalys eller intern telemetri — det är en **öppen transparens-API** om projektet självt.

Tjänsten kör på port 3003 och exponerar två sorters siffror:

**Community-siffror**, som den hämtar från en extern tjänst (`stargrazer-live.onrender.com`) och vidarebefordrar: antal GitHub-stjärnor, forkar, sammanslagna pull requests och öppna issues.

**Tillväxtsiffror**, som den läser ur den egna databasen: nya användare per månad, färdigsignerade dokument, totalt antal användare, totalt antal kunder, och "signer conversion" — hur stor andel av dem som fått ett dokument att signera som sedan själva blir användare.

Två detaljer i koden avslöjar vem publiken är. Varje endpoint anropar `cors()`, alltså tillåter anrop från andra domäner — det vore meningslöst om bara den egna appen skulle läsa siffrorna. Och svaren sätter `Cache-Control: public, s-maxage=3600`, alltså "vem som helst får cacha detta i en timme".

Det här är alltså infrastrukturen bakom en *open startup*-sida: mönstret där ett företag publicerar sina egna tillväxttal offentligt och löpande. För en produkt som säljs på att vara öppen källkod är det både marknadsföring och trovärdighetsbygge — man kan inte påstå att man är transparent och samtidigt hålla siffrorna hemliga.

De som faktiskt läser dem: potentiella användare som utvärderar om projektet lever, bidragsgivare som vill se om det är värt att engagera sig, investerare, och teamet självt.

Värt att notera i sammanhanget: `openpage-api` är det enda paketet i hela repot som håller sig till **ett enda** beroende (`prisma`), och det är precis därför den aldrig nämns i något av problemavsnitten ovan. Det är också ett bra exempel på varför ett rent bottenlager är värt något — den behöver databasen, ingenting annat, och kan ta just det.

### Nu innehåller `lib` fyra olika sorters kod — hur skulle ett idealt scenario se ut?

Gränserna finns redan i mappstrukturen. Det ideala scenariot är i huvudsak att **höja dem en nivå**, från mappar till paket, så att verktygen ser dem.

En rimlig uppdelning:

| Nytt paket | Från | Innehåll | Får bero på |
| --- | --- | --- | --- |
| `@documenso/core` | `lib/universal`, `lib/types`, `lib/constants`, `lib/errors` | Rena regler, typer, konstanter, felklasser. Ingen databas, inget `window`. | ingenting |
| `@documenso/domain` | `lib/server-only` | Affärslogiken, 38 domänmappar | `core`, `prisma`, `email`, `signing` |
| `@documenso/jobs` | `lib/jobs` | Bakgrundsjobb och jobbklienten | `core`, `domain` |
| `@documenso/react` | `lib/client-only` | Hooks och providers för webbläsaren | `core`, `ui`, `trpc` |

Poängen är riktningen: `core` längst ner utan beroenden, och de tre andra pekar nedåt mot den. Ingen av dem behöver känna till de andra tre.

**Vad det löser konkret:**

`ui` skulle bara bero på `core` — alltså typer och konstanter — i stället för på hela `lib` med databasen, e-postutskicken och Stripe i släptåg. Cirkeln `lib ↔ ui` försvinner, eftersom det som orsakade den (React-providrarna) flyttar till `@documenso/react`, där ett beroende till `ui` är helt normalt och pekar rätt väg.

Samma sak med `lib ↔ trpc`. Providrarna som anropar tRPC-klienten hamnar i `@documenso/react`, som gärna får bero på `trpc`.

Och ombyggnaderna krymper. Ändrar du en serverfunktion byggs `@documenso/domain` om — men inte `ui`, inte `@documenso/react`, inte appens klientdel. Idag byggs allt om.

**En ärlig invändning:** det här är inte gratis. Fler paket betyder fler `package.json`-filer att hålla i synk, en flyttning som rör nästan varje importrad i repot, och en period där dokumentation och muskelminne pekar på gamla sökvägar. Uppdelningen är också en engångsinvestering som blir dyrare desto längre man väntar.

Därför står den sist på åtgärdslistan i originaldokumentet. Den ger mest, men den kostar också mest — och punkterna före den (deklarera beroenden, flytta seed, invertera `ee`) ger mätbar nytta utan att röra en enda importrad i affärslogiken.

**Ett mellansteg som är billigare:** behåll `lib` som ett paket men förbjud de felaktiga importerna med en lintregel — ingenting i `server-only/` får importera från `client-only/` eller från `ui`. Då stoppas problemet från att växa medan man bestämmer sig om den större flytten. Det är ofta rätt första drag: frys blödningen innan du opererar.

### Vilka bakgrundsjobb finns?

Det finns 32 jobbdefinitioner under `packages/lib/jobs/definitions/`, uppdelade i två grupper. Varje jobb består av två filer: en definition (namn, schema för indata, eventuellt schemaläggning) och en `.handler.ts` som gör själva arbetet.

**E-postjobb — 17 stycken.** All utgående e-post skickas som jobb och inte direkt i webbförfrågan. Det är ett viktigt designval: om e-postleverantören är nere ska dokumentet ändå skickas, och försöket ska kunna göras om.

| Område | Jobb |
| --- | --- |
| Signeringsflödet | `send-signing-email`, `send-recipient-signed-email`, `send-document-completed-emails`, `send-document-pending-email`, `send-rejection-emails` |
| Dokumentets livscykel | `send-document-cancelled-emails`, `send-document-deleted-emails`, `send-recipient-removed-email`, `send-owner-recipient-expired-email`, `send-document-created-from-direct-template-email` |
| Konto | `send-confirmation-email`, `send-password-reset-success-email`, `send-admin-user-created-email` |
| Organisation | `send-organisation-member-joined-email`, `send-organisation-member-left-email`, `send-organisation-limit-alert-email`, `send-team-deleted-email` |

**Interna jobb — 15 stycken.** Här ligger det tyngre arbetet.

| Jobb | Vad det gör |
| --- | --- |
| `seal-document` | **Det viktigaste.** Signerar och "plomberar" PDF:en kryptografiskt när sista mottagaren är klar. Kör som jobb eftersom det är CPU-tungt och måste kunna göras om. |
| `execute-webhook` | Anropar kundens webhook-URL vid händelser |
| `bulk-send-template` | Massutskick från en mall |
| `process-signing-reminder` | Skickar påminnelse till en mottagare som inte signerat |
| `process-recipient-expired` | Hanterar en mottagare vars signeringsfrist gått ut |
| `sync-organisation-seats`, `cancel-organisation-subscription`, `backport-subscription-claims` | Fakturering och platsantal mot Stripe |
| `sync-email-domains` | Verifierar kunders egna e-postdomäner |
| `admin-delete-organisation` | Radering som är för långsam för en webbförfrågan |

**Sex av jobben är schemalagda med cron:**

| Jobb | Schema | Innebörd |
| --- | --- | --- |
| `send-signing-reminders-sweep` | `*/15 * * * *` | var 15:e minut |
| `expire-recipients-sweep` | `*/15 * * * *` | var 15:e minut |
| `seal-document-sweep` | `*/15 * * * *` | var 15:e minut |
| `cleanup-rate-limits` | `*/15 * * * *` | var 15:e minut |
| `sync-email-domains` | `0 * * * *` | varje timme |
| `alert-organisation-seat-drift` | `0 0 * * *` | varje natt kl 00:00 |

Notera mönstret `*-sweep`. Det finns både ett `seal-document` (körs när ett dokument blir klart) och ett `seal-document-sweep` (letar var 15:e minut efter dokument som *borde* ha plomberats men inte blev det). Sweepen är ett skyddsnät: om det direkta jobbet misslyckas eller tappas plockas dokumentet upp senare i stället för att fastna för alltid. Samma tanke bakom `alert-organisation-seat-drift` — den letar efter organisationer där platsantalet glidit ur synk med Stripe, alltså efter fel som redan inträffat.

Att bygga in den sortens självläkning är rimligt när konsekvensen av ett tappat jobb är ett dokument som aldrig blir färdigt.

Jobbklienten (`lib/jobs/client/`) har tre utbytbara implementationer bakom ett gemensamt gränssnitt: `local` (kör direkt i processen, för utveckling), `bullmq` (Redis-baserad kö) och `inngest`. Vilken som används styrs av `NEXT_PRIVATE_JOBS_PROVIDER`. Det är för övrigt samma mönster som beskrevs under dependency inversion ovan — och det visar att projektet redan använder tekniken där den behövdes.

### Om `a.ts` beror på `b.ts` som beror på `a.ts` — kan den koden bygga alls?

Ja, den bygger. Och den kör oftast också. Men "oftast" är problemet.

**Varför det bygger.** JavaScript-moduler laddas inte som en beställningskedja där varje modul måste vara helt klar innan nästa får börja. I stället läser körtiden in alla filerna först, kopplar ihop referenserna, och *sedan* kör den koden i varje fil. Under den ihopkopplingsfasen är en cirkel inget problem — den är bara två pilar i en graf.

**När det ändå går sönder.** Vid körningen måste en av filerna gå först. Säg att `a.ts` körs först och behöver ett värde från `b.ts` **direkt när modulen laddas**:

```ts
// b.ts
import { a } from './a';
export const b = a + 1;      // ← behöver a NU
```

```ts
// a.ts
import { b } from './b';
export const a = 1;
console.log(b);
```

Här får du antingen `undefined` eller ett `ReferenceError: Cannot access 'a' before initialization`.

Men det vanliga fallet ser ut så här:

```ts
// a.ts
import { helpB } from './b';
export function helpA() { return 1; }
export function doWork() { return helpB(); }   // ← anropas senare
```

Det fungerar. När `doWork()` faktiskt anropas är båda filerna färdiglästa. Funktioner och React-komponenter används nästan alltid *senare*, inte vid inläsningen — och därför överlever de flesta cirklar.

**Så ja, det kan bli en bugg i produktion — och det är den obehagligaste sorten**, eftersom den beror på i vilken ordning filerna råkar laddas. Den ordningen kan skilja mellan utvecklingsläge och produktionsbygge, eftersom buntaren grupperar och sorterar om filer. Det ger felet "fungerar lokalt, kraschar i produktion", och felmeddelandet (`undefined is not a function`) pekar på symptomet snarare än på cirkeln.

**Hur ser det ut i det här repot?** Jag mätte det. Räknar man alla importer finns **7 cirklar på filnivå**, och den största omfattar 285 filer. Men räknar man bort `import type` — som ju inte finns kvar när koden körs — återstår **3**:

| Cirkel | Filer | Bedömning |
| --- | --- | --- |
| `document-signing-auth-provider.tsx` ↔ `document-signing-auth-dialog.tsx` (+ 4 filer) | 6 | Klassisk React-cirkel: providern renderar dialogen, dialogen läser providerns context via en hook. Båda används vid rendering, inte vid inläsning. Ofarligt men svårläst. |
| `billing-plans.tsx` ↔ `organisation-create-dialog.tsx` | 2 | Dialogen importerar en knappkomponent, `billing-plans` importerar dialogens Zod-schema. Schemat borde ligga i en egen fil — då försvinner cirkeln. |
| `seed/users.ts` ↔ `seed/organisations.ts` | 2 | Bara testdata, körs aldrig i produktion. |

Och den 285-filers-cirkeln? Den hålls ihop **helt av typimporter** och existerar inte när koden körs. Den kommer av att tRPC-procedurer lånar typer av varandra på kryss — priset för typsäkerhet, precis som beskrevs tidigare.

Det gör att jag bör precisera formuleringen längre upp i det här dokumentet ("på filnivå är grafen i huvudsak utan cirklar"): den stämmer för *körtiden*, men om man mäter naivt med alla importer inräknade får man ett dramatiskt svar som inte betyder något. Skillnaden mellan 7 och 3 är exakt skillnaden mellan att räkna typimporter och att inte göra det — och det är därför originaldokumentet håller isär `import type` från vanliga importer överallt.

Ingen av de tre riktiga cirklarna är en bugg idag. Alla tre är dock ställen där en framtida ändring — någon som gör om en funktion till en konstant, eller flyttar ett anrop upp till modulnivå — kan förvandla dem till en.

### Att `lib` drar med `email`, `signing` och `ee` — vad är den största nackdelen?

**Att man inte kan bero på en del av `lib`. Man får allt eller inget.**

Det är precis den förmågan som är hela poängen med att dela upp kod i paket. Utan den är uppdelningen bara mappar med extra steg.

Det konkreta exemplet är `ui`. Det är ett komponentbibliotek — knappar, formulär, dialoger. Det behöver typer och några konstanter från `lib`. Men eftersom beroendet går till hela `lib` blir kedjan:

```
ui → lib → signing   (den kryptografiska PDF-signeringen)
ui → lib → ee        (Stripe-integrationen)
ui → lib → email     (e-postutskick)
ui → lib → prisma    (databasen)
```

Ett komponentbibliotek beror alltså, på pappret, på en HSM-integration och en betaltjänst.

**Tre kostnader, i ordning efter hur mycket de faktiskt märks:**

**1. Ombyggnader (märks dagligen).** Turborepo läser paketgrafen, inte filgrafen. En ändring i `signing` — kod som `ui` aldrig rör — gör att `ui` byggs om. Multiplicera med hur ofta någon rör `lib` och du har en byggkedja där nästan varje ändring bygger nästan allt. Det är den kostnad utvecklarna betalar varje dag utan att koppla den till orsaken.

**2. Begriplighet (märks vid felsökning).** Frågan "vad kan påverka den här komponenten?" har inget användbart svar längre. Svaret är "allt", och då slutar man ställa frågan. Det är så här arkitektur slutar styra beslut: inte genom att någon avskaffar den, utan genom att den blir för dyr att resonera om.

**3. Inlåsning (märks den dag man vill något).** Att publicera `ui` som ett fristående paket, återanvända det i ett annat projekt, eller bygga en lättviktig tjänst som bara behöver en bit av logiken — inget av det går utan att först reda ut det här.

**Vad det *inte* är — och det är värt att vara tydlig med:** signeringsmotorn hamnar inte i webbläsarens JavaScript. Buntare gör *tree-shaking*, alltså slänger kod som ingen faktiskt anropar, och den analysen sker per fil och inte per paket. Den färdiga klientbunten innehåller alltså inte Stripe-koden.

Det är alltså inte ett prestandaproblem och inte ett säkerhetsproblem. Det är ett problem med byggorkestrering och med begriplighet — vilket är mindre dramatiskt, men också svårare att motivera att man åtgärdar, eftersom ingen graf pekar rakt uppåt när man låter det vara.

### Utveckla stycket om att "konstanten ligger på fel sida"

Det här visade sig vara ett bättre exempel än jag först skrev, så här är hela kedjan.

**Vad konstanten är.** I `packages/ui/primitives/document-flow/field-items-advanced-settings/constants.ts`:

```ts
export const checkboxValidationSigns = [
  { label: 'Select at least', value: '>=' },
  { label: 'Select exactly',  value: '='  },
  { label: 'Select at most',  value: '<=' },
];
```

Den kopplar ihop en engelsk text i en dropdown med den matematiska operatorn den betyder. Ser ut som ren presentation. Ligger bland komponenterna. Heter `constants.ts`.

**Vad servern gör med den.** I `packages/lib/server-only/document/send-document.ts`, rad 503:

```ts
const validation = checkboxValidationSigns.find((sign) => sign.label === validationRule);

if (!validation) {
  throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Invalid checkbox validation rule' });
}
```

Läs raden en gång till. Servern avgör om ett dokument får skickas genom att **jämföra mot en engelsk användargränssnittstext**.

Och `validationRule` kommer inte från formuläret — den läses ur fältets `fieldMeta` i databasen. Strängen `'Select at least'` är alltså **lagrad data**, inte bara något som visas på skärmen.

**Vad det betyder i praktiken.** Tre konsekvenser som inte är uppenbara när man läser filen där konstanten bor:

*Att byta text är en brytande ändring.* Ändrar någon `'Select at least'` till `'Select minimum'` — en ren språkputs, den sortens ändring man gör utan eftertanke — slutar `.find()` hitta något för alla dokument som redan ligger i databasen. Servern kastar `INVALID_REQUEST` och dokumenten kan inte skickas. Ingenting i koden varnar, för TypeScript ser bara en sträng som matchar en sträng.

*Fältet kan inte översättas.* Projektet använder Lingui och har översättningar för tolv språk. Men just den här dropdownens etiketter kan inte lokaliseras, för då bryts uppslagningen. En hel funktion är alltså låst till engelska av ett skäl som inte står någonstans.

*Samma tre strängar finns definierade tre gånger* i samma fil: som `checkboxValidationSigns`, som `checkboxValidationRules`, och som en enum med `SELECT_AT_LEAST = 'Select at least'`. Tre sanningskällor för samma sak, som måste ändras i takt.

**Sex ställen läser den.** Inte bara `send-document`:

| Fil | Lager |
| --- | --- |
| `lib/server-only/document/send-document.ts` | server |
| `lib/advanced-fields-validation/validate-checkbox.ts` | delad validering |
| `lib/utils/envelope-signing.ts` | delad logik |
| `apps/remix/app/utils/field-signing/checkbox-field.ts` | app |
| `apps/remix/.../editor-field-checkbox-form.tsx` | app, redigeraren |
| `apps/remix/.../document-signing-checkbox-field.tsx` | app, signeringsvyn |

Alla sex gör samma `sign.label === ...`-uppslagning. Regeln är alltså inte presentation som råkat läcka — den är produktens definition av vad ett giltigt kryssrutefält är, och den bor i komponentbiblioteket.

**Testet som avgör var något hör hemma.** Fråga inte "vad ser det ut som?" utan **"vad går sönder om jag ändrar det här?"**

Ser det ut som presentation. Ändrar man det slutar dokument gå att skicka. Alltså är det inte presentation.

Det är samma test man kan använda på hela dokumentet: den deklarerade kartan säger en sak, konsekvenserna säger en annan, och det är konsekvenserna som är arkitekturen.

**Vad man faktiskt bör göra.** Åtgärden är liten och beror inte på någon av de större omstruktureringarna:

1. Flytta konstanten till `packages/lib/constants/` — då pekar pilen nedåt och alla sex läsarna hämtar den från samma, rätta ställe.
2. Skilj på nyckel och etikett. Lagra `'>='` i databasen, inte `'Select at least'`. Etiketten blir då en ren översättningsfråga och kan ändras fritt.
3. Slå ihop de tre parallella definitionerna till en.

Steg 2 kräver en databasmigrering för befintliga fält, så det är inte gratis. Men steg 1 och 3 är rena flyttar — och steg 1 ensamt tar bort den mest missvisande importen i hela repot, den där serverkoden som skickar dokument hämtar en affärsregel ur komponentbiblioteket.

### Vad är skillnaden mellan "rena regler" (`core`) och "affärslogik" (`domain`)?

Skillnaden är **inte** hur viktig koden är, eller hur mycket produktkunskap som ligger i den. Båda är affärsregler i vardaglig mening. Skillnaden är om koden **rör omvärlden**.

En ren regel tar emot värden och returnerar ett svar. Samma indata ger alltid samma utdata. Den läser ingen databas, skickar ingen e-post, skriver ingen logg, tittar inte på klockan.

Affärslogik *gör* något: läser, skriver, skickar, köar. Den har en effekt som finns kvar efter att funktionen returnerat.

Ett par exempel för att göra det konkret:

| Ren regel | Affärslogik |
| --- | --- |
| "Får en MANAGER se dokument märkta ADMIN?" | "Hämta de dokument den här användaren får se" |
| "Är den här mottagarlistan giltig att skicka?" | "Skicka dokumentet till mottagarna" |
| "Överlappar de här två fälten för mycket?" | "Spara fältplaceringen och logga ändringen" |

Notera att den vänstra kolumnen ofta är *inuti* den högra. Affärslogik är i praktiken **rena regler plus omvärlden**: hämta data, ställ frågan till regeln, agera på svaret, skriv resultatet.

Det är därför uppdelningen är användbar. Regeln kan testas med ett anrop och en jämförelse — ingen databas, ingen uppstart, inga attrapper. Affärslogiken behöver ett riktigt sammanhang för att testas alls. Håller man dem isär kan man ha många snabba tester på reglerna och färre, tyngre tester på flödena.

### Ge tre exempel på "rena regler" i Documenso

Alla tre finns i repot idag, och alla tre ligger utanför `server-only/`.

**1. Vem får se vilka dokument** — `packages/lib/constants/teams.ts`:

```ts
export const TEAM_DOCUMENT_VISIBILITY_MAP = {
  [TeamMemberRole.ADMIN]:   [DocumentVisibility.ADMIN, DocumentVisibility.MANAGER_AND_ABOVE, DocumentVisibility.EVERYONE],
  [TeamMemberRole.MANAGER]: [DocumentVisibility.MANAGER_AND_ABOVE, DocumentVisibility.EVERYONE],
  [TeamMemberRole.MEMBER]:  [DocumentVisibility.EVERYONE],
};
```

Det här är en av produktens mest konsekvensrika regler — den avgör vem som kan se vilka dokument — och den är samtidigt bara en uppslagstabell. Ingen databas, inga sidoeffekter. Den är också ett bra argument för uppdelningen: en regel som styr behörighet bör vara läsbar på ett ställe, i tio rader, utan att man behöver följa ett anropsträd.

**2. Överlappar två fält för mycket?** — `packages/lib/utils/fields-overlap.ts`:

```ts
export const FIELD_OVERLAP_THRESHOLD = 0.4;
```

Ren geometri: räknar ut hur stor del av det mindre fältets yta som täcks av ett annat, och jämför mot tröskeln. Allt i procent av sidans mått. Filens kommentar förklarar också *varför* tröskeln finns — fält som ligger ovanpå varandra beter sig oförutsägbart vid signering — och att lite överlapp (kanter som nuddar) är ofarligt.

Att 0.4 är rätt siffra är ett produktbeslut, inte matematik. Men beslutet är uttryckt som ett tal i en ren funktion, och det gör det både lätt att hitta och lätt att ändra.

**3. Är den här mottagarlistan giltig?** — `packages/lib/utils/recipients.ts`:

```ts
export const RECIPIENT_ROLES_THAT_REQUIRE_FIELDS = [RecipientRole.SIGNER] as const;

export const isCcRecipient = (recipient: Pick<Recipient, 'role'>) =>
  recipient.role === RecipientRole.CC;

export const isAssistantLastSigner = (recipients: Pick<Recipient, 'role'>[]) => {
  const nonCcRecipients = recipients.filter((r) => !isCcRecipient(r));
  return nonCcRecipients[nonCcRecipients.length - 1]?.role === RecipientRole.ASSISTANT;
};
```

`isAssistantLastSigner` är ett fint exempel på en regel som är svår att förstå men trivial att testa: en assistent kan inte vara sist i ordningen, eftersom en assistent fyller i fält *åt* någon annan och det då inte finns någon kvar att fylla i åt. Det är produktkunskap — men den behöver ingen databas för att uttryckas.

Notera också typerna: `Pick<Recipient, 'role'>` i stället för hela `Recipient`. Funktionen begär bara det fält den faktiskt läser, vilket gör den anropbar med vad som helst som har en roll — inklusive testdata man skriver för hand.

### Ge tre exempel på "affärslogik" i Documenso

Alla tre ligger i `packages/lib/server-only/`.

**1. `cancel-document.ts`** — avbryt ett pågående dokument. Funktionen gör i ordning:

1. Löser ut behörighetsfiltret via `getEnvelopeWhereInput` (rena regler + databas)
2. Hämtar dokumentet, kastar `NOT_FOUND` om filtret inte matchade
3. Kontrollerar om användaren är ägare eller har tillräcklig teamroll
4. Uppdaterar dokumentets status
5. Skriver en post i granskningsloggen
6. Triggar en webhook till kundens system
7. Köar ett jobb som skickar avbrottsmejl

Steg 3 är en ren regel. Steg 1, 2 och 4–7 är omvärlden. Det är den blandningen som gör funktionen till affärslogik.

**2. `complete-document-with-token.ts`** — den mest kritiska funktionen i produkten: en mottagare har signerat klart. Den innehåller ett tjugotal `await`, läser och skriver mottagare, fält och granskningsloggar, kontrollerar om det verkligen är mottagarens tur (`getIsRecipientsTurnToSign`) och om mottagaren är autentiserad (`isRecipientAuthorized`), och avslutar med ett `prisma.$transaction` så att statusändringen och dess loggposter antingen sker båda eller ingen.

Just transaktionen är själva skälet till att den här koden inte kan vara en ren regel. "Antingen båda eller ingen" är ett löfte om omvärlden.

**3. `send-document.ts`** — skicka ett dokument för signering. Validerar dokumentet, kontrollerar att varje SIGNER har ett signaturfält, validerar fältinställningar (det är här kryssrutekonstanten används), uppdaterar status till `PENDING`, skriver granskningslogg och köar ett jobb per mottagare.

Ett mönster värt att notera i alla tre: **inget av dem skickar e-post själv.** De köar ett jobb. Funktionen ansvarar för att tillståndsändringen blir riktig och hållbar; jobbsystemet ansvarar för att mejlet blir skickat, med omförsök om det misslyckas. Det är en medveten gränsdragning, och det är den som gör att ett nedbrott hos e-postleverantören inte kan hindra ett dokument från att skickas.

### Är det okej att alla — eller många — paket beror på `core`?

Ja. Det är inte bara okej, det är själva avsikten.

Regeln är enkel: **det är riktningen som räknas, inte antalet.** Ett paket som många beror på är inget problem så länge det självt inte beror på något.

Tre skäl till att `core` är säkert att bero på:

**Det kan inte skapa cirklar.** Har `core` inga beroenden finns det ingen väg tillbaka från `core` till någon annan. Alla pilar som pekar in kan aldrig komma ut igen. Cirklar kräver att ett paket både tar emot och ger — `core` gör bara det ena.

**Det ändras sällan.** En uppslagstabell över teamroller och en funktion som räknar ytöverlapp ändras sällan. Att många beror på något som ändras sällan är billigt: ombyggnaderna utlöses nästan aldrig.

**Det är billigt att bygga.** Ett paket med typer, konstanter och rena funktioner byggs på ett ögonblick och kräver ingen konfiguration, inga miljövariabler och ingen databas.

Det här är egentligen samma princip som förklarar vad som *är* fel med `lib` idag. `lib` har många som beror på det — vilket är helt riktigt — men det har också massor av egna beroenden, och det är kombinationen som är dyr. `prisma` är ett annat bra jämförelseobjekt: många beror på det och det fungerar utmärkt, ända fram till att `prisma → lib` införs och bottenlagret plötsligt får en väg uppåt.

**Två sätt det kan gå fel ändå**, som är värda att bevaka:

*`core` blir en skräplåda.* Namnet `core` säger inget om vad som får ligga där, precis som `lib` inte gör det (mer om det i nästa fråga). Utan ett tydligt kriterium — "inga beroenden, inga sidoeffekter" — hamnar allt möjligt där, och man har byggt om exakt det problem man försökte lösa. Kriteriet måste vara mekaniskt kontrollerbart, alltså en lintregel och inte en överenskommelse.

*`core` börjar bero på saker.* Den dagen någon behöver läsa en miljövariabel i `core` är det inte längre `core`. Det är den ändring som ska mötas med motstånd i granskningen, för den är svår att upptäcka i efterhand och lätt att motivera i stunden.

### Varför tror du att fyra olika sorters kod hamnat i `lib`? Är det vanligt?

**Det är extremt vanligt.** Det är sannolikt det mest utbredda strukturproblemet i större kodbaser, och det uppstår nästan aldrig av ett beslut.

**Mekanismen.** Ett paket som heter `lib` — eller `utils`, `common`, `shared`, `helpers` — har ett namn som beskriver *hur koden används* ("den delas") snarare än *vad den handlar om*. Sådana namn har ingen avvisningsregel. Det finns aldrig ett svar på frågan "hör det här hemma i `lib`?" utom "tja, det delas ju".

Jämför med `signing`. Frågan "hör e-postutskick hemma i `signing`?" besvarar sig själv. Namnet gör arbetet.

**Kostnadsskillnaden gör resten.** Föreställ dig en utvecklare som skrivit en funktion som två paket behöver:

- *Lägga den i `lib`:* skapa en fil, klar. Noll friktion.
- *Skapa ett nytt paket:* ny mapp, `package.json`, `tsconfig.json`, lägga till beroendet i alla som ska använda det, kanske justera byggkonfiguration, förklara valet i granskningen.

Det är fem minuter mot en timme, varje gång, för alla. Och varje enskilt val är rimligt — ingen av dem är felet. Felet är summan av tvåhundra rimliga val, och den syns inte förrän långt senare.

**Varför just fyra sorter här.** Ordningen är nästan alltid densamma. Serverlogiken kommer först, eftersom det är där produkten bor. Konstanter och typer följer, eftersom både server och klient behöver dem och `lib` redan finns. Bakgrundsjobben hamnar där eftersom de anropar serverlogiken och ligger bekvämt nära. React-providrarna kommer sist och är den bit som verkligen inte hör hemma — men vid det laget är `lib` redan "platsen där delade saker bor", och en provider som delas mellan flera routes uppfyller kriteriet.

**Vad som gör det här fallet ovanligt — på ett positivt sätt:** teamet har redan dragit gränserna. `server-only/`, `client-only/` och `universal/` är inte slumpmässiga mappar, de är exakt den uppdelning som behövs, och namnen anger en regel som går att kontrollera. Någon har alltså känt smärtan och agerat — men agerat på den billigaste nivån som fanns tillgänglig, nämligen mappar.

Det är därför förslaget att dela upp `lib` är ovanligt lågriskabelt. I de flesta kodbaser med det här problemet är den svåra delen att *hitta* gränserna, och det kräver att man läser hundratals filer och förhandlar om var saker hör hemma. Här är det arbetet redan gjort. Det som återstår är en flytt.

**Det generella lärdomen:** ett paket vars namn inte kan besvara frågan "hör det här hemma här?" kommer att växa tills någon delar det. Det är inte ett tecken på slarv, det är en förutsägbar följd av namnet. Vill man undvika det ska man antingen döpa paket efter *vad* de innehåller, eller sätta ett mekaniskt kriterium som lintern kan upprätthålla.

### Vad är skillnaden mellan `core` och `domain`?

Den här frågan överlappar den första i FAQ:n, så jag tar den från ett annat håle: inte *hur man känner igen* skillnaden, utan **vad som praktiskt skiljer de två paketen** när de väl finns.

| | `@documenso/core` | `@documenso/domain` |
| --- | --- | --- |
| Beror på | ingenting | `core`, `prisma`, `email`, `signing` |
| Får köra | server *och* webbläsare | bara server |
| Rör databasen | nej | ja, det är det enda lagret som får |
| Sidoeffekter | inga | databas, e-post, webhooks, jobb |
| Testas med | ett anrop och en jämförelse | databas, ofta hela appen |
| Storlek | liten, ~120 filer | stor, 282 filer |
| Ändras | sällan | ofta |
| Innehåller | typer, konstanter, rena funktioner | en funktion per operation |

Tre konsekvenser som gör uppdelningen värd besväret:

**`core` kan skickas till webbläsaren, `domain` får aldrig.** Det är inte en stilfråga. `domain` har direkt databasåtkomst och läser hemligheter ur miljövariabler — signeringsnycklar, SMTP-uppgifter, Stripe-nycklar. Hamnar den i klientbunten läcker den. Idag skiljs de bara åt av en mappkonvention och utvecklarnas uppmärksamhet; som separata paket blir det något verktygen kan kontrollera.

**`ui` kan bero på `core` men inte på `domain`.** Det är den ändringen som löser cirkeln `lib ↔ ui`. Ett komponentbibliotek behöver typer och konstanter; det behöver aldrig funktionen som skickar dokument.

**De ändras i olika takt.** `domain` ändras varje vecka, `core` några gånger om året. Ligger de i samma paket får `core`s stabilitet ingen effekt — allt byggs om ändå. Skilda åt slutar den vanliga ändringen utlösa den dyra ombyggnaden.

En hjälpsam tumregel för gränsdragningen: **kan funktionen testas utan att något startas, hör den i `core`.** Behöver den en databas, en kö eller en klocka, hör den i `domain`.

### Varför är det så många separata jobb för liknande saker — är det bra eller dåligt?

Övervägande **bra**, och av skäl som inte är uppenbara förrän något går sönder i produktion.

Alternativet vore ett enda `send-email`-jobb med en `type`-parameter. Det låter renare. Det är sämre, av fyra skäl:

**Omförsök blir precisa.** Varje jobb är den enhet som körs om vid fel. Går mejlet till mottagare 3 av 5 fel ska just det mejlet skickas om — inte hela utskicket, för då får mottagare 1 och 2 dubbletter. Ett brett jobb tvingar en att bygga den logiken själv, inuti jobbet. Ett smalt jobb får den gratis.

**Felen blir läsbara.** I övervakningen ser man `send.recipient.signed.email misslyckas 12 gånger i timmen` i stället för `send.email misslyckas ibland`. Det första är en diagnos, det andra är början på en utredning. För ett system där ett tappat jobb betyder ett dokument som aldrig blir färdigt är det skillnaden värd mycket.

**Indata typas per jobb.** Varje definition har ett eget Zod-schema:

```ts
const SEND_RECIPIENT_SIGNED_EMAIL_JOB_DEFINITION_SCHEMA = z.object({
  documentId: z.number(),
  recipientId: z.number(),
});
```

Med ett gemensamt jobb blir schemat unionen av allt varje mejltyp kan behöva, alltså mestadels valfria fält — och då kontrollerar det inget. Varje jobb har dessutom ett eget `version: '1.0.0'`, så ett jobb kan ändra sitt format utan att röra de andra.

**Definition och arbete kan laddas separat.** Det här är den finaste detaljen i uppsättningen. Definitionsfilen laddar handlern *dynamiskt*:

```ts
handler: async ({ payload, io }) => {
  const handler = await import('./send-recipient-signed-email.handler');
  await handler.run({ payload, io });
},
```

Det betyder att den som bara vill *köa* ett jobb laddar en liten fil med ett Zod-schema — inte handlern med dess importer av Prisma, e-postmallar och React. Bara den process som faktiskt kör jobbet betalar för den koden. Med ett gemensamt jobb skulle varje köande anrop dra in samtliga sjutton mejlmallar.

**Vad som faktiskt är dåligt med det.** 32 jobb betyder 64 filer, och definitionsfilerna är nästan identiska — samma sex rader med ett annat namn. Handlarna varierar från 17 rader (`send-team-deleted-email`) till 275 (`send-signing-email`), sammanlagt cirka 1 900 rader bara för mejljobben. Det finns två verkliga kostnader:

*Risk för drift.* Sjutton handlare som alla ska hämta mottagaren, hämta e-postsammanhanget, rendera med rätt språk och respektera kundens e-postinställningar. Rättar man en bugg i ett av de stegen är det lätt att missa några av de sjutton.

*Trögt att lägga till ett mejl.* Två filer och sex rader ceremoni innan man skriver en rad som betyder något.

**Men — koden hanterar redan detta.** Handlarna delar hjälpfunktioner (`getEmailContext`, `renderEmailWithI18N`, `isRecipientEmailValidForSending`), så det gemensamma ligger på ett ställe medan omförsök, namn och schema förblir per jobb. Det är rätt avvägning: dela *implementationen*, inte *identiteten*.

**Sammanfattat:** många små jobb är rätt val här, eftersom jobbets identitet är vad omförsök, övervakning och versionshantering hänger på. Ceremonin runt varje jobb är ett verkligt men mindre problem, och lösningen på det är en generator eller en hjälpfunktion — inte färre jobb.
