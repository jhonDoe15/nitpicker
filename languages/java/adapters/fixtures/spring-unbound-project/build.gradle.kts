plugins {
    java
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot:3.5.5")
    implementation("org.springframework.boot:spring-boot-autoconfigure:3.5.5")
    testImplementation("org.springframework.boot:spring-boot-test:3.5.5")
    testImplementation("org.springframework:spring-test:6.2.10")
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.13.4")
}

tasks.test {
    useJUnitPlatform()
}
