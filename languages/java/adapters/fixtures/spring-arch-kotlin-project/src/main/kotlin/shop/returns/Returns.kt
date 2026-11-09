package shop.returns

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice

class ReturnNotFound(id: Long) : RuntimeException("Return $id")

open class ReturnProblem : RuntimeException()

class ReturnLocked : ReturnProblem()

@ResponseStatus(HttpStatus.GONE)
class ReturnExpired : RuntimeException()

@Service
class ReturnService {
    fun find(id: Long): String = if (id < 0) throw ReturnNotFound(id) else "return"
}

@RestController
class ReturnController(private val service: ReturnService) {
    @GetMapping("/returns/{id}")
    fun show(@PathVariable id: Long): String = service.find(id)

    @DeleteMapping("/returns/{id}")
    fun cancel(@PathVariable id: Long) {
        if (id > 0) throw ReturnLocked()
        throw ReturnExpired()
    }

    @GetMapping("/returns/{id}/safe")
    fun safe(@PathVariable id: Long): String =
        try {
            service.find(id)
        } catch (missing: ReturnNotFound) {
            "none"
        }
}

@RestControllerAdvice
class ReturnErrors {
    @ExceptionHandler(ReturnProblem::class)
    fun problem(error: ReturnProblem): ResponseEntity<String> = ResponseEntity.status(409).body("conflict")
}
