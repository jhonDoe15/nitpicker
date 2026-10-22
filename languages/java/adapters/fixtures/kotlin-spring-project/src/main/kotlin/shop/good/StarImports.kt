package shop.good

import jakarta.persistence.*
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

@Service
class Parser(private val entityManager: EntityManager) {
    @Transactional
    fun parse(raw: String): Int =
        try {
            raw.toInt()
        } catch (e: NumberFormatException) {
            entityManager.clear()
            0
        }
}

@RestControllerAdvice
class StarAdvice {
    @ExceptionHandler
    fun missing(e: NoSuchElementException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.message ?: "not found")
}
