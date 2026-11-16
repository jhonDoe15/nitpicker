package shop.futures

import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutorService
import org.springframework.scheduling.annotation.Async
import shop.orders.Order
import shop.orders.OrderRepository

class OrderFuturesAllowed(private val orders: OrderRepository, private val executor: ExecutorService) {
    @Async
    fun springAsync(id: Long): CompletableFuture<Order?> =
        CompletableFuture.completedFuture(orders.findById(id).orElse(null))

    fun submitted(id: Long): CompletableFuture<Order?> =
        CompletableFuture.supplyAsync({ orders.findById(id).orElse(null) }, executor)

    fun known(order: Order): CompletableFuture<Order> = CompletableFuture.completedFuture(order)

    fun startAsync(id: Long): CompletableFuture<Order?> = submitted(id)

    fun withoutTwin(id: Long): Order? = startAsync(id).get()

    fun overlapped(id: Long): Order? {
        val pending = submitted(id)
        val other = orders.findById(id + 1).orElse(null)
        return if (other == null) pending.get() else other
    }
}
