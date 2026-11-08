package shop.good

import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Version
import org.jooq.DSLContext
import org.jooq.impl.DSL
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Entity
class Satchel(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var status: String = "",
)

class SatchelView(var status: String = "")

interface SatchelRepository : JpaRepository<Satchel, Long> {
    @Query("select count(p) from Satchel p where p.status = :status")
    fun tally(status: String): Int

    @Query("select new shop.good.SatchelView(p.status) from Satchel p where p.id = :id")
    fun findViewById(id: Long): SatchelView
}

@Service
@Transactional(readOnly = true)
class SatchelViews(
    private val satchels: SatchelRepository,
    private val jdbc: JdbcTemplate,
    private val dsl: DSLContext,
) {
    fun tally() = satchels.tally("SENT")

    fun warm() {
        jdbc.execute("select 1")
    }

    fun rows() = jdbc.queryForList("select * from satchel")

    fun count() = dsl.fetchCount(DSL.table("satchel"))

    fun view(id: Long): SatchelView {
        val satchel = satchels.findById(id).orElseThrow()
        val view = SatchelView()
        view.status = satchel.status
        return view
    }

    fun projected(id: Long): SatchelView {
        val view = satchels.findViewById(id)
        view.status = view.status.lowercase()
        return view
    }

    fun shadowed(id: Long, views: List<SatchelView>): List<SatchelView> {
        val satchel = satchels.findById(id).orElseThrow()
        views.forEach { satchel -> satchel.status = "SEEN" }
        run {
            val satchel = Satchel()
            satchel.status = "NEW"
        }
        return views + SatchelView(satchel.status)
    }

    @Transactional
    fun markSeen(id: Long) {
        val satchel = satchels.findById(id).orElseThrow()
        satchel.status = "SEEN"
    }
}
