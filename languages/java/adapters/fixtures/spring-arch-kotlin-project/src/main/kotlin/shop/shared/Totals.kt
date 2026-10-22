package shop.shared

import shop.orders.OrderDto

object Totals {
    fun of(order: OrderDto): Long? = order.id
}
