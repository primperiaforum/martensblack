CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  fname TEXT,
  lname TEXT,
  tname TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  status TEXT,
  company TEXT,
  sfera TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  origin TEXT,
  user_agent TEXT,
  payload_json TEXT NOT NULL,
  tracking_json TEXT,
  forward_status TEXT NOT NULL DEFAULT 'pending',
  crm_status INTEGER,
  forward_error TEXT,
  forwarded_at TEXT
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_forward_status_idx ON leads(forward_status);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
