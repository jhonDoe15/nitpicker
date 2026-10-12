plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

val generateApi by tasks.registering {
    val output = layout.buildDirectory.dir("generated/api")
    outputs.dir(output)
    doLast {
        val file = output.get().file("demo/Api.kt").asFile
        file.parentFile.mkdirs()
        file.writeText("package demo\n\nclass Api {\n    private val unused = 42\n    fun port(): Int = 8080 + 1\n}\n")
    }
}

kotlin {
    sourceSets.main {
        kotlin.srcDir(generateApi)
    }
}
