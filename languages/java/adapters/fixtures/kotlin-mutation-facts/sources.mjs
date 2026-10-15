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
`;

export const FACTS_EXPECTED = {
  file: 'src/demo/Facts.kt',
  package: 'demo',
  lines: 46,
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
      name: 'demo.FactsKt',
      kind: 'facade',
      start: 0,
      headerEnd: 0,
      init: false,
      serializable: false,
      functions: ['twice', 'fetch', 'force'],
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
    },
    {
      name: 'sound',
      class: 'demo.Animal',
      start: 24,
      end: 24,
      suspend: false,
      inline: false,
    },
    {
      name: 'twice',
      class: 'demo.FactsKt',
      start: 32,
      end: 32,
      suspend: false,
      inline: true,
    },
    {
      name: 'fetch',
      class: 'demo.FactsKt',
      start: 34,
      end: 41,
      suspend: true,
      inline: false,
    },
    {
      name: 'force',
      class: 'demo.FactsKt',
      start: 43,
      end: 43,
      suspend: false,
      inline: false,
    },
  ],
  lambdas: [
    {
      start: 14,
      end: 14,
      valueLines: [14, 14],
      callee: 'lazy',
    },
    {
      start: 36,
      end: 40,
      valueLines: [39, 39],
      callee: 'coroutineScope',
    },
    {
      start: 37,
      end: 37,
      valueLines: [37, 37],
      callee: 'async',
    },
    {
      start: 38,
      end: 38,
      valueLines: [38, 38],
      callee: 'launch',
    },
    {
      start: 45,
      end: 45,
      valueLines: [45, 45],
      callee: 'map',
    },
  ],
  branching: [17, 20, 43, 45],
  bang: [43],
};
