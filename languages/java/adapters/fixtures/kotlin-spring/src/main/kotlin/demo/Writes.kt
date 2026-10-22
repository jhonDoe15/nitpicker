package demo

import jakarta.persistence.EntityManager
import java.io.IOException
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

interface AuditRepo : JpaRepository<Order, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.name = :name where o.id = :id")
    fun markSeen(id: Long, name: String)

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Order o set o.name = '' where o.id = :id")
    fun touch(id: Long)
}

@Service
class Ledger(
    private val orders: OrderRepo,
    private val audit: AuditRepo,
    private val entities: EntityManager,
    private val jdbc: JdbcTemplate,
) {
    @Transactional
    @Throws(IOException::class) // violation: SpringTransactionalCheckedRollback
    fun load() {}

    @Transactional(rollbackFor = [Exception::class])
    @Throws(IOException::class)
    fun safe() {}

    @Transactional(readOnly = true)
    @Throws(IOException::class)
    fun reading() {}

    @Transactional
    @Throws(IllegalStateException::class)
    fun unchecked() {}

    @Transactional(readOnly = true)
    fun report() {
        orders.save(Order()) // violation: SpringTransactionalReadOnlyWrite
        orders.deleteAllInBatch() // violation: SpringTransactionalReadOnlyWrite
        entities.persist(Order()) // violation: SpringTransactionalReadOnlyWrite
        audit.markSeen(1L, "x") // violation: SpringTransactionalReadOnlyWrite
        orders.findByName("x")
    }

    @Transactional
    fun write() {
        orders.save(Order())
    }

    fun search(name: String, ids: List<Long>) {
        entities.createQuery("select o from Order o where o.name = '" + name + "'") // violation: SpringQueryConcatenation
        entities.createQuery("select o from Order o where o.name = '$name'") // violation: SpringQueryConcatenation
        entities.createNativeQuery("select * from t where id = %d".format(ids.first())) // violation: SpringQueryConcatenation
        entities.createQuery("select o from Order o where o.name = :name")
        entities.createQuery("select o " + "from Order o")
        jdbc.queryForList("select * from t where name = '$name'") // violation: SpringQueryConcatenation
        val sql = "select * from t where x = " + name
        jdbc.update(sql) // violation: SpringQueryConcatenation
        val fixed = "select 1"
        jdbc.execute(fixed)
        jdbc.execute(String.format("drop table %s", name)) // violation: SpringQueryConcatenation
        jdbc.execute(String.format("drop table %s", "t"))
    }

    fun batches(items: List<Order>) {
        for (item in items) { orders.saveAll(listOf(item)) } // violation: SpringDataBatchOfOne
        items.forEach { orders.deleteAll(setOf(it)) } // violation: SpringDataBatchOfOne
        orders.saveAll(items)
        for (item in items) {
            val single = listOf(item)
            orders.saveAll(single) // violation: SpringDataBatchOfOne
        }
    }

    fun rows(items: List<Order>, ids: List<Long>) {
        for (item in items) { audit.markSeen(1L, "x") } // violation: SpringDataRowWriteInLoop
        items.forEach { audit.markSeen(2L, it.toString()) } // violation: SpringDataRowWriteInLoop
        ids.forEach(audit::touch) // violation: SpringDataRowWriteInLoop
        audit.markSeen(3L, "once")
    }

    private fun store(order: Order) {
        orders.save(order)
    }

    fun helper(items: List<Order>) {
        for (item in items) { store(item) } // violation: SpringDataSaveInLoopHelper
        items.forEach(this::store) // violation: SpringDataSaveInLoopHelper
        store(Order())
    }

    fun filtering() {
        orders.findAll().filter { it.toString().isNotEmpty() } // violation: SpringDataFilterInQuery
        orders.findAll().stream().count() // violation: SpringDataFilterInQuery
        orders.findAll().size // violation: SpringDataFilterInQuery
        orders.findAll().isEmpty() // violation: SpringDataFilterInQuery
        orders.findAll().sortedBy { it.toString() }
        orders.findAll(org.springframework.data.domain.Sort.unsorted()).size
    }
}

@Service
@Transactional
class Posting {
    @Throws(IOException::class) // violation: SpringTransactionalCheckedRollback
    fun post() {}

    @Throws(IOException::class)
    private fun hidden() {}
}

@Service
@Transactional(readOnly = true)
class Viewer(private val orders: OrderRepo) {
    fun view() {
        orders.save(Order()) // violation: SpringTransactionalReadOnlyWrite
    }

    @Transactional
    fun write() {
        orders.save(Order())
    }
}
