import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SpringFinding } from '../typed/spring-types.mts';

export { readSpringConfigFindings } from '../java-spring.mts';

const roots: string[] = [];

export function removeProjects(): void {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function project(
  files: Readonly<Record<string, string>>,
  { jpa }: { readonly jpa?: false } = {},
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-spring-'));
  roots.push(root);
  const all = {
    ...(jpa === false
      ? { 'src/main/java/demo/Plain.java': 'package demo;\nclass Plain {}\n' }
      : { 'src/main/java/demo/Repo.java': 'package demo;\nimport jakarta.persistence.Entity;\n' }),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

export const sourceRoots = ['src/main/java'];
export function resource(name: string): string {
  return `src/main/resources/${name}`;
}

const OPEN_IN_VIEW_MESSAGE =
  'Set spring.jpa.open-in-view=false. Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries.';
export const MAIN_PROPERTIES = 'src/main/resources/application.properties';

export type { SpringFinding } from '../typed/spring-types.mts';

type FindingFields = {
  readonly rule: string;
  readonly file: string;
  readonly identity: string;
  readonly message: string;
  readonly line?: number | undefined;
};

export function finding({ rule, file, identity, message, line }: FindingFields): SpringFinding {
  return {
    tool: 'spring',
    rule,
    path: file,
    identity,
    message: `${message} If this is intended, add {"rule":"spring/${rule}","paths":["${file}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    allowedForm: message,
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

export function openInView(file: string, line?: number): SpringFinding {
  return finding({
    rule: 'open-in-view',
    file,
    identity: line === undefined ? 'spring.jpa.openinview:missing' : 'spring.jpa.openinview',
    message: OPEN_IN_VIEW_MESSAGE,
    line,
  });
}

export function secretFinding({
  key,
  variable,
  file = MAIN_PROPERTIES,
  line = 1,
  identity = key,
}: {
  readonly key: string;
  readonly variable?: string;
  readonly file?: string;
  readonly line?: number;
  readonly identity?: string;
}): SpringFinding {
  return finding({
    rule: 'literal-secret',
    file,
    identity: identity.toLowerCase().replaceAll(/[-_]/g, ''),
    message:
      variable === undefined
        ? `Drop the default from the placeholder of ${key}, so a missing secret fails at startup; it falls back to a literal secret.`
        : `Set ${variable} in the environment, or read it from a secret store, and remove the literal secret from ${key}.`,
    line,
  });
}

export const OPEN_IN_VIEW_OFF = 'spring.jpa.open-in-view=false';
export const OPEN_IN_VIEW_OFF_YAML = 'spring.jpa.open-in-view: false';
export function rules(findings: readonly { readonly rule: string }[]): string[] {
  return findings.map((finding) => finding.rule);
}
