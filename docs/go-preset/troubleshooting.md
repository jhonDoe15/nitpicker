# Troubleshooting

[Troubleshooting](../troubleshooting.md) has the cause and the fix for every failure that is not a
finding. The ones this preset meets:

- [Go is missing from the PATH](../troubleshooting.md#go-is-missing-from-the-path): `go version`
  must work where nitpicker runs.
- [A Go module does not load](../troubleshooting.md#a-go-module-does-not-load): a `go.mod` that
  cannot be parsed, a module that cannot be downloaded or a `go.sum` that does not match.
- [`go vet` or `go test` fails to run](../troubleshooting.md#go-vet-or-go-test-fails-to-run) with
  no diagnostic or failing test to read.
- [A pinned Go tool fails to build](../troubleshooting.md#a-pinned-go-tool-fails-to-build):
  gofumpt, goimports, deadcode and the lint and inspect programs need a recent Go.
- Every preset: [Exit code 2 and tool errors](../troubleshooting.md#exit-code-2-and-tool-errors), [no merge base](../troubleshooting.md#no-merge-base) (a shallow clone), [tests fail](../troubleshooting.md#tests-fail) and [on the base](../troubleshooting.md#tests-fail-on-the-base), [another run is in progress](../troubleshooting.md#another-run-is-in-progress) and [a policy-loosened finding](../troubleshooting.md#a-policy-loosened-finding).
