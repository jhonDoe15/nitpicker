const STRING = 'String';
const LOOP = `        Map<String, String> headers = new TreeMap<>();
        for (String line : raw) {
            int index = line.indexOf(':');
            if (index > 0 && headers.size() < limit) {
                headers.put(line.substring(0, index).trim().toLowerCase(), line.substring(index + 1).trim());
            }
        }
        List<String> names = new ArrayList<>(headers.keySet());`;

type HeaderOptions = { before?: string; after: string; loop?: string };
type ValidationOptions = { message: string; after: string; binds?: boolean };

export function headerMethod(type: string, name: string, options: HeaderOptions): string {
  const { before = '', after, loop = LOOP } = options;
  const lead = before === '' ? '' : `${before}\n`;
  return `    ${type} ${name}(List<String> raw, int limit) {\n${lead}${loop}\n${after}\n    }\n`;
}

export function headerPair(): [string, string] {
  return [
    headerMethod(STRING, 'headerNames', { after: '        return String.join(",", names);' }),
    headerMethod('int', 'headerCount', {
      before: '        int total = raw.size();',
      after: '        return names.size() + total;',
    }),
  ];
}

function checks(message: string): string {
  return `        if (name.isEmpty()) {
            throw new IllegalArgumentException("${message}");
        }
        if (age < 0 || age > 150) {
            throw new IllegalArgumentException("age is out of range");
        }
        if (name.length() > 64) {
            throw new IllegalArgumentException("name is too long");
        }`;
}

export function validationMethod(type: string, name: string, options: ValidationOptions): string {
  const { message, after, binds = true } = options;
  const bound = binds ? '\n        String trimmed = name.trim().toLowerCase();' : '';
  return `    ${type} ${name}(String name, int age) {\n${checks(message)}${bound}\n${after}\n    }\n`;
}

export function validationPair(): [string, string] {
  return [
    validationMethod(STRING, 'createUser', {
      message: 'name is required',
      after: '        return trimmed + age;',
    }),
    validationMethod(STRING, 'renameUser', {
      message: 'new name is required',
      after: '        String label = trimmed + ":" + age;\n        return label.toUpperCase();',
    }),
  ];
}

export function partialClassOf(...members: readonly string[]): string {
  const imports = ['ArrayList', 'List', 'Map', 'TreeMap'].map(
    (name) => `import java.util.${name};`,
  );
  return `package demo;\n\n${imports.join('\n')}\n\nclass Align {\n${members.join('\n')}}\n`;
}
