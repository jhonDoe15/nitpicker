package shop.api

import jakarta.annotation.security.PermitAll
import jakarta.annotation.security.RolesAllowed
import org.springframework.security.access.annotation.Secured
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/accounts")
class AccountController {
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    fun list(): List<String> = emptyList()

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER')")
    fun get(): String = ""

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    fun create(): String = ""

    @PutMapping("/{id}")
    @Secured("ROLE_ADMIN")
    fun update(): String = ""

    @DeleteMapping("/{id}")
    @RolesAllowed("ADMIN")
    fun delete() {}

    @GetMapping("/ping")
    @PermitAll
    fun ping(): String = "pong"

    @GetMapping("/export")
    fun export(): List<String> = emptyList()
}
