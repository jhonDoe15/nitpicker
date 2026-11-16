package shop.futures

import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutorService
import shop.orders.Order
import shop.orders.OrderRepository

class OrderFutures(private val orders: OrderRepository, private val executor: ExecutorService) {
    fun wrapped(id: Long): CompletableFuture<Order?> {
        val order = orders.findById(id).orElse(null)
        return CompletableFuture.completedFuture(order)
    }

    fun find(id: Long): Order? = orders.findById(id).orElse(null)

    fun findAsync(id: Long): CompletableFuture<Order?> = CompletableFuture.supplyAsync({ find(id) }, executor)

    fun waits(id: Long): Order? = findAsync(id).get()
}
