import { packageCycleFindings as sharedPackageCycleFindings } from '../../../../shared/rules/features/package-cycles.mjs';

const ROOT_PACKAGE = '(root)';

function packageName({ packageName: name }) {
  return name === '' ? ROOT_PACKAGE : name;
}

function packageEdges(edges) {
  return edges
    .map(({ source, target }) => ({
      source: packageName(source),
      target: packageName(target),
      files: `${source.file}\0${target.file}`,
    }))
    .filter(({ source, target }) => source !== target);
}

function anchors(classes) {
  const anchor = new Map();
  for (const entry of classes.toSorted((left, right) => left.file.localeCompare(right.file))) {
    if (!anchor.has(packageName(entry))) {
      anchor.set(packageName(entry), entry.file);
    }
  }
  return anchor;
}

export function packageCycleFindings({ classes, edges }, features) {
  return sharedPackageCycleFindings(
    { anchor: anchors(classes), packaged: packageEdges(edges) },
    features,
  );
}
