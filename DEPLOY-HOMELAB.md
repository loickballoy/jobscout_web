# Running JobScout on a homelab (Docker + Traefik + Tailscale)

JobScout runs as one container that stays up permanently. It scans the job sites
every morning by itself, so new offers are already scored when you open it.

- **Access**: through Traefik, only from your Tailscale network, behind a password.
- **Data**: SQLite database and generated CVs and letters live in `./data` next to
  `docker-compose.yml`. Back up that folder.
- **Documents**: download them from the offer page in your browser. The
  "open folder" buttons of the desktop version are hidden.

## 1. Prerequisites on the homelab

- Docker with the Compose plugin.
- Traefik running in Docker, attached to a Docker network (named `traefik-public` below).
- A hostname that reaches Traefik over Tailscale. For example, the MagicDNS name
  of the homelab (`homelab.tail1234.ts.net`) or a subdomain you route to it.

## 2. Configure

```bash
git clone <this repository> jobscout && cd jobscout
cp .env.docker.example .env
nano .env
```

Fill in at least:

| Variable | Example | Role |
|---|---|---|
| `JOBSCOUT_HOST` | `jobscout.homelab.tail1234.ts.net` | Hostname you type in the browser. Traefik routes it and the app accepts it. |
| `JOBSCOUT_PASSWORD` | a long password | Login screen. Required. |
| `JOBSCOUT_DAILY_SCAN` | `06:30` | Automatic daily scan (`TZ` time zone). Leave empty to disable it. |
| `TRAEFIK_NETWORK` | `traefik-public` | Docker network shared with Traefik. |

JobScout answers on both `http://` (entrypoint `web`) and `https://` (entrypoint
`websecure`). Without a dedicated certificate, Traefik serves its self-signed one
over HTTPS. To use a certificate resolver, add
`traefik.http.routers.jobscout-secure.tls.certresolver: <your resolver>`.
Tailscale can also issue certificates for `*.ts.net` names (`tailscale cert`).

## 3. Start

```bash
docker compose up -d --build
docker compose logs -f jobscout   # expect: [daily-scan] programmé chaque jour à 06:30
```

The first build takes a few minutes (dependencies, then Chromium for LinkedIn).
Open `http://<JOBSCOUT_HOST>` (or `https://`) from any device on your tailnet.

## 3b. Reach it from your tailnet with Tailscale Serve (recommended)

Tailscale's MagicDNS resolves machine names (`homelab.tail1234.ts.net`) but
not names in front of them (`jobscout.homelab.tail1234.ts.net`). The reliable
way in is Tailscale Serve: it publishes JobScout on the machine's own
Tailscale name, with a real HTTPS certificate, visible only on your tailnet.

1. In the Tailscale admin console, under **DNS**, enable MagicDNS and
   **HTTPS Certificates**.
2. In `.env`, accept the machine name, then restart:
   ```
   JOBSCOUT_EXTRA_HOSTS=homelab.tail1234.ts.net
   ```
   ```bash
   docker compose up -d
   ```
3. On the homelab, publish the container's local port (`127.0.0.1:3000`, see
   `JOBSCOUT_LOCAL_PORT`) on port 8443. Port 443 is already taken by Traefik.
   ```bash
   sudo tailscale serve --bg --https=8443 http://127.0.0.1:3000
   tailscale serve status
   ```
4. Open `https://homelab.tail1234.ts.net:8443` from any device on your tailnet.

`--bg` keeps the setting across reboots. To remove it:
`sudo tailscale serve --https=8443 off`.

## 4. First use

1. Copy your master CV template next to the database **before** the first start
   (or import it later from the **Modèle CV** page):
   ```bash
   cp cv-template.json ./data/cv-template.json
   ```
   It is imported on first access. It contains your phone and e-mail, so keep it
   out of git (`cv-template.json` is in `.gitignore`).
2. Log in with `JOBSCOUT_PASSWORD`.
3. Onboarding: choose the AI provider and paste your key (see [GUIDE-IA.md](GUIDE-IA.md)),
   then upload your CV, check the extracted profile, and set preferences (target
   countries **France and Suisse**, sectors, contracts, sources).
4. **Profil › Zones de recherche**: select *Paris et Île-de-France*, *Lyon et agglomération*
   and *Suisse romande*. The scan then searches those places instead of the
   whole country, and the Offres page opens filtered on **Mes zones**.
5. **Profil › Niveau de poste**: turn on *Postes junior uniquement*. The Offres page
   then opens filtered on **Junior** (junior offers plus offers that state no level;
   senior offers and offers asking for 3+ years are hidden), senior offers lose
   25 points in the score, and LinkedIn is searched on *Entry level* and *Associate*.
6. **Modèle CV › À compléter avant d'envoyer**: fill the `[N]` and `[mois]`
   placeholders. Until they are filled, every generated CV lists them as warnings.
7. Click **Lancer un scan** once. After that, the daily scan runs every morning.

## Daily routine

1. Open **Offres**: new offers in your zones are already scored.
2. Open an offer: the panel shows the probable CV cluster (A–E) and an **Aperçu** link
   (free preview, no AI).
3. **Générer les documents**: the AI picks the cluster, the exact job title, the
   bullets and up to 5 keywords from the ad, but every word comes from your
   template. The cover letter may only use the facts of that CV. Without an AI
   key, the same choice is made automatically by keyword matching.
4. Download the Word or PDF file (`Loick-Balloy-CV-Company-Title.pdf`),
   then **Postuler** to open the ad and track the application.

### Which sources for which location

| Target | Sources to enable |
|---|---|
| France | France Travail (official API recommended: `FT_CLIENT_ID` / `FT_CLIENT_SECRET` from francetravail.io), HelloWork, Welcome to the Jungle |
| French-speaking Switzerland (Geneva, Lausanne, Neuchâtel, Fribourg, Sion) | LinkedIn, Talent.com, Welcome to the Jungle. France Travail only covers France. |

Read [CGU.md](CGU.md) (sections 5 and 6) before enabling the sites other than France Travail.

## Update

```bash
git pull && docker compose up -d --build
```

## Troubleshooting

- **403 "hôte non autorisé"**: the hostname in the browser is neither
  `JOBSCOUT_HOST` nor in `JOBSCOUT_EXTRA_HOSTS` (comma-separated).
- **Browser can't reach the name but `curl -H "Host: <name>" http://127.0.0.1`
  on the homelab returns `307` to `/login`**: JobScout and Traefik work, the
  name does not resolve on your device. Use Tailscale Serve (section 3b).
  On Windows, `nslookup` ignores Tailscale's DNS, so test in the browser or with
  `Resolve-DnsName` in PowerShell.
- **Scan stuck at the start behind Traefik**: the scan streams its progress.
  Make sure no compression middleware is applied to this router.
- **"unable to open database file"**: fixed at startup since this version (the
  container hands `./data` to its user, UID 1000). With an older image:
  `sudo chown -R 1000:1000 ./data`.
- **Lighter image without LinkedIn**: set `WITH_LINKEDIN=0` in `.env`, then rebuild.
