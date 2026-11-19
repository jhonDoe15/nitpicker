import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../../test-support/apply-recipe.mts';
import { sleepInsteadOfDelayRecipe } from './sleep-instead-of-delay.mts';

const fix = (text: string): string => applyRecipe(sleepInsteadOfDelayRecipe, text);

const IMPORTS = 'import kotlinx.coroutines.launch\nimport java.util.UUID\n';
const DELAYED_IMPORTS = `import kotlinx.coroutines.delay\n${IMPORTS}`;

function file(body: string, imports = IMPORTS): string {
  return `package demo\n\n${imports}\nclass A(private val pause: Long) {\n${body}\n}\n`;
}

function suspendBody(statement: string): string {
  return `    suspend fun run() {\n        ${statement}\n    }`;
}

describe('sleepInsteadOfDelayRecipe fixes', () => {
  it.each([
    ['Thread.sleep(100)', 'delay(100)'],
    ['Thread.sleep(100L)', 'delay(100L)'],
    ['Thread.sleep(1_000)', 'delay(1_000)'],
    ['Thread.sleep(60 * 1000)', 'delay(60 * 1000)'],
    ['Thread.sleep(2L * pause)', 'delay(2L * pause)'],
    ['Thread.sleep(pause)', 'delay(pause)'],
    ['Thread.sleep(count.toLong())', 'delay(count.toLong())'],
    ['Thread.sleep(TimeUnit.SECONDS.toMillis(2))', 'delay(TimeUnit.SECONDS.toMillis(2))'],
    ['java.lang.Thread.sleep(5)', 'delay(5)'],
    ['Thread . sleep ( 5 )', 'delay ( 5 )'],
    ['if (retry) Thread.sleep(5)', 'if (retry) delay(5)'],
    [
      'if (retry) {\n            Thread.sleep(5)\n        }',
      'if (retry) {\n            delay(5)\n        }',
    ],
    [
      'for (i in 1..3) {\n            Thread.sleep(5)\n        }',
      'for (i in 1..3) {\n            delay(5)\n        }',
    ],
    [
      'while (busy()) {\n            Thread.sleep(5)\n        }',
      'while (busy()) {\n            delay(5)\n        }',
    ],
  ])('rewrites %s', (before, after) => {
    expect(fix(file(suspendBody(before)))).toBe(file(suspendBody(after), DELAYED_IMPORTS));
  });

  it('rewrites toMillis on a typed java.time.Duration name', () => {
    const imports = 'import kotlinx.coroutines.launch\n';
    const before = file(suspendBody('Thread.sleep(timeout.toMillis())'), imports);
    const typed = before.replace('pause: Long', 'timeout: java.time.Duration');
    expect(fix(typed)).toBe(
      typed
        .replace('Thread.sleep', 'delay')
        .replace(imports, `import kotlinx.coroutines.delay\n${imports}`),
    );
  });

  it('adds the import in sorted place or after the last import', () => {
    const before = file(
      suspendBody('Thread.sleep(5)'),
      'import kotlinx.coroutines.async\nimport kotlinx.coroutines.launch\n',
    );
    expect(fix(before)).toBe(
      file(
        suspendBody('delay(5)'),
        'import kotlinx.coroutines.async\nimport kotlinx.coroutines.delay\nimport kotlinx.coroutines.launch\n',
      ),
    );
    const last = file(suspendBody('Thread.sleep(5)'), 'import kotlinx.coroutines.async\n');
    expect(fix(last)).toBe(
      file(
        suspendBody('delay(5)'),
        'import kotlinx.coroutines.async\nimport kotlinx.coroutines.delay\n',
      ),
    );
  });

  it.each(['import kotlinx.coroutines.delay\n', 'import kotlinx.coroutines.*\n'])(
    'adds no import when %j covers delay',
    (imports) => {
      expect(fix(file(suspendBody('Thread.sleep(5)'), imports))).toBe(
        file(suspendBody('delay(5)'), imports),
      );
    },
  );

  it('rewrites several sleeps with one import and reports each line', () => {
    const body = `${suspendBody('Thread.sleep(5)\n        Thread.sleep(6)')}\n    suspend fun other() {\n        Thread.sleep(7)\n    }`;
    const result = fix(file(body));
    expect(result.match(/import kotlinx\.coroutines\.delay/gu)).toHaveLength(1);
    expect(result.match(/delay\(\d\)/gu)).toEqual(['delay(5)', 'delay(6)', 'delay(7)']);
    const fixes = sleepInsteadOfDelayRecipe.plan({
      files: [{ path: 'src/main/kotlin/demo/A.kt', text: file(body) }],
    }).fixes;
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.finding.line).toBe(8);
    expect(fixes[0]?.alsoFixes?.map(({ line }) => line)).toEqual([9, 12]);
    expect(plannedLines(sleepInsteadOfDelayRecipe, file(body))).toEqual([8]);
  });

  it.each([
    'private suspend fun run()',
    'override suspend fun run()',
    'suspend inline fun run()',
    'inline suspend fun run()',
    'suspend fun <T> run()',
    'suspend fun String.run(): Unit',
    'suspend fun run(a: Int = 1, b: (Int) -> Unit = {}): Result<Unit>',
  ])('rewrites a sleep in %s', (header) => {
    const text = (call: string, imports: string): string =>
      file(`    ${header} {\n        ${call}\n    }`, imports);
    expect(fix(text('Thread.sleep(5)', IMPORTS))).toBe(text('delay(5)', DELAYED_IMPORTS));
  });

  it('is a review fix', () => {
    expect(sleepInsteadOfDelayRecipe.safety).toBe('review');
  });
});

