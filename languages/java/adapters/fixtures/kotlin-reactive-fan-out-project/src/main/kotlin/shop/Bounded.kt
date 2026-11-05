package shop

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.flatMapMerge
import kotlinx.coroutines.reactive.asFlow
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono

class Bounded(private val feeds: Feeds) {
    private val mirrors = listOf("a", "b")

    fun limited(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap({ feeds.fetch(it) }, 8)

    fun referencedLimit(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap(feeds::fetch, 8)

    fun oneAtATime(ids: List<String>): Flux<String> = Flux.fromIterable(ids).concatMap { feeds.fetch(it) }

    fun batched(ids: List<String>): Flux<String> = Flux.fromIterable(ids).buffer(20).flatMap { feeds.fetchAll(it) }

    fun mirrored(): Flux<String> = Flux.fromIterable(mirrors).flatMap { feeds.fetch(it) }

    fun literal(): Flux<String> = Flux.fromIterable(listOf("a", "b")).flatMap { feeds.fetch(it) }

    fun pair(first: String, second: String): Mono<String> =
        Mono.zip(feeds.fetch(first), feeds.fetch(second)).map { it.t1 + it.t2 }

    fun mirrorsJoined(): Mono<Void> = Mono.`when`(mirrors.map { feeds.fetch(it) })

    fun local(ids: List<String>): Flux<String> = Flux.fromIterable(ids).flatMap { Mono.just(it.trim()) }

    fun streamed(ids: Flux<String>): Flux<String> = ids.flatMap { feeds.fetch(it) }

    fun listed(ids: List<String>): List<Mono<String>> = ids.flatMap { listOf(feeds.fetch(it)) }

    fun two(first: String, second: String): Flux<String> = Flux.merge(feeds.fetch(first), feeds.fetch(second))

    fun firstTen(ids: List<String>): Flux<String> = Flux.fromIterable(ids).take(10).flatMap { feeds.fetch(it) }

    fun sequentialLimited(ids: List<String>): Flux<String> =
        Flux.mergeSequential(ids.map { feeds.fetch(it) }, 4, 32)

    fun chainedPure(ids: List<String>): Flux<String> =
        Flux.fromIterable(ids).flatMap({ feeds.fetch(it) }, 4).flatMap { Mono.just(it.trim()) }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun flowDefault(ids: List<String>): Flow<String> = ids.asFlow().flatMapMerge { id -> feeds.fetch(id).asFlow() }

    @OptIn(ExperimentalCoroutinesApi::class)
    fun flowLimited(ids: List<String>): Flow<String> = ids.asFlow().flatMapMerge(8) { id -> feeds.fetch(id).asFlow() }
}
