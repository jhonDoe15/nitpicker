package shop.good

import io.github.resilience4j.retry.annotation.Retry
import io.micrometer.core.annotation.Timed
import jakarta.validation.constraints.Positive
import org.springframework.stereotype.Service

@Service
class SyncGateway(private val remote: RemoteCalls) {
    fun sync() {
        remote.fetch()
        remote.timed()
    }
}

@Service
class RemoteCalls {
    @Retry(name = "remote")
    fun fetch() = Unit

    @Timed("remote.sync")
    fun timed() = Unit
}

@Service
class Unvalidated {
    fun place() {
        quantity(1)
    }

    fun quantity(@Positive count: Int) = Unit
}
