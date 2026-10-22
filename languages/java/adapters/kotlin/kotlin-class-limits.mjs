import { classLimitFindings } from '../../../../shared/rules/size/class-limits.mjs';
import { inModule } from '../../builds/module-path.mjs';

function fullName(packageName, name) {
  return packageName === '' ? name : `${packageName}.${name}`;
}

function resolver(files, types) {
  const byName = new Map(
    types.map((type) => [fullName(files.get(type.file)?.package ?? '', type.name), type]),
  );
  return (type) => {
    const file = files.get(type.file) ?? { package: '', imports: [] };
    const written = type.extends;
    const [first, ...rest] = written.split('.');
    const suffix = rest.length === 0 ? '' : `.${rest.join('.')}`;
    const owners = type.name
      .split('.')
      .map((_, index, parts) => parts.slice(0, parts.length - index).join('.'));
    const candidates = [
      ...owners.map((owner) => fullName(file.package, `${owner}.${written}`)),
      ...file.imports
        .filter((name) => name.endsWith(`.${first}`))
        .map((name) => `${name}${suffix}`),
      fullName(file.package, written),
      ...file.imports
        .filter((name) => name.endsWith('.*'))
        .map((name) => `${name.slice(0, -1)}${written}`),
      written,
    ];
    return candidates.map((name) => byName.get(name)).find((found) => found !== undefined);
  };
}

function depthOf(type, parentOf) {
  const chain = [type];
  for (const current of chain) {
    const parent = current.extends === undefined ? undefined : parentOf(current);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain.filter((link) => link.extends !== undefined).length;
}

export function readKotlinClassLimitFindings(metrics, { thresholds, exceptions, modulePath } = {}) {
  const types = metrics.types ?? [];
  const files = new Map(
    metrics.files.map((file) => [
      file.file,
      { package: file.package, imports: file.imports ?? [] },
    ]),
  );
  const parentOf = resolver(files, types);
  return classLimitFindings(
    types.map((type) => ({ ...type, inheritanceDepth: depthOf(type, parentOf) })),
    {
      analyzerName: 'structure',
      thresholds,
      exceptions,
      projectPath: (file) => inModule(modulePath, file),
    },
  );
}
