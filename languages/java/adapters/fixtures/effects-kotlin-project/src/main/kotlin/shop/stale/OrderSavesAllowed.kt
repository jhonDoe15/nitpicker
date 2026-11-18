package shop.stale

import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.retry.annotation.Retryable
import reactor.core.publisher.Mono
import reactor.util.retry.Retry
import shop.orders.Order
import shop.orders.OrderRepository
import shop.reactive.ReactiveOrders

class OrderSavesAllowed(private val reactive: ReactiveOrders, private val orders: OrderRepository) {
    fun reread(id: Long): Mono<Order> =
        Mono.defer { reactive.findById(id).flatMap { found -> reactive.save(found) } }
            .retryWhen(Retry.max(3).filter { it is OptimisticLockingFailureException })

    fun otherFailure(order: Order): Mono<Order> = reactive.save(order).retryWhen(Retry.max(3))

    fun loopReread(id: Long): Order? {
        for (attempt in 1..3) {
            try {
                return orders.save(orders.findById(id).orElseThrow())
            } catch (conflict: OptimisticLockingFailureException) {
                println(conflict)
            }
        }
        return null
    }

    @Retryable(retryFor = [OptimisticLockingFailureException::class])
    fun annotatedReread(id: Long): Order = orders.save(orders.findById(id).orElseThrow())
}
