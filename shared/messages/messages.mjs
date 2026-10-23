import { exceptionSentence } from './exception-sentence.mjs';

export const EXCEPTION_HINT = exceptionSentence('{exception}');

const ALLOWED_OPEN = '\u27E6';
const ALLOWED_CLOSE = '\u27E7';
const ALLOWED_SPAN = /\u27E6([^\u27E7]*)\u27E7/gu;

export function allowedForm(text) {
  return `${ALLOWED_OPEN}${text}${ALLOWED_CLOSE}`;
}

export const BASE_MESSAGES = {
  functionStructure: '{name} has {value} {metric}; limit is {limit}',
  functionStatements: `{name} has {value} statements; limit is {limit}. ${allowedForm('Split by responsibility and name each part for what it checks or does.')}`,
  functionControlNesting: `{name} nests control flow {value} deep (limit {limit}). ${allowedForm('Return early instead of nesting.')}`,
  crapScoreLimit: `{name} has CRAP {crap}; score must be below {limit}. ${allowedForm('Test its uncovered branches, or split a branchy part into its own function.')}`,
  crapScoreLimitCovered: `{name} has CRAP {crap} although tests cover it; score must be below {limit}. ${allowedForm('Reduce its branches: split a branchy part into its own function.')}`,
  crapCoverageUnknown: `{name} has unknown coverage and no CRAP score: no test runs it. ${allowedForm('Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.')}`,
  crapCoverageUnknownJava: `{name} has unknown coverage and no CRAP score: JaCoCo has no data for it, so no test runs it or it is annotated @Generated. ${allowedForm('Add a test that calls it, and remove @Generated from hand-written code.')}`,
  crapCoverageUnknownPlain: `{name} has unknown coverage and no CRAP score: no test runs it. ${allowedForm('Add a test that calls it.')}`,
  changedBranchCoverage: 'Branch coverage is {percent}%; minimum is {minimum}%',
  unusedProp: `Prop {name} is never passed. ${allowedForm('Remove it, or pass it from a real caller ({scope}).')} ${EXCEPTION_HINT}`,
  unusedOption: `Option {name} is never set. ${allowedForm('Remove it, or set it from a real call ({scope}).')} ${EXCEPTION_HINT}`,
  testOnlyExport: `Export {name} is only imported by tests. ${allowedForm('Remove `export`, or import it from production code.')} ${EXCEPTION_HINT}`,
  testOnlyReexport: `Export {name} is only imported by tests, and {reexporter} re-exports it, which is not a use. ${allowedForm('Remove the re-export and `export`, or import it from production code. If a host or tool loads {reexporter} instead of importing it, list it in "layout.entryPoints".')} ${EXCEPTION_HINT}`,
  testOnlyModule: `Module {name} is only imported by tests. ${allowedForm('Move it to a test-support/ folder, or import it from production code.')} ${EXCEPTION_HINT}`,
  testOnlyDeclaration: `{name} is only used by tests. ${allowedForm('Make it private to its module, or use it from production code.')} ${EXCEPTION_HINT}`,
  testOnlyFile: `Module {name} is only used by tests. ${allowedForm('Move it beside the tests as a test helper, or use it from production code.')} ${EXCEPTION_HINT}`,
  restatingDocComment: `This doc comment only restates {name}. ${allowedForm('Delete it, or say what the name cannot: a unit, a limit, an edge case or why.')} ${EXCEPTION_HINT}`,
  longDocComment: `This doc comment's description is {lines} lines (limit {limit}). ${allowedForm('Keep the non-obvious point, a unit, a limit or an edge case, and put the rest in names and types.')} ${EXCEPTION_HINT}`,
  slowTest: `{name} took {seconds} s; {kind} test may take {limit} s. ${allowedForm('{fix}.')} ${EXCEPTION_HINT}`,
  sharedUsedByOneFeature: `{path} is used only by feature {feature}. ${allowedForm('Move it into {directory}.')} ${EXCEPTION_HINT}`,
  duplicateDefinition: `{name} is also defined with {same} in {others}. ${allowedForm('{fix}')} ${EXCEPTION_HINT}`,
  siblingCopyEdit: `{name} is edited here but not in {others}, where it has almost the same code. ${allowedForm('Edit it there too, or merge the copies.')} ${EXCEPTION_HINT}`,
  exportedNameCollision: `{name} is also exported by {others}; {importer} imports both. ${allowedForm('{fix}')} ${EXCEPTION_HINT}`,
  redefinedLibraryComponent: `{name} is already rendered from {package} in {count}. ${allowedForm('Use that one.')} ${EXCEPTION_HINT}`,
  newIconAsset: `${allowedForm('Use an icon from {package} instead of adding {path}.')} ${EXCEPTION_HINT}`,
  testConsoleOutput: `Tests print new console output: {output}. ${allowedForm('Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json.')} ${EXCEPTION_HINT}`,
};

function fill(text, values) {
  return text.replaceAll(/\{(\w+)\}/g, (_, key) => String(values[key]));
}

export function renderMessage(template, values) {
  return fill(template.replaceAll(ALLOWED_SPAN, '$1'), values);
}

function renderAllowedForm(template, values) {
  const spans = [...template.matchAll(ALLOWED_SPAN)].map(([, text]) => fill(text, values));
  return spans.length === 0 ? undefined : spans.join(' ');
}

export function definedField(name, value) {
  return value === undefined ? {} : { [name]: value };
}

export function allowedFormField(...parts) {
  const kept = parts.filter((part) => part !== undefined);
  return definedField('allowedForm', kept.length === 0 ? undefined : kept.join(' '));
}

export function messageFields(template, values) {
  return {
    message: renderMessage(template, values),
    ...allowedFormField(renderAllowedForm(template, values)),
  };
}

export const BASE_GREW_MESSAGES = {
  lines: `{name} grew from {base} to {value} lines (limit {limit}). ${allowedForm('Put new code in a new function.')}`,
  statements: `{name} grew from {base} to {value} statements (limit {limit}). ${allowedForm('Put new code in a new function.')}`,
  maxControlNesting: `{name} control nesting grew from {base} to {value} levels (limit {limit}). ${allowedForm('Put the new nested code in a new function.')}`,
  parameters: `{name} grew from {base} to {value} parameters (limit {limit}). ${allowedForm('Group related parameters into one object instead of adding another.')}`,
  crap: `{name} CRAP rose from {base} to {crap} (limit {limit}). ${allowedForm('Put new code in a new function and cover it with tests.')}`,
};

export const BASE_HELD_MESSAGES = {
  lines:
    '{name}: {value} lines (limit {limit}), allowed because base was {base}; any increase fails.',
  statements:
    '{name}: {value} statements (limit {limit}), allowed because base was {base}; any increase fails.',
  maxControlNesting:
    '{name}: control nesting {value} (limit {limit}), allowed because base was {base}; any increase fails.',
  parameters:
    '{name}: {value} parameters (limit {limit}), allowed because base was {base}; any increase fails.',
  crap: '{name}: CRAP {crap} (limit {limit}), allowed because base was {base}; any increase fails.',
};
