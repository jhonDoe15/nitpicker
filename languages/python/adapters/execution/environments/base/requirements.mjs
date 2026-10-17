import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONTINUATION = /\\\r?\n/g;
const INCLUDE = /^(?:-r|--requirement)(?:\s+|=)(\S+)$/;
const CONSTRAINT = /^(?:-c|--constraint)(?:\s+|=)(\S+)$/;
const KEPT_OPTION = /^(?:-i|--index-url|--extra-index-url)(?:\s|=)/;
const LOCAL_REQUIREMENT = /^(?:[./\\~]|[A-Za-z]:[\\/]|file:)|@\s*file:/;
const COMMENT = /(?:^|\s)#.*$/;

function containedFile(root, from, relative) {
  const resolved = path.resolve(path.dirname(from), relative);
  const inside = resolved === root || resolved.startsWith(`${root}${path.sep}`);
  return inside && existsSync(resolved) ? resolved : undefined;
}

function logicalLines(file) {
  return readFileSync(file, 'utf8')
    .replaceAll(CONTINUATION, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(COMMENT, '').trim())
    .filter((line) => line !== '');
}

function classify(line) {
  if (INCLUDE.test(line)) {
    return { kind: 'include', value: INCLUDE.exec(line)[1] };
  }
  if (CONSTRAINT.test(line)) {
    return { kind: 'constraint', value: CONSTRAINT.exec(line)[1] };
  }
  if (line.startsWith('-')) {
    return { kind: KEPT_OPTION.test(line) ? 'keep' : 'drop', value: line };
  }
  return { kind: LOCAL_REQUIREMENT.test(line) ? 'drop' : 'keep', value: line };
}

export function safeRequirements(root, names) {
  const queue = names.map((name) => path.resolve(root, name));
  const seen = new Set();
  const lines = [];
  const constraints = [];
  const dropped = [];
  for (const file of queue) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const line of logicalLines(file)) {
      const { kind, value } = classify(line);
      const followed =
        kind === 'include' || kind === 'constraint' ? containedFile(root, file, value) : undefined;
      if (kind === 'include' && followed !== undefined) {
        queue.push(followed);
      } else if (kind === 'constraint' && followed !== undefined) {
        constraints.push(followed);
      } else if (kind === 'keep') {
        lines.push(value);
      } else {
        dropped.push(`${path.relative(root, file)}: ${line}`);
      }
    }
  }
  return { lines, constraints, dropped };
}
