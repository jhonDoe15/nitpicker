const LIST_IMPORTS = 'import java.util.ArrayList;\nimport java.util.List;\n';

function scan(name, ending) {
  return `    Object ${name}(List<String> source, int limit) {
        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : source) {
            seen++;
            if (picked.size() < limit) {
                picked.add(item);
            }
        }
        String joined = String.join(",", picked);
${ending}
    }
`;
}

export function creator(name, type, use = (made) => `return ${made};`, argument = 'joined') {
  return scan(name, `        ${use(`new ${type}(${argument})`)}`);
}

export function creatorClass(...members) {
  return `package demo;\n\n${LIST_IMPORTS}\nclass Make {\n${members.join('\n')}}\n`;
}

function failure(kind) {
  return `throw new IOException("Failed parsing '" + next + "' as ${kind}; at " + in.length(), e);`;
}

function adapterBody(type, kind, options) {
  const { catches = 'MalformedURLException', handler, body, more = '' } = options;
  return `            @Override
            public ${type} read(String in) throws IOException {
                if (in.isEmpty()) {
                    return null;
                }
                String next = in.trim();
                if (next.equals("null")) {
                    return null;
                }
                try {
                    ${body ?? `return new ${type}(next);`}
                } catch (${catches} e) {
                    ${handler ?? failure(kind)}
                }${more}
            }
`;
}

function anonymousAdapter(name, type, kind, options = {}) {
  return `    static final Adapter<${type}> ${name} =
        new Adapter<${type}>() {
${adapterBody(type, kind, options)}        };
`;
}

function adaptersClass(...members) {
  return `package demo;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;

abstract class Adapter<T> {
    abstract T read(String in) throws IOException;
}

final class Adapters {
${members.join('\n')}}
`;
}

export function urlAndUri(options = {}) {
  const [url, uri] = [options.url ?? {}, options.uri ?? {}];
  return adaptersClass(
    anonymousAdapter('URL_ADAPTER', 'URL', 'URL', url),
    anonymousAdapter('URI_ADAPTER', 'URI', 'URI', { catches: 'URISyntaxException', ...uri }),
  );
}
