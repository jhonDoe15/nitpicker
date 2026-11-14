import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { helperNameFor } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import {
  dedentedToLeast,
  indentedBy,
  withLineEndingOf,
} from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { alignRegions } from '../lockstep.mjs';
import {
  holeArgumentText,
  holeParameterText,
  identifierTexts,
  nameHoles,
  replacedText,
  symbolTypeString,
  topLevelStatement,
} from '../render.mjs';
import { declarationsOf, templateProblem } from '../scope.mjs';
import { isTypeScriptFile, symbolAt } from '../syntax.mjs';
import { lostCommentsIn } from '../whole/unit-check.mjs';
import { writesOf } from '../writes.mjs';
import { ownNodes, runAnalysis } from './flow.mjs';
import { runRegion, runStatements } from './runs.mjs';

function sideOf(unit, span, env) {
  const statements =
    unit.body !== undefined && ts.isBlock(unit.body)
      ? runStatements(unit, span, env.sourceFile)
      : undefined;
  if (statements === undefined) {
    return undefined;
  }
  const writes = writesOf(unit, env.checker);
  const region = runRegion(statements, env.sourceFile);
  return {
    unit,
    statements,
    region,
    checker: env.checker,
    written: new Set(writes.map(({ symbol }) => symbol)),
    regionWrites: new Set(
      writes
        .filter(({ node }) => node.pos >= region.pos && node.end <= region.end)
        .map(({ symbol }) => symbol),
    ),
  };
}

function throwsText(side, sourceFile) {
  return ownNodes(side.statements)
    .filter((node) => ts.isThrowStatement(node))
    .map(({ expression }) =>
      ts.isNewExpression(expression) ? expression.expression.getText(sourceFile) : '',
    )
    .join(',');
}

function sidesProblem(sides, env) {
  if (sides.includes(undefined)) {
    return 'a run is not a whole list of statements in a block';
  }
  if (sides[0].statements.length !== sides[1].statements.length) {
    return 'the runs have different numbers of statements';
  }
  if (throwsText(sides[0], env.sourceFile) !== throwsText(sides[1], env.sourceFile)) {
    return 'the copies throw different exceptions';
  }
  const lost = lostCommentsIn(
    sides.map(({ statements, region }) => ({
      roots: statements,
      range: { pos: region.start, end: region.end },
    })),
    env.sourceFile,
  );
  return lost ? 'the second copy has comments the shared function would drop' : undefined;
}

function outputsOf(sides) {
  const analyses = sides.map((side, index) => runAnalysis(side, sides[index].written));
  const problem = analyses.find((analysis) => analysis.problem !== undefined)?.problem;
  if (problem !== undefined) {
    return { declined: problem };
  }
  const [a, b] = analyses.map(({ output }) => output);
  const same = a.kind === b.kind && a.where === b.where;
  return same ? { outputs: [a, b] } : { declined: 'the runs produce different values' };
}

function alignment(sides, env) {
  const pairs = sides[0].statements.map((statement, index) => [
    statement,
    sides[1].statements[index],
  ]);
  return alignRegions(pairs, {
    ...env,
    units: sides.map(({ unit }) => unit),
    regions: sides.map(({ region }) => region),
    written: sides.map(({ written }) => written),
    regionWrites: sides.map(({ regionWrites }) => regionWrites),
  });
}

function analysis({ units, runs, engineHoles }, env) {
  const sides = units.map((unit, index) => sideOf(unit, runs[index], env));
  const problem = sidesProblem(sides, env);
  const outputs = problem === undefined ? outputsOf(sides) : { declined: problem };
  if (outputs.declined !== undefined) {
    return outputs;
  }
  const aligned = alignment(sides, env);
  if (aligned.declined !== undefined || aligned.holes.length !== engineHoles) {
    return {
      declined: aligned.declined ?? 'the differing values do not match the ones the rule found',
    };
  }
  const holeNodes = aligned.holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  const template = templateProblem(sides[0].statements, { ...env, unit: units[0], holeNodes });
  return template === undefined
    ? { sides, aligned, outputs: outputs.outputs }
    : { declined: template };
}

function inputTypeText(input, env) {
  const symbols = input.nodes.map((node) => symbolAt(node, env.checker));
  const texts = symbols.map(
    (symbol) => declarationsOf(symbol)[0]?.type?.getText() ?? symbolTypeString(env.checker, symbol),
  );
  return [...new Set(texts)].join(' | ');
}

function parameterTexts({ inputs, holes }, env) {
  const typed = isTypeScriptFile(env.path);
  const own = inputs.map((input) =>
    typed ? `${input.nodes[0].text}: ${inputTypeText(input, env)}` : input.nodes[0].text,
  );
  return [...own, ...holes.map((hole) => holeParameterText(hole, env.checker, typed))];
}

function helperDeclaration(plan, env) {
  const { region } = plan.sides[0];
  const text = replacedText({ start: region.start, end: region.end }, plan.holes, env.sourceFile);
  const [output] = plan.outputs;
  const tail = output.kind === 'value' ? `\nreturn ${output.name};` : '';
  const body = indentedBy(`${dedentedToLeast(text)}${tail}`, '  ');
  return `function ${plan.name}(${parameterTexts(plan, env).join(', ')}) {\n${body}\n}`;
}

function callStatement(plan, side, env) {
  const own = plan.inputs.map((input) => input.nodes[side].text);
  const extra = plan.holes.map((hole) => holeArgumentText(hole, side, env.sourceFile));
  const call = `${plan.name}(${[...own, ...extra].join(', ')})`;
  const output = plan.outputs[side];
  if (output.kind === 'value') {
    const annotation = output.typeText === undefined ? '' : `: ${output.typeText}`;
    return `${output.keyword} ${output.name}${annotation} = ${call};`;
  }
  return output.kind === 'return' ? `return ${call};` : `${call};`;
}

function editsFor(plan, env) {
  const insertAt = topLevelStatement(plan.sides[0].unit).end;
  const replacements = plan.sides.map(({ region }, side) => ({
    start: region.start,
    end: region.end,
    text: callStatement(plan, side, env),
  }));
  const helper = { start: insertAt, end: insertAt, text: `\n\n${helperDeclaration(plan, env)}` };
  return [...replacements, helper].map((edit) => ({
    type: 'replace',
    path: env.path,
    ...edit,
    text: withLineEndingOf(env.sourceFile.text, edit.text),
  }));
}

export function partialExtraction(input, env) {
  const found = analysis(input, env);
  if (found.declined !== undefined) {
    return found;
  }
  const taken = new Set([...identifierTexts(env.sourceFile), ...env.claimed]);
  const name = helperNameFor(`${input.label}Steps`, taken);
  const holes =
    name === undefined ? undefined : nameHoles(found.aligned.holes, new Set([...taken, name]));
  if (holes === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  env.claimed.add(name);
  const plan = { ...found, name, holes, inputs: found.aligned.inputs };
  return { edits: editsFor(plan, env) };
}
