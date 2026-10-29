import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { repositoryBlocks, resolutionSettings } from './project-repositories.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-repositories-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const GROOVY_SETTINGS = `pluginManagement {
  repositories { gradlePluginPortal() }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    maven {
      url 'https://nexus.example/repository/maven-public/' /* mirror { } */
      credentials {
        username = nexusUser
        password = nexusPassword
      }
    }
  }
}
include 'app'
`;

describe('repositoryBlocks', () => {
  it('reads the body of the named blocks only, keeping nested blocks and strings with braces', () => {
    const text = `buildscript { repositories { google() } }
repositories {
    maven { url = uri("https://x.example/{a}") }
}
allprojects { repositories { mavenLocal() } }
dependencies { implementation("a:b:1") }
`;

    expect(repositoryBlocks(text, [['repositories'], ['allprojects', 'repositories']])).toEqual([
      'maven { url = uri("https://x.example/{a}") }',
      'mavenLocal()',
    ]);
  });
});

describe('resolutionSettings', () => {
  it('copies the repositories a Groovy settings file declares for dependency resolution', () => {
    const root = project({
      'settings.gradle': GROOVY_SETTINGS,
      'build.gradle': "plugins { id 'java' }\n",
    });

    expect(resolutionSettings(root)).toEqual({
      file: 'settings.gradle',
      sources: ['settings.gradle'],
      text: [
        "rootProject.name = 'nitpicker-fix-tools'",
        'dependencyResolutionManagement {',
        '    repositories {',
        '        maven {',
        "        url 'https://nexus.example/repository/maven-public/'",
        '        credentials {',
        '        username = nexusUser',
        '        password = nexusPassword',
        '        }',
        '        }',
        '    }',
        '}',
        '',
      ].join('\n'),
    });
  });
  it('copies the repositories of a Kotlin build file and keeps its language', () => {
    const root = project({
      'settings.gradle.kts': 'rootProject.name = "demo"\n',
      'build.gradle.kts': 'repositories {\n    maven("https://mirror.example/m2")\n}\n',
    });

    expect(resolutionSettings(root)).toEqual({
      file: 'settings.gradle.kts',
      sources: ['build.gradle.kts'],
      text: [
        'rootProject.name = "nitpicker-fix-tools"',
        'dependencyResolutionManagement {',
        '    repositories {',
        '        maven("https://mirror.example/m2")',
        '    }',
        '}',
        '',
      ].join('\n'),
    });
  });
  it('falls back to Maven Central when the project declares no repositories', () => {
    const root = project({ 'build.gradle': "plugins { id 'java' }\n" });

    expect([
      resolutionSettings(root).sources,
      resolutionSettings(root).text.split('\n')[3],
    ]).toEqual([[], '        mavenCentral()']);
  });
});
