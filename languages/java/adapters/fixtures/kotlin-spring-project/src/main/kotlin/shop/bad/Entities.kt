package shop.bad

import jakarta.persistence.CascadeType
import jakarta.persistence.ElementCollection
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.ManyToMany
import jakarta.persistence.ManyToOne
import jakarta.persistence.MappedSuperclass
import jakarta.persistence.OneToMany
import jakarta.persistence.OneToOne
import jakarta.persistence.Version

enum class Status { OPEN, PAID, VOID }

@Entity
data class Customer(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long? = null,
    val name: String = "",
)

@Entity
class Tag(@Id var id: Long = 0, @Version var version: Long = 0)

@Entity
class Invoice(
    @Id @GeneratedValue var id: Long? = null,
    @Version var version: Long = 0,
    @ManyToOne var customer: Customer? = null,
    @OneToOne(fetch = FetchType.EAGER) var receipt: Tag? = null,
    @OneToMany(fetch = FetchType.EAGER) var lines: MutableList<Tag> = mutableListOf(),
    @ManyToMany(cascade = [CascadeType.ALL]) var tags: MutableList<Tag> = mutableListOf(),
    var status: Status = Status.OPEN,
    @ElementCollection var history: MutableSet<Status> = mutableSetOf(),
    @ElementCollection var limits: MutableMap<Status, Int> = mutableMapOf(),
) {
    override fun hashCode(): Int = id.hashCode()

    override fun equals(other: Any?): Boolean = other is Invoice && other.id == id
}

@MappedSuperclass
abstract class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.TABLE)
    var id: Long? = null
}

@Entity
class Payment : BaseEntity() {
    var amount: Long = 0
}

@Entity
class Refund(
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long? = null,
    @Version var version: Long = 0,
    var state: State = State.NEW,
    var priority: Priority = Priority.LOW,
) {
    enum class State { NEW, DONE }
}
