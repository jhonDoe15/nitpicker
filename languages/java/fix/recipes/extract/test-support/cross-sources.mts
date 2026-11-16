import type {
  RecipeEdit,
  RecipeFix,
  RecipeSource,
} from '../../../../../../core/fix/typed/fix-types.mts';
import { applied } from './sources.mts';

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

type AdapterSpec = {
  name: string;
  type: string;
  imports: string;
  pattern: string;
  kind: string;
  local: string;
  restore: string;
  field: string;
  lock: string;
  extra: string;
  package: string;
  label: boolean;
  write: boolean;
  date: string;
  suppress: string;
  use: string;
  call: string;
};
export type AdapterOverrides = Partial<AdapterSpec>;
type ClassShape = { shape?: string; ext?: string };

const DEFAULTS: AdapterSpec = {
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

function writeOf(o: AdapterSpec): string {
  return WRITE.replace('TYPE', o.type)
    .replace('LOCK', o.lock)
    .replace('format.format(value)', o.use);
}

function adapterFile(overrides: AdapterOverrides = {}): string {
  const o: AdapterSpec = { ...DEFAULTS, ...overrides };
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

function timeFile(overrides: AdapterOverrides = {}): string {
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

export function filesOf(
  first: AdapterOverrides = {},
  second: AdapterOverrides = {},
): RecipeSource[] {
  return [
    { path: 'src/main/java/demo/SqlDateAdapter.java', text: adapterFile(first) },
    { path: 'src/main/java/demo/SqlTimeAdapter.java', text: timeFile(second) },
    { path: 'src/main/java/demo/Adapter.java', text: BASE },
  ];
}

function replacesOf(edits: readonly RecipeEdit[], path: string): RecipeEdit[] {
  return edits.filter((edit) => edit.type === 'replace' && edit.path === path);
}

function writesOf(edits: readonly RecipeEdit[]): [string, string][] {
  return edits.flatMap((edit) => (edit.type === 'write' ? [[edit.path, edit.text]] : []));
}

export function appliedFiles(
  files: readonly RecipeSource[],
  fixes: readonly RecipeFix[],
): Record<string, string> {
  const edits = fixes.flatMap((fix) => fix.edits);
  const changed = files.map(({ path, text }): [string, string] => [
    path,
    applied(text, replacesOf(edits, path)),
  ]);
  return { ...Object.fromEntries(changed), ...Object.fromEntries(writesOf(edits)) };
}

const SCAN = `        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : source) {
            seen++;
            if (picked.size() < limit) {
                picked.add(item);
            }
        }
        String joined = String.join(",", picked);`;

const SCAN_WHILE = `        List<String> picked = new ArrayList<>();
        int seen = 0;
        int at = 0;
        while (at < source.size()) {
            seen += 2;
            if (picked.size() < limit + 1) {
                picked.add(source.get(at).trim());
            }
            at++;
        }
        String joined = String.join(",", picked);`;

function classOf(name: string, type: string, options: ClassShape = {}): string {
  const { shape = SCAN, ext = '' } = options;
  return `final class ${name}${ext} {
    Object make(List<String> source, int limit) {
${shape}
        return new ${type}(joined);
    }
}
`;
}

const HEADER = 'package demo;\n\nimport java.util.ArrayList;\nimport java.util.List;\n\n';

export function family(
  first: string,
  second: string,
  options: { ext?: string; loop?: 'for' | 'while' } = {},
): RecipeSource[] {
  const { ext = '', loop = 'for' } = options;
  const body = loop === 'while' ? SCAN_WHILE : SCAN;
  return [
    {
      path: `src/main/java/demo/${first}.java`,
      text: HEADER + classOf(first, 'StringBuilder', { shape: body, ext }),
    },
    {
      path: `src/main/java/demo/${second}.java`,
      text: HEADER + classOf(second, 'StringBuffer', { shape: body, ext }),
    },
  ];
}

function twoClassFile(
  name: string,
  type: string,
  [one, two]: readonly [string, string],
): RecipeSource {
  const classes = [classOf(one, type, { shape: SCAN }), classOf(two, type, { shape: SCAN_WHILE })];
  return { path: `src/main/java/demo/${name}s.java`, text: `${HEADER}${classes.join('\n')}` };
}

export function twoClasses(): RecipeSource[] {
  return [
    twoClassFile('Reader', 'StringBuilder', ['OrderReader', 'LineReader']),
    twoClassFile('Writer', 'StringBuffer', ['OrderWriter', 'LineWriter']),
  ];
}
