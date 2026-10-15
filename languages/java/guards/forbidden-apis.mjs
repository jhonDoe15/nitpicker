import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter, hashIdentity } from '../ingest/common.mjs';

const FORBIDDEN_APIS_TOOL = 'forbiddenapis';
const FORBIDDEN_REPORT = 'forbidden-apis.txt';
const VIOLATION = /^ERROR: Forbidden [\w/ ]+: (.+?) \[([a-z-]+): (.+)\]$/;
const LOCATION = /^ERROR:\s+in (\S+) \((\S+?):(\d+)\)$/;

function shortName(signature) {
  const method = /^([\w.$]+)#(<init>|\w+)/.exec(signature);
  if (method === null) {
    return signature.split('.').at(-1);
  }
  const owner = method[1].split('.').at(-1);
  return method[2] === '<init>' ? `new ${owner}` : `${owner}.${method[2]}`;
}

export function parseForbiddenApiUses(text) {
  const uses = [];
  let pending;
  for (const line of text.split(/\r?\n/)) {
    const violation = VIOLATION.exec(line);
    if (violation !== null) {
      pending = { signature: violation[1], rule: violation[2], text: violation[3] };
      continue;
    }
    const location = LOCATION.exec(line);
    if (location !== null && pending !== undefined) {
      uses.push({
        ...pending,
        className: location[1],
        fileName: location[2],
        line: Number(location[3]),
      });
      pending = undefined;
    }
  }
  return uses;
}

function useFinding(use, file, unique) {
  return {
    tool: FORBIDDEN_APIS_TOOL,
    rule: use.rule,
    path: file,
    identity: unique(hashIdentity('forbidden', [use.rule, file, use.className, use.signature])),
    message: `${use.text} Found: ${shortName(use.signature)}. If it is right here, add an exception for ${FORBIDDEN_APIS_TOOL}/${use.rule} in nitpicker.config.json.`,
    classification: 'enforceable',
    location: { line: use.line },
  };
}

export function readForbiddenApiFindings(reportRoot, { locate }) {
  const report = path.join(reportRoot, FORBIDDEN_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const unique = createIdentityCounter();
  return parseForbiddenApiUses(readFileSync(report, 'utf8')).flatMap((use) => {
    const packageDirectory = use.className.split('.').slice(0, -1).join('/');
    const file = locate(packageDirectory, use.fileName);
    return file === undefined ? [] : [useFinding(use, file, unique)];
  });
}
