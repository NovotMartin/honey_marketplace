# Honey Marketplace

Jednoduchá česká one-page aplikace pro rezervace sklenic medu.

## Stack

- Vue 3 + Vite + TypeScript + Vue Router
- Tailwind CSS + Pinia
- Node.js + Express
- Prisma + SQLite
- QR platby přes `qrcode`
- E-mail notifikace přes SMTP (`nodemailer`)

## Lokální spuštění

1. Nainstaluj závislosti:

   ```bash
   yarn install
   ```

2. Zkontroluj `.env`:

   ```env
   DATABASE_URL="file:./prisma/dev.db"
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="zmen-me"
   PORT=3000
   ```

3. Vytvoř SQLite databázi a vygeneruj Prisma klienta:

   ```bash
   yarn db:push
   yarn prisma:generate
   ```

4. Spusť frontend i backend:

   ```bash
   yarn dev
   ```

Frontend běží na Vite adrese, API na `http://localhost:3000`. Vite proxy posílá `/api` na backend.

Hlavní routy:

- `/` veřejná homepage s úvodem a přehledem medojedů,
- `/chcimed` rychlá rezervace medu,
- `/mujmed` profil, detail objednávek a úpravy čekajících rezervací,
- `/admin` administrace a nastavení,
- `/objednavky` admin tabulka objednávek.

## Produkční build

```bash
yarn build
yarn start
```

Server potom servíruje API i statický frontend z `dist/client`.

## Admin

Admin se přihlašuje stejně jako běžný uživatel přes `/mujmed`. Jméno admina se čte z `ADMIN_USERNAME` (výchozí `admin`) a heslo z `ADMIN_PASSWORD`. Rezervované admin jméno nemůže použít běžný zákazník.

Po přihlášení jako admin se v horním menu zobrazí ozubené kolečko `/admin` a odkaz `/objednavky`. Odhlášení v horní liště odhlásí i admin přístup.

Admin umí:

- nastavit celkový počet sklenic, cenu, IBAN, SWIFT/BIC, Revolut username/link a zprávu k platbě,
- zobrazit stav SMTP/e-mail konfigurace a poslat testovací e-mail,
- filtrovat, řadit, upravit, potvrdit, zrušit nebo úplně smazat zrušené objednávky na `/objednavky`,
- vytvořit osobní/offline objednávku na `/objednavky`,
- resetovat heslo zákazníkovi.

Reset hesla zároveň zruší aktivní přihlášení daného zákazníka.

## Přihlášení zákazníka

Běžný zákazník se po první rezervaci nebo přihlášení uloží v prohlížeči přes session token v `localStorage`. Heslo se do prohlížeče neukládá. Přihlášení zůstává platné bez expirace, dokud zákazník nepoužije `Odhlásit` v `/mujmed` nebo dokud admin zákazníkovi neresetuje heslo.

## Platby

Bankovní QR se generuje z IBAN/SWIFT jako český SPD payload v CZK. Revolut QR se generuje z uloženého `revolut.me` odkazu s parametry `amount` a `currency=CZK`, pokud je odkaz nastavený.

## E-mail notifikace

Webové objednávky z `/chcimed` a `/mujmed` pošlou adminovi e-mail. Offline objednávky vytvořené adminem e-mail neposílají.

E-mail obsahuje tlačítko pro potvrzení objednávky. Odkaz je podepsaný přes `ADMIN_ACTION_SECRET`, časově omezený a nepotřebuje admin heslo. Potvrzení z e-mailu provede stejnou akci jako tlačítko `Potvrdit` v tabulce objednávek.

Purelymail příklad:

```env
SMTP_HOST=smtp.purelymail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tvuj@email.cz
SMTP_PASSWORD=heslo-nebo-app-password
SMTP_FROM=tvuj@email.cz
ADMIN_EMAIL=admin@email.cz
APP_PUBLIC_URL=https://med.example.cz
ADMIN_ACTION_SECRET=dlouhy-nahodny-token
ADMIN_CONFIRM_LINK_TTL_HOURS=72
```

