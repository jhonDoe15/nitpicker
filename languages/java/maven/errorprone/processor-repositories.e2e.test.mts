import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseXml } from '../../../../shared/ingest/report-records.mts';
import { readPinnedTools } from '../../builds/java-build.mts';
import { defined } from '../../builds/test-support/defined.mts';
import { resolveToolSet, toolDependencies } from '../maven-tools.mts';
import { compilerSettings } from './maven-compiler.mts';
import { processorTool } from './maven-errorprone.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const maven = process.env['NITPICKER_MAVEN'];
const GROUP = 'nitpicker.fixture.processors';
const VERSION = `1.${String(process.pid)}`;
const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  rmSync(path.join(homedir(), '.m2', 'repository', ...GROUP.split('.')), {
    recursive: true,
    force: true,
  });
});

function fileRepository(root: string): string {
  const repository = path.join(root, 'repository');
  const folder = path.join(repository, ...GROUP.split('.'), 'indexer', VERSION);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, `indexer-${VERSION}.pom`),
    '<project><modelVersion>4.0.0</modelVersion>' +
      `<groupId>${GROUP}</groupId><artifactId>indexer</artifactId><version>${VERSION}</version></project>`,
  );
  writeFileSync(
    path.join(folder, `indexer-${VERSION}.jar`),
    Buffer.from([0x50, 0x4b, 0x05, 0x06, ...Array.from({ length: 18 }, () => 0)]),
  );
  return pathToFileURL(repository).href;
}

function projectPom(repository: string | undefined): string {
  const declared =
    repository === undefined
      ? ''
      : `<repositories><repository><id>project-only</id><url>${repository}</url></repository></repositories>`;
  return `<project><groupId>demo</groupId><artifactId>app</artifactId><version>1</version>${declared}
    <build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration>
      <annotationProcessorPaths><path>
        <groupId>${GROUP}</groupId><artifactId>indexer</artifactId><version>${VERSION}</version>
      </path></annotationProcessorPaths>
    </configuration></plugin></plugins></build></project>`;
}

function resolved(root: string, repository: string | undefined): readonly string[] {
  const tool = defined(processorTool(compilerSettings(parseXml(projectPom(repository)))));
  const all = toolDependencies(readPinnedTools(), [], [tool]);
  const classpaths = resolveToolSet({
    projectRoot: root,
    maven,
    tools: { [tool.name]: all[tool.name] ?? [] },
    environment: { XDG_CACHE_HOME: path.join(root, 'cache') },
  });
  return classpaths[tool.name] ?? [];
}

describe.skipIf(!enabled)('annotation processors from a repository the project declares', () => {
  it('resolves a processor that only the project repository holds, and fails without it', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-processor-repos-')));
    roots.push(root);
    const repository = fileRepository(root);

    expect(() => resolved(root, undefined)).toThrow(/indexer/u);
    expect(resolved(root, repository).map((jar) => path.basename(jar))).toEqual([
      `indexer-${VERSION}.jar`,
    ]);
  });
});
