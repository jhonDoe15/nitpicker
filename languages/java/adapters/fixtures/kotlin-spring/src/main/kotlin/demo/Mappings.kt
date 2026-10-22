package demo

import jakarta.persistence.ElementCollection
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Transient
import jakarta.persistence.Version

enum class Level { LOW, HIGH }

@Entity
open class Gauge(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) open var id: Long?,
    @Version open var version: Long = 0,
) {
    open var level: Level = Level.LOW // violation: JpaEnumString

    @Enumerated(EnumType.STRING)
    open var mode: Level = Level.HIGH

    @Enumerated(EnumType.ORDINAL)
    open var rank: Level = Level.LOW // violation: JpaEnumString

    @Transient
    open var skipped: Level = Level.LOW

    @ElementCollection
    open var levels: MutableSet<Level> = mutableSetOf() // violation: JpaEnumString

    @ElementCollection
    @Enumerated(EnumType.STRING)
    open var named: MutableSet<Level> = mutableSetOf()

    @ElementCollection
    @Enumerated(EnumType.STRING)
    open var byKey: MutableMap<Level, String> = mutableMapOf() // violation: JpaEnumString

    open var label: String = ""
}

@Entity
open class Account(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) open var id: Long?,
    @Version open var version: Long = 0,
) {
    override fun hashCode(): Int = id.hashCode() // violation: JpaIdentityHashCode

    override fun equals(other: Any?): Boolean = other is Account && other.id == id
}

@Entity
open class Stable(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) open var id: Long?,
    @Version open var version: Long = 0,
) {
    override fun hashCode(): Int = javaClass.hashCode()
}

@Entity // violation: JpaEntityClass, JpaIdentityHashCode
data class Ticket(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) val id: Long,
    @Version val version: Long,
)
