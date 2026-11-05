package shop.good

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import org.springframework.data.repository.kotlin.CoroutineCrudRepository
import org.springframework.data.repository.reactive.ReactiveCrudRepository
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono

interface ReactiveShipments : ReactiveCrudRepository<Shipment, Long>

interface CoroutineShipments : CoroutineCrudRepository<Shipment, Long>

@Service
class ShipmentReports(
    private val reactive: ReactiveShipments,
    private val coroutines: CoroutineShipments,
) {
    fun names(): Flux<String> = reactive.findAll().map { it.toString() }

    fun listed(): Mono<List<Shipment>> = reactive.findAll().collectList()

    fun total(): Mono<Long> = reactive.count()

    fun labels(): Flow<String> = coroutines.findAll().map { it.toString() }

    suspend fun all(): List<Shipment> = coroutines.findAll().toList()

    suspend fun counted(): Long = coroutines.count()
}
