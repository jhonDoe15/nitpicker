export type ClonedFinding = {
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
};

export type MatchedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly symbol?: string | undefined;
};

const LAMBDA = /^lambda\$(.+)\$\d+$/u;

function pitFunctionName(symbol: string): string {
  const separator = symbol.indexOf('#');
  if (separator === -1) {
    return symbol;
  }
  const className = symbol.slice(symbol.slice(0, separator).lastIndexOf('.') + 1, separator);
  const classNames = className.split('$');
  const method = symbol.slice(separator + 1).replace(/\(.*$/su, '');
  const name = method === '<init>' ? classNames.at(-1) : (LAMBDA.exec(method)?.[1] ?? method);
  return [...classNames, name === 'new' ? classNames.at(-1) : name].join('.');
}

export function functionNameOf(finding: {
  readonly tool: string;
  readonly symbol?: string | undefined;
}): string | undefined {
  if (typeof finding.symbol !== 'string' || finding.symbol === '') {
    return undefined;
  }
  return finding.tool === 'pit' ? pitFunctionName(finding.symbol) : finding.symbol;
}

export const RENAMED_IDENTITY_PREFIX = 'renamed:';
const IDENTITY_KIND_PREFIXES = [RENAMED_IDENTITY_PREFIX, 'cpd:'];

const PAIR_END = /:(?:fragment|occurrence):/;

export function clonePartnerPath(finding: ClonedFinding): string | undefined {
  if (!['duplicate-clone', 'duplicate-clone-size'].includes(finding.rule)) {
    return undefined;
  }
  const prefix = `pair:${finding.path}|`;
  const kind = IDENTITY_KIND_PREFIXES.find((candidate) => finding.identity.startsWith(candidate));
  const identity = finding.identity.slice(kind?.length ?? 0);
  if (!identity.startsWith(prefix)) {
    return undefined;
  }
  const rest = identity.slice(prefix.length);
  const end = rest.search(PAIR_END);
  return end < 0 ? undefined : rest.slice(0, end);
}

export function findingPaths(finding: ClonedFinding): string[] {
  const partner = clonePartnerPath(finding);
  return partner === undefined ? [finding.path] : [finding.path, partner];
}
