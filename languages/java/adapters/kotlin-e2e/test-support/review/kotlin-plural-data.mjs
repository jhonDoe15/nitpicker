export const PLURALS = `package demo.orders

data class Query(val tag: String, val tags: List<String>)

data class Page(val tag: String, val size: Int)

class Search(val child: String, val children: List<String>)

class Router(private val route: String, private val routes: List<String>) {
    fun resolve(path: String): String = if (routes.contains(path)) path else route
}

fun deliver(recipient: String? = null, recipients: List<String> = emptyList()): String =
    recipient.orEmpty() + recipients.joinToString()

fun hasRole(role: String, roles: Set<String>): Boolean = roles.any { it.equals(role, ignoreCase = true) }

fun plurals(): String =
    deliver(recipient = "a", recipients = listOf("b")) + hasRole("r", setOf("r")) +
        Router("a", listOf("b")).resolve("a") + Search("c", listOf()).children + Page("t", 1).size +
        Query("t", listOf()).tags
`;

export const PLURAL_FINDINGS = [
  'SingularAndPluralMember Query.tags',
  'SingularAndPluralMember Search.children',
  'SingularAndPluralMember deliver.recipients',
];
