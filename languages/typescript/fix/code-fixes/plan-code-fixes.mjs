import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mjs';
import {
  acceptsAction,
  candidateFiles,
  codeName,
  fixesForCode,
  selectedCodeFixes,
} from './code-fix-rules.mjs';
import { unusedDeclarationDeclined } from './fix-guards.mjs';
import { createFixService } from './language-service.mjs';

const CODE_FIX_PASSES = 3;

function lineOf(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function fixGroups({ fixService, name, text, fixes }) {
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
    fixesForCode(fixes, diagnostic.code).flatMap((fix) => {
      const actions = service
        .getCodeFixesAtPosition(
          file,
          diagnostic.start,
          diagnostic.start + diagnostic.length,
          [diagnostic.code],
          lazyTypeScriptApi().getDefaultFormatCodeSettings(),
          {},
        )
        .filter((action) => acceptsAction(fix, action));
      const changes = actions.length === 1 ? actions[0].changes : [];
      const edits = changes.flatMap((change) =>
        change.fileName === file
          ? change.textChanges.map(({ span, newText }) => ({
              start: span.start,
              end: span.start + span.length,
              text: newText,
            }))
          : [{ foreign: true }],
      );
      const declined =
        fix.id === 'unused-declaration' &&
        edits.length > 0 &&
        !edits.some(({ foreign }) => foreign === true) &&
        unusedDeclarationDeclined(service.getProgram().getSourceFile(file), {
          position: diagnostic.start,
          edits,
        });
      return edits.length === 0 || declined || edits.some(({ foreign }) => foreign === true)
        ? []
        : [{ edits, rule: codeName(diagnostic.code), line: lineOf(text, diagnostic.start) }];
    }),
  );
}

function overlaps(left, right) {
  return left.start <= right.end && right.start <= left.end;
}

function acceptedGroups(groups) {
  const accepted = [];
  for (const group of groups.toSorted(
    (left, right) => left.edits[0].start - right.edits[0].start,
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

function applied(text, groups) {
  const edits = groups
    .flatMap(({ edits: own }) => own)
    .toSorted((left, right) => right.start - left.start);
  return edits.reduce(
    (result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
    text,
  );
}

function fixPass(state) {
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

function settle(state) {
  Array.from({ length: CODE_FIX_PASSES }).some(() => !fixPass(state));
}

export function planCodeFixes({ projectRoot, javascript, files, selectedRules = [] }) {
  const fixes = selectedCodeFixes(selectedRules);
  const candidates = candidateFiles(fixes, files);
  if (fixes.length === 0 || candidates.length === 0) {
    return { texts: new Map(), applied: [] };
  }
  const names = candidates.map(({ name }) => name);
  const fixService = createFixService({ projectRoot, javascript, names });
  const texts = new Map(candidates.map(({ name, text }) => [name, text]));
  const state = { fixService, fixes, texts, done: [] };
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
