function testClass(name, expected) {
  return `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class ${name} {
    @Test
    fun parses() {
        assertEquals(${String(expected)}, Shapes(listOf("a")).parse("3"))
    }
}
`;
}

const SHAPES = `package demo

sealed interface Shape

data class Circle(val radius: Double) : Shape

data class Square(val side: Double) : Shape

class Shapes(private val names: List<String>) {
    fun area(shape: Shape): Double =
        when (shape) {
            is Circle -> Math.PI * shape.radius * shape.radius
            is Square -> shape.side * shape.side
        }

    fun parse(text: String): Int = text.toIntOrNull() ?: names.size

    fun limit(): Int = 42

    fun sum(first: Int, second: Int, third: Int, fourth: Int): Int = first + second + third + fourth
}
`;

const MESSY = `package demo

class Messy { fun one(): List<String> { return listOf() } }
`;

export function kotlinLevelFiles(release) {
  return {
    'settings.gradle.kts': 'rootProject.name = "levels"\n',
    'build.gradle.kts': `plugins {
    kotlin("jvm") version "2.4.21"
}

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(${String(release)})
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}
`,
    'src/main/kotlin/demo/Shapes.kt': SHAPES,
    'src/main/kotlin/demo/Messy.kt': MESSY,
    'src/test/kotlin/demo/ShapesTest.kt': testClass('ShapesTest', 3),
    'src/test/kotlin/demo/BrokenTest.kt': testClass('BrokenTest', 2),
  };
}

export const KOTLIN_POLICY = {
  preset: 'kotlin',
  kotlinFormatter: 'ktfmt',
  testSeconds: { unitTestSeconds: -1 },
};
