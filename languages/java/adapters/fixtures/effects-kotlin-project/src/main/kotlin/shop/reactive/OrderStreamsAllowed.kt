package shop.reactive

import reactor.core.publisher.Flux
import reactor.kotlin.core.publisher.toFlux
import shop.orders.Order

class OrderStreamsAllowed(private val orders: ReactiveOrders) {
    fun batched(ids: List<Long>): Flux<Order> = orders.findAllById(ids)

    fun withoutLookup(ids: List<Long>): Flux<String> = ids.toFlux().map { "order-$it" }

    fun fromDatabase(): Flux<Order> = orders.findAll().map { it }
}
