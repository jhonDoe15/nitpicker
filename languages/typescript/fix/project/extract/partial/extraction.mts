import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import type { Planned, ReplaceEdit } from '../../typed/project-types.mts';
import { alignRegions } from '../lockstep.mts';
import {
  holeArgumentText,
  holeParameterText,
  identifierTexts,
  nameHoles,
  replacedText,
  symbolTypeString,
  topLevelStatement,
} from '../render.mts';
import { declarationsOf, templateProblem } from '../scope.mts';
import { isTypeScriptFile, symbolAt } from '../syntax.mts';
import { lostCommentsIn } from '../whole/unit-check.mts';
import {
  eachSide,
  paired,
  type Aligned,
  type Both,
  type ExtractEnv,
  type Hole,
  type InputPair,
  type LineSpan,
  type NamedHole,
  type PartialInput,
  type RunOutput,
  type RunSide,
  type Side,
  type UnitNode,
} from '../typed/extract-types.mts';
import {
  dedentedToLeast,
  helperNameFor,
  indentedBy,
  withLineEndingOf,
} from '../typed/typed-views.mts';
import { writesOf } from '../writes.mts';
import { ownNodes, runAnalysis } from './flow.mts';
import { runRegion, runStatements } from './runs.mts';

type Checked =
  | { readonly problem: string; readonly sides?: undefined }
  | { readonly sides: Both<RunSide>; readonly problem?: undefined };

type Outputs =
  | { readonly declined: string; readonly outputs?: undefined }
  | { readonly outputs: Both<RunOutput>; readonly declined?: undefined };

type Analysis =
  | { readonly declined: string; readonly sides?: undefined }
  | {
      readonly declined?: undefined;
      readonly sides: Both<RunSide>;
      readonly aligned: { readonly holes: Hole[]; readonly inputs: InputPair[] };
      readonly outputs: Both<RunOutput>;
    };

type Plan = {
  readonly sides: Both<RunSide>;
  readonly outputs: Both<RunOutput>;
  readonly name: string;
  readonly holes: readonly NamedHole[];
  readonly inputs: readonly InputPair[];
};

const ts = typescriptApi();

function isSyntaxNode(value: unknown): value is TypeScript.Node {
  return typeof value === 'object' && value !== null && 'kind' in value && 'pos' in value;
}

function sideOf(unit: UnitNode, span: LineSpan, env: ExtractEnv): RunSide | undefined {
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

function throwsText(side: RunSide, sourceFile: TypeScript.SourceFile): string {
  return ownNodes(side.statements)
    .filter((node): node is TypeScript.ThrowStatement => ts.isThrowStatement(node))
    .map(({ expression }) =>
      ts.isNewExpression(expression) ? expression.expression.getText(sourceFile) : '',
    )
    .join(',');
}

function sidesProblem(sides: Both<RunSide | undefined>, env: ExtractEnv): Checked {
  const [first, second] = sides;
  if (first === undefined || second === undefined) {
    return { problem: 'a run is not a whole list of statements in a block' };
  }
  if (first.statements.length !== second.statements.length) {
    return { problem: 'the runs have different numbers of statements' };
  }
  if (throwsText(first, env.sourceFile) !== throwsText(second, env.sourceFile)) {
    return { problem: 'the copies throw different exceptions' };
  }
  const lost = lostCommentsIn(
    eachSide([first, second], ({ statements, region }) => ({
      roots: statements,
      range: { pos: region.start, end: region.end },
    })),
    env.sourceFile,
  );
  return lost
    ? { problem: 'the second copy has comments the shared function would drop' }
    : { sides: [first, second] };
}

function outputsOf(sides: Both<RunSide>): Outputs {
  const [first, second] = eachSide(sides, (side) => runAnalysis(side, side.written));
  if (first.problem !== undefined) {
    return { declined: first.problem };
  }
  if (second.problem !== undefined) {
    return { declined: second.problem };
  }
  const [a, b] = [first.output, second.output];
  const same = a.kind === b.kind && a.where === b.where;
  return same ? { outputs: [a, b] } : { declined: 'the runs produce different values' };
}

function alignment(sides: Both<RunSide>, env: ExtractEnv): Aligned {
  const pairs = paired(sides[0].statements, sides[1].statements);
  return alignRegions(pairs, {
    ...env,
    typeHoles: false,
    units: eachSide(sides, ({ unit }) => unit),
    regions: eachSide(sides, ({ region }) => region),
    written: eachSide(sides, ({ written }) => written),
    regionWrites: eachSide(sides, ({ regionWrites }) => regionWrites),
  });
}

function analysis({ units, runs, engineHoles }: PartialInput, env: ExtractEnv): Analysis {
  const checked = sidesProblem(
    eachSide(units, (unit, index) => sideOf(unit, runs[index], env)),
    env,
  );
  if (checked.problem !== undefined) {
    return { declined: checked.problem };
  }
  const { sides } = checked;
  const outputs = outputsOf(sides);
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

function annotationText(declaration: TypeScript.Declaration | undefined): string | undefined {
  const annotation = fieldOf(declaration, 'type');
  return isSyntaxNode(annotation) ? annotation.getText() : undefined;
}

function inputTypeText(input: InputPair, env: ExtractEnv): string {
  const symbols = input.nodes.map((node) => symbolAt(node, env.checker));
  const texts = symbols.map(
    (symbol) => annotationText(declarationsOf(symbol)[0]) ?? symbolTypeString(env.checker, symbol),
  );
  return [...new Set(texts)].join(' | ');
}

function parameterTexts(
  { inputs, holes }: Pick<Plan, 'inputs' | 'holes'>,
  env: ExtractEnv,
): string[] {
  const typed = isTypeScriptFile(env.path);
  const own = inputs.map((input) =>
    typed ? `${input.nodes[0].text}: ${inputTypeText(input, env)}` : input.nodes[0].text,
  );
  return [...own, ...holes.map((hole) => holeParameterText(hole, env.checker, { typed }))];
}

function helperDeclaration(plan: Plan, env: ExtractEnv): string {
  const { region } = plan.sides[0];
  const text = replacedText({ start: region.start, end: region.end }, plan.holes, env.sourceFile);
  const [output] = plan.outputs;
  const tail = output.kind === 'value' ? `\nreturn ${output.name};` : '';
  const body = indentedBy(`${dedentedToLeast(text)}${tail}`, '  ');
  return `function ${plan.name}(${parameterTexts(plan, env).join(', ')}) {\n${body}\n}`;
}

function callStatement(plan: Plan, side: Side, env: ExtractEnv): string {
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

function editsFor(plan: Plan, env: ExtractEnv): ReplaceEdit[] {
  const insertAt = topLevelStatement(plan.sides[0].unit).end;
  const replacements = eachSide(plan.sides, ({ region }, side) => ({
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

export function partialExtraction(input: PartialInput, env: ExtractEnv): Planned<ReplaceEdit> {
  const found = analysis(input, env);
  if (found.declined !== undefined) {
    return found;
  }
  const taken = new Set([...identifierTexts(env.sourceFile), ...env.claimed]);
  const name = helperNameFor(`${input.label}Steps`, taken);
  const holes =
    name === undefined ? undefined : nameHoles(found.aligned.holes, new Set([...taken, name]));
  if (name === undefined || holes === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  env.claim(name);
  const plan = { ...found, name, holes, inputs: found.aligned.inputs };
  return { edits: editsFor(plan, env) };
}
