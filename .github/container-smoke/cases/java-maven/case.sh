SAMPLE=languages/java/adapters/fixtures/gradle-project
OVERLAYS=java-gradle
prepare() {
  cp "$repo/languages/java/maven/fixtures/single/pom.xml" "$work/pom.xml"
  rm "$work/build.gradle" "$work/settings.gradle"
}
PRESET=java
VIOLATION_RULE='^errorprone/EmptyCatch$'
