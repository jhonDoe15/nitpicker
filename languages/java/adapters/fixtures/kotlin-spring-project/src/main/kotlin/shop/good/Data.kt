package shop.good

import jakarta.persistence.EntityManager
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import reactor.core.publisher.Mono

interface ShipmentRepository : JpaRepository<Shipment, Long> {
    @Query(
        """
        select s from Shipment s
        where s.status = :status
        """,
    )
    fun byStatus(status: Status): List<Shipment>

    @Query("select count(s) from Shipment s where s.status = :status")
    fun countWithStatus(status: Status): Long

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Shipment s set s.status = :status where s.id in :ids")
    fun markAll(ids: List<Long>, status: Status): Int

    @Suppress("PMD.SpringDataNativeQuery")
    @Query(value = "select * from shipment for update skip locked", nativeQuery = true)
    fun lockNext(): List<Shipment>
}

@Service
class ShipmentService(private val shipments: ShipmentRepository, private val entityManager: EntityManager) {
    @Transactional
    fun importAll(items: List<Shipment>, ids: List<Long>) {
        shipments.saveAll(items)
        shipments.markAll(ids, Status.PAID)
        for ((index, item) in items.withIndex()) {
            entityManager.persist(item)
            if (index % BATCH == 0) {
                entityManager.flush()
                entityManager.clear()
            }
        }
    }

    @Transactional
    fun later(next: Mono<Shipment>): Mono<Shipment> = next.map { shipments.save(it) }

    @Transactional
    fun touch(id: Long): Shipment? = shipments.findById(id).map { shipments.save(it) }.orElse(null)

    @Transactional(readOnly = true)
    fun open(): List<Shipment> = shipments.byStatus(Status.OPEN)

    @Transactional(readOnly = true)
    fun openCount(): Long = shipments.countWithStatus(Status.OPEN)

    private companion object {
        const val BATCH = 50
    }
}

interface StockRepository : JpaRepository<Shipment, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Shipment s set s.status = 'VOID' where s.id in :ids")
    fun deactivate(ids: Collection<Long>): Int
}

@Service
class StockService(private val stock: StockRepository, private val shipments: ShipmentRepository) {
    @Transactional
    fun retire(ids: List<Long>, groups: Map<String, List<Long>>) {
        ids.chunked(CHUNK).forEach { chunk -> stock.deactivate(chunk) }
        for (chunk in ids.chunked(CHUNK)) {
            stock.deactivate(chunk)
        }
        ids.chunked(CHUNK).forEach { stock.deactivate(it) }
        ids.windowed(CHUNK, CHUNK, true).forEach { chunk: List<Long> -> stock.deactivate(chunk) }
        groups.forEach { (_, grouped) -> stock.deactivate(grouped) }
    }

    @Transactional
    fun reopen(id: Long): Shipment? =
        shipments.findById(id).filter { it.status == Status.PAID }.map { shipments.save(it) }.orElse(null)

    private companion object {
        const val CHUNK = 500
    }
}

@Service
class GroupedStockService(private val stock: StockRepository) {
    @Transactional
    fun retireGroups(ids: List<Long>) {
        val groups = ids.groupBy { it % CHUNK }
        groups.forEach { (_, grouped) -> stock.deactivate(grouped) }
        groups.values.forEach { stock.deactivate(it) }
        groups.values.forEach { grouped -> stock.deactivate(grouped) }
        for ((_, grouped) in groups) {
            stock.deactivate(grouped)
        }
        ids.chunked(BATCH).forEach { chunk ->
            val (active, retired) = chunk.partition { it > 0L }
            stock.deactivate(active)
            stock.deactivate(retired)
        }
    }

    private companion object {
        const val CHUNK = 500L
        const val BATCH = 100
    }
}
