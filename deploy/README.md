# Production deployment

The production host keeps the repository under `~/projects/paper2agent-nvl-asthma` and all restricted material outside Git history.

## Private inputs

Create these files with mode `0600`:

- `source/nvl-002l_S3_Asthma_2024-08.pdf` — the official 183-page PDF, SHA-256 `8b9540b03b4cd3c8f0276e07bf93dac20aa44e9a4dee6e29d1648124d1baa126`;
- `secrets/nvl-permission.txt` — a concise operator record of the permission scope plus the SHA-256 of the original correspondence retained privately;
- `secrets/openrouter.key` — a dedicated key restricted to `deepseek/deepseek-v4.1-flash` and a hard monthly budget.

Never commit the inputs, the extracted SQLite volume, or the original permission correspondence.

## Install and ingest

```bash
./deploy/install-user-service.sh
docker compose --env-file ~/.config/paper2agent-nvl-asthma/runtime.env \
  -f compose.yaml -f compose.nvl-permission.yaml \
  --profile tools run --rm ingest
systemctl --user start paper2agent-nvl-asthma.service
```

The service binds only to `127.0.0.1:18080`. The Pangolin resource must target that loopback address through the host-networked site connector.

## Verification

```bash
curl --fail --silent http://127.0.0.1:18080/healthz
curl --fail --silent http://127.0.0.1:18080/readyz
curl --fail --silent http://127.0.0.1:18080/api/papers
docker inspect paper2agent-nvl-asthma-web-1 \
  --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}}'
```

Then verify the public HTTPS page, anonymous access policy, a real page-cited answer, and the provider key's model/budget restrictions. A deployment is not complete while `/readyz` is non-200 or any cited page falls outside the displayed retrieval evidence.

## Update and rollback

Before an update, record the current commit and copy the private SQLite volume with Docker stopped. Deploy only a tested commit from `main`. If verification fails, check out the previous commit, rebuild with `systemctl --user reload paper2agent-nvl-asthma.service`, and restore the matching database backup if the schema changed.
