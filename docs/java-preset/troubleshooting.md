# Troubleshooting

[Troubleshooting](../troubleshooting.md) has the cause and the fix for every failure that is not a
finding. The ones this preset meets:

- [The Gradle build fails](../troubleshooting.md#the-gradle-build-fails) and
  [the Maven build fails](../troubleshooting.md#the-maven-build-fails): a `gradle-failure` or
  `maven-failure` tool error holds the build's own output.
- [Gradle, Maven or Java is not found](../troubleshooting.md#gradle-maven-or-java-is-not-found):
  `NITPICKER_GRADLE`, `NITPICKER_MAVEN` and `JAVA_HOME`.
- [Gradle or Maven times out](../troubleshooting.md#gradle-or-maven-times-out):
  `NITPICKER_GRADLE_TIMEOUT_MINUTES`.
- [Error Prone cannot find a JDK](../troubleshooting.md#error-prone-cannot-find-a-jdk).
- [A project tool config is missing or broken](../troubleshooting.md#a-project-tool-config-is-missing-or-broken):
  a Checkstyle or PMD config named by `precedence`.
- Every preset: [Exit code 2 and tool errors](../troubleshooting.md#exit-code-2-and-tool-errors), [no merge base](../troubleshooting.md#no-merge-base) (a shallow clone), [tests fail](../troubleshooting.md#tests-fail) and [on the base](../troubleshooting.md#tests-fail-on-the-base), [another run is in progress](../troubleshooting.md#another-run-is-in-progress) and [a policy-loosened finding](../troubleshooting.md#a-policy-loosened-finding).
