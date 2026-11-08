plugins {
    kotlin("multiplatform")
}

repositories {
    mavenCentral()
}

kotlin {
    jvm()
    sourceSets {
        commonMain {
            kotlin.exclude("**/Legacy*.kt")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}
