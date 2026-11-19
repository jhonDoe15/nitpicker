import { existsSync, readFileSync } from 'node:fs';
import { javaFilesUnder, pathInside } from '../../../../review-rules/java-sources.mts';
import { typeName } from '../spring-names.mts';
import { escapeRegExp } from '../../../../../../../shared/paths/glob.mjs';
import type { ProjectContext, Super } from './spring-shapes.mts';

const AUTO_APPLY = String.raw`@Converter\s*\(\s*(?:autoApply\s*=\s*)?true\s*\)`;
const JAVA_CONVERTER = new RegExp(
  String.raw`${AUTO_APPLY}[^{]*?\bimplements\s+(?:[\w.]+\.)?AttributeConverter\s*<\s*([\w.]+)`,
  'gu',
);
function javaExtends(name: string): RegExp {
  return new RegExp(
    String.raw`\binterface\s+${escapeRegExp(name)}\b[^{]*?\bextends\s+([^{]+)\{`,
    'u',
  );
}

type JavaRoots = Pick<ProjectContext, 'projectRoot' | 'javaRoots'>;

export function readJavaSource(
  { projectRoot, javaRoots }: JavaRoots,
  qualified: string,
): string | undefined {
  const relative = `${qualified.replaceAll('.', '/')}.java`;
  const file = javaRoots
    .map((root) => pathInside(projectRoot, `${root}/${relative}`))
    .find((candidate) => existsSync(candidate));
  return file === undefined ? undefined : readFileSync(file, 'utf8');
}

export function javaSource(context: ProjectContext, qualified: string): string | undefined {
  return context.javaSource(qualified);
}

export function exactly(names: string[]): Super[] {
  return names.map((name) => ({ name, exact: names.length === 1 }));
}

function javaImport(text: string, type: string): string | undefined {
  return new RegExp(String.raw`^\s*import\s+([\w.]+\.${escapeRegExp(type)})\s*;`, 'mu').exec(
    text,
  )?.[1];
}

export function javaSupers(context: ProjectContext, candidate: string): Super[] {
  const text = javaSource(context, candidate);
  const simple = candidate.split('.').at(-1) ?? '';
  const extended = text === undefined ? undefined : javaExtends(simple).exec(text)?.[1];
  if (extended === undefined) {
    return [];
  }
  const packageName = candidate.split('.').slice(0, -1).join('.');
  return extended
    .split(',')
    .map((type) => typeName(type))
    .flatMap((type) => {
      const imported = type.includes('.') ? type : javaImport(text ?? '', type);
      return imported === undefined
        ? exactly([`org.springframework.data.repository.${type}`, `${packageName}.${type}`])
        : exactly([imported]);
    });
}

export function readConverted({ projectRoot, javaRoots }: JavaRoots): Set<string | undefined> {
  return new Set(
    javaRoots
      .flatMap((root) => javaFilesUnder(pathInside(projectRoot, root)))
      .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(JAVA_CONVERTER)])
      .map((match) => (match[1] ?? '').split('.').at(-1)),
  );
}

export function javaConverted(context: ProjectContext): Set<string | undefined> {
  return context.converted();
}

function enclosingFiles(candidate: string): string[] {
  const parts = candidate.split('.');
  return parts.slice(1).map((_, index) => parts.slice(0, parts.length - index).join('.'));
}

export function isJavaEnum(context: ProjectContext, candidates: string[]): boolean {
  return candidates.some((candidate) => {
    const simple = candidate.split('.').at(-1);
    const declaration = new RegExp(String.raw`\benum\s+${escapeRegExp(simple)}\b`, 'u');
    return enclosingFiles(candidate).some((file) =>
      declaration.test(javaSource(context, file) ?? ''),
    );
  });
}
