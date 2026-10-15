const MODULE = String.raw`[\w.]+`;
const ALIAS = String.raw`(?:\s+as\s+\w+)?`;
const PLAIN_IMPORT = String.raw`import\s+${MODULE}${ALIAS}(?:\s*,\s*${MODULE}${ALIAS})*`;
const FROM_IMPORT = String.raw`from\s+${MODULE}\s+import\s+(?:\(.*|[\w\s,*]+?\\?)`;
const IMPORT_LINE = new RegExp(String.raw`^\s*(?:${PLAIN_IMPORT}|${FROM_IMPORT})\s*(?:#.*)?$`);
const IMPORT_CONTINUATION = /^\s*(?:[\w.*]+(?:\s+as\s+\w+)?\s*(?:,\s*\)?|\))|\))\s*$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
const ALL_START = /^\s*__all__\s*[+]?=\s*[[(]/;
const ALL_END = /[\])]\s*$/;
export const PYTHON_OVERSHOOT = /^\s*(?:@\w|#|(?:async\s+)?(?:def|class)\b)/;

function onlyImportLines(lines) {
  let open = false;
  let exporting = false;
  return lines.every((line) => {
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

export function pythonImportsOnly(fragment) {
  const lines = fragment.split('\n');
  return (
    lines.some((line) => IMPORT_LINE.test(line) || ALL_START.test(line)) && onlyImportLines(lines)
  );
}