V administraci na `/admin` se zobrazuje stav e-mailového nastavení a formulář pro odeslání testovacího e-mailu. SMTP heslo a `ADMIN_ACTION_SECRET` se v UI nezobrazují, pouze jestli jsou nastavené.

## Docker

Image obsahuje backend i produkční frontend. Při startu kontejneru se automaticky spustí `prisma db push --skip-generate`, takže SQLite schéma vznikne samo v persistentním volume.

Lokální build image:

```bash
docker build -t honey-marketplace:local .
```

Lokální spuštění přes compose s lokálně buildnutou image:

```bash
HONEY_IMAGE=honey-marketplace:local docker compose up -d
```

Výchozí `docker-compose.yml` očekává image v GHCR. Před nasazením nastav `HONEY_IMAGE`, například:

```bash
HONEY_IMAGE=ghcr.io/tvoje-jmeno/honey-marketplace:latest docker compose up -d
```

Konfigurace v compose:

```yaml
environment:
  NODE_ENV: production
  PORT: 3000
  DATABASE_URL: file:/app/data/honey.db
  ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
  ADMIN_PASSWORD: ${ADMIN_PASSWORD:-zmen-me}
  HONEY_TOTAL_JARS: ${HONEY_TOTAL_JARS:-}
  HONEY_PRICE_PER_JAR_CZK: ${HONEY_PRICE_PER_JAR_CZK:-}
  HONEY_IBAN: ${HONEY_IBAN:-}
  HONEY_SWIFT: ${HONEY_SWIFT:-}
  HONEY_REVOLUT_USERNAME: ${HONEY_REVOLUT_USERNAME:-}
  HONEY_REVOLUT_LINK: ${HONEY_REVOLUT_LINK:-}
  HONEY_PAYMENT_MESSAGE: ${HONEY_PAYMENT_MESSAGE:-}
  SMTP_HOST: ${SMTP_HOST:-smtp.purelymail.com}
  SMTP_PORT: ${SMTP_PORT:-465}
  SMTP_SECURE: ${SMTP_SECURE:-true}
  SMTP_USER: ${SMTP_USER:-}
  SMTP_PASSWORD: ${SMTP_PASSWORD:-}
  SMTP_FROM: ${SMTP_FROM:-}
  ADMIN_EMAIL: ${ADMIN_EMAIL:-}
  APP_PUBLIC_URL: ${APP_PUBLIC_URL:-}
  ADMIN_ACTION_SECRET: ${ADMIN_ACTION_SECRET:-}
  ADMIN_CONFIRM_LINK_TTL_HOURS: ${ADMIN_CONFIRM_LINK_TTL_HOURS:-72}
```

`HONEY_*` hodnoty se použijí jen při prvním vytvoření nastavení v prázdné databázi. Jakmile už nastavení existuje, hodnoty z admin UI se při restartu ani redeployi nepřepisují.

SQLite data jsou uložená ve volume `honey-data` na cestě `/app/data`.

## GHCR Publish

Workflow `.github/workflows/docker.yml` publikuje image do GitHub Container Registry při pushi do větve `main`.

Publikované tagy:

```text
ghcr.io/<owner>/<repo>:latest
ghcr.io/<owner>/<repo>:sha-<commit>
```

Po prvním běhu workflow zkontroluj v GitHubu package visibility. Pro jednoduché nasazení na TrueNAS bez loginu nastav package jako public.

## TrueNAS Nasazení

Na TrueNAS použij compose aplikaci nebo vlastní Linux VM s Docker Compose. Doporučené minimum je:

```bash
export HONEY_IMAGE=ghcr.io/<owner>/<repo>:latest
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="silne-admin-heslo"
docker compose pull
docker compose up -d
```

Port hostitele změníš přes `HONEY_PORT`, například:

```bash
HONEY_PORT=8080 docker compose up -d
```

Pro zálohu stačí zálohovat persistentní volume nebo soubor `/app/data/honey.db` uvnitř volume.
