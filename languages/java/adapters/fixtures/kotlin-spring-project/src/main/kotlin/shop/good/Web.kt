package shop.good

import jakarta.validation.Valid
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

data class OrderRequest(val item: String)
data class OrderView(val id: Long)

private val logger = LoggerFactory.getLogger(OrderController::class.java)

@RestController
@RequestMapping("/orders")
class OrderController {
    @GetMapping
    fun all(): List<OrderView> = emptyList()

    @PostMapping
    fun create(@Valid @RequestBody request: OrderRequest): ResponseEntity<OrderView> = ResponseEntity.ok(OrderView(1))

    @PutMapping("/tags")
    fun tags(@RequestBody tags: Map<String, String>): ResponseEntity<Void> = ResponseEntity.noContent().build()

    @PostMapping("/text")
    fun text(@RequestBody text: String): String = text

    @GetMapping("/{id}")
    suspend fun find(@PathVariable id: Long): OrderView = OrderView(id)

    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long) {
        listOf(1).firstOrNull { return }
    }
}

class OrderMissing(message: String) : RuntimeException(message)

@RestControllerAdvice
class Errors {
    @ExceptionHandler
    fun missing(e: OrderMissing): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "missing")

    @ExceptionHandler
    fun handle(e: Exception): ProblemDetail {
        logger.error("failed: {}", e.message, e)
        val text = e.message
        logger.warn("text {}", text)
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong")
    }
}
