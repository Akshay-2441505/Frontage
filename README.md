# Frontage

*"Give your merchant a storefront AI agents can actually see — and shop from."*

Razorpay AI Buildathon 2026 — Track 01: AI Growth & Agentic Commerce. Full context and rationale
live in [PROJECT_SPEC.md](PROJECT_SPEC.md); this file covers running the project.

Status: under active build. See [PROJECT_SPEC.md §11](PROJECT_SPEC.md) for the build sequence.
Current state: Day 1 (foundation) complete — backend + frontend skeleton, data model, seed data.

## Project layout

```
backend/    FastAPI app, SQLAlchemy models, agents, Razorpay client
frontend/   React + Vite dashboard
```

## Prerequisites

- Python 3.11+
- Node 18+
- A Razorpay account with **test-mode** API keys (Settings → API Keys → Test Mode)
- An Anthropic API key

## Setup

1. Copy `.env.example` to `.env` at the repo root and fill in real values:
   ```bash
   cp .env.example .env
   ```
2. Backend:
   ```bash
   cd backend
   python -m venv .venv
   .venv/Scripts/activate   # Windows; use `source .venv/bin/activate` on macOS/Linux
   pip install -r requirements.txt
   python -m app.seed.seed   # seeds two demo merchants with deliberately messy catalogs
   uvicorn app.main:app --reload --port 8000
   ```
3. Frontend (separate terminal):
   ```bash
   cd frontend
   npm install
   npm run dev -- --port 5173
   ```
4. Open http://localhost:5173 — the dashboard should list two seeded merchants
   (Bloom & Thread, Terracotta & Co) and their catalogs.

## What's built so far

- Data model (Merchant, CatalogItem, DiagnosticReport, CatalogManifest, Mandate, AgentAction,
  Transaction) per spec §8.
- Seed data: two merchants with deliberately incomplete catalogs (missing descriptions,
  ambiguous availability) so the Diagnose Agent has real gaps to find.
- `/health`, `/merchants`, `/merchants/{id}`, `/merchants/{id}/catalog` endpoints.
- Dashboard shell with routing (Dashboard / Manifest / Audit Log), live-wired to the backend.

## Not built yet

Diagnose scoring, Fix manifest generation, Transact + mandate gating, the simulated Buyer Agent,
and the deliberate spend-ceiling-breach failure case — see [PROJECT_SPEC.md §11](PROJECT_SPEC.md)
for the sequence. The "what broke at 2 AM" writeup will land here once the failure case is built.
