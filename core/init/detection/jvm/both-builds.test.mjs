import { describe, expect, it } from 'vitest';
import { init, readText, useProjects } from '../../test-support/projects.mjs';
import { detectProject } from '../detect-project.mts';

const project = useProjects();
const REPOSITORY = { repository: true };
const SOURCE = { 'src/main/java/App.java': 'class App {}' };
const GRADLE_NOTE =
  'pom.xml and a Gradle build both exist: using Gradle (gradlew exists), set as "java.buildTool" in nitpicker.config.json. Change it there to use Maven.';
const MAVEN_NOTE =
  'pom.xml and a Gradle build both exist: using Maven (mvnw exists and gradlew does not), set as "java.buildTool" in nitpicker.config.json. Change it there to use Gradle.';
const UNPINNED_NOTE =
  'pom.xml and a Gradle build both exist: using Gradle (gradlew exists). To choose, set "java.buildTool" ("maven" or "gradle") in nitpicker.config.json.';

function both(extra) {
  return project({ 'pom.xml': '<project/>', 'build.gradle': '', ...SOURCE, ...extra }, REPOSITORY);
}

function noteLines(stdoutText) {
  return stdoutText.split('\n').filter((line) => line.includes('both exist'));
}

describe('a project with a Maven and a Gradle build', () => {
  it('says it chose Gradle because of gradlew, and how to choose Maven', () => {
    const { summary, settings, notes } = detectProject(both({ gradlew: '', mvnw: '' }));

    expect({ summary, settings, notes }).toEqual({
      summary: 'Java, Gradle',
      settings: { java: { buildTool: 'gradle' } },
      notes: [GRADLE_NOTE],
    });
  });

  it('chooses Maven when only mvnw exists', () => {
    const { summary, settings, notes } = detectProject(both({ mvnw: '' }));

    expect({ summary, settings, notes }).toEqual({
      summary: 'Java, Maven',
      settings: { java: { buildTool: 'maven' } },
      notes: [MAVEN_NOTE],
    });
  });

  it('writes the choice into the generated config and prints the note', () => {
    const root = both({ gradlew: '' });

    const { exitCode, stdoutText } = init(root);

    expect(exitCode).toBe(0);
    expect(readText(root, 'nitpicker.config.json')).toBe(
      '{ "preset": "java", "java": {"buildTool":"gradle"} }\n',
    );
    expect(noteLines(stdoutText)).toEqual([GRADLE_NOTE]);
  });

  it('writes nothing into an existing config and says how to choose', () => {
    const existing = '{ "preset": "java" }\n';
    const root = both({ gradlew: '', 'nitpicker.config.json': existing });

    const { settings, notes } = detectProject(root);
    const { stdoutText } = init(root);

    expect({ settings, notes }).toEqual({ settings: undefined, notes: [UNPINNED_NOTE] });
    expect(readText(root, 'nitpicker.config.json')).toBe(existing);
    expect(noteLines(stdoutText)).toEqual([UNPINNED_NOTE]);
  });

  it('follows the build the config already names and says nothing about both', () => {
    const config = '{ "preset": "java", "java": { "buildTool": "maven" } }\n';
    const detected = detectProject(both({ gradlew: '', 'nitpicker.config.json': config }));

    expect({ summary: detected.summary, settings: detected.settings }).toEqual({
      summary: 'Java, Maven',
      settings: undefined,
    });
    expect(detected.notes.filter((note) => note.includes('both exist'))).toEqual([]);
  });

  it.each([
    [{ 'pom.xml': '<project/>' }, 'Maven'],
    [{ 'build.gradle': '' }, 'Gradle'],
  ])('writes no build setting when there is only one build (%j)', (files, label) => {
    const root = project({ ...files, ...SOURCE }, REPOSITORY);

    const { stdoutText } = init(root);

    expect(readText(root, 'nitpicker.config.json')).toBe('{ "preset": "java" }\n');
    expect(stdoutText.split('\n')[0]).toBe(`nitpicker init: Java, ${label} (preset "java")`);
  });
});
