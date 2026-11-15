import { RULE_IDS } from '../../../../shared/policy.mjs';
import { libraryConcern } from './go-domain-libraries.mts';
import { byText } from '../../../../shared/text-order/by-text.mjs';
import { adapterMessage, domainFinding, libraryMessage, listed } from '../typed/shared-readers.mts';
import type { FindingRow, GoFile, GoImport, GoUsage, InspectReport } from '../go-types.mts';

type DomainContext = { owner: string; module: string };

const DOMAIN_SEGMENT = 'domain';
const ADAPTER_SEGMENTS = new Set(['adapter', 'adapters', 'infrastructure', 'infra']);

function folderSegments(file: string) {
  return file.split('/').slice(0, -1);
}

function isAdapterFolder(segments: readonly string[]) {
  return segments.some((segment) => ADAPTER_SEGMENTS.has(segment));
}

function isDomainFile(file: GoFile) {
  const segments = folderSegments(file.path);
  return (
    !file.test && !file.generated && segments.includes(DOMAIN_SEGMENT) && !isAdapterFolder(segments)
  );
}

function projectFolder(importPath: string, module: string) {
  if (importPath === module) {
    return '';
  }
  return importPath.startsWith(`${module}/`) ? importPath.slice(module.length + 1) : undefined;
}

const MAJOR_VERSION = /^v\d+$/u;

function packageNames(importPath: string) {
  const [final = '', previous] = importPath.split('/').toReversed();
  const last = previous !== undefined && MAJOR_VERSION.test(final) ? previous : final;
  const bare = last
    .replace(/\.v\d+$/u, '')
    .replace(/^go[-.]/u, '')
    .replace(/[-.]go$/u, '');
  return [...new Set([bare, last, bare.replaceAll(/[-.]/gu, '')])];
}

function localName(entry: GoImport) {
  return entry.name === '' ? (packageNames(entry.path)[0] ?? '') : entry.name;
}

function selectedNames(usage: GoUsage, entry: GoImport) {
  const qualifiers = new Set(entry.name === '' ? packageNames(entry.path) : [entry.name]);
  return usage.selectors
    .filter((selector) => qualifiers.has(selector.qualifier))
    .map(({ name }) => name);
}

function uniqueImports(usage: GoUsage) {
  return [...new Map(usage.imports.map((entry) => [entry.path, entry])).values()];
}

function adapterUses(usage: GoUsage, module: string) {
  return uniqueImports(usage).flatMap((entry) => {
    const folder = projectFolder(entry.path, module);
    return folder !== undefined && isAdapterFolder(folder.split('/'))
      ? [{ entry, used: selectedNames(usage, entry) }]
      : [];
  });
}

function adapterFindings(usage: GoUsage, { owner, module }: DomainContext) {
  return adapterUses(usage, module).map(({ entry, used }) =>
    domainFinding(
      {
        rule: RULE_IDS.domainImportsAdapter,
        file: usage.file,
        identity: `domain-adapter:${entry.path}`,
      },
      adapterMessage({
        owner,
        used:
          used.length === 0
            ? `package ${localName(entry)}`
            : listed([...new Set(used)].toSorted(byText)),
        packageName: entry.path,
      }),
    ),
  );
}

function libraryFindings(usage: GoUsage, { owner, module }: DomainContext) {
  return uniqueImports(usage).flatMap((entry) => {
    if (projectFolder(entry.path, module) !== undefined) {
      return [];
    }
    const names = selectedNames(usage, entry);
    const concern = libraryConcern(entry.path, names);
    if (concern === undefined) {
      return [];
    }
    const shown = concern.names.length === 0 ? [localName(entry)] : concern.names;
    const used = `${listed(shown.map((name) => `${localName(entry)}.${name}`))} (${entry.path})`;
    return [
      domainFinding(
        { rule: concern.rule, file: usage.file, identity: `library:${entry.path}` },
        libraryMessage(concern.rule, { owner, used, first: localName(entry) }),
      ),
    ];
  });
}

function ownerOf(file: string) {
  return file.slice(file.lastIndexOf('/') + 1);
}

export function goDomainFindings(
  report: Pick<InspectReport, 'files' | 'usages'>,
  module: string,
): FindingRow[] {
  const domainFiles = new Set(report.files.filter(isDomainFile).map(({ path }) => path));
  return report.usages
    .filter((usage) => domainFiles.has(usage.file))
    .flatMap((usage) => {
      const context = { owner: ownerOf(usage.file), module };
      return [...adapterFindings(usage, context), ...libraryFindings(usage, context)];
    });
}
