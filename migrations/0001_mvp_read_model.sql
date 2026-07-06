CREATE TABLE IF NOT EXISTS tool_cards (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  confidence TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  document_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  tool_id TEXT PRIMARY KEY,
  overall_score INTEGER NOT NULL,
  recommendation_level TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  evidence_quality TEXT NOT NULL,
  document_json TEXT NOT NULL,
  FOREIGN KEY (tool_id) REFERENCES tool_cards(id)
);

CREATE TABLE IF NOT EXISTS search_documents (
  tool_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  confidence TEXT NOT NULL,
  rating_overall INTEGER NOT NULL,
  search_text TEXT NOT NULL,
  FOREIGN KEY (tool_id) REFERENCES tool_cards(id)
);

CREATE INDEX IF NOT EXISTS idx_tool_cards_type ON tool_cards(type);
CREATE INDEX IF NOT EXISTS idx_tool_cards_risk ON tool_cards(risk_level);
CREATE INDEX IF NOT EXISTS idx_ratings_level ON ratings(recommendation_level);
CREATE INDEX IF NOT EXISTS idx_search_documents_risk ON search_documents(risk_level);
