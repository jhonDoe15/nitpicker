package shop.good

import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import jakarta.persistence.Entity
import jakarta.persistence.EntityManager
import java.io.File
import org.springframework.data.domain.*
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class Grain { FINE, COARSE }

enum class Finish { MATTE, GLOSS }

abstract class LabelConverter<K, E : Enum<E>> : AttributeConverter<E, String> {
    override fun convertToDatabaseColumn(attribute: E?): String? = attribute?.name

    override fun convertToEntityAttribute(dbData: String?): E? = null
}

@Converter(autoApply = true)
class GrainConverter : LabelConverter<String, Grain>()

open class FinishColumns : AttributeConverter<Finish, String> {
    override fun convertToDatabaseColumn(attribute: Finish?): String? = attribute?.name

    override fun convertToEntityAttribute(dbData: String?): Finish? = dbData?.let { Finish.valueOf(it) }
}

@Converter(autoApply = true)
class FinishConverter : FinishColumns()

@Entity
class Crate(
    var grain: Grain = Grain.FINE,
    var finish: Finish = Finish.MATTE,
    var label: String = "",
) : AuditedEntity()

interface CrateRepository : JpaRepository<Crate, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Crate c set c.version = 0 where c.id = :id")
    fun ship(id: Long?): Int

    @Query("select c.id from Crate c where c.label = :label")
    fun idsLabelled(label: String): List<Long>

    @Query("select c from Crate c where c.label = '\$label'")
    fun dollarLabelled(): List<Crate>
}

@Service
class CrateService(
    private val crates: CrateRepository,
    private val audits: AuditRepository,
    private val entityManager: EntityManager,
) {
    @Transactional
    fun archive(items: List<Crate>, labels: List<String>, chunks: List<List<Long>>, files: List<File>) {
        val shipped = items.map { crates.ship(it.id) }
        val found = mutableListOf<Long>()
        for (label in labels) crates.idsLabelled(label).forEach { found.add(it) }
        for (item in items) audits.save(item)
        files.forEach { it.delete() }
        for (item in items) {
            val batch = mutableListOf(item)
            batch.addAll(items)
            crates.saveAll(batch)
        }
        chunks.forEach { chunk ->
            val query = entityManager.createQuery("update Crate c set c.version = 0 where c.id in :ids")
            query.setParameter("ids", chunk)
            query.executeUpdate()
        }
        chunks.forEach { chunk -> entityManager.createQuery(CHUNK).setParameter("ids", chunk).executeUpdate() }
        println(shipped.size + found.size)
    }

    private fun Crate.delete() {
        crates.delete(this)
    }

    companion object {
        const val CHUNK = "update Crate c set c.version = 0 where c.id in :ids"
    }
}

class Shelf(val id: Long?, val labels: Set<String>)

interface ShelfRepository : JpaRepository<Crate, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Crate c set c.label = '' where c.label in :labels")
    fun clearLabels(labels: Set<String>)
}

@Service
class ShelfService(private val shelves: ShelfRepository, private val crates: CrateRepository) {
    @Transactional
    fun tidy(items: List<Shelf>, others: List<Crate>, grouped: List<List<Crate>>) {
        items.map { it.labels }.forEach { labels -> shelves.clearLabels(labels) }
        items.zip(others) { shelf, _ -> shelf.labels }.forEach { shelves.clearLabels(it) }
        items.associateBy({ it.id }, { it.labels }).values.forEach { shelves.clearLabels(it) }
        for (group in grouped) {
            val batch = mutableListOf<Crate>()
            for (crate in group) batch.add(crate)
            crates.saveAll(batch)
        }
    }
}
