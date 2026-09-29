CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canais (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contatos (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_updated_at
ON docs(updated_at);

CREATE INDEX IF NOT EXISTS idx_canais_updated_at
ON canais(updated_at);

CREATE INDEX IF NOT EXISTS idx_contatos_updated_at
ON contatos(updated_at);
