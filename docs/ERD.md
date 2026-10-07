# Entity–Relationship Diagram

TypeORM entities live in `backend/src/database/entities/`; the schema itself is created by the SQL migration in `backend/src/database/migrations/`.

```mermaid
erDiagram
  CATEGORIES ||--o{ EXHIBITOR_CATEGORIES : "has entrants"
  EXHIBITORS ||--o{ EXHIBITOR_CATEGORIES : "competes in"
  IMAGES |o--o{ EXHIBITORS : "photo of"
  VISITORS ||--o{ OTP_CHALLENGES : "requests"
  VISITORS ||--o{ VOTES : "casts (max 1 per category)"
  CATEGORIES ||--o{ VOTES : "receives"
  EXHIBITORS ||--o{ VOTES : "receives"
  EXHIBITOR_CATEGORIES ||--o{ VOTES : "valid pairing"

  CATEGORIES {
    int id PK
    text slug UK
    text name
    text description
    int sort_order
    bool is_active
  }
  EXHIBITORS {
    int id PK
    text name "maker / team"
    text project
    text description
    text booth
    uuid image_id FK
    bool is_active
  }
  EXHIBITOR_CATEGORIES {
    int exhibitor_id PK, FK
    int category_id PK, FK
  }
  IMAGES {
    uuid id PK
    text mime_type
    bytea bytes
    text sha256
  }
  VISITORS {
    uuid id PK
    text name_enc "AES-256-GCM"
    text phone_enc "AES-256-GCM"
    text phone_hash UK "HMAC-SHA256 lookup key"
    text phone_last4
    timestamptz verified_at
    bool consent_outreach
    inet created_ip
  }
  OTP_CHALLENGES {
    uuid id PK
    uuid visitor_id FK
    text code_hash "HMAC(id:code)"
    text payload_enc "pending name/consent"
    int attempts "max 5"
    timestamptz expires_at
    timestamptz consumed_at
  }
  VOTES {
    bigint id PK
    uuid visitor_id FK
    int category_id FK
    int exhibitor_id FK
    inet ip
    float geo_lat
    float geo_lng
    timestamptz created_at
  }
  ADMINS {
    int id PK
    text username UK
    text password_hash "scrypt"
    text totp_secret_enc
    bool totp_enabled
    text role "admin | viewer"
    int failed_logins
    timestamptz locked_until
  }
  SETTINGS {
    text key PK "event | voting | access | display"
    jsonb value
  }
  AUDIT_LOG {
    bigint id PK
    text actor
    text action
    jsonb detail
    inet ip
    timestamptz created_at
  }
```

## Integrity rules enforced by the database

| Rule | Constraint |
|---|---|
| One vote per visitor per category (F12) | `UNIQUE (visitor_id, category_id)` on `votes` |
| A vote must name an exhibitor that is actually in that category | composite FK `votes(exhibitor_id, category_id) → exhibitor_categories` |
| One visitor record per phone number | `UNIQUE (phone_hash)` on `visitors` |
| Unique usernames / category slugs | `UNIQUE` constraints |
| Tally speed | index `votes (category_id, exhibitor_id)` |

Because these rules live in PostgreSQL rather than in application code, they hold even under concurrent double-taps, multiple replicas and replayed requests (covered by `test/api.test.js` → "concurrent double-submits").

## `settings` documents

| key | shape |
|---|---|
| `event` | `{ name, tagline, venue }` |
| `voting` | `{ open: bool, opens_at: ISO?, closes_at: ISO? }` |
| `access` | `{ mode: off\|ip\|geo\|ip_or_geo\|ip_and_geo, allowed_cidrs: string[], geofence: { lat, lng, radius_m, max_accuracy_m } }` |
| `display` | `{ key: string, show_counts: bool }` |
