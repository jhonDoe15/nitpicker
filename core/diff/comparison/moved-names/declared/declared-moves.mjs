import { agreedPairs } from '../qualified-names.mjs';
import { declaredPackage, JVM_SOURCE } from './declared-package.mjs';

const KOTLIN_FACADE = 'Kt';

function stemOf(filePath) {
  return filePath.slice(filePath.lastIndexOf('/') + 1).replace(JVM_SOURCE, '');
}

function qualified(packageName, stem) {
  return packageName === '' ? stem : `${packageName}.${stem}`;
}

function sameLanguage(oldPath, newPath) {
  return JVM_SOURCE.exec(oldPath)?.[1] === JVM_SOURCE.exec(newPath)?.[1];
}

function namesOf(oldPath, newPath, packages) {
  const from = qualified(packages.base, stemOf(oldPath));
  const to = qualified(packages.head, stemOf(newPath));
  const facade = oldPath.endsWith('.kt') ? [[from + KOTLIN_FACADE, to + KOTLIN_FACADE]] : [];
  return [[from, to], ...facade].filter(([left, right]) => left !== right);
}

function readable([oldPath, newPath], { baseTexts, headTexts }) {
  const packages = {
    base: declaredPackage(baseTexts.get(oldPath)),
    head: declaredPackage(headTexts.get(newPath)),
  };
  return JVM_SOURCE.test(oldPath) &&
    sameLanguage(oldPath, newPath) &&
    packages.base !== undefined &&
    packages.head !== undefined
    ? [{ oldPath, packages, named: namesOf(oldPath, newPath, packages) }]
    : [];
}

function ownBareName({ oldPath, named }) {
  const [own] = named;
  return own !== undefined && !own[0].includes('.') ? [[oldPath, own]] : [];
}

function changedPackage({ oldPath, packages }) {
  const moved = packages.base !== '' && packages.head !== '' && packages.base !== packages.head;
  return moved ? [[oldPath, new Map([[packages.base, packages.head]])]] : [];
}

export function declaredMoves({ renames, baseTexts, headTexts }) {
  const files = [...renames].flatMap((rename) => readable(rename, { baseTexts, headTexts }));
  const pairs = agreedPairs(files.flatMap(({ named }) => named));
  return {
    names: new Map([...pairs].filter(([from]) => from.includes('.'))),
    bare: new Map(files.flatMap(ownBareName)),
    filePackages: new Map(files.flatMap(changedPackage)),
    covered: new Set(files.map(({ oldPath }) => oldPath)),
    folders: new Map(),
    packageDirs: new Set(),
  };
}