describe('sleepInsteadOfDelayRecipe declines', () => {
  it.each([
    'Thread.sleep(count)',
    'Thread.sleep(Duration.ofMillis(5))',
    'Thread.sleep(compute())',
    'Thread.sleep(5, 100)',
    'Thread.sleep(-5)',
    'Thread.sleep((count + 1).toLong() * 10)',
    'Thread.sleep(0x10)',
    'Thread.sleep()',
    'Thread.sleep(mystery * 1000)',
    'launch { Thread.sleep(5) }',
    'run { Thread.sleep(5) }',
    'listOf(1).forEach { Thread.sleep(5) }',
    'withContext(Dispatchers.IO) {\n            Thread.sleep(5)\n        }',
    'val f = { Thread.sleep(5) }',
    'fun inner() {\n            Thread.sleep(5)\n        }',
    'val o = object : Runnable {\n            override fun run() { Thread.sleep(5) }\n        }',
    'try {\n            Thread.sleep(5)\n        } catch (e: InterruptedException) {\n            return\n        }',
    'try {\n            work()\n        } finally {\n            Thread.sleep(5)\n        }',
    'synchronized(lock) {\n            Thread.sleep(5)\n        }',
    'when (mode) {\n            1 -> {\n                Thread.sleep(5)\n            }\n        }',
    'Thread./* wait */sleep(5)',
    'MyThread.sleep(5)',
    'thread.Thread.sleep(5)',
    'x.Thread.sleep(5)',
  ])('%s in a suspend function', (statement) => {
    const text = file(suspendBody(statement), 'import kotlinx.coroutines.launch\n');
    expect(fix(text)).toBe(text);
  });

  it('a sleep outside a suspend function or in an expression-bodied one', () => {
    const texts = [
      file('    fun run() {\n        Thread.sleep(5)\n    }'),
      file('    suspend fun run() = Thread.sleep(5)'),
      file('    fun run() = runBlocking {\n        Thread.sleep(5)\n    }'),
      file('    val action: suspend () -> Unit = {\n        Thread.sleep(5)\n    }'),
    ];
    expect(texts.map(fix)).toEqual(texts);
  });

  it('a file that does not use kotlinx.coroutines or has its own delay', () => {
    const texts = [
      file(suspendBody('Thread.sleep(5)'), 'import java.util.UUID\n'),
      file(suspendBody('Thread.sleep(5)'), 'import kotlinx.coroutines.launch\nimport demo.delay\n'),
      file(
        suspendBody('Thread.sleep(5)'),
        'import kotlinx.coroutines.launch\nimport kotlinx.coroutines.delay as wait\n',
      ),
      file(
        `${suspendBody('Thread.sleep(5)')}\n    fun delay(ms: Long) {}`,
        'import kotlinx.coroutines.launch\n',
      ),
      file(
        `${suspendBody('Thread.sleep(5)')}\n    fun f(delay: () -> Unit) {}`,
        'import kotlinx.coroutines.launch\n',
      ),
    ];
    expect(texts.map(fix)).toEqual(texts);
  });

  it('keeps an eligible sleep when another one in the file is declined', () => {
    const body = `${suspendBody('Thread.sleep(5)')}\n    suspend fun other() {\n        launch { Thread.sleep(6) }\n    }`;
    const expected = file(
      `${suspendBody('delay(5)')}\n    suspend fun other() {\n        launch { Thread.sleep(6) }\n    }`,
      DELAYED_IMPORTS,
    );
    expect(fix(file(body))).toBe(expected);
  });

  it('calls in comments and strings', () => {
    const text = file(suspendBody('// Thread.sleep(5)\n        val s = "Thread.sleep(5)"'));
    expect(fix(text)).toBe(text);
  });

  it('a name with a type other than Long', () => {
    const texts = [
      file(suspendBody('Thread.sleep(pause)'), 'import kotlinx.coroutines.launch\n').replace(
        'pause: Long',
        'pause: Int',
      ),
      file(`${suspendBody('Thread.sleep(pause)')}\n    fun f(pause: Int) {}`),
    ];
    expect(texts.map(fix)).toEqual(texts);
  });

  it('toMillis on a receiver that is not a known duration or time unit', () => {
    const texts = [
      file(suspendBody('Thread.sleep(timeout.toMillis())')),
      file(suspendBody('Thread.sleep(mystery.toMillis())'), 'import kotlinx.coroutines.launch\n'),
      file(suspendBody('Thread.sleep(TimeUnit.SECONDS.toMillis())')),
    ];
    expect(texts.map(fix)).toEqual(texts);
  });

  it('an abstract suspend function does not borrow the next function body', () => {
    const imports = 'import kotlinx.coroutines.launch\n';
    const head = `package demo\n\n${imports}\n`;
    const texts = [
      `${head}abstract class A {\n    abstract suspend fun a(): Int\n    fun b() { Thread.sleep(5) }\n}\n`,
      `${head}interface A {\n    suspend fun a(): Int\n\n    fun b() { Thread.sleep(5) }\n}\n`,
      `${head}interface A {\n    suspend fun a()\n    fun b() { Thread.sleep(5) }\n}\n`,
    ];
    expect(texts.map(fix)).toEqual(texts);
  });
});
