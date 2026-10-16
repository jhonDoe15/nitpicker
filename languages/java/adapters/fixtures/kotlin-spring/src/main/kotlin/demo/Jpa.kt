package demo

import jakarta.persistence.*
import org.hibernate.annotations.Immutable

class Tag

@Entity // violation: JpaEntityClass
data class DataEntity(@Id val id: Long = 0, @Version val version: Long = 0)

@Entity // violation: JpaEntityClass
final class FinalEntity(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) val id: Long, // violation: JpaSequenceIds
    @Version var version: Long,
)

@Entity // violation: JpaVersion
open class Parent(@Id @GeneratedValue(strategy = GenerationType.SEQUENCE) var id: Long?) {
    @ManyToOne // violation: JpaLazyFetching
    var owner: Parent? = null

    @ManyToOne(fetch = FetchType.LAZY)
    var lazyOwner: Parent? = null

    @OneToMany(mappedBy = "owner", fetch = FetchType.EAGER) // violation: JpaLazyFetching
    var children: MutableList<Parent> = mutableListOf()

    @ManyToMany(cascade = [CascadeType.ALL]) // violation: JpaManyToManyCascade, JpaManyToManySet
    var tags: List<Tag> = listOf()

    @ManyToMany
    @OrderColumn
    var ordered: List<Tag> = listOf()

    @ManyToMany
    var unique: Set<Tag> = setOf()
}

@MappedSuperclass // violation: JpaVersion
open class Base(@Id var id: Long = 0)

@Entity
class Child : Base()

@Entity
@Immutable
class Frozen(@Id val id: Long)
