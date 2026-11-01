package shop.bad

import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import jakarta.persistence.Entity
import jakarta.persistence.EntityManager
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Version
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate

enum class Hue { RED, BLUE }

enum class Size { SMALL, LARGE }

abstract class PairConverter<K, E : Enum<E>> : AttributeConverter<E, String> {
    override fun convertToDatabaseColumn(attribute: E?): String? = attribute?.name

    override fun convertToEntityAttribute(dbData: String?): E? = null
}

@Converter(autoApply = true)
class SizeConverter : PairConverter<Hue, Size>()

@Entity
class Carton(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var hue: Hue = Hue.RED,
    var size: Size = Size.SMALL,
)

interface CartonRepository : JpaRepository<Carton, Long> {
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Carton c set c.version = 0 where c.id = :id")
    fun ship(id: Long?)

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Carton c set c.version = 0 where c.id = :id and c.id not in :kept")
    fun keepOnly(id: Long?, kept: Set<Long>)
}

@Service
class CartonService(
    private val cartons: CartonRepository,
    private val entityManager: EntityManager,
    private val transactions: TransactionTemplate,
) {
    @Transactional
    fun shipAll(items: List<Carton>, ids: List<Long>, kept: Set<Long>) {
        items.forEach { carton -> carton.id?.let { cartons.ship(it) } }
        items.forEach { carton -> transactions.executeWithoutResult { cartons.ship(carton.id) } }
        items.forEach { carton -> run { cartons.ship(carton.id) } }
        items.forEach { carton -> cartons.ship(carton.id).also { log(carton) } }
        items.forEach { if (it.id != null) cartons.ship(it.id) }
        items.forEach { carton -> carton.id?.let(cartons::ship) }
        items.map { cartons.ship(it.id) }
        items.forEach { cartons.keepOnly(it.id, kept) }
        for (item in items) note(item, items)
        for (n in ids) entityManager.createQuery(SCOPED).setParameter("id", n).setParameter("ids", ids).executeUpdate()
        for (id in ids) entityManager.createQuery(CHUNK).setParameter("ids", setOf(id)).executeUpdate()
        items.forEach { carton -> carton.id?.let { cartons.ship(it) } ?: return@forEach }
        items.forEach { carton -> return@forEach cartons.ship(carton.id) }
    }

    @Transactional
    fun flushChunks(chunks: List<List<Carton>>) {
        chunks.forEach { chunk -> chunk.forEach { cartons.saveAndFlush(it) }; entityManager.clear() }
    }

    private fun note(carton: Carton, context: Any) {
        cartons.save(carton)
    }

    private fun log(carton: Carton) = println(carton.id)

    companion object {
        const val SCOPED = "update Carton c set c.version = 0 where c.id = :id and c.id in :ids"
        const val CHUNK = "update Carton c set c.version = 0 where c.id in :ids"
    }
}

@Service
class CartonBatches(private val cartons: CartonRepository) {
    @Transactional
    fun saveEach(items: List<Carton>) {
        for (item in items) cartons.saveAll(listOf(item).filter { it.id != null })
        for (item in items) cartons.saveAll(listOf(item).map { it })
        for (item in items) cartons.saveAll(listOf(item) as Collection<Carton>)
        for (item in items) {
            val one = mutableListOf<Carton>()
            one += item
            cartons.saveAll(one)
        }
        for (item in items) {
            val one = ArrayList<Carton>()
            one.add(item)
            cartons.saveAll(one)
        }
    }
}
