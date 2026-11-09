import { partsOf } from '../../../../../shared/rules/stability/test-support/library-project.mjs';

const PART_MODULES = { face: '', domain: '.domain.model', adapters: '.adapters.store' };
const ROOT_MODULES = { shared: 'app.shared.ids', main: 'app.main' };

function moduleOf(reference) {
  const { feature, part } = partsOf(reference);
  return feature === undefined
    ? ROOT_MODULES[part]
    : `app.features.${feature}${PART_MODULES[part]}`;
}

function packagesOf(name) {
  const parts = name.split('.');
  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('.'));
}

function fileOf(name, isPackage) {
  return `src/${name.replaceAll('.', '/')}${isPackage ? '/__init__' : ''}.py`;
}

export function libraryModules(features, uses) {
  const named = [...new Set(uses.flat().map(moduleOf))];
  const featurePackages = new Set(features.map((feature) => moduleOf(`${feature}:face`)));
  const packages = new Set([...named.flatMap(packagesOf), ...featurePackages]);
  const modules = [...new Set([...packages, ...named])].sort().map((name) => ({
    module: name,
    file: fileOf(name, packages.has(name)),
    isPackage: packages.has(name),
  }));
  const files = new Map(modules.map((entry) => [entry.module, entry.file]));
  const imports = {};
  for (const [source, target] of uses.map((pair) => pair.map(moduleOf))) {
    const cut = target.lastIndexOf('.');
    const statement = { level: 0, module: target.slice(0, cut), names: [target.slice(cut + 1)] };
    imports[files.get(source)] = [...(imports[files.get(source)] ?? []), statement];
  }
  return { modules, imports };
}
