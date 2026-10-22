const MODULE = String.raw`[\w.]+`;
const ALIAS = String.raw`(?:\s+as\s+\w+)?`;
const PLAIN_IMPORT = String.raw`import\s+${MODULE}${ALIAS}(?:\s*,\s*${MODULE}${ALIAS})*`;
const FROM_IMPORT = String.raw`from\s+${MODULE}\s+import(?:\s+\(.*|(?:\s+[\w,*]+)+\s*\\?)`;
const IMPORT_LINE = new RegExp(String.raw`^(?:${PLAIN_IMPORT}|${FROM_IMPORT})$`);
const COMMENT_TAIL = /#.*$/;
const IMPORT_CONTINUATION = /^(?:[\w.*]+(?:\s+as\s+\w+)?\s*(?:,\s*\)?|\))|\))$/;
const BLANK_OR_COMMENT = /^\s*(?:#.*)?$/;
const ALL_START = /^\s*__all__\s*[+]?=\s*[[(]/;
const ALL_END = /[\])]\s*$/;
export const PYTHON_OVERSHOOT = /^\s*(?:@\w|#|(?:async\s+)?(?:def|class)\b)/;

function isImportLine(line) {
  return IMPORT_LINE.test(line.replace(COMMENT_TAIL, '').trim());
}

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
    if (open || isImportLine(line)) {
      open = (open || line.includes('(')) && !line.includes(')');
      return true;
    }
    return BLANK_OR_COMMENT.test(line) || IMPORT_CONTINUATION.test(line.trim());
  });
}

export function pythonImportsOnly(fragment) {
  const lines = fragment.split('\n');
  return lines.some((line) => isImportLine(line) || ALL_START.test(line)) && onlyImportLines(lines);
}
