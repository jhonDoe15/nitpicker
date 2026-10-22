import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const roots = [];

export function removeProjects() {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function project(files, { jpa = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-spring-'));
  roots.push(root);
  const all = {
    ...(jpa
      ? { 'src/main/java/demo/Repo.java': 'package demo;\nimport jakarta.persistence.Entity;\n' }
      : { 'src/main/java/demo/Plain.java': 'package demo;\nclass Plain {}\n' }),
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

export const sourceRoots = ['src/main/java'];
export function resource(name) {
  return `src/main/resources/${name}`;
}

const OPEN_IN_VIEW_MESSAGE =
  'Set spring.jpa.open-in-view=false. Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries.';
export const MAIN_PROPERTIES = 'src/main/resources/application.properties';

export function finding({ rule, file, identity, message, line }) {
  return {
    tool: 'spring',
    rule,
    path: file,
    identity,
    message: `${message} If it is right here, add an exception for spring/${rule} in nitpicker.config.json.`,
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

export function openInView(file, line) {
  return finding({
    rule: 'open-in-view',
    file,
    identity: line === undefined ? 'spring.jpa.openinview:missing' : 'spring.jpa.openinview',
    message: OPEN_IN_VIEW_MESSAGE,
    line,
  });
}

export function secretFinding({ key, variable, file = MAIN_PROPERTIES, line = 1, identity = key }) {
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
export function rules(findings) {
  return findings.map((finding) => finding.rule);
}
