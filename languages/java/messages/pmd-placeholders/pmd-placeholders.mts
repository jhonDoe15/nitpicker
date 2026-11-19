type PlaceholderFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string;
  readonly location?: { readonly line?: number; readonly column?: number } | undefined;
};
type SourceText = (file: string) => string | undefined;

const PLACEHOLDER = /\s*\$\{[^}]*\}/gu;
const HAS_PLACEHOLDER = /\$\{[^}]*\}/u;
const STRING_LITERAL = /"(?:[^"\\\r\n]|\\.)*"/gu;
const HARD_CODED_IP_RULE = 'AvoidUsingHardCodedIP';
const ADDRESS = /^"(?:\d{1,3}(?:\.\d{1,3}){3}|(?=[\d.a-f]*:)[\da-f:.]+)"$/iu;

function literalAt(line: string, column: number): string | undefined {
  const addresses = [...line.matchAll(STRING_LITERAL)]
    .filter(([text]) => ADDRESS.test(text))
    .map((match) => ({ text: match[0], start: match.index + 1 }));
  const at = addresses.find(({ text, start }) => start <= column && column < start + text.length);
  return (at ?? addresses[0])?.text;
}

function literalOf(finding: PlaceholderFinding, sourceText: SourceText): string | undefined {
  const { line, column = 1 } = finding.location ?? {};
  const text = line === undefined ? undefined : sourceText(finding.path);
  const sourceLine = text?.split(/\r?\n/u)[(line ?? 1) - 1];
  return sourceLine === undefined ? undefined : literalAt(sourceLine, column);
}

function rendered<Finding extends PlaceholderFinding>(
  finding: Finding,
  sourceText: SourceText,
): Finding {
  const literal = finding.rule === HARD_CODED_IP_RULE ? literalOf(finding, sourceText) : undefined;
  return {
    ...finding,
    message:
      literal === undefined
        ? finding.message.replace(PLACEHOLDER, '')
        : finding.message.replace(PLACEHOLDER, ` ${literal}`),
  };
}

export function withRenderedPlaceholders<Finding extends PlaceholderFinding>(
  findings: Finding[],
  { sourceText }: { sourceText: SourceText },
): Finding[] {
  return findings.map((finding) =>
    finding.tool === 'pmd' && HAS_PLACEHOLDER.test(finding.message)
      ? rendered(finding, sourceText)
      : finding,
  );
}
