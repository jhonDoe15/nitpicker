plugins {
    kotlin("jvm")
}

dependencies {
    implementation(project(":shared"))
}

kotlin {
    sourceSets.named("main") {
        kotlin.exclude("**/Generated*.kt")
    }
}
