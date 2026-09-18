# Architecture

```text
Browser
  │ same-origin JSON
  ▼
Node 24 web/API service ──► OpenRouter (server-side key, optional)
  │
  ├── static HTML/CSS/JS
  ├── rights gate
  ├── per-client rate limit
  └── SQLite FTS5 index on a private volume
          ▲
          │ page-anchored chunks
      operator-only ingest job
          ▲
          │ mounted PDF after written permission
```

The upstream Paper2Agent repository provides the conversion skill and reviewed paper-skill workflow. Its public repository does **not** contain the implementation of `paper2agent.ai/live`. This fork therefore adds a small auditable web runtime rather than pretending that the hosted site's private runtime was cloned.

The chat runtime uses page-anchored retrieval so every returned source can point back to a visible page in the official document. The SQLite index lives only in the deployment volume. Neither full text nor index is a Git artifact.

## Runtime modes

- `mock` (default): proves routing, rights state, retrieval, and UI without spending money or calling a model.
- `openrouter`: calls a server-side model after retrieval. Production should use a dedicated key restricted to the configured model and a hard monthly budget.

## Trust boundaries

- Source documents and their extracted text are untrusted input.
- Browser requests are untrusted and size/rate limited.
- Reverse-proxy headers are trusted only from a loopback peer when explicitly enabled.
- Permission evidence and model keys are runtime secrets.
