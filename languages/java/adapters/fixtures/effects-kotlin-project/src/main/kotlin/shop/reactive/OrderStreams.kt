package shop.reactive

import org.springframework.data.repository.reactive.ReactiveCrudRepository
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.kotlin.core.publisher.toFlux
import shop.orders.Order

interface ReactiveOrders : ReactiveCrudRepository<Order, Long>

class OrderStreams(private val orders: ReactiveOrders) {
    fun byLambda(ids: List<Long>): Flux<Order> = ids.toFlux().flatMap { orders.findById(it) }

    fun fromIterable(ids: List<Long>): Flux<Mono<Order>> = Flux.fromIterable(ids).map(this::lookup)

    fun lookup(id: Long): Mono<Order> = orders.findById(id)
}
