# Production deployment (one server)

Full step-by-step guide: see the "FieldOps — Deploy to Oracle Cloud" runbook.

| File | Purpose |
|---|---|
| `server-setup.sh` | One-time server setup (Docker, swap, firewall, fail2ban, auto updates) |
| `.env.example` | Copy to `.env` on the server and fill in (secrets; never commit) |
| `docker-compose.prod.yml` | Production stack: Postgres, both backends, both frontends, Caddy |
| `Caddyfile` | HTTPS + routing: `app.DOMAIN` → admin, `DOMAIN` → portal |
| `deploy.sh` | Pull `main`, rebuild, restart (admin first, then portal) |
| `backup.sh` | Nightly DB dump + uploads, copied off-server with rclone |

Restore a backup:

```bash
cd /opt/fieldops/app/deploy
docker compose -f docker-compose.prod.yml stop backend portal-backend
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U fieldops -d fieldops --clean --if-exists < /opt/fieldops/backups/db-YYYYMMDD-HHMM.dump
docker run --rm -v fieldops_uploads:/data -v /opt/fieldops/backups:/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/uploads-YYYYMMDD-HHMM.tar.gz -C /data"
docker compose -f docker-compose.prod.yml up -d
```
