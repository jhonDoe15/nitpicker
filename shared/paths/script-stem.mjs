const SCRIPT_PATH = /\.[cm]?[jt]sx?$/u;
const STEM = /(?:\.d)?\.[cm]?[jt]sx?$|\/index(?:\.[cm]?[jt]sx?)?$/u;

export function isScriptPath(filePath) {
  return SCRIPT_PATH.test(filePath);
}

export function scriptStem(filePath) {
  return filePath.replace(STEM, '');
}
