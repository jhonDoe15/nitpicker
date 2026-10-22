const FIRST_NESTED_THRESHOLD = 5;

export const BOOTER = `package demo

class Booter(value: Int) {
    var total = 0

    init {
        for (step in 0..value) {
            if (step > 1) {
                while (total < step) {
                    total += 1
                }
${Array.from({ length: 4 }, (_, index) => `                if (step > ${(index + FIRST_NESTED_THRESHOLD) * 10}) {\n                    total -= ${index + 1}\n                }`).join('\n')}
            }
        }
    }

    val label = value.let { number ->
        var result = 0
${Array.from({ length: 9 }, (_, index) => `        if (number > ${index * 10}) {\n            result += ${index + 1}\n        }`).join('\n')}
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

function nestedInit(counter, value, indent) {
  return `init {
    for (step in 0..${value}) {
        if (step > 1) {
            while (${counter} < step) {
                ${counter} += 1
            }
${Array.from({ length: 4 }, (_, index) => `            if (step > ${(index + FIRST_NESTED_THRESHOLD) * 10}) {\n                ${counter} -= ${index + 1}\n            }`).join('\n')}
        }
    }
}`
    .split('\n')
    .map((line) => (line === '' ? line : `${indent}${line}`))
    .join('\n');
}

function extraInits(inserted, indent) {
  return inserted
    ? `${indent}init {\n${indent}    println("inserted")\n${indent}}\n\n${indent}init {}\n\n`
    : '';
}

export function boxes(inserted) {
  return `package demo.boxes

class Box(value: Int) {
    var total = 0

${extraInits(inserted, '    ')}    ${nestedInit('total', 'value', '    ').trimStart()}

    val runner = object : Runnable {
${extraInits(inserted, '        ')}        ${nestedInit('total', 'value', '        ').trimStart()}

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
