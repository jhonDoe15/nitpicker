const SCRIPT_FILE = /\.(?:[cm]?js|jsx)$/u;

export function isScriptFile(filename: string): boolean {
  return SCRIPT_FILE.test(filename);
}
