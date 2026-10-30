plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    compileOnly("org.springframework:spring-web:6.2.10")
    compileOnly("org.apache.kafka:kafka-clients:3.9.1")
}
