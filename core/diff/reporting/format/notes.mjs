const CONTINUATION_INDENT = '  ';

export function noteText(note) {
  const [first, ...rest] = note.message.split('\n');
  return [
    `${note.tool} (${note.snapshot}): ${first}`,
    ...rest.map((line) => `${CONTINUATION_INDENT}${line}`),
  ].join('\n');
}

export function noteSectionLines(notes = []) {
  if (notes.length === 0) {
    return [];
  }
  return ['', 'Notes:', ...notes.flatMap((note) => noteText(note).split('\n'))];
}

const UNKNOWN_ON_BASE = [
  'Coverage, CRAP, mutation, slow-test and test-console results are unknown there,',
  'so only added files and edited lines are judged on them.',
].join(' ');

const COUNTS_AS_NEW = [
  'The change removes tests, so every coverage, CRAP, mutation, slow-test and test-console result',
  'of the head counts as new.',
].join(' ');

export function noteSummaryLines(notes = []) {
  const failed = notes.filter(({ rule }) => rule !== 'tests-removed');
  if (failed.length === 0) {
    return [];
  }
  const tools = [...new Set(failed.map(({ tool }) => tool))].join(', ');
  const removed = notes.some(({ rule }) => rule === 'tests-removed');
  return [
    `Note: the project's tests fail on the base (${tools}).`,
    removed ? COUNTS_AS_NEW : UNKNOWN_ON_BASE,
  ];
}
