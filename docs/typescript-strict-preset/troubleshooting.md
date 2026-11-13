# Troubleshooting

[Troubleshooting](../troubleshooting.md) has the cause and the fix for every failure that is not a
finding. The ones the TypeScript, JavaScript and React presets meet:

- [A peer tool is missing](../troubleshooting.md#a-peer-tool-is-missing) and
  [dependencies are not installed](../troubleshooting.md#dependencies-are-not-installed).
- [Installing the base dependencies fails](../troubleshooting.md#installing-the-base-dependencies-fails),
  [the package manager is not installed](../troubleshooting.md#the-package-manager-is-not-installed) and
  [unsupported Yarn setup](../troubleshooting.md#unsupported-yarn-setup).
- [The test runner ran no tests](../troubleshooting.md#the-test-runner-ran-no-tests),
  [a test runner is not installed](../troubleshooting.md#a-test-runner-is-not-installed),
  [Jest collects no coverage](../troubleshooting.md#jest-collects-no-coverage) and
  [test timeouts need Vitest](../troubleshooting.md#test-timeouts-need-vitest).
- [The lint or type-check engine cannot run](../troubleshooting.md#the-lint-or-type-check-engine-cannot-run),
  [a project package does not support this ESLint](../troubleshooting.md#a-project-package-does-not-support-this-eslint),
  [the TypeScript config cannot be read](../troubleshooting.md#the-typescript-config-cannot-be-read) and
  [the base does not type check](../troubleshooting.md#the-base-does-not-type-check).
- [Mutation testing is skipped for this runner](../troubleshooting.md#mutation-testing-is-skipped-for-this-runner).
- [A TypeScript or JavaScript tool fails](../troubleshooting.md#a-typescript-or-javascript-tool-fails):
  ESLint, Prettier, `tsc`, dependency-cruiser, knip, jscpd, Stryker or the test runner exits with an
  error.
- [A project tool config is missing or broken](../troubleshooting.md#a-project-tool-config-is-missing-or-broken)
  for Prettier.
- [Windows and WSL](../troubleshooting.md#windows-and-wsl): the base install needs WSL.
- Every preset: [Exit code 2 and tool errors](../troubleshooting.md#exit-code-2-and-tool-errors), [no merge base](../troubleshooting.md#no-merge-base) (a shallow clone), [tests fail](../troubleshooting.md#tests-fail) and [on the base](../troubleshooting.md#tests-fail-on-the-base), [another run is in progress](../troubleshooting.md#another-run-is-in-progress) and [a policy-loosened finding](../troubleshooting.md#a-policy-loosened-finding).
