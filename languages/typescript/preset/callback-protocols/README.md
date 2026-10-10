# Callback protocol architecture policy

`node languages/typescript/preset/callback-protocols/report.mjs` scans all production TypeScript sources below `src/main`. Tests, declarations, dependencies, and build outputs are excluded by file role. Any finding produces exit code 1. `CALLBACK_PROTOCOL_SOURCE_ROOT` can select an extracted source tree for differential validation.

Contracts in `contracts.mjs` identify callback roles on APIs. The analyzer itself contains no feature names, consumer paths, or naming convention for loader methods. A contract specifies its callee, options argument, source callbacks, correlation-input positions, forbidden external publication callbacks, and full-snapshot read methods.

The rules require correlated callbacks to declare their correlation input, keep publication commits with the state owner, and prevent a source callback from reading the full published snapshot of its own target. Bounded reads of accepted metadata and snapshots of independent upstream sources remain valid.

The syntactic resolver follows same-file callback/function/method references, `.bind`, option spreads, variable aliases, local calls, and target parameters. Imported API aliases are recognized. It does not perform cross-module call-graph inference or resolve dynamically assembled callback/options objects; type checking remains a separate gate. Synthetic tests verify rule behavior with an unrelated configurable API and arbitrary source paths.
