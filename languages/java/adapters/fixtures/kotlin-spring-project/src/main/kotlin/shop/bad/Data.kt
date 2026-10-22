package shop.bad

import jakarta.persistence.EntityManager
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.NativeQuery
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

interface InvoiceRepository : JpaRepository<Invoice, Long> {
    fun findByStatus(status: Status): List<Invoice>

    @Query("select i from Invoice i where i.id = ?1")
    fun byId(id: Long): Invoice?

    @Query("select i from Invoice i " + "where i.status = :status")
    fun byStatus(status: Status): List<Invoice>

    @Query(value = "select * from invoice", nativeQuery = true)
    fun raw(): List<Invoice>

    @NativeQuery("select * from invoice where status = 'OPEN'")
    fun rawOpen(): List<Invoice>

    @Modifying
    @Query("update Invoice i set i.status = :status where i.id = :id")
    fun markStatus(id: Long, status: Status): Int
}

@Service
class InvoiceService(private val invoices: InvoiceRepository, private val entityManager: EntityManager) {
    @Transactional
    fun importAll(items: List<Invoice>, ids: List<Long>) {
        for (item in items) {
            invoices.save(item)
        }
        items.forEach { invoices.saveAll(listOf(it)) }
        items.forEach(invoices::delete)
        ids.forEach { invoices.markStatus(it, Status.PAID) }
        items.forEach { store(it) }
        repeat(ids.size) { entityManager.persist(Tag()) }
        ids.forEach(this::archive)
        for (id in ids) {
            entityManager.createQuery("update Invoice i set i.status = 'VOID' where i.id = :id")
                .setParameter("id", id)
                .executeUpdate()
        }
        invoices.flush()
        entityManager.createNativeQuery("select 1").singleResult
    }

    private fun store(invoice: Invoice) {
        invoices.save(invoice)
    }

    private fun archive(id: Long) {
        invoices.deleteById(id)
    }

    @Transactional(readOnly = true)
    fun anyOpen(): Boolean = invoices.findAll().stream().anyMatch { it.status == Status.OPEN }

    @Transactional(readOnly = true)
    fun unpaid(): List<Invoice> = invoices.findAll().filter { it.status == Status.OPEN }

    @Transactional(readOnly = true)
    fun total(): Int = invoices.findAll().size
}
