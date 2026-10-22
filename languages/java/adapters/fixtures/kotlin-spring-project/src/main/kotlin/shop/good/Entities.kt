package shop.good

import jakarta.persistence.AttributeConverter
import jakarta.persistence.Converter
import jakarta.persistence.ElementCollection
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.ManyToMany
import jakarta.persistence.ManyToOne
import jakarta.persistence.MapKeyEnumerated
import jakarta.persistence.MappedSuperclass
import jakarta.persistence.OneToMany
import jakarta.persistence.OrderColumn
import jakarta.persistence.Transient
import jakarta.persistence.Version

enum class Status { OPEN, PAID, VOID }

enum class Currency { EUR, USD }

@Converter(autoApply = true)
class CurrencyConverter : AttributeConverter<Currency, String> {
    override fun convertToDatabaseColumn(attribute: Currency?): String? = attribute?.name

    override fun convertToEntityAttribute(dbData: String?): Currency? = dbData?.let { Currency.valueOf(it) }
}

@MappedSuperclass
abstract class AuditedEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    var id: Long? = null

    @Version
    var version: Long = 0

    override fun hashCode(): Int = javaClass.hashCode()

    override fun equals(other: Any?): Boolean = this === other || (other is AuditedEntity && id != null && id == other.id)
}

@Entity
class Tag(@Id var id: Long = 0, @Version var version: Long = 0)

@Entity
class Shipment(
    @ManyToOne(fetch = FetchType.LAZY) var tag: Tag? = null,
    @OneToMany(mappedBy = "shipment") var lines: MutableList<Line> = mutableListOf(),
    @ManyToMany var tags: MutableSet<Tag> = mutableSetOf(),
    @ManyToMany @OrderColumn var ordered: MutableList<Tag> = mutableListOf(),
    @Enumerated(EnumType.STRING) var status: Status = Status.OPEN,
    @ElementCollection @Enumerated(EnumType.STRING) var history: MutableSet<Status> = mutableSetOf(),
    @ElementCollection @MapKeyEnumerated(EnumType.STRING) var limits: MutableMap<Status, Int> = mutableMapOf(),
    var currency: Currency = Currency.EUR,
    @Transient var preview: Status = Status.OPEN,
) : AuditedEntity()

@Entity
class Line(
    @ManyToOne(fetch = FetchType.LAZY) var shipment: Shipment? = null,
    var quantity: Int = 0,
) : AuditedEntity()

@Entity
class Parcel(
    @Enumerated(EnumType.STRING) var status: Status = Status.OPEN,
    var weight: Int = 0,
) : AuditedEntity() {
    val derivedStatus: Status
        get() = if (weight > 0) status else Status.VOID

    val cachedStatus: Status by lazy { Status.OPEN }
}
