# Security policy

## Design

- Model-provider keys stay server-side and can be mounted from a file.
- The browser never receives source chunks or provider credentials.
- Chat bodies are not persisted or logged by the application.
- The default deployment binds to loopback, drops Linux capabilities, uses a read-only root filesystem, and applies a per-client hourly limit.
- Retrieved source text is treated as untrusted data in the model prompt.
- Restricted sources remain locked unless permission acknowledgement and evidence are both present.

## Reporting

Please use GitHub's private vulnerability-reporting feature for this repository. Do not open a public issue containing credentials, patient information, exploit details, or protected source text.

## Deployment cautions

- Use a dedicated, model-restricted, budget-capped OpenRouter key for the public service.
- Put the service behind TLS and an abuse-control layer.
- Do not accept uploads in the public deployment.
- Do not send patient-identifying information to the chat endpoint.
