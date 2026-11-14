import { applied } from './sources.mjs';

export const BASE =
  'package demo;\n\nabstract class Adapter<T> {\n    abstract T read(String in);\n}\n';

const LABEL = `
    public String label(String in) {
        StringBuilder out = new StringBuilder();
        for (int index = 0; index < in.length(); index++) {
            out.append(in.charAt(index)).append(',');
        }
        out.append("KIND");
        if (out.length() > 100) {
            out.setLength(100);
        }
        return out.toString();
    }
`;

const WRITE = `
    public void write(StringBuilder out, TYPE value) {
        if (value == null) {
            out.append("null");
            return;
        }
        String text;
        synchronized (LOCK) {
            text = format.format(value);
        }
        out.append(text);
    }
`;

const DEFAULTS = {
  name: 'SqlDateAdapter',
  type: 'java.sql.Date',
  imports: '',
  pattern: 'MMM d, yyyy',
  kind: 'Date',
  local: 'parsed',
  restore: 'Restore the original time zone after parsing',
  field: 'private final DateFormat format',
  lock: 'this',
  extra: '',
  package: 'demo',
  label: false,
  write: false,
  date: 'java.util.Date',
  suppress: '@SuppressWarnings("JavaUtilDate")',
  use: 'format.format(value)',
  call: 'format.setTimeZone(zone);',
};

function writeOf(o) {
  return WRITE.replace('TYPE', o.type)
    .replace('LOCK', o.lock)
    .replace('format.format(value)', o.use);
}

function adapterFile(overrides = {}) {
  const o = { ...DEFAULTS, ...overrides };
  return `package ${o.package};

${o.imports}import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import ${o.date};
import java.util.TimeZone;

${o.suppress}
final class ${o.name} extends Adapter<${o.type}> {
    ${o.field} = new SimpleDateFormat("${o.pattern}");
${o.extra}
    @Override
    public ${o.type} read(String in) {
        if (in.isEmpty()) {
            return null;
        }
        String s = in.trim();
        synchronized (${o.lock}) {
            TimeZone zone = format.getTimeZone(); // Save the original time zone
            try {
                Date ${o.local} = format.parse(s);
                return new ${o.type}(${o.local}.getTime());
            } catch (ParseException e) {
                throw new IllegalArgumentException("Failed parsing '" + s + "' as SQL ${o.kind}; at " + in.length(), e);
            } finally {
                ${o.call} // ${o.restore}
            }
        }
    }
${o.label ? LABEL.replace('KIND', o.kind) : ''}${o.write ? writeOf(o) : ''}}
`;
}

function timeFile(overrides = {}) {
  return adapterFile({
    name: 'SqlTimeAdapter',
    type: 'Time',
    imports: 'import java.sql.Time;\n',
    pattern: 'hh:mm:ss a',
    kind: 'Time',
    local: 'date',
    restore: 'Restore the original time zone',
    ...overrides,
  });
}

export function filesOf(first = {}, second = {}) {
  return [
    { path: 'src/main/java/demo/SqlDateAdapter.java', text: adapterFile(first) },
    { path: 'src/main/java/demo/SqlTimeAdapter.java', text: timeFile(second) },
  ];
}

export function appliedFiles(files, fixes) {
  const edits = fixes.flatMap((fix) => fix.edits);
  const written = Object.fromEntries(
    edits.filter(({ type }) => type === 'write').map(({ path, text }) => [path, text]),
  );
  const changed = files.map(({ path, text }) => [
    path,
    applied(
      text,
      edits.filter((edit) => edit.type === 'replace' && edit.path === path),
    ),
  ]);
  return { ...Object.fromEntries(changed), ...written };
}
