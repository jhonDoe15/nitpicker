export const DYNAMIC = '\u0000';
const STATEMENT =
  '(?:SELECT\\b[\\s\\S]*?\\bFROM\\b|INSERT\\s+INTO\\b|UPDATE\\s+\\S+\\s+SET\\b|DELETE\\s+FROM\\b|REPLACE\\s+INTO\\b|MERGE\\s+INTO\\b|TRUNCATE\\s+TABLE\\b|DROP\\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\\b|ALTER\\s+TABLE\\b|CREATE\\s+(?:UNIQUE\\s+)?(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\\b|WITH\\s+\\S+\\s+AS\\s*\\()';
const COMPARISON = '\\s*(?:=|<>|!=|<=|>=|<|>|\\bLIKE\\b|\\bIN\\b|\\bNOT\\s+IN\\b|\\bIS\\b)';
const CLAUSE = `(?:(?:WHERE|AND|OR|HAVING|ON)\\s+[\\w."\`[\\]]+${COMPARISON}|(?:ORDER|GROUP)\\s+BY\\b|LIMIT\\b|OFFSET\\b|VALUES\\s*\\()`;
export const STRONG_STATEMENT = new RegExp(`^\\s*(?:${STATEMENT}|${CLAUSE})`, 'u');
export const LOOSE_STATEMENT = new RegExp(`^\\s*${STATEMENT}`, 'iu');
export const FRAGMENT_BEFORE_VALUE =
  /(?:\b(?:where|and|or|having|on)\s+[\w."`[\]]+\s*(?:=|<>|!=|<=|>=|<|>|\blike\b|\bin\b|\bnot\s+in\b)\s*(?:\(\s*)?['"%]*|\b(?:order|group)\s+by\s+|\b(?:limit|offset)\s+)$/iu;
export const VALUE_POSITION =
  /(?:=|<>|!=|<=|>=|<|>|\blike|\bin|\bnot\s+in|\bbetween|\band)\s*(?:\(\s*)?['"%]*$/iu;
