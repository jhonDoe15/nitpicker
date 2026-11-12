package shop.bad

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker
import io.github.resilience4j.retry.annotation.Retry
import io.micrometer.core.annotation.Timed
import io.micrometer.observation.annotation.Observed
import jakarta.annotation.security.PermitAll
import jakarta.annotation.security.RolesAllowed
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import org.aspectj.lang.ProceedingJoinPoint
import org.aspectj.lang.annotation.Around
import org.aspectj.lang.annotation.Aspect
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.validation.annotation.Validated

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
@Cacheable("rates")
annotation class CachedRate

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class Logged

@Aspect
@Component
class LoggingAspect {
    @Around("@annotation(logged)")
    fun log(point: ProceedingJoinPoint, logged: Logged): Any? = point.proceed()
}

@Service
class RemoteSync {
    fun sync() {
        fetch()
        open()
        timed()
        observed()
        admin()
        rate()
        logged()
        anyone()
    }

    @Retry(name = "remote")
    fun fetch() = Unit

    @CircuitBreaker(name = "remote")
    fun open() = Unit

    @Timed("remote.sync")
    fun timed() = Unit

    @Observed(name = "remote.sync")
    fun observed() = Unit

    @RolesAllowed("ADMIN")
    fun admin() = Unit

    @CachedRate
    fun rate() = 1

    @Logged
    fun logged() = Unit

    @PermitAll
    fun anyone() = Unit

    @Retry(name = "remote")
    private fun hiddenRetry() = Unit

    @Logged
    protected fun hiddenLog() = Unit
}

@Service
@Validated
class Checkout {
    fun place(form: OrderForm, codes: List<String>) {
        verify(form)
        quantity(1)
        codes(codes)
        plain("x")
    }

    fun verify(@Valid form: OrderForm) = Unit

    fun quantity(@Positive count: Int) = Unit

    fun codes(codes: List<@NotBlank String>) = Unit

    fun plain(text: String) = Unit

    protected fun hidden(@NotBlank text: String) = Unit

    private fun trimmed(@NotBlank text: String) = text.trim()

    fun trim(text: String) = trimmed(text)

    @NotBlank
    fun getLabel(): String = "label"

    fun label() = getLabel()
}

data class OrderForm(val sku: String)
