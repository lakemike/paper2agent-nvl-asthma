<p align="center">
  <img src="./logo/paper2agent_logo.png" alt="Paper2Agent Logo" width="600" />
</p>

# Paper2Agent · NVL Asthma web runtime

This public fork of [jmiao24/Paper2Agent](https://github.com/jmiao24/Paper2Agent) extends the upstream conversion skill with an auditable, citation-first web application. The target is a deployable page where an authorized source can be selected and queried, beginning with the **Nationale VersorgungsLeitlinie Asthma, Version 5.0 (2024)**.

> **Current state:** repository, web UI, API, retrieval database, guarded ingest job, Docker deployment, tests, and CI are present. The NVL itself is deliberately **rights-locked**. Its PDF, prose, embeddings, and index are not in this repository and the public chat cannot be activated until the NVL rights holders grant written permission for this use. See [RIGHTS.md](RIGHTS.md).

## Why this fork adds a runtime

The upstream MIT-licensed repository contains the Paper2Agent orchestration skill, converters, verification workflow, and examples. It does **not** publish the source of the hosted [`paper2agent.ai/live`](https://paper2agent.ai/live) runtime. This fork keeps the upstream history and skill intact, then adds a compact open implementation that reaches a real browser page and server API.

## What is included

- the complete upstream Paper2Agent skill under `skills/paper2agent/`;
- a responsive no-build web client in `web/`;
- a Node 24 API with server-side OpenRouter support;
- page-anchored SQLite FTS5 retrieval and visible page references;
- an operator-only PDF ingest command with hash and page-count verification;
- hard rights activation gates;
- loopback-first Docker Compose deployment with read-only container hardening;
- unit tests, repository leak checks, Docker health check, and GitHub Actions CI.

## Safe quick start

The default starts in mock mode and shows the real rights status. It does not call a model or ingest protected content.

```bash
cp .env.example .env
docker compose up --build
```

Open <http://127.0.0.1:8080>. The NVL card will remain locked by design.

Run local checks:

```bash
npm ci --ignore-scripts
npm run ci
docker build -t paper2agent-nvl-asthma:test .
```

## Activation after written permission

Only after the permission scope explicitly covers the intended electronic/public use:

1. Place the official PDF at `source/nvl-002l_S3_Asthma_2024-08.pdf`.
2. Place a private permission record at `secrets/nvl-permission.txt`.
3. Set `SOURCE_USE_PERMISSION_GRANTED=true`.
4. Build the private index:

   ```bash
   docker compose -f compose.yaml -f compose.nvl-permission.yaml \
     --profile tools run --rm ingest
   ```

5. Start the rights-enabled mock deployment and verify retrieval:

   ```bash
   docker compose -f compose.yaml -f compose.nvl-permission.yaml up --build
   ```

6. Add a **dedicated, model-restricted, hard-budget-capped** OpenRouter key at `secrets/openrouter.key`, then enable the model provider:

   ```bash
   docker compose \
     -f compose.yaml \
     -f compose.nvl-permission.yaml \
     -f compose.openrouter.yaml \
     up -d --build
   ```

Do not reuse a broad personal key or the OpenClaw agent's own runtime key for a public website.

## API

- `GET /healthz` — liveness and non-secret runtime state
- `GET /api/papers` — configured papers, rights/index status
- `POST /api/chat` — source-bound chat for an available paper

Chat requests are not persisted. The model receives only the recent bounded conversation and retrieved source chunks. The browser receives the answer and page/heading references, never the raw chunks or provider key.

## Deployment model

The container binds to `127.0.0.1` by default. Put a TLS reverse proxy or tunnel in front of it and keep the backend port off the LAN. See [docs/architecture.md](docs/architecture.md) and [SECURITY.md](SECURITY.md).

## Upstream sync

```bash
git remote add upstream https://github.com/jmiao24/Paper2Agent.git
git fetch upstream
git merge upstream/main
```

Review every upstream change before deployment. Never commit source documents or runtime data during a sync.

## License and attribution

Paper2Agent code remains under the upstream [MIT License](LICENSE), copyright Jiacheng Miao. New code in this fork is contributed under the same license. This license does **not** apply to third-party papers or guidelines. The NVL rights remain with its named rights holders.

## Medical safety

This software supports document retrieval and summarization. It is not a medical device and does not replace professional diagnosis, treatment, or review of the current official guideline.
