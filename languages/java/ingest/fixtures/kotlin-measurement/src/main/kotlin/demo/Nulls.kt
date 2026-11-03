package demo

class Person(val name: String, val nickname: String?) {
    lateinit var tag: String

    fun display(): String = nickname ?: name

    fun nickLength(): Int = nickname?.length ?: 0

    fun forced(): Int = (nickname ?: error("no nickname")).length

    fun castOrNull(value: Any): String? = value as? String

    fun cast(value: Any): String = value as String

    fun castNullable(value: Any?): String = value as String

    fun tagged(): String = tag
}

fun greet(name: String, greeting: String = "Hello", punctuation: String = "!"): String =
    "$greeting, $name$punctuation"

@JvmOverloads
fun overloaded(name: String, times: Int = 2): String = name.repeat(times)

inline fun twice(action: () -> Int): Int = action() + action()

fun useInline(value: Int): Int = twice { if (value > 0) value else -value }

fun classify(value: Int): String {
    if (value < 0) {
        return "negative"
    }
    return if (value == 0) "zero" else "positive"
}

fun both(a: Boolean, b: Boolean): Boolean = a && b

fun either(a: Boolean, b: Boolean): Boolean = a || b

fun loop(values: List<Int>): Int {
    var total = 0
    for (value in values) {
        total += value
    }
    return total
}

fun safeParse(text: String): Int =
    try {
        text.toInt()
    } catch (e: NumberFormatException) {
        -1
    }

class Counter {
    companion object {
        const val START = 10
        fun create(): Counter = Counter()
    }

    var count = START

    fun increment() {
        count++
    }
}
