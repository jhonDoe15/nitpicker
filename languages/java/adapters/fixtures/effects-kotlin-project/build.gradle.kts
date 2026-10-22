plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    compileOnly("org.springframework:spring-context:6.2.10")
    compileOnly("org.springframework:spring-web:6.2.10")
    compileOnly("org.springframework:spring-tx:6.2.10")
    compileOnly("org.springframework.data:spring-data-jpa:3.5.3")
    compileOnly("org.springframework.kafka:spring-kafka:3.3.0")
    compileOnly("jakarta.persistence:jakarta.persistence-api:3.1.0")
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
}
