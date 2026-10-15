import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export const HOSTILE_DETEKT_CONFIG = `formatting:
  active: true
  Indentation:
    active: true
compose:
  active: true
style:
  active: false
  excludes: ['**/*.kt']
  ignoreAnnotated: ['Marker']
  ForbiddenMethodCall:
    active: false
    severity: info
    excludes: ['**/*.kt']
    ignoreAnnotated: ['Marker']
    methods:
      - 'kotlin.io.println'
      - value: 'kotlin.run'
        reason: 'The project allows run.'
      - value: 'java.lang.Thread.sleep'
        reason: 'Use a scheduler or a test clock instead of sleeping.'
coroutines:
  active: false
potential-bugs:
  active: false
  ignoreAnnotated: ['Marker']
  UnsafeCallOnNullableType:
    severity: info
    ignoreAnnotated: ['Marker']
  CastNullableToNonNullableType:
    excludes: ['**/*.kt']
exceptions:
  active: false
  excludes: ['**/*.kt']
  TooGenericExceptionCaught:
    active: false
    excludes: ['**/*.kt']
    exceptionNames: []
`;

export const JDK_PROBE = `
tasks.matching { it.name == "nitpickerDetekt" }.configureEach {
    doLast {
        val args = (this as JavaExec).args.orEmpty()
        val out = layout.buildDirectory.get().asFile
        out.resolve("jdk-home.txt").writeText(args[args.indexOf("--jdk-home") + 1])
        out.resolve("gradle-jvm-home.txt").writeText(System.getProperty("java.home"))
    }
}
`;

export function copyJdkWithNativeImage(target) {
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
  const settings = spawnSync(java, ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
  const home = /java\.home = (.+)/.exec(settings.stderr)[1];
  execFileSync('cp', ['-a', home, target]);
  writeFileSync(path.join(target, 'bin/native-image'), '#!/bin/sh\n', { mode: 0o755 });
  return target;
}

export const TOOLCHAIN_PROBE = `
kotlin {
    jvmToolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
        nativeImageCapable.set(true)
    }
}

tasks.matching { it.name == "nitpickerDetekt" }.configureEach {
    doLast {
        layout.buildDirectory.get().asFile.resolve("toolchain-home.txt").writeText(
            javaToolchains.launcherFor(java.toolchain).get().metadata.installationPath.asFile.absolutePath,
        )
    }
}
`;

export const EXTRA_SOURCES = {
  'Annotated.kt':
    'package demo.extras\n\nannotation class Marker\n\n@Marker\nclass Annotated {\n    fun twice(): Int = run { 1 + 1 }\n}\n',
  'Wildcard.kt':
    'package demo.extras\n\nimport kotlinx.coroutines.*\n\nfun waitWildcard(): Int = runBlocking { 1 }\n',
  'Qualified.kt':
    'package demo.extras\n\nfun waitQualified(): Int = kotlinx.coroutines.runBlocking { 1 }\n',
  'Holder.kt': 'package demo.extras\n\nclass Holder(var count: Int)\n',
  'Printer.kt': 'package demo.extras\n\nfun show(): Unit = println("shown")\n',
  'Sleeper.kt': 'package demo.extras\n\nfun nap(): Unit = Thread.sleep(1)\n',
  'convention.gradle.kts': 'println("a script next to the sources")\n',
  'Hidden.kt':
    '@file:Suppress("ktlint:standard:indent")\n\npackage demo.extras\n\nval pattern = "**/*.kt"\nval maybe: String? = "a"\n\n@get:Suppress("UnsafeCallOnNullableType")\nval size: Int get() = maybe!!.length\n\n/** end */\n',
  'Compiler.kt':
    'package demo.extras\n\n@Suppress("UNCHECKED_CAST", "unused")\nfun cast(value: Any): List<String> = value as List<String>\n',
};
