package shop.good

import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import jakarta.persistence.Entity
import jakarta.persistence.EntityManager
import jakarta.persistence.MappedSuperclass
import org.springframework.data.domain.Page
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class Shade { LIGHT, DARK }

abstract class NameConverter<E : Enum<E>>(private val type: Class<E>) : AttributeConverter<E, String> {
    override fun convertToDatabaseColumn(attribute: E?): String? = attribute?.name

    override fun convertToEntityAttribute(dbData: String?): E? = dbData?.let { java.lang.Enum.valueOf(type, it) }
}

@Converter(autoApply = true)
class ShadeConverter : NameConverter<Shade>(Shade::class.java)

@MappedSuperclass
abstract class Shaded : AuditedEntity() {
    abstract val shade: Shade
}

@Entity
class Swatch(
    var primary: Shade = Shade.LIGHT,
    var tone: Tone = Tone.WARM,
) : Shaded() {
    override val shade: Shade
        get() = primary
}

interface SwatchRepository : JpaRepository<Swatch, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Swatch s set s.primary = :shade where s.id in :ids")
    fun recolor(ids: Collection<Long>, shade: Shade): Int

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Swatch s set s.version = 0 where s.id in :ids")
    fun retire(ids: Collection<Long>): Int

    @Query("select s.id from Swatch s where s.primary = :shade")
    fun idsWith(shade: Shade): List<Long>
}

@Service
class SwatchService(private val swatches: SwatchRepository, private val entityManager: EntityManager) {
    @Transactional
    fun recolor(items: List<Swatch>, ids: List<Long>, size: Int, groups: Map<Shade, List<Long>>) {
        items.groupBy { it.primary }.forEach { (shade, group) -> swatches.recolor(group.map { it.id!! }, shade) }
        ids.chunked(CHUNK).forEach { chunk -> swatches.retire(chunk.toSet()) }
        ids.chunked(size.coerceAtLeast(1)).forEach { swatches.retire(it) }
        ids.chunked(CHUNK).withIndex().forEach { (_, chunk) -> swatches.retire(chunk) }
        ids.chunked(CHUNK).forEach(swatches::retire)
        groups.forEach { entry -> swatches.recolor(entry.value, entry.key) }
        val buckets = mutableMapOf<Shade, MutableList<Long>>()
        items.forEach { buckets.getOrPut(it.primary) { mutableListOf() }.add(it.id!!) }
        buckets.forEach { (shade, bucket) -> swatches.recolor(bucket, shade) }
        items.chunked(CHUNK).forEach { chunk ->
            val chunkIds = buildList { chunk.forEach { add(it.id!!) } }
            swatches.retire(chunkIds)
        }
    }

    @Transactional
    fun sweep(sorted: java.util.SortedSet<Long>, page: Page<Long>) {
        repeat(2) { swatches.retire(sorted) }
        repeat(2) { swatches.retire(page.content) }
        while (true) {
            val batch = swatches.idsWith(Shade.DARK)
            if (batch.isEmpty()) break
            swatches.retire(batch)
        }
    }

    @Transactional(readOnly = true)
    fun lookups(shades: List<Shade>): List<Long> {
        val byShade = shades.associateWith { swatches.idsWith(it) }
        val counts = shades.map { swatches.idsWith(it).size.toLong() }
        return shades.flatMap(swatches::idsWith) + byShade.values.flatten() + counts
    }

    @Transactional
    fun batches(items: List<Swatch>) {
        items.forEachIndexed { index, item ->
            entityManager.persist(item)
            if (index % CHUNK == 0) {
                entityManager.flush()
                entityManager.clear()
            }
        }
        items.chunked(CHUNK).forEach { chunk ->
            swatches.saveAllAndFlush(chunk)
            entityManager.clear()
        }
        items.chunked(CHUNK).forEach { swatches.saveAll(listOf(*it.toTypedArray())) }
        items.chunked(CHUNK).forEach { store(it) }
        for (chunk in items.chunked(CHUNK)) store(chunk)
    }

    @Transactional
    fun chunkUpdates(ids: List<Long>) {
        ids.chunked(CHUNK).forEach { chunk ->
            entityManager.createQuery("update Swatch s set s.version = 0 where s.id in :ids")
                .setParameter("ids", chunk)
                .executeUpdate()
        }
    }

    private fun store(item: Swatch) {
        swatches.save(item)
    }

    private fun store(chunk: List<Swatch>) {
        swatches.saveAll(chunk)
    }

    private companion object {
        const val CHUNK = 500
    }
}
