import type { AnalysisResult, Guard, TraceEvent, Violation, Witness } from '../model/run-types.mts';
import type { FlowModel } from '../model/syntax-types.mts';
import { semanticItems } from './items.mts';

type Located = { readonly line: number; readonly column: number };

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function row(cells: readonly string[]): string {
  return `| ${cells.map(cell).join(' | ')} |`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
}

function at(item: Located): string {
  return `${String(item.line)}:${String(item.column)}`;
}

function guardText(guard: Guard): string {
  return guard.text === 'catch'
    ? `caught at ${at(guard)}`
    : `${guard.text} is ${String(guard.value)} (${at(guard)})`;
}

function eventText(event: TraceEvent): string {
  const target = event.to === undefined ? event.entity : `${event.entity} to ${event.to}`;
  return `${event.callee}(${target}) ${event.outcome} (${at(event)})`;
}

export function stepsOf(trace: Witness): string[] {
  const steps = [
    ...trace.guards.map((guard) => ({ seq: guard.seq, text: guardText(guard) })),
    ...trace.events.map((event) => ({ seq: event.seq, text: eventText(event) })),
  ];
  return steps.sort((left, right) => left.seq - right.seq).map((step) => step.text);
}

export function decisionTable(model: FlowModel): string {
  const rows = semanticItems(model)
    .filter(
      (item) => item.kind === 'guard' || item.kind === 'effect' || item.kind === 'unsupported',
    )
    .map((item) => [
      item.fn,
      `${String(item.loc?.line ?? 0)}:${String(item.loc?.column ?? 0)}`,
      item.kind,
      item.text,
    ]);
  return table(['Function', 'Line:Col', 'Kind', 'Decision or effect'], rows);
}

export function pathTable(result: AnalysisResult): string {
  const rows = result.paths.map((path) => [
    path.id,
    stepsOf(path).join('; ') || '(no decisions)',
    `${path.completion} ${path.value}`,
    path.violations.join(', ') || '-',
  ]);
  return table(['Path', 'Steps', 'Completion', 'Violations'], rows);
}

export function flowView({
  name,
  model,
  result,
}: {
  name: string;
  model: FlowModel;
  result: AnalysisResult;
}): string {
  const reasons = result.reasons.map((item) => `- ${item.reason} at ${at(item)}: ${item.detail}`);
  return [
    `### ${name}`,
    '',
    `Entry \`${model.entry}\` in \`${model.file}\`: **${result.status}**, ${String(result.paths.length)} paths.`,
    '',
    decisionTable(model),
    '',
    pathTable(result),
    ...(reasons.length === 0 ? [] : ['', 'Incomplete analysis:', ...reasons]),
    '',
  ].join('\n');
}

function witnessSteps(violation: Violation): string[] {
  const steps = [...stepsOf(violation.witness), `violation at ${at(violation)}`];
  return steps.map((step, index) => `${String(index + 1)}. ${step}`);
}

export function witnessView({
  name,
  file,
  result,
}: {
  name: string;
  file: string;
  result: AnalysisResult;
}): string[] {
  return result.violations.map((violation) => {
    const move =
      violation.from === undefined
        ? ''
        : ` from ${String(violation.from)} to ${String(violation.to)}`;
    return [
      `### ${name}: ${violation.contract} (${violation.certainty})`,
      '',
      `\`${file}:${at(violation)}\` ${violation.callee} for ${violation.entity}${move}`,
      '',
      ...witnessSteps(violation),
      '',
    ].join('\n');
  });
}
