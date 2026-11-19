import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectJavaFindings } from '../../java-diff.mts';

type ReportText = { readonly file: string; readonly text: string };

export type GeneratedGradleProject = {
  readonly prepare: () => void;
  readonly cleanup: () => void;
  readonly reportTexts: (name: string) => ReportText[];
};

function flawed(name: string): string {
  return `package demo;

public class ${name} {
  private int unused;
  private String name = "a";

  public boolean same(String other) {
    return other == name;
  }

  public int[] none() {
    return null;
  }
}
`;
}

function contained(base: string, relative: string): string {
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${relative} is outside ${base}`);
  }
  return full;
}

function write(root: string, file: string, text: string): void {
  const target = contained(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

export function useGeneratedGradleProject(gradle: string): GeneratedGradleProject {
  let root = '';
  let reports = '';

  function prepare(): void {
    root = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-generated-')), 'my project');
    reports = mkdtempSync(path.join(tmpdir(), 'nitpicker-generated-reports-'));
    write(root, 'settings.gradle', "rootProject.name = 'app'\ninclude 'only-generated'\n");
    write(
      root,
      'build.gradle',
      `plugins { id 'java' }
repositories { mavenCentral() }
sourceSets.main.java.srcDir 'build/generated/sources/spaced dir (1)'
`,
    );
    write(root, 'src/main/java/demo/Written.java', flawed('Written'));
    write(root, 'build/generated/sources/spaced dir (1)/demo/Made.java', flawed('Made'));
    write(
      root,
      'only-generated/build.gradle',
      `plugins { id 'java' }
repositories { mavenCentral() }
sourceSets.main.java.srcDirs = ['build/generated/sources/proto']
`,
    );
    write(root, 'only-generated/build/generated/sources/proto/demo/Only.java', flawed('Only'));
    collectJavaFindings(root, { gradle, reportDirectory: reports, policy: { preset: 'java' } });
  }

  function cleanup(): void {
    rmSync(path.dirname(root), { recursive: true, force: true });
    rmSync(reports, { recursive: true, force: true });
  }

  function reportTexts(name: string): ReportText[] {
    return readdirSync(reports, { recursive: true, encoding: 'utf8' })
      .filter((file) => path.basename(file) === name)
      .map((file) => ({ file, text: readFileSync(contained(reports, file), 'utf8') }));
  }

  return { prepare, cleanup, reportTexts };
}
