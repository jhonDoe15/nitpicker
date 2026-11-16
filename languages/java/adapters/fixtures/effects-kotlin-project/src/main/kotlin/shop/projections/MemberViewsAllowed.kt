package shop.projections

class MemberViewsAllowed(private val members: MemberRepository) {
    fun twoColumns(team: String): List<String> = members.findByTeam(team).map { it.email + it.name }

    fun transientColumn(team: String): List<String> = members.findByTeam(team).map { it.label }

    fun howMany(email: String): Long = members.countByEmail(email)

    fun reused(email: String): String {
        val found = members.findByEmail(email)
        return if (found != null) found.name else ""
    }
}
