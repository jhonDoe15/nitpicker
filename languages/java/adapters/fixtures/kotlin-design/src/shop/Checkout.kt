package shop

fun addDirect(cart: Cart, line: Line) {
    cart.lines().add(line)
}

fun addViaAlias(cart: Cart, line: Line) {
    val lines = cart.lines()
    lines.add(line)
}

fun addViaCopy(cart: Cart, line: Line) {
    val lines = cart.lines().toMutableList()
    lines.add(line)
}

fun addViaReassigned(cart: Cart, other: Cart, line: Line) {
    var lines = cart.lines()
    lines = other.lines()
    lines.add(line)
}

fun clearTags(cart: Cart) {
    cart.tags.clear()
    cart.tags[0] = "x"
}

fun readOnly(cart: Cart): Int = cart.view.size + cart.snapshot().size

fun total(cart: Cart): Int = cart.total()

fun totalOf(cart: Cart, scale: Int): Int = cart.total() * scale

fun same(cart: Cart): Int {
    return cart.total()
}

fun reorder(cart: Cart, sku: String, fallback: Int): Int = cart.count(sku, fallback)

fun reordered(cart: Cart, sku: String, fallback: Int): Int = Cart().count(fallback.toString(), 1)

fun nothing(cart: Cart, line: Line) {
    cart.add(line)
}

fun ambiguous(cart: Cart, sku: String) = cart.count(sku)

class Checkout(private val cart: Cart) {
    fun add(line: Line) = cart.add(line)

    fun price(): Int = cart.total()

    fun both(line: Line): Int {
        cart.add(line)
        return cart.total()
    }
}
