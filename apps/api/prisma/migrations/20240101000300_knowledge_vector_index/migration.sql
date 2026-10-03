-- Section 5.1(b): pgvector extension and an approximate nearest-neighbor
-- index over KnowledgeItem.embedding, used by the knowledge retrieval
-- similarity query (Module 8, A8.1/A8.2). Already created by the baseline
-- migration so the embedding column itself could exist; repeated here
-- (idempotently) to keep this migration self-contained per the spec.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX knowledge_item_embedding_idx ON "KnowledgeItem"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
