import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { childAt, childrenAt, parseXml } from '../../../shared/ingest/common.mjs';
import { classifyExpression, REJECTED } from './license-rule.mjs';

const LICENSE_NAMES = [
  [
    /^gnu general public license, version 2 \(gpl2\), with the classpath exception$/i,
    'GPL-2.0-only WITH Classpath-exception-2.0',
  ],
  [/\b(?:apache|asl)\b.*\b2(?:\.0)?$/i, 'Apache-2.0'],
  [/^(?:the )?mit(?: license)?$/i, 'MIT'],
  [/^(?:the )?bsd3 license$/i, 'BSD-3-Clause'],
  [/^(?:the )?bsd(?:-style| licen[cs]e(?: 2\.0)?)$/i, 'BSD-style'],
  [/^(?:eclipse public license v2\.0|epl-2\.0)$/i, 'EPL-2.0'],
  [/^eclipse public license - v 1\.0$/i, 'EPL-1.0'],
  [
    /^(?:gnu lesser general public license,? (?:version )?2\.1|lgpl,? (?:version )?2\.1)$/i,
    'LGPL-2.1',
  ],
  [/^gnu lesser general public license$/i, 'LGPL-2.0-or-later'],
  [/^(?:mozilla public license version 2\.0|mpl 2\.0)$/i, 'MPL-2.0'],
  [/^mpl 1\.1$/i, 'MPL-1.1'],
];
const SPDX_ID = /^[A-Za-z0-9.+-]+$/;
const ARTIFACT_LICENSES = new Map([['org.dom4j:dom4j', 'BSD-style']]);

function textOf(element, name) {
  return childAt(element, name)?.text?.replaceAll(/\s+/g, ' ').trim();
}

export function spdxOf(name) {
  const known = LICENSE_NAMES.find(([pattern]) => pattern.test(name));
  if (known !== undefined) {
    return known[1];
  }
  return SPDX_ID.test(name) ? name : `LicenseRef-${name.replaceAll(/[^A-Za-z0-9.]+/g, '-')}`;
}

function pomPath(repository, group, artifact, version) {
  return path.join(
    repository,
    ...group.split('.'),
    artifact,
    version,
    `${artifact}-${version}.pom`,
  );
}

function ownPom(jar) {
  const directory = path.dirname(jar);
  const version = path.basename(directory);
  const artifact = path.basename(path.dirname(directory));
  return { file: path.join(directory, `${artifact}-${version}.pom`), artifact, version };
}

function readProject(file) {
  return existsSync(file) ? parseXml(readFileSync(file, 'utf8')) : undefined;
}

function licenseNames(project) {
  return childrenAt(project, 'licenses', 'license')
    .map((license) => textOf(license, 'name'))
    .filter((name) => name !== undefined && name !== '');
}

function parentPom(repository, project) {
  const parent = childAt(project, 'parent');
  return parent === undefined
    ? undefined
    : pomPath(
        repository,
        ...['groupId', 'artifactId', 'version'].map((name) => textOf(parent, name)),
      );
}

function declaredNames(repository, file) {
  const pending = [file];
  for (const current of pending) {
    const project = readProject(current);
    const names = project === undefined ? [] : licenseNames(project);
    const parent = project === undefined ? undefined : parentPom(repository, project);
    if (names.length > 0 || parent === undefined || pending.includes(parent)) {
      return names;
    }
    pending.push(parent);
  }
  return [];
}

function pomLicenses(jar) {
  const { file, artifact, version } = ownPom(jar);
  const project = readProject(file);
  if (project === undefined) {
    return { label: path.basename(jar), names: [] };
  }
  const group = textOf(project, 'groupId') ?? textOf(childAt(project, 'parent'), 'groupId') ?? '';
  const repository = path.resolve(
    path.dirname(file),
    ...group.split('.').map(() => '..'),
    '..',
    '..',
  );
  const override = ARTIFACT_LICENSES.get(`${group}:${artifact}`);
  return {
    label: `${group}:${artifact}:${version}`,
    names: override === undefined ? declaredNames(repository, file) : [override],
  };
}

function pomLicenseExpression(names) {
  return [...new Set(names.map((name) => spdxOf(name)))].join(' OR ');
}

export function jarLicenseViolations(jars, { extraPermissive }) {
  return [...new Set(jars)].flatMap((jar) => {
    const { label, names } = pomLicenses(jar);
    if (names.length === 0) {
      return [`${label}: no license in its POM or a parent POM`];
    }
    const expression = pomLicenseExpression(names);
    return classifyExpression(expression, { extraPermissive }) === REJECTED
      ? [`${label}: license "${names.join('" or "')}" (${expression}) is not on the allowlist`]
      : [];
  });
}
