const FIELDS_PER_KIND = 3;

export type Copy = {
  readonly type: string;
  readonly fn: string;
  readonly list: string;
  readonly sum: string;
  readonly item: string;
};
export type Numbers = readonly [string, string, string, string];

export const FIELDS = (
  'id name email phone street city zip country role plan bio score level owner locale avatar ' +
  'status created updated timezone'
).split(' ');
export const ORDER_FIELDS = (
  'code total tax note carrier weight items paid buyer method coupon refund channel house ' +
  'invoice placed shipped tracking discount currency'
).split(' ');

export function javaCopy(
  { type, fn, list, sum, item }: Copy,
  [low, limit, scale, discount]: Numbers,
): string {
  return `package demo;

import java.util.List;

class ${type} {
    int ${fn}(List<Entry> ${list}, int factor) {
        int ${sum} = ${low};
        for (Entry ${item} : ${list}) {
            if (${item}.price > ${low} && ${item}.count > ${low}) {
                ${sum} += ${item}.price * ${item}.count * factor;
            } else if (${item}.price < ${low}) {
                ${sum} -= Math.abs(${item}.price) * ${item}.count;
            }
            if (${sum} > ${limit}) {
                ${sum} = ${sum} - ${discount};
            }
        }
        long rounded = Math.round(${sum} * ${scale}.0) / ${scale};
        return rounded > ${limit} ? (int) (rounded - ${discount}) : (int) rounded;
    }
}
`;
}

export function javaMapper(type: string, source: string, fields: readonly string[]): string {
  const getters = fields.map((field) => `                ${source}.get${field}()`).join(',\n');
  return `package demo;\n\nfinal class ${type}Mapper {\n    static ${type}Dto to${type}Dto(${type} ${source}) {\n        return new ${type}Dto(\n${getters});\n    }\n}\n`;
}

export function javaSwitch(type: string, values: readonly string[]): string {
  const cases = values.map((value) => `            case ${value.toUpperCase()} -> "${value}";`);
  return `package demo;\n\nfinal class ${type}Names {\n    static String name(${type} value) {\n        return switch (value) {\n${cases.join('\n')}\n        };\n    }\n}\n`;
}

export function javaBean(type: string, fields: readonly string[]): string {
  const members = fields.flatMap((field) => [
    `    private String ${field};`,
    `    public String get${field}() {`,
    `        return ${field};`,
    '    }',
    `    public void set${field}(String ${field}) {`,
    `        this.${field} = ${field};`,
    '    }',
  ]);
  return `package demo;\n\npublic class ${type} {\n${members.join('\n')}\n}\n`;
}

const KOTLIN_COPY = `package demo

class @type@ {
    fun @fn@(@list@: List<Entry>, factor: Int): Int {
        var @sum@ = @low@
        for (@item@ in @list@) {
            if (@item@.price > @low@ && @item@.count > @low@) {
                @sum@ += @item@.price * @item@.count * factor
            } else if (@item@.price < @low@) {
                @sum@ -= Math.abs(@item@.price) * @item@.count
            }
            if (@sum@ > @limit@) {
                @sum@ = @sum@ - @discount@
            }
        }
        val rounded = Math.round(@sum@ * @scale@.0) / @scale@
        return if (rounded > @limit@) rounded - @discount@ else rounded.toInt()
    }
}
`;

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/@(\w+)@/gu, (_match, key: string) => values[key] ?? '');
}

export function kotlinCopy(
  { type, fn, list, sum, item }: Copy,
  [low, limit, scale, discount]: Numbers,
): string {
  return fill(KOTLIN_COPY, { type, fn, list, sum, item, low, limit, scale, discount });
}

export function kotlinMapper(type: string, fields: readonly string[]): string {
  const assignments = fields.map((field) => `        ${field} = this.${field},`).join('\n');
  return `package demo\n\nfun ${type}.to${type}Dto(): ${type}Dto =\n    ${type}Dto(\n${assignments}\n    )\n`;
}

export function kotlinWhen(type: string, values: readonly string[]): string {
  const branches = values.map((value) => `        ${type}.${value.toUpperCase()} -> "${value}"`);
  return `package demo\n\nfun ${type.toLowerCase()}Name(value: ${type}): String =\n    when (value) {\n${branches.join('\n')}\n    }\n`;
}

export function kotlinDataClass(type: string, fields: readonly string[]): string {
  const defaults = ['""', 'emptyList()', '0', 'mutableMapOf()', 'null', 'listOf("a")', 'now()'];
  const types = [
    'String',
    'List<String>',
    'Int',
    'MutableMap<String, Int>',
    'String?',
    'Any',
    'Instant',
  ];
  const parameters = fields.map((field, index) => {
    const kind = Math.floor(index / FIELDS_PER_KIND) % types.length;
    return `    val ${field}: ${types[kind] ?? ''} = ${defaults[kind] ?? ''},`;
  });
  return `package demo\n\ndata class ${type}(\n${parameters.join('\n')}\n)\n`;
}

export function kotlinChain(name: string, step: number): string {
  const branches = Array.from(
    { length: 9 },
    (_, index) => `    if (value > ${String(index * step)}) {\n        result += 1\n    }`,
  );
  return `package demo\n\nfun ${name}(value: Int): Int {\n    var result = 0\n${branches.join('\n')}\n    return result\n}\n`;
}
