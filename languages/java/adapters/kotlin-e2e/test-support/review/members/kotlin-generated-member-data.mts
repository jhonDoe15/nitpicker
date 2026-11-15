const CATALOG = `package demo.catalog

import java.time.Instant

data class Category(
    val name: String,
    val parent: Category?,
    val children: MutableList<Category>,
)

data class Folder(val name: String, val folders: List<Folder>)

data class Shipment(val id: String, val parcels: List<Parcel>)

data class Parcel(val label: String) {
    var shipment: Shipment? = null
}

open class Audited(val createdAt: Instant)

data class Invoice(val total: Long, val issuedAt: Instant) : Audited(issuedAt)

abstract class Entry {
    abstract val id: String
}

data class Refund(override val id: String, val amount: Long) : Entry()
`;

export const GENERATED_MEMBER_FILES = {
  'src/main/kotlin/demo/catalog/Catalog.kt': CATALOG,
};

export const GENERATED_MEMBER_FINDINGS = [
  'GeneratedEqualsSkipsSuperclass Invoice',
  'GeneratedMemberCycle Category.parent',
];

export const GENERATED_MEMBER_EXCEPTIONS = [
  { rule: 'pmd/GeneratedMemberCycle', glob: 'src/main/kotlin/demo/catalog/*' },
  { rule: 'pmd/GeneratedEqualsSkipsSuperclass', glob: 'src/main/kotlin/demo/catalog/*' },
];
