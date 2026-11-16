export const KOTLIN_COPIES = `
package shop

import a.b.Logger
import a.b.Store as Sink

object Prices {
  private val log = Logger.create()
  private var reads = 0

  fun sumWeights(items: List<Item>): Long {
    var total = 0L
    for (item in items) {
      if (item.weight > 0 && item.visible) {
        total += item.weight * item.count
      }
    }
    reads++
    log.debug("sum \${items.size} weights")
    return normalize(total)
  }

  fun addWeights(entries: List<Item>): Long {
    var sum = 0L
    for (entry in entries) {
      if (entry.weight > 0 && entry.visible) {
        sum += entry.weight * entry.count
      }
    }
    reads++
    log.debug("sum \${entries.size} weights")
    return round(sum)
  }

  fun maxFloat(values: Array<Float>): Float {
    var best = values[0]
    for (value in values) {
      if (value > best && !value.isNaN()) {
        best = value
      }
    }
    return best
  }

  fun maxDouble(values: Array<Double>): Double {
    var best = values[0]
    for (value in values) {
      if (value > best && !value.isNaN()) {
        best = value
      }
    }
    return best
  }

  fun label(code: Int): String = when (code) {
    0 -> "none"
    in 1..9 -> "few"
    else -> "many"
  }

  fun tag(code: Int): String = when (code) {
    0 -> "zero"
    in 1..9 -> "few"
    else -> "many"
  }

  fun save(rows: List<Row>) {
    val valid = rows.filter { it.email.contains("@") && it.name.isNotEmpty() }
    val unique = valid.associateBy { row -> row.email.lowercase() }
    Sink.write("users", unique.values)
    log.info("saved \${unique.size}")
  }

  fun store(rows: List<Row>) {
    val valid = rows.filter { it.email.contains("@") && it.name.isNotEmpty() }
    val unique = valid.associateBy { row -> row.email.lowercase() }
    Sink.write("users", unique.values)
    log.info("stored \${unique.size}")
  }
}
`;

export const KOTLIN_FORMS = `
package forms

class Box(val size: Int) {
  constructor(text: String) : this(text.length) {
    println(text)
  }

  val doubled: Int
    get() = size * 2

  var label: String = ""
    set(value) {
      field = value.trim()
    }

  val onClose = { code: Int -> println(code) }

  companion object {
    fun of(size: Int) = Box(size)
  }

  fun load(path: String, retries: Int = 3) {}
  fun load(path: java.nio.file.Path) {}
  abstract fun hidden()
}

fun String.shout(): String = uppercase() + "!"
`;
