These are the seven original backend modules captured from the active `align`
project before the memory fixes on 2026-10-21. The benchmark's isolated TypeScript
loader substitutes them only for the `before` variant. They are plain-text fixture
sources and are never imported by application routes or deployed as workers.

Both variants use the same mock database with real projection semantics, local
synthetic Drive files and loopback mock Gmail HTTP sink. The baseline gets numeric
identity-wrapper measurements at allocation boundaries; wrappers do not retain
message or attachment data. No original application data or secrets are included.
