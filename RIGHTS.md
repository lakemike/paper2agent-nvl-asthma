# Source rights and activation gate

## NVL Asthma 2024

The first planned source is the **Nationale VersorgungsLeitlinie Asthma, Version 5.0 (2024)**, AWMF register `nvl-002`.

- Official landing page: <https://register.awmf.org/de/leitlinien/detail/nvl-002>
- Rights holders named by the document: Bundesärztekammer (BÄK), Kassenärztliche Bundesvereinigung (KBV), and Arbeitsgemeinschaft der Wissenschaftlichen Medizinischen Fachgesellschaften (AWMF).
- Rights notice: page 2 says the work is protected in all parts and requires written consent for reproduction and for storage, use, or exploitation in electronic systems, intranets, and the internet. It separately permits unrestricted third-party use of figures and tables created for the guideline.

That wording does **not** permit this project to publish the PDF, extracted prose, search index, embeddings, or a public chat service over the full text without written consent. The repository therefore contains only public bibliographic metadata and code.

## Enforced activation conditions

Restricted ingestion and chat require both:

1. `SOURCE_USE_PERMISSION_GRANTED=true`; and
2. a non-empty evidence file mounted at `PERMISSION_EVIDENCE_FILE`.

The evidence itself is an operator secret and must never be committed. The gate is deliberate defense in depth, not a substitute for legal review.

## Never commit

- the NVL PDF;
- extracted or normalized full text;
- a generated Paper2Agent paper skill containing protected prose;
- SQLite indexes, embeddings, or vector-store snapshots;
- permission correspondence;
- model-provider credentials.

When written permission is obtained, record its scope and expiry in private operations documentation and mount the evidence at runtime. If permission is narrower than public internet use, do not activate a public endpoint.
