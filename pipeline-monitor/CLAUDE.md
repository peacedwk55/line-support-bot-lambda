# CLAUDE.md — PipelineHub Project Reference

> Notes for Claude Code to understand this project without re-reading every file.

---

## Project Goal

Learning demo — สร้าง production-grade CI/CD monitoring dashboard ทีละ phase เพื่อเรียนรู้ full DevOps stack ตั้งแต่ app ไปจนถึง infra

---

## Roadmap

| Phase | ชื่อ | สถานะ |
|-------|------|--------|
| 1 | Full Stack App (Backend + Frontend) | ✅ Done |
| 2 | Docker Compose (local dev) | ✅ Done |
| 3 | Kubernetes | ✅ Done |
| 4 | ArgoCD GitOps | ✅ Done |
| 5 | Ingress (pipelinehub.local + argocd.local) | ✅ Done |
| 6 | Monitoring — Prometheus + Grafana | ✅ Done |
| 7 | CI/CD Pipeline (build image → push → auto-deploy) | 🔜 Next |
| 8 | Helm Charts | ⬜ |
| 9 | TLS / HTTPS (cert-manager) | ⬜ |

---

## What Is This?

**PipelineHub** — Real-time CI/CD monitoring dashboard for Azure DevOps pipelines.
- Visualizes pipeline runs, stages, and statuses live
- Supports multi-project selection, filtering, dark mode

---

## Architecture Overview

```
Browser
  ├── REST API calls  ──→  Backend (Fastify, port 3001)
  └── SSE stream      ──→  Backend /api/sse
                              ├── PostgreSQL (port 5432) — persists runs
                              ├── Redis (port 6379)      — caches API responses
                              └── Azure DevOps REST API  — source of pipeline data

Azure DevOps
  └── Webhook POST ──→ Backend /api/webhook  (build.complete events)
```

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20, Fastify 5, axios, pg, redis |
| Frontend | Next.js 16 (standalone), React 19, TypeScript, Tailwind CSS 4, SWR |
| DB | PostgreSQL 15 |
| Cache | Redis 7 |
| Container | Docker (Alpine) |
| Orchestration | Kubernetes (Minikube on WSL2) |
| GitOps | ArgoCD (auto-sync, prune, self-heal) |
| Ingress | NGINX |

