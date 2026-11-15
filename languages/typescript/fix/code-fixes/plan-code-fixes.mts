import type TypeScript from 'typescript';
import { lazyTypeScriptApi } from '../typed/lazy-typescript-api.mts';
import { unusedDeclarationDeclined } from './fix-guards.mts';
import { createFixService, type FixService } from './language-service.mts';
import {
  acceptsAction,
  candidateFiles,
  codeName,
  fixesForCode,
  selectedCodeFixes,
  type CodeFix,
  type SourceText,
} from './typed/code-fix-views.mts';

type Edit = { readonly start: number; readonly end: number; readonly text: string };
type Group = {
  readonly edits: readonly Edit[];
  readonly rule: string;
  readonly line: number;
};
type Done = { readonly name: string; readonly rule: string; readonly line: number };
type PassState = {
  readonly fixService: FixService;
  readonly fixes: readonly CodeFix[];
  readonly texts: Map<string, string>;
  readonly done: Done[];
};

const CODE_FIX_PASSES = 3;

function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

type DiagnosticFix = {
  readonly service: TypeScript.LanguageService;
  readonly file: string;
  readonly diagnostic: TypeScript.Diagnostic;
  readonly fix: CodeFix;
};

function actionChanges({
  service,
  file,
  diagnostic,
  fix,
}: DiagnosticFix): readonly TypeScript.FileTextChanges[] {
  const start = diagnostic.start ?? 0;
  const actions = service
    .getCodeFixesAtPosition(
      file,
      start,
      start + (diagnostic.length ?? 0),
      [diagnostic.code],
      lazyTypeScriptApi().getDefaultFormatCodeSettings(),
      {},
    )
    .filter((action) => acceptsAction(fix, action));
  return actions.length === 1 ? (actions[0]?.changes ?? []) : [];
}

function ownEdits(changes: readonly TypeScript.FileTextChanges[], file: string): Edit[] {
  return changes.flatMap((change) =>
    change.fileName === file
      ? change.textChanges.map(({ span, newText }) => ({
          start: span.start,
          end: span.start + span.length,
          text: newText,
        }))
      : [],
  );
}

function fixGroups({
  fixService,
  name,
  text,
  fixes,
}: {
  readonly fixService: FixService;
  readonly name: string;
  readonly text: string;
  readonly fixes: readonly CodeFix[];
}): Group[] {
  const { service, absolute } = fixService;
  const file = absolute(name);
  if (service.getSyntacticDiagnostics(file).length > 0) {
    return [];
  }
  const diagnostics = [
    ...service.getSemanticDiagnostics(file),
    ...service.getSuggestionDiagnostics(file),
  ];
  return diagnostics.flatMap((diagnostic) =>
    fixesForCode(fixes, diagnostic.code).flatMap((fix): Group[] => {
      const start = diagnostic.start ?? 0;
      const changes = actionChanges({ service, file, diagnostic, fix });
      const foreign = changes.some((change) => change.fileName !== file);
      const edits = ownEdits(changes, file);
      const sourceFile = service.getProgram()?.getSourceFile(file);
      const declined =
        fix.id === 'unused-declaration' &&
        edits.length > 0 &&
        !foreign &&
        sourceFile !== undefined &&
        unusedDeclarationDeclined(sourceFile, { position: start, edits });
      return edits.length === 0 || declined || foreign
        ? []
        : [{ edits, rule: codeName(diagnostic.code), line: lineOf(text, start) }];
    }),
  );
}

function overlaps(left: Edit, right: Edit): boolean {
  return left.start <= right.end && right.start <= left.end;
}

function acceptedGroups(groups: readonly Group[]): Group[] {
  const accepted: Group[] = [];
  for (const group of groups.toSorted(
    (left, right) => (left.edits[0]?.start ?? 0) - (right.edits[0]?.start ?? 0),
  )) {
    const clash = accepted.some(({ edits }) =>
      edits.some((taken) => group.edits.some((edit) => overlaps(taken, edit))),
    );
    if (!clash) {
      accepted.push(group);
    }
  }
  return accepted;
}

function applied(text: string, groups: readonly Group[]): string {
  const edits = groups
    .flatMap(({ edits: own }) => own)
    .toSorted((left, right) => right.start - left.start);
  return edits.reduce(
    (result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
    text,
  );
}

function fixPass(state: PassState): boolean {
  const { fixService, fixes, texts, done } = state;
  let changed = false;
  for (const [name, text] of texts) {
    const groups = acceptedGroups(fixGroups({ fixService, name, text, fixes }));
    const next = applied(text, groups);
    if (next !== text) {
      texts.set(name, next);
      fixService.setText(name, next);
      done.push(...groups.map(({ rule, line }) => ({ name, rule, line })));
      changed = true;
    }
  }
  return changed;
}

function settle(state: PassState): void {
  Array.from({ length: CODE_FIX_PASSES }).some(() => !fixPass(state));
}

export function planCodeFixes({
  projectRoot,
  javascript,
  files,
  selectedRules = [],
}: {
  readonly projectRoot: string;
  readonly javascript: boolean;
  readonly files: readonly SourceText[];
  readonly selectedRules?: readonly string[];
}): { texts: Map<string, string>; applied: Done[] } {
  const fixes = selectedCodeFixes(selectedRules);
  const candidates = candidateFiles(fixes, files);
  if (fixes.length === 0 || candidates.length === 0) {
    return { texts: new Map(), applied: [] };
  }
  const names = candidates.map(({ name }) => name);
  const fixService = createFixService({ projectRoot, javascript, names });
  const texts = new Map(candidates.map(({ name, text }) => [name, text]));
  const state: PassState = { fixService, fixes, texts, done: [] };
  try {
    settle(state);
  } finally {
    fixService.dispose();
  }
  const original = new Map(candidates.map(({ name, text }) => [name, text]));
  return {
    texts: new Map([...texts].filter(([name, text]) => text !== original.get(name))),
    applied: state.done,
  };
}
