const IMPORT_LINE = /^\s*(?:import\s|from\s+\S+\s+import\b)/;
const IMPORT_CONTINUATION = /^\s*(?:[\w.*]+(?:\s+as\s+\w+)?\s*(?:,\s*\)?|\))|\))\s*$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
const ALL_START = /^\s*__all__\s*[+]?=\s*[[(]/;
const ALL_END = /[\])]\s*$/;

export function pythonImportsOnly(fragment) {
  let open = false;
  let exporting = false;
  return fragment.split('\n').every((line) => {
    if (exporting) {
      exporting = !ALL_END.test(line);
      return true;
    }
    if (ALL_START.test(line)) {
      exporting = !ALL_END.test(line);
      return true;
    }
    if (open || IMPORT_LINE.test(line)) {
      open = (open || line.includes('(')) && !line.includes(')');
      return true;
    }
    return BLANK_OR_COMMENT.test(line) || IMPORT_CONTINUATION.test(line);
  });
}
