package shop.security

import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Component

@Component
class TokenProvider {
    fun attach(response: ResponseEntity<String>, token: String): String = token + response
}
