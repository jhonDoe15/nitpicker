import { ALL_PRESETS } from '../../plan-parts/presets.mjs';
import { symbolOf, targetOf, without } from '../../plan-parts/finding.mjs';
import { languageOf } from '../../plan-parts/source.mjs';
import { stepsOf } from '../../plan-parts/steps.mjs';
import { declaredParameters, wordsIn } from './declaration.mjs';
import { declineReason } from './decline.mjs';
import { lastWord, parameterNames, sharedName } from './names.mjs';

function placeOf({ path: file, startLine, endLine }) {
  return `${file}:${String(startLine)}-${String(endLine)}`;
}

function argumentsOf(facts, names, side) {
  return facts.parameters.map((parameter, index) => ({
    parameter: names[index],
    value: parameter.values[side] ?? 'nothing',
  }));
}

function takenNames(facts, env) {
  const own = facts.copies.map(({ symbol }) => lastWord(symbol));
  const words = facts.copies.flatMap((copy) =>
    wordsIn(env.read(copy.path), copy.startLine, copy.endLine),
  );
  return new Set(words.filter((word) => !own.includes(word)));
}

function signatureOf(facts, { name, names, own }) {
  const added = facts.parameters.map((parameter, index) =>
    parameter.kind === 'type' ? `type ${names[index]}` : names[index],
  );
  const list = [...(own === undefined || own === '' ? [] : [own]), ...added];
  return {
    name,
    ownParameters: own,
    addedParameters: names.map((parameter, index) => ({
      name: parameter,
      kind: facts.parameters[index].kind,
      deferred: facts.parameters[index].deferred,
    })),
    text: `${name}(${list.join(', ')})`,
  };
}

function moduleWord(file) {
  return ['java', 'kotlin'].includes(languageOf(file)) ? 'class' : 'module';
}

function bodyStep(facts, { signature, copies }) {
  const [first] = copies;
  if (facts.verdict === 'partial-run' && first.run !== undefined) {
    return `Extract only the shared statements, lines ${String(first.run.startLine)}-${String(first.run.endLine)} of ${first.path} and the matching lines of ${copies[1].path}, as ${signature.text}.`;
  }
  if (facts.verdict === 'same') {
    return `Move the body of ${first.symbol} into ${signature.text}: the copies do the same, so it needs no extra parameter.`;
  }
  return `Move the body of ${first.symbol} into ${signature.text}, and use the new parameters where the copies differ.`;
}

function callStep(copy, { signature, args }) {
  const list = args.map(({ value }) => value).join(', ');
  const call = args.length === 0 ? `${signature.name}(...)` : `${signature.name}(..., ${list})`;
  return `In ${placeOf(copy)}, replace the body with a call: ${call}.`;
}

function placeSteps(facts, signature) {
  const { folder, kind, reason } = facts.place;
  const where = folder === '' ? 'the project root' : `${folder}/`;
  return [
    `Put ${signature.name} in a ${moduleWord(facts.copies[0].path)} in ${where}: ${reason}.`,
    kind === 'shared'
      ? 'A shared module must not import a feature (shared-imports-feature): pass what it needs from a feature as parameters.'
      : '',
  ];
}

function declineStep({ recipe, reason, command }) {
  return command === undefined
    ? `Why a recipe did not make this change: ${reason}.`
    : `A recipe may make this change: ${recipe}. Run \`${command}\`; if it leaves the pair, its Fix notes say why.`;
}

function nearDuplicate(finding, env) {
  const facts = finding.planFacts;
  const snake = languageOf(facts.copies[0].path) === 'python';
  const [first] = facts.copies;
  const own = declaredParameters(env.read(first.path), first.startLine);
  const taken = takenNames(facts, env);
  const name = sharedName(
    facts.copies.map(({ symbol }) => symbolOf({ symbol })),
    { snake, taken },
  );
  const names = parameterNames(facts.parameters, { snake, taken: new Set([...taken, name]) });
  const signature = signatureOf(facts, { name, names, own });
  const copies = facts.copies.map((copy, side) => ({
    ...copy,
    arguments: argumentsOf(facts, names, side),
  }));
  const declined = declineReason(facts);
  const [firstCopy, second] = copies;
  return {
    kind: 'extract-shared-function',
    target: {
      path: firstCopy.path,
      symbol: symbolOf({ symbol: firstCopy.symbol }),
      startLine: firstCopy.startLine,
      endLine: firstCopy.endLine,
    },
    context: without({
      verdict: facts.verdict,
      signature,
      copies,
      location: facts.place,
      declined: declined.command === undefined ? declined : undefined,
      recipe: declined.command === undefined ? undefined : declined,
    }),
    steps: stepsOf(
      `Compare the copies: ${placeOf(firstCopy)} and ${placeOf(second)}.`,
      declineStep(declined),
      placeSteps(facts, signature),
      bodyStep(facts, { signature, copies }),
      copies.map((copy) => callStep(copy, { signature, args: copy.arguments })),
      facts.parameters.some(({ deferred }) => deferred)
        ? 'A parameter that is not a literal holds code that differs: evaluate it in the caller, or pass a function when order or side effects matter.'
        : '',
      'Keep the behavior of both callers: run their tests.',
    ),
  };
}

function withoutFacts(finding) {
  return {
    kind: 'extract-shared-function',
    target: targetOf(finding),
    context: {},
    steps: stepsOf(
      `Compare ${finding.symbol ?? 'this function'} with the copy the finding names.`,
      'Extract one function in a module both callers may import, with the values that differ as parameters.',
      'Make both places call it.',
      finding.allowedForm,
      'Keep the behavior of both callers: run their tests.',
    ),
  };
}

function build(finding, env) {
  return finding.planFacts?.copies?.length === 2
    ? nearDuplicate(finding, env)
    : withoutFacts(finding);
}

export const NEAR_DUPLICATE_BUILDERS = [
  {
    id: 'extract-shared-function',
    rules: [{ tool: 'structure', rule: 'near-duplicate' }],
    presets: ALL_PRESETS.filter((preset) => preset !== 'go'),
    build,
  },
];
