package demo

import java.util.concurrent.CompletableFuture
import org.springframework.cache.annotation.Cacheable
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Controller
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class Visibility {
    @Transactional // violation: SpringProxyMethodVisibility
    private fun hidden() {}

    @Transactional // violation: SpringProxyMethodVisibility
    internal fun internalOne() {}

    @Cacheable("a") // violation: SpringProxyMethodVisibility
    final fun closed(): String = ""

    @Transactional
    fun fine() {}
}

@Service
@Transactional // violation: SpringProxyMethodVisibility
final class FinalBean

@Service
class SelfCalls {
    @Transactional(readOnly = true)
    fun annotated() {}

    @Async("pool")
    fun later(): CompletableFuture<String> = CompletableFuture.completedFuture("")

    @Transactional
    fun outer() {
        annotated() // violation: SpringProxySelfCall
        this.later() // violation: SpringProxySelfCall
        helper()
    }

    @Transactional
    fun plain() {}

    @Transactional
    fun caller() {
        plain()
    }

    fun helper() {}
}

@Service
class Transactions {
    @jakarta.transaction.Transactional // violation: SpringTransactionalAnnotation
    fun old() {}

    @Transactional(propagation = Propagation.REQUIRES_NEW) // violation: SpringNoRequiresNew
    fun nested() {}

    @Transactional
    fun swallow() {
        try { work() } catch (e: Exception) { log(e) } // violation: SpringNoSwallowedTransactionException
        try { work() } catch (e: DataAccessException) { throw e }
        try { work() } catch (e: java.io.IOException) { }
        val task = { try { work() } catch (e: RuntimeException) { } }
        task()
    }

    private fun work() {}
    private fun log(e: Exception) {}
}

@Controller
@Transactional // violation: SpringNoTransactionalController
class Pages {
    @Transactional // violation: SpringNoTransactionalController
    fun page() {}
}

@Service
class Jobs {
    @Async // violation: SpringAsyncExecutor, SpringAsyncExecutor
    fun fire() {}

    @Async("pool") // violation: SpringAsyncExecutor
    fun again(): String = ""

    @Scheduled(fixedRate = 1000) // violation: SpringScheduledFixedDelay
    fun tick() {}

    @Scheduled(fixedDelay = 1000)
    fun tock() {}
}
