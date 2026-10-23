package refs

fun double(n: Int): Int = n * 2

fun triple(n: Int): Int = n * 3

fun negate(n: Int): Int = -n

fun overloaded(n: Int): Int = n

fun overloaded(n: Int, m: Int): Int = n + m

val table: Map<String, (Int) -> Int> = mapOf("double" to ::double, "triple" to ::triple)

val registered = register(::negate)

fun register(f: (Int) -> Int): (Int) -> Int = f

class Handler {
    fun handle(n: Int): Int = n + 1

    fun first(): List<Int> = listOf(1).map(::double)

    fun bound(): List<Int> = listOf(1).map(this::handle)

    fun unbound(): (Handler, Int) -> Int = Handler::handle

    fun ambiguous(): (Int) -> Int = ::overloaded

    fun wrapped(): List<Int> = listOf(1).map { double(it) }

    fun stored(): (Int) -> Int {
        val chosen = ::triple
        return chosen
    }

    fun lookup(key: String): Int = Dispatch.byName.getValue(key)(1)

    fun fromFile(key: String): Int = table.getValue(key)(1)

    companion object Dispatch {
        val byName: Map<String, (Int) -> Int> = mapOf("negate" to ::negate)
    }
}
