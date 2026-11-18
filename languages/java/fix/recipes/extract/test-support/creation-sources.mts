const LIST_IMPORTS = 'import java.util.ArrayList;\nimport java.util.List;\n';

function scan(name: string, ending: string): string {
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

type Use = (made: string) => string;
type CreatorOptions = { use?: Use | undefined; argument?: string | undefined };
type AdapterOptions = {
  catches?: string;
  handler?: string;
  body?: string;
  more?: string;
};
type UrlAndUriOptions = { url?: AdapterOptions; uri?: AdapterOptions };

export function creator(name: string, type: string, options: CreatorOptions = {}): string {
  const { use = (made: string) => `return ${made};`, argument = 'joined' } = options;
  return scan(name, `        ${use(`new ${type}(${argument})`)}`);
}

export function creatorClass(...members: readonly string[]): string {
  return `package demo;\n\n${LIST_IMPORTS}\nclass Make {\n${members.join('\n')}}\n`;
}

function failure(kind: string): string {
  return `throw new IOException("Failed parsing '" + next + "' as ${kind}; at " + in.length(), e);`;
}

function adapterBody(type: string, kind: string, options: AdapterOptions): string {
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

function anonymousAdapter(
  name: string,
  type: string,
  kind: string,
  options: AdapterOptions = {},
): string {
  return `    static final Adapter<${type}> ${name} =
        new Adapter<${type}>() {
${adapterBody(type, kind, options)}        };
`;
}

function adaptersClass(...members: readonly string[]): string {
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

export function urlAndUri(options: UrlAndUriOptions = {}): string {
  const [url, uri] = [options.url ?? {}, options.uri ?? {}];
  return adaptersClass(
    anonymousAdapter('URL_ADAPTER', 'URL', 'URL', url),
    anonymousAdapter('URI_ADAPTER', 'URI', 'URI', { catches: 'URISyntaxException', ...uri }),
  );
}
