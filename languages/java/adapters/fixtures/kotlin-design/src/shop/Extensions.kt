package shop

private val registry = mutableListOf<String>()
val names = HashMap<String, Int>()
var counter = 0
const val LIMIT = 10

fun register(name: String) {
    registry.add(name)
    counter += 1
}

fun registered(): List<String> = registry

fun leaked(): MutableList<String> = registry

fun Order.isPaid(): Boolean = status == Status.PAID

fun Cart.addAll(lines: List<Line>) {
    for (line in lines) {
        add(line)
    }
}

fun useExtensions(cart: Cart, order: Order, lines: List<Line>): Boolean {
    cart.addAll(lines)
    return order.isPaid()
}

fun Order.describe(): String =
    when (status) {
        Status.NEW -> "new"
        else -> note
    }

fun String.shout(): String = uppercase()

fun shouted(text: String): String = text.shout()
