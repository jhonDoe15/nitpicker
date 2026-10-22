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
