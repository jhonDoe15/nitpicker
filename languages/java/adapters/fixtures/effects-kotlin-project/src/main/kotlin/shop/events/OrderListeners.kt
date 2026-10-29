package shop.events

import org.springframework.transaction.event.TransactionalEventListener
import shop.orders.OrderLoader

data class Placed(val id: Long)

class OrderListeners(private val loader: OrderLoader) {
    @TransactionalEventListener
    fun onPlaced(placed: Placed) {
        loader.placed(placed.id)
    }
}
