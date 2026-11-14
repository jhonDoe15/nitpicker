package shop.api

import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/invoices")
@PreAuthorize("hasRole('BILLING')")
class InvoiceController {
    @GetMapping
    fun list(): String = ""

    @GetMapping("/{id}")
    fun get(): String = ""

    @PostMapping
    fun create(): String = ""
}
