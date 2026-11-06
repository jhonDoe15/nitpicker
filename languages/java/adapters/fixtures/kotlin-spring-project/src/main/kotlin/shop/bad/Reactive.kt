package shop.bad

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.count
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.toList
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.data.repository.reactive.ReactiveCrudRepository
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono

interface ReactivePostings : ReactiveCrudRepository<Posting, Long>

interface CoroutinePostings : CoroutineCrudRepository<Posting, Long>

@Service
class PostingReports(
    private val reactive: ReactivePostings,
    private val coroutines: CoroutinePostings,
) {
    fun open(): Flux<Posting> = reactive.findAll().filter { it.status == Status.OPEN }

    fun total(): Mono<Long> = reactive.findAll().count()

    fun stocked(): Mono<Boolean> = reactive.findAll().hasElements()

    fun first(): Mono<Posting> = reactive.findAll().next()

    fun firstTen(): Flux<Posting> = reactive.findAll().take(10)

    fun sized(): Int = reactive.findAll().collectList().block()?.size ?: 0

    fun openFlow(): Flow<Posting> = coroutines.findAll().filter { it.status == Status.OPEN }

    suspend fun countFlow(): Int = coroutines.findAll().count()

    suspend fun firstOpen(): Posting? = coroutines.findAll().firstOrNull { it.status == Status.OPEN }

    suspend fun listed(): Int = coroutines.findAll().toList().size
}
