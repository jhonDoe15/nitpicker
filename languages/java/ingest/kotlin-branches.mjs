const BRANCHING_SYNTAX =
  /\b(?:if|when|while|for|do|is|in|as)\b|&&|\|\||\?[.:]|[<>!]|==|\b(?:require|check|assert|requireNotNull|checkNotNull)\s*\(/;
const TYPE_ARGUMENTS = /(?<=\w)<[\w?., *<>]*>/g;

export function hasBranchingSyntax(sourceLine) {
  return BRANCHING_SYNTAX.test(sourceLine.replaceAll(TYPE_ARGUMENTS, ''));
}
