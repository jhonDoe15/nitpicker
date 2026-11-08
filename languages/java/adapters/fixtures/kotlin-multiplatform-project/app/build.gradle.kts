plugins {
    kotlin("jvm")
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(project(":shared"))
}

kotlin {
    sourceSets.named("main") {
        kotlin.exclude("**/Generated*.kt")
    }
}
