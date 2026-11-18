import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectWideReport } from '../../../builds/project-wide.mts';

const JAVA = [
  'package shop;',
  'class Client {',
  '  Foo load(HttpClient client, HttpRequest request) throws Exception {',
  '    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
  '    return mapper.readValue(response.body(), Foo.class);',
  '  }',
  '}',
  '',
].join('\n');

const KOTLIN = [
  'package shop',
  'class Notes {',
  '  fun load(client: HttpClient, request: HttpRequest): Foo {',
  '    val response = client.send(request, HttpResponse.BodyHandlers.ofString())',
  '    return Json.decodeFromString(response.body())',
  '  }',
  '}',
  '',
].join('\n');

describe('the project-wide report', () => {
  it('includes the value-check findings of a Java and a Kotlin module', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-value-wide-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/shop'), { recursive: true });
      mkdirSync(path.join(root, 'src/main/kotlin/shop'), { recursive: true });
      writeFileSync(path.join(root, 'src/main/java/shop/Client.java'), JAVA);
      writeFileSync(path.join(root, 'src/main/kotlin/shop/Notes.kt'), KOTLIN);
      const project = {
        reportRoot: path.join(root, 'reports'),
        qualifier: '',
        sourceRoots: ['src/main/java'],
        testSourceRoots: [],
        kotlinSourceRoots: ['src/main/kotlin'],
        kotlinTestSourceRoots: [],
      };
      const { findings } = projectWideReport(root, {
        projects: [project],
        mergedRoot: path.join(root, 'merged'),
        manifest: { sourceRoots: ['src/main/java'] },
        kotlin: true,
        policy: {},
      });

      expect(
        findings
          .filter(({ rule }) => rule === 'UncheckedResponseBody')
          .map(({ path: file, location }) => `${file}:${String(location?.line)}`)
          .sort(),
      ).toEqual(['src/main/java/shop/Client.java:5', 'src/main/kotlin/shop/Notes.kt:5']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
