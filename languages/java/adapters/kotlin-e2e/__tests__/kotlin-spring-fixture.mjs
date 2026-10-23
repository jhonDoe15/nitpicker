import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { springFindings } from '../../kotlin/review-rules/spring/spring-findings.mjs';
import { SPRING_RULES } from '../../kotlin/review-rules/spring/spring-messages.mjs';
import { git, writeAll } from '../test-support/kotlin-e2e-project.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-spring-project');
const SOURCE_BASE_FILES = new Set([
  'src/main/kotlin/shop/ShopApplication.kt',
  'src/main/java/shop/LegacyRepository.java',
]);
const SPRING = new Set(SPRING_RULES);

export const BAD_FILES = 'src/main/kotlin/shop/bad/*';
export const PINNED_SPRING_LINES = JSON.parse(
  readFileSync(path.join(FIXTURES, 'kotlin-spring-findings.json'), 'utf8'),
);
export const WITHOUT_SELF_CALLS = PINNED_SPRING_LINES.filter(
  (line) => !line.includes(' SpringProxySelfCall '),
);

function sourceFiles() {
  return Object.fromEntries(
    readdirSync(path.join(FIXTURE, 'src'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(FIXTURE, path.join(entry.parentPath, entry.name)))
      .map((relative) => [
        relative.replaceAll('\\', '/'),
        readFileSync(path.join(FIXTURE, relative), 'utf8'),
      ]),
  );
}

export function commitBaseThenSpringBranch(project, build) {
  const files = { ...sourceFiles(), ...build };
  const isBase = (file) => SOURCE_BASE_FILES.has(file) || Object.hasOwn(build, file);
  writeAll(project, {
    '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n/target/\n',
    ...Object.fromEntries(Object.entries(files).filter(([file]) => isBase(file))),
  });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base');
  git(project, 'checkout', '-q', '-b', 'spring');
  writeAll(project, files);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'spring');
}

export function fixtureBuild(...names) {
  return Object.fromEntries(
    names.map((name) => [name, readFileSync(path.join(FIXTURE, name), 'utf8')]),
  );
}

export function recordedFindings() {
  const { files } = JSON.parse(
    readFileSync(path.join(FIXTURES, 'kotlin-spring-facts.json'), 'utf8'),
  );
  return springFindings(files, {
    finding: findingFactory(),
    manifest: { spring: true, kotlinAllOpen: { annotations: [], presets: ['spring'] } },
    projectFiles: files,
    projectRoot: FIXTURE,
    javaRoots: ['src/main/java'],
  });
}

export function springLines(findings) {
  return findings
    .filter(({ tool, rule }) => tool === 'pmd' && SPRING.has(rule))
    .map(
      ({ path: file, location, rule, symbol }) =>
        `${file}:${String(location.line)} ${rule} ${symbol}`,
    )
    .sort();
}
