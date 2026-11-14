# Troubleshooting

[Troubleshooting](../troubleshooting.md) has the cause and the fix for every failure that is not a
finding. The ones this preset meets:

- [The Gradle build fails](../troubleshooting.md#the-gradle-build-fails): a `gradle-failure` tool error
  holds the build's own output.
- [Gradle, Maven or Java is not found](../troubleshooting.md#gradle-maven-or-java-is-not-found):
  `NITPICKER_GRADLE` and `JAVA_HOME`.
- [Gradle or Maven times out](../troubleshooting.md#gradle-or-maven-times-out):
  `NITPICKER_GRADLE_TIMEOUT_MINUTES`.
- [PIT fails or times out](../troubleshooting.md#pit-fails-or-times-out): a `pit-failure` tool error
  replaces that module's mutation findings, and the other findings are still reported.
- [A project tool config is missing or broken](../troubleshooting.md#a-project-tool-config-is-missing-or-broken):
  a detekt config named by `kotlin.detektConfig` or `precedence`.
- Every preset: [Exit code 2 and tool errors](../troubleshooting.md#exit-code-2-and-tool-errors), [no merge base](../troubleshooting.md#no-merge-base) (a shallow clone), [tests fail](../troubleshooting.md#tests-fail) and [on the base](../troubleshooting.md#tests-fail-on-the-base), [another run is in progress](../troubleshooting.md#another-run-is-in-progress) and [a policy-loosened finding](../troubleshooting.md#a-policy-loosened-finding).
