import { RULE_IDS } from '../../../../shared/policy.mjs';
import {
  adapterMessage,
  domainFinding,
  libraryMessage,
} from '../../../../shared/rules/domain/domain-messages.mjs';
import { listed } from '../../../../shared/rules/features/feature-boundaries.mjs';
import { libraryConcern } from './go-domain-libraries.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';

const DOMAIN_SEGMENT = 'domain';
const ADAPTER_SEGMENTS = new Set(['adapter', 'adapters', 'infrastructure', 'infra']);

function folderSegments(file) {
  return file.split('/').slice(0, -1);
}

function isAdapterFolder(segments) {
  return segments.some((segment) => ADAPTER_SEGMENTS.has(segment));
}

function isDomainFile(file) {
  const segments = folderSegments(file.path);
  return (
    !file.test && !file.generated && segments.includes(DOMAIN_SEGMENT) && !isAdapterFolder(segments)
  );
}

function projectFolder(importPath, module) {
  if (importPath === module) {
    return '';
  }
  return importPath.startsWith(`${module}/`) ? importPath.slice(module.length + 1) : undefined;
}

const MAJOR_VERSION = /^v\d+$/u;

function packageNames(importPath) {
  const [final, previous] = importPath.split('/').toReversed();
  const last = previous !== undefined && MAJOR_VERSION.test(final) ? previous : final;
  const bare = last
    .replace(/\.v\d+$/u, '')
    .replace(/^go[-.]/u, '')
    .replace(/[-.]go$/u, '');
  return [...new Set([bare, last, bare.replaceAll(/[-.]/gu, '')])];
}

function localName(entry) {
  return entry.name === '' ? packageNames(entry.path)[0] : entry.name;
}

function selectedNames(usage, entry) {
  const qualifiers = new Set(entry.name === '' ? packageNames(entry.path) : [entry.name]);
  return usage.selectors
    .filter((selector) => qualifiers.has(selector.qualifier))
    .map(({ name }) => name);
}

function uniqueImports(usage) {
  return [...new Map(usage.imports.map((entry) => [entry.path, entry])).values()];
}

function adapterUses(usage, module) {
  return uniqueImports(usage).flatMap((entry) => {
    const folder = projectFolder(entry.path, module);
    return folder !== undefined && isAdapterFolder(folder.split('/'))
      ? [{ entry, used: selectedNames(usage, entry) }]
      : [];
  });
}

function adapterFindings(usage, { owner, module }) {
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

function libraryFindings(usage, { owner, module }) {
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

function ownerOf(file) {
  return file.slice(file.lastIndexOf('/') + 1);
}

export function goDomainFindings(report, module) {
  const domainFiles = new Set(report.files.filter(isDomainFile).map(({ path }) => path));
  return report.usages
    .filter((usage) => domainFiles.has(usage.file))
    .flatMap((usage) => {
      const context = { owner: ownerOf(usage.file), module };
      return [...adapterFindings(usage, context), ...libraryFindings(usage, context)];
    });
}
