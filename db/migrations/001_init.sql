CREATE TABLE logs (
  event_id      UUID         NOT NULL,
  ts            TIMESTAMPTZ  NOT NULL,
  ingested_at   TIMESTAMPTZ  NOT NULL,
  tenant        TEXT         NOT NULL,
  source        TEXT         NOT NULL,
  event_type    TEXT         NOT NULL,
  event_subtype TEXT,
  severity      SMALLINT     NOT NULL,
  action        TEXT         NOT NULL,
  src_ip        INET,
  dst_ip        INET,
  "user"        TEXT,
  host          TEXT,
  attrs         JSONB        NOT NULL,
  raw           TEXT,
  tags          TEXT[]       NOT NULL,
  PRIMARY KEY (ts, event_id)
) PARTITION BY RANGE (ts);

CREATE TABLE logs_2026_09_04 PARTITION OF logs
  FOR VALUES FROM ('2026-09-04') TO ('2026-09-05');

CREATE TABLE logs_2026_09_05 PARTITION OF logs
  FOR VALUES FROM ('2026-09-05') TO ('2026-09-06');

CREATE INDEX ON logs (tenant, ts DESC);
CREATE INDEX ON logs (tenant, source, ts DESC);
CREATE INDEX ON logs (tenant, event_type, ts DESC);
CREATE INDEX ON logs (tenant, src_ip, ts DESC) WHERE src_ip IS NOT NULL;
CREATE INDEX ON logs USING GIN (attrs jsonb_path_ops);

-- ============ control plane ============

CREATE TABLE tenants (
  id          TEXT         PRIMARY KEY,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT         NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  role           TEXT         NOT NULL CHECK (role IN ('admin', 'viewer')),
  tenants        TEXT[]       NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant      TEXT         NOT NULL REFERENCES tenants(id),
  source      TEXT,
  key_hash    TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE alert_rules (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant          TEXT         NOT NULL REFERENCES tenants(id),
  name            TEXT         NOT NULL,
  condition       JSONB        NOT NULL,
  channel         TEXT         NOT NULL CHECK (channel IN ('ui', 'webhook', 'email')),
  channel_config  JSONB        NOT NULL DEFAULT '{}',
  enabled         BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID         NOT NULL REFERENCES alert_rules(id),
  tenant        TEXT         NOT NULL,
  triggered_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  status        TEXT         NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ack', 'closed')),
  dedupe_key    TEXT         NOT NULL,
  details       JSONB        NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX ON alert_events (rule_id, dedupe_key) WHERE status = 'open';
