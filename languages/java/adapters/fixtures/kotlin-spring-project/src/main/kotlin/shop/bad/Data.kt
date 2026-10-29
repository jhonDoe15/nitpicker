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

const val BASE_QUERY = "select i from Invoice i "
const val OPEN_FILTER = "where i.status = 'OPEN'"

interface ArchiveRepository : JpaRepository<Invoice, Long> {
    @Query(BASE_QUERY + OPEN_FILTER)
    fun openOnes(): List<Invoice>

    @Query(
        """
        select i from Invoice i
        where i.status = 'OPEN'
          and i.customer is not null
          and i.version > 0
          and i.receipt is null
          and exists (select t from Tag t where t.id = i.id)
          and i.customer.name is not null
          and i.customer.name <> ''
          and i.lines is not empty
          and i.tags is not empty
          and i.history is not empty
          and i.id = ?1
        """,
    )
    fun longPositional(id: Long): List<Invoice>

    @Query(
        """
        select i from Invoice i
        where i.customer is not null
          and i.version > 0
          and i.receipt is null
          and exists (select t from Tag t where t.id = i.id)
          and i.customer.name is not null
          and i.customer.name <> ''
          and i.lines is not empty
          and i.tags is not empty
          and i.history is not empty
          and i.status = :status
        """ + " order by i.id",
    )
    fun longJoined(status: Status): List<Invoice>
}

class Batch(val items: List<Invoice>, val byId: Map<Long, Invoice>)

fun InvoiceRepository.saveEach(items: List<Invoice>) = items.forEach { save(it) }

fun InvoiceRepository.saveLoop(items: List<Invoice>) {
    for (item in items) {
        this.save(item)
    }
}

fun EntityManager.persistAll(items: List<Tag>) {
    items.forEach { persist(it) }
}

@Service
class BatchService(private val invoices: InvoiceRepository) {
    @Transactional
    fun importBatch(batch: Batch, items: List<Invoice>) {
        batch.items.map { invoices.save(it) }
        items.filter { it.status == Status.OPEN }.map { invoices.save(it) }
        items.asSequence().map { invoices.save(it) }.toList()
        batch.byId.values.map { invoices.save(it) }
        val repository = invoices
        items.forEach { repository.save(it) }
        items.forEach(this.invoices::save)
        items.forEach { keep(it) }
    }

    private fun keep(invoice: Invoice, audit: Boolean = true) {
        if (audit) {
            invoices.save(invoice)
        }
    }
}

@Service
class GroupedService(private val invoices: InvoiceRepository) {
    @Transactional
    fun closeGroups(ids: List<Long>) {
        val (paid, open) = ids.partition { it > 0L }
        open.forEach { invoices.markStatus(it, Status.PAID) }
        val groups = ids.groupBy { it % 2L }
        groups.keys.forEach { invoices.markStatus(it, Status.VOID) }
        groups.forEach { (_, grouped) -> grouped.forEach { invoices.markStatus(it, Status.OPEN) } }
        for (id in paid) {
            invoices.markStatus(id, Status.PAID)
        }
    }
}
