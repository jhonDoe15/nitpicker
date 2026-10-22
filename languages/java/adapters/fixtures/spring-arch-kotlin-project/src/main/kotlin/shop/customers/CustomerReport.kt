package shop.customers

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class CustomerReport(private val jdbc: JdbcTemplate) {
    @GetMapping("/customers/count")
    fun count(): Int? = jdbc.queryForObject("select count(*) from customer", Int::class.java)
}
