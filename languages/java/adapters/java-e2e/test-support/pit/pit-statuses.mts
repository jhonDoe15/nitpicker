import { escapeRegExp as escapedText } from '../../../../../../shared/paths/glob.mjs';

const escapeRegExp: (value: string) => string = escapedText;

const KEY_FIELDS = [
  'mutatedClass',
  'mutatedMethod',
  'methodDescription',
  'lineNumber',
  'mutator',
  'indexes',
];

function field(body: string | undefined, name: string): string {
  return (
    new RegExp(`<${escapeRegExp(name)}>([^<]*)</${escapeRegExp(name)}>`, 'u').exec(
      body ?? '',
    )?.[1] ?? ''
  );
}

export function pitStatuses(
  xml: string,
): { key: string; className: string; status: string | undefined; ran: number }[] {
  return [...xml.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/gu)]
    .map(([, attributes = '', body]) => ({
      key: KEY_FIELDS.map((name) => field(body, name)).join('|'),
      className: field(body, 'mutatedClass'),
      status: /\bstatus='([^']*)'/u.exec(attributes)?.[1],
      ran: Number(/\bnumberOfTestsRun='(\d+)'/u.exec(attributes)?.[1]),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
