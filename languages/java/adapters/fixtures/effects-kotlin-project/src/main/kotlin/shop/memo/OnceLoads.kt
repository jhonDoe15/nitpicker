package shop.memo

import shop.orders.Order
import shop.orders.OrderRepository

lateinit var knownOrders: OrderRepository

val allOrders: List<Order> by lazy { knownOrders.findAll() }

class Names {
    fun has(order: Order): Boolean = order in cached

    companion object {
        val cached: List<Order> by lazy { knownOrders.findAll() }
    }
}

fun fromTopLevel(orders: List<Order>) {
    for (order in orders) {
        allOrders.contains(order)
    }
}

fun fromCompanion(orders: List<Order>, names: Names) {
    for (order in orders) {
        names.has(order)
    }
}
