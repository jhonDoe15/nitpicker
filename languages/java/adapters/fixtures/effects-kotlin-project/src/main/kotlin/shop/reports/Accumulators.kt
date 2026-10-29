package shop.reports

import shop.orders.Order

class Accumulators {
    fun folded(orders: List<Order>): List<Order> = orders.fold(listOf()) { acc, order -> acc + order }

    fun reassigned(orders: List<Order>): Set<Long> {
        var ids = setOf<Long>()
        for (order in orders) {
            ids += order.id
        }
        return ids
    }

    fun mapped(orders: List<Order>): Map<Long, Order> {
        var byId = mapOf<Long, Order>()
        orders.forEach { byId = byId + (it.id to it) }
        return byId
    }

    fun built(orders: List<Order>): List<Long> = buildList { orders.forEach { add(it.id) } }

    fun grouped(orders: List<Order>): Map<Long, List<Order>> = orders.groupBy { it.id }

    fun mutable(orders: List<Order>): List<Order> {
        val all = mutableListOf<Order>()
        for (order in orders) {
            all += order
        }
        return all
    }
}
