package shop.events

import org.springframework.retry.annotation.Retryable
import shop.orders.Order
import shop.orders.OrderLoader

class Retries(private val loader: OrderLoader) {
    @Retryable
    fun announce(id: Long) = loader.placed(id)

    fun announceWithLoop(id: Long) {
        repeat(3) {
            try {
                loader.placed(id)
                return
            } catch (failed: IllegalStateException) {
                Thread.sleep(100)
            }
        }
    }

    @Retryable
    fun load(id: Long): Order? = loader.load(id)
}
