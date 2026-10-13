import path from 'node:path';
import { importRoots } from './python-project.mjs';
import { execute } from './python-process.mjs';

const SCAN_SCRIPT = `
import ast, json, os, sys

SKIPPED = {'__pycache__', 'mutants', 'node_modules'}
modules = {}
for scan, base in json.loads(sys.argv[1]):
    for directory, names, files in os.walk(scan):
        names[:] = [name for name in names if not name.startswith('.') and name not in SKIPPED]
        for file in files:
            if file.endswith('.py'):
                full = os.path.join(directory, file)
                parts = os.path.relpath(full, base)[:-3].split(os.sep)
                package = parts[-1] == '__init__'
                modules[tuple(parts[:-1] if package else parts)] = (full, package)

edges = {}
for parts, (full, package) in modules.items():
    try:
        with open(full, encoding='utf-8') as handle:
            tree = ast.parse(handle.read())
    except (SyntaxError, ValueError, OSError):
        edges[full] = []
        continue
    found = set()
    own = parts if package else parts[:-1]

    def add(name):
        for length in range(1, len(name) + 1):
            if name[:length] in modules:
                found.add(modules[name[:length]][0])

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add(tuple(alias.name.split('.')))
        elif isinstance(node, ast.ImportFrom):
            if node.level > len(own) + 1:
                continue
            anchor = own[: len(own) - node.level + 1] if node.level else ()
            target = anchor + (tuple(node.module.split('.')) if node.module else ())
            add(target)
            for alias in node.names:
                add(target + (alias.name,))
    edges[full] = sorted(found - {full})
print(json.dumps(edges))
`;

export function importGraph(context) {
  const { projectRoot, project } = context;
  const specs = project.sourceRoots.map((root) => [
    path.resolve(projectRoot, root),
    ...importRoots(projectRoot, [root]),
  ]);
  const result = execute(context, ['python', '-c', SCAN_SCRIPT, JSON.stringify(specs)]);
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  const edges = JSON.parse(result.stdout);
  return new Map(
    Object.entries(edges).map(([file, imported]) => [
      toProjectPath(projectRoot, file),
      imported.map((target) => toProjectPath(projectRoot, target)),
    ]),
  );
}

function toProjectPath(projectRoot, file) {
  return path.relative(projectRoot, file).split(path.sep).join('/');
}

export function dependentFiles(graph, changed) {
  const importers = new Map();
  for (const [file, imported] of graph) {
    for (const target of imported) {
      importers.set(target, [...(importers.get(target) ?? []), file]);
    }
  }
  const affected = new Set(changed);
  for (const file of affected) {
    for (const importer of importers.get(file) ?? []) {
      affected.add(importer);
    }
  }
  return affected;
}
