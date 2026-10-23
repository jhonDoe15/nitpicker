plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    compileOnly("org.springframework:spring-context:6.2.10")
    compileOnly("org.springframework:spring-web:6.2.10")
    compileOnly("org.springframework:spring-jdbc:6.2.10")
    compileOnly("org.springframework.data:spring-data-jpa:3.5.3")
    compileOnly("org.springframework.boot:spring-boot:3.5.5")
    compileOnly("org.springframework.boot:spring-boot-autoconfigure:3.5.5")
    compileOnly("jakarta.persistence:jakarta.persistence-api:3.1.0")
    compileOnly("org.springframework:spring-webflux:6.2.10")
    compileOnly("jakarta.ws.rs:jakarta.ws.rs-api:3.1.0")
    compileOnly("io.micronaut:micronaut-http:4.9.9")
    compileOnly("io.vertx:vertx-web:4.5.21")
    testCompileOnly("org.springframework:spring-test:6.2.10")
    testCompileOnly("org.springframework.boot:spring-boot-test:3.5.5")
    testCompileOnly("org.springframework.boot:spring-boot-test-autoconfigure:3.5.5")
}
