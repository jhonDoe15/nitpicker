package demo

import jakarta.validation.Valid
import org.apache.commons.logging.Log
import org.apache.commons.logging.LogFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice

class OrderMissing(message: String) : RuntimeException(message)

@RestController
class Reports {
    @GetMapping("/any")
    fun any(): Any = Unit // violation: SpringTypedResponse

    @GetMapping("/map")
    fun map(): Map<String, Any> = emptyMap() // violation: SpringTypedResponse

    @GetMapping("/list")
    fun list(): List<Map<String, Any?>> = emptyList() // violation: SpringTypedResponse

    @GetMapping("/entity")
    fun entity(): ResponseEntity<*> = ResponseEntity.ok().build<Any>() // violation: SpringTypedResponse

    @GetMapping("/typed")
    fun typed(): List<OrderDto> = emptyList()

    @GetMapping("/strings")
    fun strings(): Map<String, String> = emptyMap()

    @GetMapping("/void")
    fun none(): ResponseEntity<Void> = ResponseEntity.noContent().build()

    @GetMapping("/null")
    fun nothing(): OrderDto? {
        return null // violation: SpringTypedResponse
    }

    @PostMapping("/post")
    fun post(
        @RequestBody @Valid payload: Map<String, Any>, // violation: SpringTypedRequestBody
        @RequestBody @Valid anything: Any, // violation: SpringTypedRequestBody
        @RequestBody @Valid names: Map<String, String>,
        @RequestBody @Valid items: List<Map<String, Any>>, // violation: SpringTypedRequestBody
        @RequestBody @Valid order: OrderDto,
    ) {}
}

@RestControllerAdvice
class Problems {
    private val log: Log = LogFactory.getLog(Problems::class.java)

    @ExceptionHandler(IllegalStateException::class)
    fun state(e: IllegalStateException): ProblemDetail {
        log.warn("state", e)
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "") // violation: SpringNoErrorLeak
    }

    @ExceptionHandler(java.io.IOException::class)
    fun io(e: java.io.IOException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, "failed: $e") // violation: SpringNoErrorLeak

    @ExceptionHandler(Exception::class)
    fun fallback(e: Exception): ProblemDetail {
        e.printStackTrace() // violation: SpringNoErrorLeak
        log.error(e.message, e)
        return ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    }

    @ExceptionHandler(OrderMissing::class)
    fun own(e: OrderMissing): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "")

    @ExceptionHandler(IllegalArgumentException::class)
    fun bad(e: IllegalArgumentException): ProblemDetail {
        val text = e.message // violation: SpringNoErrorLeak
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, text ?: "")
    }

    @ExceptionHandler(NullPointerException::class)
    fun missing(e: NullPointerException): ProblemDetail {
        val text = e.message
        log.warn(text)
        return ProblemDetail.forStatus(HttpStatus.BAD_REQUEST)
    }
}
