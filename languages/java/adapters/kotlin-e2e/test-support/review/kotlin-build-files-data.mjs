const EMPTY_JAR = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array.from({ length: 18 }, () => 0)]);

export function runtimeSerializationFiles(build) {
  return {
    'build.gradle.kts': `${build}
dependencies {
    runtimeOnly(files("libs/jackson-module-kotlin-2.17.2.jar"))
}
`,
    'libs/jackson-module-kotlin-2.17.2.jar': EMPTY_JAR,
  };
}

export function publishedFiles(build) {
  return {
    'build.gradle.kts': `${build.replace('kotlin("jvm") version', '`maven-publish`\n    kotlin("jvm") version')}
publishing {
    publications {
        create<MavenPublication>("library") {
            from(components["java"])
        }
    }
}
`,
  };
}

export function integrationSuiteFiles(build) {
  return {
    'build.gradle.kts': `${build}
testing {
    suites {
        register<JvmTestSuite>("integrationTest") {
            dependencies {
                implementation(project())
            }
        }
    }
}
`,
    'src/integrationTest/kotlin/demo/orders/PricingCheck.kt': `package demo.orders

object PricingCheck {
    fun discounted(): Int = price(100, 10)
}
`,
  };
}
