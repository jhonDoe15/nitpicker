package shop.accounts

import java.sql.Connection
import java.sql.ResultSet
import javax.sql.DataSource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

typealias Rows = List<ResultSet>

@Service
class AccountService(private val jdbc: JdbcTemplate) {
    fun rows(): Rows = emptyList()

    fun view(id: Long): AccountView = AccountView(id, jdbc.toString())

    internal fun raw(source: DataSource): Connection = source.connection
}

data class AccountView(val id: Long, val name: String)

data class AccountHandle(val source: DataSource)

fun connect(source: DataSource): Connection = source.connection
