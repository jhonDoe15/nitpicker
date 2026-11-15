const FIRST_NESTED_THRESHOLD = 5;
const NESTED_INIT_INDENT = 12;
const OUTER_INDENT = 16;
const TOTAL = 'total';

function steppedDecrements(counter: string, indent: number): string {
  const pad = ' '.repeat(indent);
  return Array.from(
    { length: 4 },
    (_, index) =>
      `${pad}if (step > ${String((index + FIRST_NESTED_THRESHOLD) * 10)}) {\n${pad}    ${counter} -= ${String(index + 1)}\n${pad}}`,
  ).join('\n');
}

export const BOOTER = `package demo

class Booter(value: Int) {
    var total = 0

    init {
        for (step in 0..value) {
            if (step > 1) {
                while (total < step) {
                    total += 1
                }
${steppedDecrements(TOTAL, OUTER_INDENT)}
            }
        }
    }

    val label = value.let { number ->
        var result = 0
${Array.from({ length: 9 }, (_, index) => `        if (number > ${String(index * 10)}) {\n            result += ${String(index + 1)}\n        }`).join('\n')}
        result
    }

    fun current(): Int = total
}
`;

export const BOOTER_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class BooterTest {
    @Test
    fun boots() {
        assertEquals(2, Booter(2).current())
    }
}
`;

function nestedInit(counter: string, value: string, indent: string) {
  return `init {
    for (step in 0..${value}) {
        if (step > 1) {
            while (${counter} < step) {
                ${counter} += 1
            }
${steppedDecrements(counter, NESTED_INIT_INDENT)}
        }
    }
}`
    .split('\n')
    .map((line) => (line === '' ? line : `${indent}${line}`))
    .join('\n');
}

function extraInits(inserted: boolean, indent: string) {
  return inserted
    ? `${indent}init {\n${indent}    println("inserted")\n${indent}}\n\n${indent}init {}\n\n`
    : '';
}

export function boxes(inserted: boolean): string {
  return `package demo.boxes

class Box(value: Int) {
    var total = 0

${extraInits(inserted, '    ')}    ${nestedInit(TOTAL, 'value', '    ').trimStart()}

    val runner = object : Runnable {
${extraInits(inserted, '        ')}        ${nestedInit(TOTAL, 'value', '        ').trimStart()}

        override fun run() {}
    }

    companion object {
        var created = 0

${extraInits(inserted, '        ')}        ${nestedInit('created', '2', '        ').trimStart()}
    }

    fun current(): Int = total
}
`;
}

export const BOX_TEST = `package demo.boxes

import kotlin.test.Test
import kotlin.test.assertEquals

class BoxTest {
    @Test
    fun boxes() {
        assertEquals(2, Box(2).current())
    }
}
`;
