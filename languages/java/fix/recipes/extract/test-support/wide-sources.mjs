export function picker(name, options = {}) {
  const { element = 'String', tail = '"top"', before = '', step = 'picked.add(item);' } = options;
  return `    List<${element}> ${name}(List<${element}> source, int limit) {
        List<${element}> picked = new ArrayList<${element}>();
        int seen = 0;
${before}        for (${element} item : source) {
            seen++;
            if (picked.size() < limit) {
                ${step}
            }
        }
        if (seen == 0) {
            picked.clear();
        }
        picked.add(${tail});
        return picked;
    }
`;
}

export function mapper(name, key, value) {
  return `    Map<${key}, ${value}> ${name}(Map<${key}, ${value}> source, ${key} fallbackKey, ${value} fallback) {
        Map<${key}, ${value}> copy = new HashMap<>();
        int kept = 0;
        for (${key} name : source.keySet()) {
            if (kept < 100) {
                copy.put(name, fallback);
                kept++;
            }
        }
        if (copy.isEmpty()) {
            copy.put(fallbackKey, fallback);
        }
        return copy;
    }
`;
}

export function floorMethod(name, call, { modifier = '' } = {}) {
  return `    List<String> ${name}(List<String> xs, int n) {
        List<String> picked = new ArrayList<>();
        int seen = 0;
        for (String item : xs) {
            seen++;
            ${modifier}int cap = ${call};
            if (picked.size() < n + cap) {
                picked.add(item);
            }
        }
        String label = String.join(",", picked);
        picked.add(label);
        return picked;
    }
`;
}

export function anonymous(field, tail, { before = '' } = {}) {
  return `    static final Selector ${field} = new Selector() {
        @Override
        public List<String> select(List<String> source, int limit) {
            List<String> picked = new ArrayList<>();
${before}            for (String item : source) {
                if (picked.size() < limit) {
                    picked.add(item);
                }
            }
            picked.add(${tail});
            return picked;
        }
    };
`;
}

export function wideClass(...members) {
  return `package demo;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class Wide {
    interface Selector {
        List<String> select(List<String> source, int limit);
    }

${members.join('\n')}}
`;
}
