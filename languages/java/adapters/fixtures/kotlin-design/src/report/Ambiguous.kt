package report

import billing.*
import shop.*

fun ambiguous(cart: Cart): Int = cart.total()

fun sameShop(order: Order, line: Line): Int = line.price + order.total

fun viaLambda(carts: List<Cart>): Int = carts.sumOf { it.total() }

fun scoped(cart: Cart): Int = with(cart) { total() }

fun applied(order: Order): Order = order.also { println(it.total) }
