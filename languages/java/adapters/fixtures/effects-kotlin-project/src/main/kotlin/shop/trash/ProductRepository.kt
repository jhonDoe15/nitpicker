package shop.trash

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query

interface ProductRepository : JpaRepository<Product, Long> {
    fun findBySkuAndDeletedAtIsNull(sku: String): List<Product>

    fun findByOwnerAndDeletedAtIsNull(owner: String): List<Product>

    fun findByIdInAndDeletedAtIsNull(ids: List<Long>): List<Product>

    fun findBySkuStartingWithAndDeletedAtIsNull(prefix: String): List<Product>

    fun findBySkuEndingWithAndDeletedAtIsNull(suffix: String): List<Product>

    fun findBySkuContainingAndDeletedAtIsNull(part: String): List<Product>

    fun countByOwnerAndDeletedAtIsNull(owner: String): Long

    fun existsBySkuAndDeletedAtIsNull(sku: String): Boolean

    fun findByDeletedAtIsNotNull(): List<Product>

    @Query("select p from Product p where p.owner = :owner and p.deletedAt is null order by p.sku")
    fun inOrderOf(owner: String): List<Product>

    @Query("select p from Product p where p.sku = :sku and p.deletedAt is null")
    fun visible(sku: String): List<Product>

    @Query("select p from Product p where p.id = :id and p.deletedAt is null")
    fun visibleById(id: Long): List<Product>

    fun findByOwner(owner: String): List<Product>

    @Query("select p from Product p where p.sku like :pattern")
    fun matching(pattern: String): List<Product>
}

interface InvoiceRepository : JpaRepository<Invoice, Long> {
    fun findByNumber(number: String): List<Invoice>

    fun findByNumberStartingWith(prefix: String): List<Invoice>

    fun findByNumberEndingWith(suffix: String): List<Invoice>

    fun findByNumberContaining(part: String): List<Invoice>

    fun findByNumberIn(numbers: List<String>): List<Invoice>
}

interface NoteRepository : JpaRepository<Note, Long> {
    fun findByTitleAndArchivedFalse(title: String): List<Note>

    fun findByAuthorAndArchivedFalse(author: String): List<Note>

    fun findByTitle(title: String): List<Note>

    fun findByAuthor(author: String): List<Note>

    fun findByTitleContaining(part: String): List<Note>
}
