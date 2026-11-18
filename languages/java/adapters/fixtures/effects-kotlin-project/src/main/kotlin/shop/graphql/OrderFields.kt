package shop.graphql

import com.netflix.graphql.dgs.DgsData
import org.springframework.data.repository.findByIdOrNull
import org.springframework.graphql.data.method.annotation.SchemaMapping
import shop.orders.Order
import shop.orders.OrderLoader
import shop.orders.OrderRepository

class OrderFields(private val repository: OrderRepository, private val loader: OrderLoader) {
    @SchemaMapping(typeName = "Order", field = "previous")
    fun previous(order: Order): Order? = repository.findByIdOrNull(order.id - 1)

    @SchemaMapping
    fun viaHelper(order: Order): Order? = loader.load(order.id)

    @SchemaMapping(typeName = "Order")
    fun price(order: Order) = loader.price(order.id)

    @DgsData(parentType = "Order", field = "previous")
    fun dgsPrevious(order: Order): Order? = repository.findByIdOrNull(order.id - 1)
}
