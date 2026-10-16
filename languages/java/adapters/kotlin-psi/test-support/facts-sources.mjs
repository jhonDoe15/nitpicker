export const FACTS_SOURCE = `package demo

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class Point(val x: Int, val y: Int = 0)

class Account(val id: String, var balance: Int) {
    val label: String
        get() = "account $id"

    val tags by lazy { listOf(id) }

    init {
        require(balance >= 0)
    }

    fun deposit(amount: Int) = if (amount > 0) balance + amount else balance
}

interface Animal {
    fun sound(): String = "..."
}

class Fish : Animal

@JvmInline
value class Meters(val value: Double)

inline fun twice(action: () -> Int): Int = action() + action()

suspend fun fetch(id: Int): Int {
    delay(1)
    return coroutineScope {
        val total = async { id * 2 }
        launch { delay(1) }
        total.await()
    }
}

fun force(text: String?): Int = text!!.length

val names = listOf("a", "b").map { it.uppercase() }

class Registry {
    companion object {
        @JvmStatic
        fun create(name: String?): Registry =
            if (name != null &&
                name.isNotEmpty()) Registry() else Registry()
    }
}

inline fun <T> measured(block: () -> T): T = block()

fun runMeasured(value: String?): Int =
    measured {
        value
            ?.length
            ?: 0
    }

fun strict(value: String?): Int =
    listOf(value)
        .firstOrNull()!!
        .length

fun repeatAction(times: Int, action: () -> Unit) {
    for (index in 0 until times) action()
}

suspend fun report(id: Int) {
    delay(1)
    repeatAction(id) { println(id) }
    println(id)
}

suspend fun combine(id: Int): Int = coroutineScope {
    val first = async {
        if (id > 0) return@async 1
        2
    }
    first.await()
}
`;

export const FACTS_EXPECTED = {
  file: 'src/demo/Facts.kt',
  package: 'demo',
  lines: 87,
  classes: [
    {
      name: 'demo.Point',
      kind: 'data',
      start: 8,
      headerEnd: 8,
      init: false,
      serializable: false,
      functions: [],
      properties: [
        {
          name: 'x',
          start: 8,
          end: 8,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
        {
          name: 'y',
          start: 8,
          end: 8,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
      ],
    },
    {
      name: 'demo.Account',
      kind: 'class',
      start: 10,
      headerEnd: 10,
      init: true,
      serializable: false,
      functions: ['deposit'],
      properties: [
        {
          name: 'label',
          start: 11,
          end: 12,
          constructor: false,
          getter: true,
          setter: false,
          delegated: false,
        },
        {
          name: 'tags',
          start: 14,
          end: 14,
          constructor: false,
          getter: false,
          setter: false,
          delegated: true,
        },
        {
          name: 'id',
          start: 10,
          end: 10,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
        {
          name: 'balance',
          start: 10,
          end: 10,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
      ],
    },
    {
      name: 'demo.Animal',
      kind: 'interface',
      start: 23,
      headerEnd: 23,
      init: false,
      serializable: false,
      functions: ['sound'],
      properties: [],
    },
    {
      name: 'demo.Fish',
      kind: 'class',
      start: 27,
      headerEnd: 27,
      init: false,
      serializable: false,
      functions: [],
      properties: [],
    },
    {
      name: 'demo.Meters',
      kind: 'value',
      start: 29,
      headerEnd: 30,
      init: false,
      serializable: false,
      functions: [],
      properties: [
        {
          name: 'value',
          start: 30,
          end: 30,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
      ],
    },
    {
      name: 'demo.Registry',
      kind: 'class',
      start: 47,
      headerEnd: 47,
      init: false,
      serializable: false,
      functions: [],
      properties: [],
    },
    {
      name: 'demo.Registry$Companion',
      kind: 'object',
      start: 48,
      headerEnd: 48,
      init: false,
      serializable: false,
      functions: ['create'],
      properties: [],
    },
    {
      name: 'demo.FactsKt',
      kind: 'facade',
      start: 0,
      headerEnd: 0,
      init: false,
      serializable: false,
      functions: [
        'twice',
        'fetch',
        'force',
        'measured',
        'runMeasured',
        'strict',
        'repeatAction',
        'report',
        'combine',
      ],
      properties: [
        {
          name: 'names',
          start: 45,
          end: 45,
          constructor: false,
          getter: false,
          setter: false,
          delegated: false,
        },
      ],
    },
  ],
  functions: [
    {
      name: 'deposit',
      class: 'demo.Account',
      start: 20,
      end: 20,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'sound',
      class: 'demo.Animal',
      start: 24,
      end: 24,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'create',
      class: 'demo.Registry$Companion',
      start: 49,
      end: 52,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: 'demo.Registry',
    },
    {
      name: 'twice',
      class: 'demo.FactsKt',
      start: 32,
      end: 32,
      suspend: false,
      inline: true,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'fetch',
      class: 'demo.FactsKt',
      start: 34,
      end: 41,
      suspend: true,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'force',
      class: 'demo.FactsKt',
      start: 43,
      end: 43,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'measured',
      class: 'demo.FactsKt',
      start: 56,
      end: 56,
      suspend: false,
      inline: true,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'runMeasured',
      class: 'demo.FactsKt',
      start: 58,
      end: 63,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: ['measured'],
      staticIn: null,
    },
    {
      name: 'strict',
      class: 'demo.FactsKt',
      start: 65,
      end: 68,
      suspend: false,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'repeatAction',
      class: 'demo.FactsKt',
      start: 70,
      end: 72,
      suspend: false,
      inline: false,
      returnsUnit: true,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'report',
      class: 'demo.FactsKt',
      start: 74,
      end: 78,
      suspend: true,
      inline: false,
      returnsUnit: true,
      inlineCalls: [],
      staticIn: null,
    },
    {
      name: 'combine',
      class: 'demo.FactsKt',
      start: 80,
      end: 86,
      suspend: true,
      inline: false,
      returnsUnit: false,
      inlineCalls: [],
      staticIn: null,
    },
  ],
  lambdas: [
    {
      start: 14,
      end: 14,
      valueLines: [14, 14],
      returnLines: [],
      callee: 'lazy',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 36,
      end: 40,
      valueLines: [39, 39],
      returnLines: [],
      callee: 'coroutineScope',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 37,
      end: 37,
      valueLines: [37, 37],
      returnLines: [],
      callee: 'async',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 38,
      end: 38,
      valueLines: [38, 38],
      returnLines: [],
      callee: 'launch',
      discarded: true,
      unitCallee: false,
    },
    {
      start: 45,
      end: 45,
      valueLines: [45, 45],
      returnLines: [],
      callee: 'map',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 59,
      end: 63,
      valueLines: [60, 62],
      returnLines: [],
      callee: 'measured',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 76,
      end: 76,
      valueLines: [76, 76],
      returnLines: [],
      callee: 'repeatAction',
      discarded: true,
      unitCallee: true,
    },
    {
      start: 80,
      end: 86,
      valueLines: [85, 85],
      returnLines: [82],
      callee: 'coroutineScope',
      discarded: false,
      unitCallee: false,
    },
    {
      start: 81,
      end: 84,
      valueLines: [83, 83],
      returnLines: [82],
      callee: 'async',
      discarded: false,
      unitCallee: false,
    },
  ],
  branching: [17, 20, 43, 45, 51, 52, 59, 60, 61, 62, 67, 71, 82],
  bang: [43, 66, 67],
};
