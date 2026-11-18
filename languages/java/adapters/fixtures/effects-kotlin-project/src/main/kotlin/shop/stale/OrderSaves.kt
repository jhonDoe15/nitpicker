package shop.stale

import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.retry.annotation.Retryable
import reactor.core.publisher.Mono
import reactor.util.retry.Retry
import shop.orders.Order
import shop.orders.OrderRepository
import shop.reactive.ReactiveOrders

class OrderSaves(private val reactive: ReactiveOrders, private val orders: OrderRepository) {
    fun resend(order: Order): Mono<Order> = reactive.save(order).retryWhen(conflicts())

    fun captured(order: Order): Mono<Order> = Mono.defer { reactive.save(order) }.retryWhen(conflicts())

    fun loop(order: Order): Order {
        repeat(3) {
            try {
                return orders.save(order)
            } catch (conflict: OptimisticLockingFailureException) {
                println(conflict)
            }
        }
        return order
    }

    @Retryable(retryFor = [OptimisticLockingFailureException::class])
    fun annotated(order: Order): Order = orders.save(order)

    private fun conflicts(): Retry = Retry.max(3).filter { it is OptimisticLockingFailureException }
}
