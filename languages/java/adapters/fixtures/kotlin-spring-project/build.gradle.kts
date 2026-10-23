plugins {
    kotlin("jvm") version "2.4.21"
    kotlin("plugin.spring") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    compileOnly("org.springframework:spring-context:6.2.10")
    compileOnly("org.springframework:spring-tx:6.2.10")
    compileOnly("org.springframework:spring-web:6.2.10")
    compileOnly("org.springframework:spring-webflux:6.2.10")
    compileOnly("org.springframework:spring-jdbc:6.2.10")
    compileOnly("org.springframework.data:spring-data-jpa:3.5.3")
    compileOnly("org.springframework.boot:spring-boot:3.5.5")
    compileOnly("org.springframework.boot:spring-boot-autoconfigure:3.5.5")
    compileOnly("org.springframework.security:spring-security-config:6.5.3")
    compileOnly("org.springframework.security:spring-security-web:6.5.3")
    compileOnly("org.springframework.security:spring-security-core:6.5.3")
    compileOnly("org.springframework.security:spring-security-crypto:6.5.3")
    compileOnly("com.fasterxml.jackson.core:jackson-databind:2.19.2")
    compileOnly("jakarta.annotation:jakarta.annotation-api:2.1.1")
    compileOnly("jakarta.persistence:jakarta.persistence-api:3.1.0")
    compileOnly("jakarta.validation:jakarta.validation-api:3.0.2")
    compileOnly("jakarta.transaction:jakarta.transaction-api:2.0.1")
    compileOnly("org.slf4j:slf4j-api:2.0.17")
}
