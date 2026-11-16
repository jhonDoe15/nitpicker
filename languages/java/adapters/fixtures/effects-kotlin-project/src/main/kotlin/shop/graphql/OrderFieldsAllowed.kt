package shop.graphql

import com.netflix.graphql.dgs.DgsData
import org.springframework.graphql.data.method.annotation.BatchMapping
import org.springframework.graphql.data.method.annotation.SchemaMapping
import shop.orders.Order
import shop.orders.OrderRepository

class OrderFieldsAllowed(private val repository: OrderRepository) {
    @BatchMapping(typeName = "Order", field = "previous")
    fun previous(orders: List<Order>): Map<Order, Order?> {
        val byId = repository.findAllById(orders.map { it.id - 1 }).associateBy { it.id }
        return orders.associateWith { byId[it.id - 1] }
    }

    @SchemaMapping(typeName = "Query", field = "orders")
    fun orders(): List<Order> = repository.findAll()

    @DgsData(parentType = "Query", field = "orders")
    fun dgsOrders(): List<Order> = repository.findAll()

    @SchemaMapping(typeName = "Order")
    fun total(order: Order) = order.total.toString()
}
