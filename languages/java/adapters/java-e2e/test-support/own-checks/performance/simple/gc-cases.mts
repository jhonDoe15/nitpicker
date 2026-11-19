import { simpleCase } from './simple-case.mts';

const CHECK = 'DoNotCallGarbageCollectionExplicitly';

export const GC_CASES = [
  simpleCase({
    check: CHECK,
    name: 'GcRemoved',
    members: [
      ['void onlyStatement() {\n  System.gc();\n}', 'void onlyStatement() {\n}'],
      [
        'void withNeighbours(int[] items) {\n  items[0] = 1;\n  System.gc();\n  Runtime.getRuntime().gc();\n  items[1] = 2;\n}',
        'void withNeighbours(int[] items) {\n  items[0] = 1;\n  items[1] = 2;\n}',
      ],
      [
        'void commented(int[] items) {\n  items[0] = 1;\n  System.gc(); // free memory\n}',
        'void commented(int[] items) {\n  items[0] = 1;\n}',
      ],
      [
        'void sameLine(int[] items) {\n  items[0] = 1; System.gc(); items[1] = 2;\n}',
        'void sameLine(int[] items) {\n  items[0] = 1; items[1] = 2;\n}',
      ],
      [
        'void guarded(boolean flag, int[] items) {\n  if (flag) {\n    items[0] = 1;\n    System.gc();\n  }\n}',
        'void guarded(boolean flag, int[] items) {\n  if (flag) {\n    items[0] = 1;\n  }\n}',
      ],
      [
        'void branches(int[] items) {\n  switch (items[0]) {\n    case 1:\n      System.gc();\n      break;\n    default:\n      items[0] = 5;\n  }\n}',
        'void branches(int[] items) {\n  switch (items[0]) {\n    case 1:\n      break;\n    default:\n      items[0] = 5;\n  }\n}',
      ],
      ['Runnable task = () -> {\n  System.gc();\n};', 'Runnable task = () -> {\n};'],
    ],
  }),
  simpleCase({
    check: CHECK,
    name: 'GcKept',
    members: [
      ['static {\n  System.gc();\n}'],
      ['void ifBody(boolean flag) {\n  if (flag) {\n    System.gc();\n  }\n}'],
      [
        'void elseBody(boolean flag, int[] items) {\n  if (flag) {\n    items[0] = 1;\n  } else {\n    System.gc();\n  }\n}',
      ],
      ['void loopBody(boolean flag) {\n  while (flag) {\n    Runtime.getRuntime().gc();\n  }\n}'],
      [
        'void tryBody(int[] items) {\n  try {\n    System.gc();\n  } finally {\n    items[0] = 3;\n  }\n}',
      ],
      [
        'void finallyBody(int[] items) {\n  try {\n    items[0] = 3;\n  } finally {\n    System.gc();\n  }\n}',
      ],
      ['void locked() {\n  synchronized (this) {\n    System.gc();\n  }\n}'],
      ['void nested() {\n  {\n    System.gc();\n  }\n}'],
      [
        'void arrow(int kind) {\n  switch (kind) {\n    case 1 -> System.gc();\n    default -> {\n      System.gc();\n    }\n  }\n}',
      ],
      ['Runnable lambda = () -> System.gc();'],
      ['Runnable reference = System::gc;'],
      ['void instance(Runtime runtime) {\n  runtime.gc();\n}'],
      ['void finalization() {\n  System.runFinalization();\n}'],
    ],
  }),
];
