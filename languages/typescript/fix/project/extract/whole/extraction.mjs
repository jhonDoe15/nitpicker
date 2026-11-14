import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { helperNameFor } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import {
  dedentedToLeast,
  withLineEndingOf,
} from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { alignRegions } from '../lockstep.mjs';
import {
  holeArgumentText,
  holeParameterText,
  identifierTexts,
  nameHoles,
  nameTypeHoles,
  replacedText,
  symbolTypeString,
  topLevelStatement,
  typeArgumentText,
} from '../render.mjs';
import { templateProblem } from '../scope.mjs';
import { descendants, isTypeScriptFile, normalizedText } from '../syntax.mjs';
import { isAsync, lostComments, unitProblem } from './unit-check.mjs';
import { writesOf } from '../writes.mjs';

function regionOf(unit) {
  return { pos: unit.body.pos, end: unit.body.end };
}

function alignment(units, env) {
  const pairs = [
    ...units[0].parameters.map((parameter, index) => [parameter, units[1].parameters[index]]),
    ...(units[0].type === undefined ? [] : [[units[0].type, units[1].type]]),
    [units[0].body, units[1].body],
  ];
  const regions = units.map(regionOf);
  const writes = units.map((unit) => writesOf(unit, env.checker));
  return alignRegions(pairs, {
    ...env,
    typeHoles: true,
    units,
    regions,
    written: writes.map((list) => new Set(list.map(({ symbol }) => symbol))),
    regionWrites: writes.map(
      (list, side) =>
        new Set(
          list
            .filter(({ node }) => node.pos >= regions[side].pos && node.end <= regions[side].end)
            .map(({ symbol }) => symbol),
        ),
    ),
  });
}

function parameterTypeTexts(units, env, typeHoles) {
  return units[0].parameters.map((parameter, index) => {
    const other = units[1].parameters[index];
    if (parameter.type !== undefined && other.type !== undefined) {
      return typeText(parameter.type, typeHoles, env.sourceFile);
    }
    const texts = [parameter, other].map((own) =>
      own.type === undefined
        ? symbolTypeString(env.checker, env.checker.getSymbolAtLocation(own.name))
        : normalizedText(own.type, env.sourceFile),
    );
    return texts[0] === texts[1] ? (parameter.type?.getText() ?? texts[0]) : undefined;
  });
}

function typeText(node, typeHoles, sourceFile) {
  const range = { start: node.getStart(sourceFile), end: node.end };
  return replacedText(range, typeHoles, sourceFile);
}

function typeParameterList(typeHoles) {
  return typeHoles.length === 0 ? '' : `<${typeHoles.map((hole) => hole.name).join(', ')}>`;
}

function hasValueReturn(unit) {
  return (
    !ts.isBlock(unit.body) ||
    descendants(unit.body).some(
      (node) => ts.isReturnStatement(node) && node.expression !== undefined,
    )
  );
}

function helperDeclaration({ units, name, holes, typeHoles }, env) {
  const typed = isTypeScriptFile(env.path);
  const types = typed ? parameterTypeTexts(units, env, typeHoles) : [];
  const own = units[0].parameters.map(
    (parameter, index) =>
      `${parameter.name.text}${types[index] === undefined ? '' : `: ${types[index]}`}`,
  );
  const extra = holes.map((hole) => holeParameterText(hole, env.checker, typed));
  const body = units[0].body;
  const range = { start: body.getStart(env.sourceFile), end: body.end };
  const text = replacedText(range, [...holes, ...typeHoles], env.sourceFile);
  const block = ts.isBlock(body) ? dedentedToLeast(text) : `{\n  return ${text};\n}`;
  const returns =
    typed && units[0].type !== undefined
      ? `: ${typeText(units[0].type, typeHoles, env.sourceFile)}`
      : '';
  const head = `${name}${typeParameterList(typeHoles)}(${[...own, ...extra].join(', ')})`;
  return `${isAsync(units[0]) ? 'async ' : ''}function ${head}${returns} ${block}`;
}

function callText({ units, name, holes, typeHoles }, side, env) {
  const own = units[side].parameters.map((parameter) => parameter.name.getText(env.sourceFile));
  const extra = holes.map((hole) => holeArgumentText(hole, side, env.sourceFile));
  const typeArguments = typeHoles.map((hole) => typeArgumentText(hole, side, env.sourceFile));
  const generic = typeArguments.length === 0 ? '' : `<${typeArguments.join(', ')}>`;
  return `${name}${generic}(${[...own, ...extra].join(', ')})`;
}

function bodyReplacement(unit, call, env) {
  const body = unit.body;
  const start = body.getStart(env.sourceFile);
  if (!ts.isBlock(body)) {
    return { start, end: body.end, text: call };
  }
  const lineStart = env.sourceFile.text.lastIndexOf('\n', start - 1) + 1;
  const indent = /^[ \t]*/u.exec(env.sourceFile.text.slice(lineStart, start))[0];
  const returns = hasValueReturn(unit) || isAsync(unit);
  return {
    start,
    end: body.end,
    text: `{\n${indent}  ${returns ? 'return ' : ''}${call};\n${indent}}`,
  };
}

function editsFor(plan, env) {
  const insertAt = topLevelStatement(plan.units[0]).end;
  const calls = plan.units.map((unit, side) =>
    bodyReplacement(unit, callText(plan, side, env), env),
  );
  const helper = { start: insertAt, end: insertAt, text: `\n\n${helperDeclaration(plan, env)}` };
  return [...calls, helper].map((edit) => ({
    type: 'replace',
    path: env.path,
    ...edit,
    text: withLineEndingOf(env.sourceFile.text, edit.text),
  }));
}

function unitProblems(units, env) {
  return (
    unitProblem(units) ??
    (lostComments(units, env.sourceFile)
      ? 'the second copy has comments the shared function would drop'
      : undefined)
  );
}

function holeCountProblem(aligned, engineHoles) {
  const values = aligned.holes.filter(({ kind }) => kind !== 'type').length;
  return values + aligned.typeSites === engineHoles
    ? undefined
    : 'the differing values do not match the ones the rule found';
}

function analysis({ units, engineHoles }, env) {
  const problem = unitProblems(units, env);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const aligned = alignment(units, env);
  const found = aligned.declined ?? holeCountProblem(aligned, engineHoles);
  if (found !== undefined) {
    return { declined: found };
  }
  const holeNodes = aligned.holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  const template = templateProblem([units[0].body], { ...env, unit: units[0], holeNodes });
  return template === undefined ? aligned : { declined: template };
}

export function wholeExtraction(input, env) {
  const aligned = analysis(input, env);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const taken = new Set([...identifierTexts(env.sourceFile), ...env.claimed]);
  const name = helperNameFor(input.label, taken);
  const values = aligned.holes.filter(({ kind }) => kind !== 'type');
  const holes = name === undefined ? undefined : nameHoles(values, new Set([...taken, name]));
  const typeHoles = nameTypeHoles(
    aligned.holes.filter(({ kind }) => kind === 'type'),
    taken,
  );
  if (holes === undefined || typeHoles === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  env.claimed.add(name);
  return { edits: editsFor({ units: input.units, name, holes, typeHoles }, env) };
}
