package shop.bad

import jakarta.persistence.Entity
import jakarta.persistence.EntityManager
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Version
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.findByIdOrNull
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Entity
class Satchel(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var status: String = "",
)

@Transactional
interface SatchelRepository : JpaRepository<Satchel, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Satchel p set p.status = 'LOST' where p.id = :id")
    fun lose(id: Long): Int
}

@Service
@Transactional(readOnly = true)
class SatchelReports(
    private val satchels: SatchelRepository,
    private val jdbc: JdbcTemplate,
    private val client: JdbcClient,
    private val dsl: DSLContext,
    private val entityManager: EntityManager,
) {
    fun lose(id: Long) = satchels.lose(id)

    fun archive(id: Long) {
        jdbc.update("update satchel set status = 'ARCHIVED' where id = ?", id)
        jdbc.execute("delete from satchel_log")
        jdbc.execute(CLEAR_LOG)
        client.sql("delete from satchel where id = :id").param("id", id).update()
        dsl.deleteFrom(DSL.table("satchel")).where(DSL.field("id").eq(id)).execute()
        dsl.insertInto(DSL.table("satchel_log")).values(id).execute()
        entityManager.createQuery("delete from Satchel p").executeUpdate()
    }

    fun relabel(id: Long): Satchel {
        val satchel = satchels.findById(id).orElseThrow()
        satchel.status = "SEEN"
        return satchel
    }

    fun touch(id: Long) {
        val satchel = satchels.findByIdOrNull(id) ?: return
        satchel.status = "SEEN"
    }

    fun found(id: Long): Satchel {
        val satchel = entityManager.find(Satchel::class.java, id)
        satchel.status = "FOUND"
        return satchel
    }

    companion object {
        const val CLEAR_LOG = "delete from satchel_log"
    }
}

@Service
class SatchelImports(private val satchels: SatchelRepository, private val jdbc: JdbcTemplate, private val dsl: DSLContext) {
    fun replaceLog(id: Long) {
        jdbc.execute("delete from satchel_log")
        dsl.insertInto(DSL.table("satchel_log")).values(id).execute()
    }

    fun loseTwice(id: Long) {
        satchels.lose(id)
        satchels.lose(id + 1)
    }
}
