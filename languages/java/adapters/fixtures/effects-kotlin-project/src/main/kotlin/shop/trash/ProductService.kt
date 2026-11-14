package shop.trash

import jakarta.persistence.EntityManager
import org.springframework.stereotype.Service

@Service
class ProductService(
    private val products: ProductRepository,
    private val invoices: InvoiceRepository,
    private val notes: NoteRepository,
    private val entities: EntityManager,
) {
    fun live(sku: String): List<Product> = products.findBySkuAndDeletedAtIsNull(sku)

    fun trashed(): List<Product> = products.findByDeletedAtIsNotNull()

    fun ownedBy(owner: String): List<Product> = products.findByOwner(owner)

    fun like(pattern: String): List<Product> = products.matching(pattern)

    fun bySku(sku: String): List<*> =
        entities
            .createQuery("select p from Product p where p.sku = :sku", Product::class.java)
            .setParameter("sku", sku)
            .resultList

    fun liveBy(sku: String): List<*> =
        entities
            .createQuery("select p from Product p where p.sku = :sku and p.deletedAt is null", Product::class.java)
            .setParameter("sku", sku)
            .resultList

    fun invoice(number: String): List<Invoice> = invoices.findByNumber(number)

    fun byTitle(title: String): List<Note> = notes.findByTitle(title)

    fun byAuthor(author: String): List<Note> = notes.findByAuthor(author)
}
