const IMPORT_LINE =
  /^\s*(?:import\s+[\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*|from\s+[\w.]+\s+import\s+(?:\(.*|[\w\s,*]+?\\?))\s*(?:#.*)?$/;
const IMPORT_CONTINUATION = /^\s*(?:[\w.*]+(?:\s+as\s+\w+)?\s*(?:,\s*\)?|\))|\))\s*$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
const ALL_START = /^\s*__all__\s*[+]?=\s*[[(]/;
const ALL_END = /[\])]\s*$/;
export const PYTHON_OVERSHOOT = /^\s*(?:@\w|#|(?:async\s+)?(?:def|class)\b)/;

export function pythonImportsOnly(fragment) {
  let open = false;
  let exporting = false;
  let anchored = false;
  const allLines = fragment.split('\n').every((line) => {
    if (exporting) {
      exporting = !ALL_END.test(line);
      return true;
    }
    if (ALL_START.test(line)) {
      anchored = true;
      exporting = !ALL_END.test(line);
      return true;
    }
    if (!open && IMPORT_LINE.test(line)) {
      anchored = true;
    }
    if (open || IMPORT_LINE.test(line)) {
      open = (open || line.includes('(')) && !line.includes(')');
      return true;
    }
    return BLANK_OR_COMMENT.test(line) || IMPORT_CONTINUATION.test(line);
  });
  return anchored && allLines;
}
