package shop.events

import org.springframework.context.ApplicationEventPublisher
import shop.orders.Order
import shop.orders.OrderLoader
import shop.orders.OrderRepository

class DualWrites(
    private val repository: OrderRepository,
    private val loader: OrderLoader,
    private val publisher: ApplicationEventPublisher,
) {
    fun place(order: Order) {
        repository.save(order)
        loader.placed(order.id)
    }

    fun placeWithEvent(order: Order) {
        repository.save(order)
        publisher.publishEvent(Placed(order.id))
    }

    fun announce(id: Long) = loader.placed(id)

    fun placeThroughHelper(order: Order) = place(order)
}
