# Slow tests

Part of the [Python preset guide](../python-preset.md).

`test-runtime/slow-test` fails a test the change adds or edits when it takes more than 5 s as a unit
test, or more than 30 s as an integration test (`thresholds.unitTestSeconds` and
`thresholds.integrationTestSeconds`); [Runner parity](runner-parity.md) says how pytest and unittest
runs are timed and which tests count as edited. A shared fixture that a function fixture or the test
itself sets up through `request.getfixturevalue` is not charged to the test, and a function fixture
that another one requests counts once. An inherited test is reported at the file and line where it
is defined.
