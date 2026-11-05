plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactive:1.10.2")
    implementation("io.projectreactor:reactor-core:3.7.9")
    implementation("io.projectreactor.kotlin:reactor-kotlin-extensions:1.2.3")
    compileOnly("org.springframework:spring-webflux:6.2.10")
    compileOnly("org.springframework:spring-web:6.2.10")
}
