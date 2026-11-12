const KEY_FIELDS = [
  'mutatedClass',
  'mutatedMethod',
  'methodDescription',
  'lineNumber',
  'mutator',
  'indexes',
];

function field(body, name) {
  return new RegExp(`<${name}>([^<]*)</${name}>`, 'u').exec(body)?.[1] ?? '';
}

export function pitStatuses(xml) {
  return [...xml.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/gu)]
    .map(([, attributes, body]) => ({
      key: KEY_FIELDS.map((name) => field(body, name)).join('|'),
      className: field(body, 'mutatedClass'),
      status: /\bstatus='([^']*)'/u.exec(attributes)?.[1],
      ran: Number(/\bnumberOfTestsRun='(\d+)'/u.exec(attributes)?.[1]),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
