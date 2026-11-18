package shop.api

import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@PreAuthorize("hasRole('ADMIN')")
annotation class AdminOnly

@RestController
class ReportController {
    @AdminOnly
    @GetMapping("/reports")
    fun reports(): String = ""
}
