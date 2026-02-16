-- Run this in your Neon (or Postgres) SQL editor once to add connection requests.
CREATE TABLE IF NOT EXISTS connection_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_requests_to_user ON connection_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_connection_requests_status ON connection_requests(status);
