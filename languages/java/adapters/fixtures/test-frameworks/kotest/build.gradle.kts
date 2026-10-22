plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("io.kotest:kotest-runner-junit5:6.0.7")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.4.1")
}

tasks.test {
    useJUnitPlatform()
}
