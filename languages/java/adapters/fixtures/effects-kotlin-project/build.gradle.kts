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
    compileOnly("org.hibernate.orm:hibernate-core:6.6.20.Final") { isTransitive = false }
    compileOnly("org.springframework.retry:spring-retry:2.0.13")
    compileOnly("org.springframework.graphql:spring-graphql:1.3.5") { isTransitive = false }
    compileOnly("com.netflix.graphql.dgs:graphql-dgs:10.0.4") { isTransitive = false }
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
}
