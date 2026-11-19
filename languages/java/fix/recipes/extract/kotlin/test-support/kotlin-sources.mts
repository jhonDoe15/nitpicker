import type { FixRecipe } from '../../../../../../../core/fix/typed/fix-types.mts';
import { planRecipe, type PlanOutcome } from '../../test-support/sources.mts';

const LIMIT = 'limit';
export const PATH = 'src/main/kotlin/demo/Align.kt';

type CopyOptions = { prefix?: string; modifiers?: string; limit?: string };

export function copy(name: string, options: CopyOptions = {}): string {
  const { prefix = 'top:', modifiers = '', limit = LIMIT } = options;
  return `    ${modifiers}fun ${name}(selection: List<String>, limit: Int): String {
        val selected = mutableListOf<String>()
        for (element in selection) {
            if (element.length < ${limit}) {
                selected.add(element)
            }
        }
        val label = selected.joinToString(",")
        return (if (label.length > 0) "${prefix}" else "none:") + label
    }
`;
}

export function classOf(...members: readonly string[]): string {
  return `package demo\n\nclass Align {\n${members.join('\n')}}\n`;
}

export function topLevel(...functions: readonly string[]): string {
  const flat = functions.map((text) => text.replaceAll(/^ {4}/gmu, ''));
  return `package demo\n\n${flat.join('\n')}`;
}

export function planned(recipe: FixRecipe, text: string, path = PATH): PlanOutcome {
  return planRecipe(recipe, text, path);
}

export function note(line: number, reason: string, path = PATH): string[] {
  return [`--fix left ${path}:${String(line)} near-duplicate: ${reason}`];
}

type Names = { list: string; cap: string; map: string; line: string; at: string; keys: string };
type HeaderOptions = { type: string; before?: string; after: string; loop?: string };

export const FIRST_NAMES: Names = {
  list: 'raw',
  cap: LIMIT,
  map: 'headers',
  line: 'line',
  at: 'index',
  keys: 'names',
};
export const SECOND_NAMES: Names = {
  list: 'lines',
  cap: 'cap',
  map: 'found',
  line: 'entry',
  at: 'colon',
  keys: 'keys',
};

export function headerCopy(name: string, names: Names, options: HeaderOptions): string {
  const { list, cap, map, line, at, keys } = names;
  const { type, before = '', after } = options;
  const lead = before === '' ? '' : `        ${before}\n`;
  return `    fun ${name}(${list}: List<String>, ${cap}: Int)${type === '' ? '' : `: ${type}`} {
${lead}        val ${map}: MutableMap<String, String> = TreeMap()
        for (${line} in ${list}) {
            val ${at} = ${line}.indexOf(':')
            if (${at} > 0 && ${map}.size < ${cap}) {
                ${map}[${line}.substring(0, ${at}).trim().lowercase()] = ${line}.substring(${at} + 1).trim()
            }
        }
        val ${keys}: List<String> = ${map}.keys.toList()
${after}
    }
`;
}

export function headerClass(...members: readonly string[]): string {
  return `package demo\n\nimport java.util.TreeMap\n\nclass Align {\n${members.join('\n')}}\n`;
}

export function headerPair(): [string, string] {
  return [
    headerCopy('headerNames', FIRST_NAMES, {
      type: 'String',
      after: '        return names.joinToString(",")',
    }),
    headerCopy('headerCount', SECOND_NAMES, {
      type: 'Int',
      before: 'val total = lines.size',
      after: '        return keys.size + total',
    }),
  ];
}

type PrintNames = { list: string; cap: string; line: string };
type PrintOptions = { before?: string; inLoop?: string; after: string };

const PRINT_FIRST: PrintNames = { list: 'raw', cap: LIMIT, line: 'line' };
const PRINT_SECOND: PrintNames = { list: 'lines', cap: 'cap', line: 'entry' };

function printCopy(name: string, names: PrintNames, options: PrintOptions): string {
  const { list, cap, line } = names;
  const { before = '', inLoop = '', after } = options;
  return `    fun ${name}(${list}: List<String>, ${cap}: Int) {
${before}        for (${line} in ${list}) {
            if (${line}.isNotEmpty() && ${line}.length < ${cap}) {
                println(${line}.trim().lowercase())
                println(${line}.length)
                println(${line}.reversed())
            }
        }
        val shown = ${list}.filter { it.isNotEmpty() }.map { it.trim() }.distinct()
        for (name in shown) {
${inLoop}            if (name.length > ${cap}) {
                println("long " + name)
            } else {
                println("short " + name)
            }
        }
${after}
    }
`;
}

type PrintSide = Partial<PrintOptions>;

export function printPair(first: PrintSide = {}, second: PrintSide = {}): [string, string] {
  return [
    printCopy('showNames', PRINT_FIRST, {
      before: '        println("a")\n',
      after: '        println("done")',
      ...first,
    }),
    printCopy('showCount', PRINT_SECOND, {
      before: '        println("a", "b")\n',
      after: '        println("done")\n        audit("again")',
      ...second,
    }),
  ];
}
