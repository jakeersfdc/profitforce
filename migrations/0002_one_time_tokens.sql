-- One-time tokens for mobile session transfer
CREATE TABLE IF NOT EXISTS one_time_tokens (
  token TEXT PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
