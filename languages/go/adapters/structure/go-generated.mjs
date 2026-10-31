import { moduleFileText } from '../execution/go-module.mjs';

const GO_FILE = /\.go$/u;
const GENERATED_HEADER = /^\/\/ Code generated .* DO NOT EDIT\.$/mu;
const PACKAGE_CLAUSE = /^package\s/mu;

export function isGeneratedGo(projectRoot, file) {
  if (!GO_FILE.test(file)) {
    return false;
  }
  const text = moduleFileText(projectRoot, file) ?? '';
  const clause = PACKAGE_CLAUSE.exec(text);
  return GENERATED_HEADER.test(clause === null ? text : text.slice(0, clause.index));
}
