# report-api

A tiny Node service (one file, no dependencies) that turns "Report a problem"
submissions from the app into GitHub issues, so that users without a GitHub
account can report a wrong sentence or word.

- Listens on `127.0.0.1:8091`; nginx proxies `https://tibetan.itjoy.space/api/`
  to it (see `server/nginx/tibetan.itjoy.space.conf`).
- `POST /api/report` with JSON `{ kind: 'sentence'|'word'|'app', category:
  'translation'|'bug'|'idea', id, tib, translation, lang, message, page }` → `{ ok: true, url }` (the issue or comment), or
  `400` / `429` / `502` with `{ ok: false, error }`. `GET /api/health` → `{ ok: true }`.
- Creates the issue `Sentence s123: <tib>` / `Word <id>: <tib>`, or for general
  reports `Bug: <first line>` / `Idea: <first line>`, labelled by category
  (`content`, `bug`, `enhancement`). If an open issue with the same title exists (GitHub search) or one
  was created for this id today, the report is added as a comment instead.
- Spam: 5 requests per hour per IP, the hidden `website` field must be empty,
  only the origin `https://tibetan.itjoy.space` is allowed (CORS).

## Install / update

`server/setup.sh` calls `install.sh`, or run it alone as root:

```
bash /tmp/tibetan-server/report-api/install.sh
```

It creates the system user `report-api`, copies `report-api.mjs` to
`/opt/report-api/`, installs `report-api.service` and creates
`/etc/report-api.env` (mode 600) if missing.

## Token

Create a **fine-grained personal access token** (GitHub → Settings → Developer
settings → Personal access tokens → Fine-grained tokens): repository access
*Only select repositories* → `Kotstantin108/Kagyu-tibetan`; permissions
*Issues: Read and write* (Metadata: read is added automatically). Put it into
`/etc/report-api.env`:

```
GITHUB_TOKEN=github_pat_...
```

then `systemctl restart report-api`. The token is never committed. To rotate,
replace the line and restart. Logs: `journalctl -u report-api -n 50`.

## Tests

```
node --test server/report-api/report-api.test.js
```

The tests use a fake GitHub client and a local socket; nothing reaches GitHub.
