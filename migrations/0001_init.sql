-- AgentFit v1 schema (requirements §9). Plans, logs and health data live in the
-- user's Google Drive, not here (PL-07, HD-01, open question 11 → Drive).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'google',
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  -- [DEFERRED] billing: region, currency, status, fee_anniversary_day
  last_active_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE memory_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_conversation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_memory_user ON memory_notes(user_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  summary TEXT,
  summary_upto_msg_id TEXT,
  memory_off INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conv_user ON conversations(user_id, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- user | assistant
  content_json TEXT NOT NULL,         -- { text, drafts?, error? }
  tokens_in INTEGER, tokens_out INTEGER,
  model TEXT, billing_mode TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

CREATE TABLE plan_meta (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- workout | meal
  current_version INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE custom_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  details_json TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

-- Credits: v1 only writes the starter grant (V1-CR-01). The other types are for the billing release.
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- topup|grant|ai_charge|platform_fee|refund|adjustment
  credits INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (ref_type, ref_id)
);
CREATE INDEX idx_ledger_user ON ledger_entries(user_id);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  message_id TEXT,
  purpose TEXT NOT NULL,              -- chat | journey | memory | summary | title
  mode TEXT NOT NULL,                 -- platform | byok
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_cached INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  est_cost_usd_micros INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,                  -- UTC YYYY-MM-DD, for caps
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_usage_user_day ON usage_events(user_id, day);
CREATE INDEX idx_usage_day ON usage_events(day, mode);

CREATE TABLE cap_hits (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- user_tokens | user_requests | global_spend | rate
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day, kind)
);

CREATE TABLE video_alerts (
  exercise_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  status TEXT NOT NULL,               -- removed | private | error
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (exercise_id, video_id)
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, day)
);

-- One row per AI request in platform-key mode, for rate limits and daily request caps.
CREATE TABLE request_log (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_request_log ON request_log(user_id, at);
