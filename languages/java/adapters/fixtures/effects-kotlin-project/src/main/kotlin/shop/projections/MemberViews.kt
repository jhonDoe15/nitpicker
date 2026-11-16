package shop.projections

class MemberViews(private val members: MemberRepository) {
    fun emails(team: String): List<String> = members.findByTeam(team).map { it.email }

    fun taken(email: String): Boolean = members.countByEmail(email) > 0

    fun known(email: String): Boolean = members.findByEmail(email) != null
}