---

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `backend/src/index.js` | Entry point — Fastify init, plugins, routes |
| `backend/src/routes/pipelines.js` | REST endpoints (projects, pipelines, runs, stats, timeline, detail) |
| `backend/src/routes/webhook.js` | SSE endpoint + Azure webhook receiver + broadcast |
| `backend/src/services/azureDevOps.js` | Azure API calls + Redis caching + DB writes |
| `backend/src/plugins/db.js` | PostgreSQL pool + auto-creates `pipeline_runs` table |
| `backend/src/plugins/redis.js` | Redis client setup |
| `backend/src/plugins/sse.js` | SSE client registry + broadcast function |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/app/dashboard/page.tsx` | Main page — all logic (fetch, SSE, filter, dark mode) ~262 lines |
| `frontend/lib/api.ts` | Axios instance + typed wrappers for all endpoints |
| `frontend/components/pipeline/PipelineCard.tsx` | Per-run card (status, duration, branch, stages) |
| `frontend/components/pipeline/StageBar.tsx` | Build stage dots with tooltips, color-coded |
| `frontend/components/ProjectSelector.tsx` | Project dropdown with click-outside handling |

### Infra
| File | Purpose |
|------|---------|
| `k8s/ingress.yaml` | NGINX routing: `/api/*` → backend, `/` → frontend, host: `pipelinehub.local` |
| `k8s/pipeline-monitor.yaml` | ArgoCD Application manifest (argo.yaml ถูกลบแล้ว ใช้อันนี้แทน) |
| `k8s/argocd-ingress.yaml` | Ingress สำหรับ ArgoCD UI, host: `argocd.local` |
| `k8s/argoCD/argocd-server-config.yaml` | ConfigMap ปิด HTTPS ใน ArgoCD server |
| `k8s/monitoring/namespace.yaml` | Namespace: monitoring |
| `k8s/monitoring/prometheus.yaml` | Prometheus deployment + service + scrape config |
| `k8s/monitoring/grafana.yaml` | Grafana deployment + service + Prometheus datasource |
| `k8s/monitoring/ingress.yaml` | Ingress: grafana.local, prometheus.local |
| `k8s/secret.yaml` | Azure PAT secret (gitignored) |
| `backend/.env` | Backend secrets (gitignored) |
| `docker-compose.yml` | Local dev: backend + frontend + postgres + redis |

---

## API Endpoints

```
GET  /api/projects
GET  /api/projects/:project/pipelines
GET  /api/projects/:project/pipelines/:pipelineId/runs
GET  /api/projects/:project/builds/:buildId/timeline
GET  /api/projects/:project/builds/:buildId/detail
GET  /api/projects/:project/stats
GET  /api/sse              ← SSE stream (frontend subscribes)
POST /api/webhook          ← Azure DevOps webhook receiver
GET  /health
```

---

## Database

Table: `pipeline_runs` (auto-created on startup)
```
id, project, pipeline_id, name, state, result,
created_date, finished_date, updated_at
```

---

## Cache TTLs (Redis)

| Data | TTL |
|------|-----|
| Projects | 1 hour |
| Pipelines | 1 hour |
| Pipeline runs | 15–30 sec |
| Build timelines | 15 sec |
| Build details | 1 hour |
| On webhook | Invalidated immediately |

---

## Real-Time Flow

1. Azure pipeline completes → POST to `/api/webhook`
2. Backend updates DB + invalidates Redis cache
3. Backend broadcasts `pipeline.update` SSE event
4. Frontend receives event → reloads data for that project

---

## Kubernetes Setup

- Namespace: `pipeline-monitor`
- Backend: 2 replicas, image `ghcr.io/peacedwk55/pipeline-backend:v2`
- Frontend: 2 replicas, image `ghcr.io/peacedwk55/pipeline-frontend:v2`
- PostgreSQL: 1 replica, `postgres:15-alpine`
- Redis: 1 replica, `redis:7-alpine`
- `imagePullPolicy: Always` (pull จาก ghcr.io)
- `imagePullSecrets: ghcr-secret` (สร้าง manual ด้วย kubectl — ไม่อยู่ใน git)

### Container Registry

- Registry: `ghcr.io/peacedwk55`
- Custom images: `pipeline-backend`, `pipeline-frontend`
- Official images (Docker Hub): postgres, redis, grafana, prometheus
- GitHub Free tier: 500 MB storage, 1 GB/เดือน transfer

---

## ArgoCD

- App name: `pipeline-monitor` (namespace: `argocd`)
- Source repo: `https://cdscom.visualstudio.com/DefaultCollection/Demo-Pipeline/_git/Demo-Pipeline`
- Target branch: `develop` (path: `k8s/` recursive)
- Auto-sync: enabled (prune + self-heal)

> **หมายเหตุ git:** local branch `develop` ต้อง push ไป `origin/develop` เสมอ (ไม่ใช่ `origin/master`) ไม่งั้น ArgoCD จะไม่ sync

### Web UI Access

ArgoCD UI: `http://argocd.local` | App UI: `http://pipelinehub.local` | Grafana: `http://grafana.local` (admin/admin) | Prometheus: `http://prometheus.local`

**WSL2 socat bridge — ต้องรันทุกครั้งที่ reboot:**
```bash
sudo socat TCP-LISTEN:80,fork,reuseaddr TCP:192.168.49.2:30773 &
```

> Minikube บน WSL2 ใช้ IP `192.168.49.2` ซึ่ง Windows เข้าไม่ถึงตรงๆ ต้อง bridge ผ่าน socat ใน WSL2

---

## Public Access — Tailscale Funnel

**URL สาธารณะ (ไม่ต้องติดตั้งอะไร):** `https://cds-dev-06.tailbe2b6b.ts.net`

### Architecture จริง
Minikube รันบน **Windows** (ไม่ใช่ WSL2) ทำให้ WSL2 ping ไปที่ `192.168.49.2` ไม่ติด
ต้องใช้ `kubectl port-forward` บน Windows แล้วให้ socat ใน WSL2 ชี้มาที่ Windows host (`172.20.64.1`) แทน

```
Browser → Tailscale Funnel (HTTPS)
        → WSL2 :80 (socat)
        → Windows :9090 (kubectl port-forward)
        → NGINX Ingress (Minikube)
        → Frontend / Backend pods
```

### ต้องรันทุกครั้งที่ reboot

**PowerShell (Windows):**
```powershell
Start-Job -ScriptBlock { kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 9090:80 --address 0.0.0.0 }
```

**WSL2:**
```bash
sudo tailscale funnel --bg 80
sudo socat TCP-LISTEN:80,fork,reuseaddr TCP:172.20.64.1:9090 &
```

### Ingress
`k8s/ingress.yaml` มี rule สำหรับ `cds-dev-06.tailbe2b6b.ts.net` อยู่แล้ว ชี้ไปที่ frontend และ backend เหมือนกับ `pipelinehub.local`

### หมายเหตุ
- Tailscale ติดตั้งใน WSL2 (`/usr/local/bin/tailscale`)
- netsh portproxy (port 9080 → Minikube) ถูกสร้างไว้แล้วแต่ไม่ได้ใช้ เพราะ Minikube VM ping ไม่ติดแม้จาก Windows
- Windows Firewall เปิด port 9080 ไว้แล้ว (rule: "WSL2 to Minikube 9080")

---

## Environment Variables (Backend)

```
AZURE_ORG_URL=https://cdscom.visualstudio.com/
AZURE_PAT=<token>
ALLOWED_PROJECTS=<comma-separated project names>
JWT_SECRET=<secret>
DB_HOST=postgres / DB_USER / DB_PASSWORD / DB_NAME
REDIS_URL=redis://redis:6379
```

---

## Local Dev

```bash
# Start all services
docker compose up

# Backend only (with hot-reload)
cd backend && npm run dev

# Frontend only
cd frontend && npm run dev
```
