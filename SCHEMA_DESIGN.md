# Database Schema Overview

## Redesigned SQLite Schema

```
┌─────────────────────────────────────────────────────────────┐
│                     APIS Table                              │
├─────────────────────────────────────────────────────────────┤
│ id (PK)  │ name (UNIQUE) │ base_url │ created_at            │
└──────────────────────┬──────────────────────────────────────┘
                       │ 1:N relationship
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  ENDPOINTS Table                            │
├─────────────────────────────────────────────────────────────┤
│ id (PK)  │ api_id (FK) │ path │ method │ expected_status   │
│ expected_fields (JSON) │ body_fixture_params (JSON)         │
│ created_at                                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ 1:N relationship
                       ▼
      ┌────────────────┴───────────────┐
      ▼                                ▼
┌──────────────────┐        ┌──────────────────┐
│  PROBES Table    │        │  BASELINES Table │
├──────────────────┤        ├──────────────────┤
│ id (PK)          │        │ id (PK)          │
│ api_id (FK)      │        │ api_id (FK)      │
│ endpoint_id (FK) │        │ endpoint_id (FK) │
│ passed (0/1)     │◄──────┤ probe_id (FK) ◄──┘ 1:1
│ status_code      │        │ baseline_time    │
│ body_size        │        └──────────────────┘
│ probe_time       │
└──────────────────┘
```

## Query File Mapping

| File | Purpose | Key Functions |
|------|---------|---|
| `api.queries.ts` | API definitions | insertOrGetApi, getApiById, getAllApis |
| `endpoints.queries.ts` | Endpoint definitions | insertEndpoint, getEndpointsByApi, updateEndpoint |
| `probe.queries.ts` | Probe results | insertProbeResult, getProbesByApi, getProbeStats |
| `baseline.queries.ts` | Baseline tracking | insertBaseline, getLatestBaseline, getBaselinesByApi |

## Data Flow

1. **Load Configuration** → Parse resources.yaml with APIs and endpoints
2. **Initialize DB** → Create/retrieve API and Endpoint records
3. **Run Probes** → Execute endpoint checks → Store in Probes table
4. **Capture Baseline** → Link probes to Baselines table
5. **Query Results** → Compare against previous baselines

## Key Design Decisions

✅ **Minimal APIs Table** - Only stores `name` and `base_url`
✅ **Structured Endpoints** - Contains all endpoint metadata
✅ **Flexible Fixtures** - `expected_fields` and `body_fixture_params` stored as JSON arrays
✅ **Lightweight Baselines** - References probes directly, no data duplication
✅ **Indexed Queries** - Foreign keys and timestamps indexed for performance
✅ **Cascading Deletes** - Removing API removes all related endpoints and probes
