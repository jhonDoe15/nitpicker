package shop.billing

import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.server.ServerWebExchange

@Service
class Refunds {
    fun refund(exchange: ServerWebExchange): String {
        if (exchange.attributes.isEmpty()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND)
        }
        return "refunded"
    }
}
