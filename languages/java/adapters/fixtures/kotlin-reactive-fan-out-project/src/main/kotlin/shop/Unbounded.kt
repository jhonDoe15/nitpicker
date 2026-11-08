package shop

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.flatMapMerge
import kotlinx.coroutines.reactive.asFlow
import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.kotlin.core.publisher.toFlux

class Unbounded(private val feeds: Feeds, private val client: WebClient) {
    fun all(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap { feeds.fetch(it) }

    fun referenced(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap(this::load)

    fun bare(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap(::load)

    fun extension(ids: List<String>): Flux<String> = ids.toFlux().flatMapSequential { feeds.relay(it) }

    fun filtered(ids: List<String>): Flux<String> =
        Flux.fromIterable(ids)
            .filter { it.isNotBlank() }
            .flatMap { feeds.fetch(it) }

    fun direct(ids: Set<String>): Flux<String> =
        Flux.fromIterable(ids).flatMap { client.get().uri("/feeds/{id}", it).retrieve().bodyToMono(String::class.java) }

    fun zipped(ids: List<String>): Mono<List<String>> =
        Mono.zip(ids.map { feeds.fetch(it) }) { parts -> parts.map { it as String } }

    fun joined(ids: List<String>): Mono<Void> = Mono.`when`(ids.map { feeds.fetch(it) })

    fun merged(ids: List<String>): Flux<String> {
        val calls = ids.map { feeds.fetch(it) }
        return Flux.merge(calls)
    }

    fun spread(ids: List<String>): Flux<String> = Flux.merge(*ids.map { feeds.fetch(it) }.toTypedArray())

    fun sequential(ids: List<String>): Flux<String> = Flux.mergeSequential(ids.map { feeds.fetch(it) })

    fun joinedLate(ids: List<String>): Mono<Void> = Mono.whenDelayError(ids.map { feeds.fetch(it) })

    fun cut(ids: List<String>): Flux<String> = Flux.fromIterable(ids).take(ids.size.toLong()).flatMap { feeds.fetch(it) }

    fun chainedLate(ids: List<String>): Flux<String> =
        Flux.fromIterable(ids).flatMap { Mono.just(it.trim()) }.flatMap { feeds.fetch(it) }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun flowed(ids: List<String>): Flow<String> =
        ids.asFlow().flatMapMerge(Int.MAX_VALUE) { id -> feeds.fetch(id).asFlow() }

    private fun load(id: String): Mono<String> = feeds.fetch(id)
}
