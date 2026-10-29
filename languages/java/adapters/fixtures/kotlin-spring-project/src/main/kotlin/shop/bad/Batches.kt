package shop.bad

import jakarta.persistence.ElementCollection
import jakarta.persistence.Entity
import jakarta.persistence.EntityManager
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.ManyToMany
import jakarta.persistence.Version
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.jpa.repository.support.JpaRepositoryImplementation
import org.springframework.data.repository.history.RevisionRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

const val LEDGER_BASE = "select l from Ledger l"

@Entity
class Ledger(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var grade: Grades.Grade = Grades.Grade.A,
) {
    var status = Status.OPEN

    @ElementCollection
    var seen = mutableSetOf<Status>()

    @ManyToMany
    var linked: java.util.LinkedList<Tag> = java.util.LinkedList()

    @ManyToMany
    var qualified: kotlin.collections.MutableList<Tag> = mutableListOf()
}

interface AuditedLedgers : RevisionRepository<Ledger, Long, Int> {
    fun findByStatus(status: Status): List<Ledger>
}

interface LedgerStore : JpaRepositoryImplementation<Ledger, Long> {
    fun findByGrade(grade: Grades.Grade): List<Ledger>
}

interface LedgerRepository : JpaRepository<Ledger, Long> {
    @Query("$LEDGER_BASE where l.status = :status")
    fun byStatus(status: Status): List<Ledger>

    @Query("select l from Ledger l ".plus("where l.grade = :grade"))
    fun byGrade(grade: Grades.Grade): List<Ledger>
}

private fun keepTop(ledgers: LedgerRepository, ledger: Ledger) = ledgers.save(ledger)

@Service
class LedgerService(
    private val ledgers: LedgerRepository,
    private val spare: LedgerRepository?,
    private val entityManager: EntityManager,
) {
    @Transactional
    fun importAll(items: List<Ledger>) {
        for (item in items) ledgers.saveAll(listOf(Ledger(item.id, 0)))
        for (item in items) ledgers.saveAll(listOf<Ledger>(item))
        for (item in items) {
            val one = listOf(item)
            ledgers.saveAll(one)
        }
        for (item in items) item.persist()
        for (item in items) keepCompanion(ledgers, item)
        for (item in items) keepTop(ledgers, item)
        items.forEach { spare!!.save(it) }
        val save = ledgers::save
        items.forEach(save)
        items.forEach(fun(item: Ledger) { ledgers.delete(item) })
        items.mapTo(mutableListOf()) { ledgers.save(it) }
        items.associateBy { it.id }.mapValues { (_, item) -> ledgers.save(item) }
        ledgers.findAll().map { ledgers.save(it) }
        for (item in items) {
            ledgers.apply { save(item) }
        }
    }

    @Transactional
    fun touchAll(items: List<Ledger>) {
        for (item in items) entityManager.createNamedQuery("Ledger.touch").executeUpdate()
        for (item in items) {
            val query = entityManager.createQuery("update Ledger l set l.version = 0")
            query.executeUpdate()
        }
    }

    @Transactional(readOnly = true)
    fun graded(): List<Ledger> = ledgers.findAll().asSequence().filter { it.grade == Grades.Grade.A }.toList()

    private fun Ledger.persist() {
        ledgers.save(this)
    }

    companion object {
        fun keepCompanion(ledgers: LedgerRepository, ledger: Ledger) = ledgers.save(ledger)
    }
}
