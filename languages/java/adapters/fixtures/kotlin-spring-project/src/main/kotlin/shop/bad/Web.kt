package shop.bad

import com.fasterxml.jackson.databind.JsonNode
import org.slf4j.LoggerFactory
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.*

data class OrderRequest(val item: String)

@RestController
@RequestMapping("/orders")
@CrossOrigin
class OrderController {
    @RequestMapping("/all")
    fun all(): List<Map<String, Any>> = emptyList()

    @PostMapping
    @ResponseBody
    fun create(@RequestBody request: OrderRequest): ResponseEntity<*> = ResponseEntity.ok(request)

    @PutMapping
    fun update(@RequestBody payload: Map<String, Any>): Any = payload

    @GetMapping("/{id}")
    fun find(@PathVariable id: Long): OrderRequest? {
        if (id < 0) return null
        return OrderRequest("x")
    }

    @PostMapping("/raw")
    suspend fun raw(@RequestBody @jakarta.validation.Valid node: JsonNode): JsonNode = node
}

@Controller
@ResponseBody
class PageController

@RestControllerAdvice
class Errors {
    private val log = LoggerFactory.getLogger(Errors::class.java)

    @ExceptionHandler
    fun handle(e: Exception): ProblemDetail {
        log.error("failed", e)
        return ProblemDetail.forStatusAndDetail(org.springframework.http.HttpStatus.BAD_REQUEST, e.message ?: "x")
    }

    @ExceptionHandler
    fun state(e: IllegalStateException): ResponseEntity<String> {
        val text = "error: $e"
        return ResponseEntity.badRequest().body(text)
    }

    @ExceptionHandler
    fun trace(e: MyError): String = e.stackTraceToString()
}

class MyError : RuntimeException()
