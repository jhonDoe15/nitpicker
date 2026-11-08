import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildFlags, readVetFindings } from '../build/go-vet.mjs';
import { run } from '../execution/go-process.mjs';
import { toolCommand } from '../execution/go-tools.mjs';
import { diagnosticFindings } from '../build/diagnostics.mjs';
import { directoryOf, goPackages } from '../facts/go-packages.mjs';
import { readInspect } from '../structure/go-inspect.mjs';

const DEADCODE_REPORT = 'deadcode.json';
const DEADCODE_TOOL = 'deadcode';
const UNREACHABLE_RULE = 'unreachable-func';
const COMPILE_RULE = 'compile-error';

function writeReport(context, packages) {
  writeFileSync(path.join(context.reportRoot, DEADCODE_REPORT), JSON.stringify(packages));
}

export function deadcode(context) {
  const report = readInspect(context.reportRoot);
  const compiles = readVetFindings(context).every(({ rule }) => rule !== COMPILE_RULE);
  if (goPackages(report, context.module).mains.length === 0 || !compiles) {
    writeReport(context, []);
    return;
  }
  const command = [
    ...toolCommand(context, 'deadcode'),
    '-json',
    ...buildFlags(context.settings),
    './...',
  ];
  const result = run(context, command, { rule: 'go-deadcode-failed' });
  writeReport(context, JSON.parse(result.stdout.trim() || '[]') ?? []);
}

function lastName(name) {
  return name.split('.').at(-1);
}

function isExported(name) {
  return /^\p{Lu}/u.test(lastName(name));
}

function constrainedReferences(report, facts) {
  const constrained = new Set(
    report.files.filter(({ constrained: limited }) => limited).map(({ path: file }) => file),
  );
  return {
    constrained,
    referenced: new Set(
      facts.imports
        .filter(({ from }) => constrained.has(from))
        .flatMap(({ to, names }) => names.map(({ name }) => `${to}\0${name}`)),
    ),
  };
}

function isKept(entry, { packages, constrained, referenced, reported }) {
  const { file, name } = entry;
  return (
    !(packages.isPublished(directoryOf(file)) && isExported(name)) &&
    !constrained.has(file) &&
    !referenced.has(`${file}\0${name}`) &&
    !reported.has(`${file}\0${name}`)
  );
}

function unreachableMessage(name) {
  return `${name} is never reached from a main package of this module (deadcode; calls from tests do not count). Delete it, or call it from production code.`;
}

function deadcodeEntries(packages) {
  return packages.flatMap(({ Funcs: functions = [] }) =>
    functions.map(({ Name: name, Position: position }) => ({
      file: position.File.split(path.sep).join('/'),
      line: position.Line,
      column: position.Col,
      name,
    })),
  );
}

export function unreachableFindings(
  projectRoot,
  deadcodePackages,
  { report, module, facts, testOnly },
) {
  const filter = {
    packages: goPackages(report, module),
    ...constrainedReferences(report, facts),
    reported: new Set(testOnly.map(({ path: file, symbol }) => `${file}\0${symbol}`)),
  };
  return diagnosticFindings(
    projectRoot,
    deadcodeEntries(deadcodePackages)
      .filter((entry) => isKept(entry, filter))
      .map(({ file, line, column, name }) => ({
        tool: DEADCODE_TOOL,
        rule: UNREACHABLE_RULE,
        file,
        line,
        column,
        message: unreachableMessage(name),
      })),
  );
}

export function readDeadcodeFindings(context, { facts, testOnly }) {
  return unreachableFindings(
    context.projectRoot,
    JSON.parse(readFileSync(path.join(context.reportRoot, DEADCODE_REPORT), 'utf8')),
    { report: readInspect(context.reportRoot), module: context.module, facts, testOnly },
  );
}
