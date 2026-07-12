CREATE TABLE IF NOT EXISTS feedback_votes (
  github_user_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (github_user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS feedback_votes_tool_vote_idx ON feedback_votes (tool_id, vote);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  github_user_id TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  mutation_count INTEGER NOT NULL CHECK (mutation_count >= 1)
);
