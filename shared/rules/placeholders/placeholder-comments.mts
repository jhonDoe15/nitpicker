const SUBJECTS = 'app|application|implementation|scenario|world|project|system';
const REMOTE = 'api|network|backend|server|http|database|db';
const STAND_INS = 'dummy|mock|mocked|fake|hard-?coded|placeholder|stub';
const PHRASES = [
  String.raw`\bin a real (?:${SUBJECTS})\b`,
  String.raw`\bsimulat(?:e|es|ing) (?:an? |the )?(?:${REMOTE})\b`,
  String.raw`\bsimulat(?:e|es|ing) (?:an? |the )?(?:request|delay|latency)\b`,
  String.raw`\bmock (?:data|implementation|response) for now\b`,
  String.raw`\bplaceholder implementation\b`,
  String.raw`\breplace (?:this |it )?with (?:an? |the |your )?(?:real|actual)\b`,
  String.raw`\bfor now,? (?:we |just |simply )*returns? (?:an? |the |some )?(?:${STAND_INS})\b`,
];
const PLACEHOLDER = new RegExp(PHRASES.join('|'), 'iu');
const NON_PRODUCTION_WORDS =
  'tests?|__tests__|specs?|stories|story|storybook|examples?|fixtures?|mocks?|__mocks__|seeds?|' +
  'docs?|documentation|templates?|demos?|samples?|e2e|playground|cypress|playwright';
const NON_PRODUCTION = new RegExp(
  String.raw`(?:^|[/\\._-])(?:${NON_PRODUCTION_WORDS})(?:[/\\._-]|$)`,
  'iu',
);

/** The words of a comment that say the code under it is a stand-in for the real work, if any. */
export function placeholderPhrase(commentText: string): string | undefined {
  return PLACEHOLDER.exec(commentText.replaceAll(/\s+/gu, ' '))?.[0];
}

/** Whether a path is a test, story, example, fixture, mock, seed, documentation or template file. */
export function isNonProductionPath(filePath: string): boolean {
  return NON_PRODUCTION.test(filePath);
}
