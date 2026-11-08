import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { metadataJson, writeJar } from '../test-support/metadata-jar.mjs';
import { metadataOf, readClasspathMetadata } from './classpath-metadata.mjs';
import { readJarEntries } from './jar-entries.mjs';

const MAIN = 'META-INF/spring-configuration-metadata.json';
const ADDITIONAL = 'META-INF/additional-spring-configuration-metadata.json';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-metadata-'));
  roots.push(root);
  return root;
}

describe('readJarEntries', () => {
  it.each([
    ['deflated', {}],
    ['stored, after an archive comment', { stored: true, comment: 'built' }],
  ])('reads %s entries by name', (_, options) => {
    const jar = path.join(scratch(), 'library.jar');
    const files = { 'a.txt': 'alpha', [MAIN]: '{"properties":[]}', 'b/c.txt': 'gamma'.repeat(100) };
    writeJar(jar, files, options);
    expect(readJarEntries(jar, [MAIN, 'b/c.txt'])).toEqual([
      { name: MAIN, text: '{"properties":[]}' },
      { name: 'b/c.txt', text: 'gamma'.repeat(100) },
    ]);
  });

  it('finds nothing in a file that is not an archive', () => {
    const root = scratch();
    writeFileSync(path.join(root, 'broken.jar'), 'not a zip');
    expect(readJarEntries(path.join(root, 'broken.jar'), [MAIN])).toEqual([]);
  });
});

describe('readClasspathMetadata', () => {
  it('merges the metadata of jars and directories and notes whether Spring Boot is on the classpath', () => {
    const root = scratch();
    writeJar(path.join(root, 'spring-boot-3.5.5.jar'), {
      [MAIN]: metadataJson({ groups: ['server'], properties: ['server.port'] }),
    });
    writeJar(path.join(root, 'library-1.0.jar'), {
      [ADDITIONAL]: metadataJson({
        properties: [
          {
            name: 'library.old',
            type: 'java.lang.String',
            deprecation: { level: 'error', replacement: 'library.new' },
          },
        ],
      }),
    });
    mkdirSync(path.join(root, 'classes/META-INF'), { recursive: true });
    writeFileSync(path.join(root, 'classes', MAIN), metadataJson({ properties: ['app.name'] }));
    writeFileSync(path.join(root, 'notes.txt'), 'not a jar');
    expect(
      readClasspathMetadata(
        ['spring-boot-3.5.5.jar', 'library-1.0.jar', 'notes.txt', 'missing.jar'].map((name) =>
          path.join(root, name),
        ),
        [path.join(root, 'classes'), path.join(root, 'absent')],
      ),
    ).toEqual({
      boot: true,
      groups: ['server'],
      properties: [
        { name: 'server.port', type: 'java.lang.String', removed: false },
        {
          name: 'library.old',
          type: 'java.lang.String',
          removed: true,
          replacement: 'library.new',
        },
        { name: 'app.name', type: 'java.lang.String', removed: false },
      ],
    });
    expect(readClasspathMetadata([path.join(root, 'spring-context-6.2.10.jar')]).boot).toBe(false);
  });

  it('skips unreadable JSON and entries without a name', () => {
    expect(
      metadataOf(['{', '{"properties":[{"type":"x"},{"name":"a.b"}],"groups":"none"}']),
    ).toEqual({
      properties: [{ name: 'a.b', type: undefined, removed: false }],
      groups: [],
    });
  });
});
