package shop.good

import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.nio.NioServerSocketChannel
import jakarta.annotation.PostConstruct
import jakarta.annotation.PreDestroy
import java.io.ByteArrayOutputStream
import java.util.Timer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelChildren
import org.springframework.beans.factory.DisposableBean
import org.springframework.context.SmartLifecycle
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.event.ContextClosedEvent
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service

@Service
class ReleasedWorkers(private val injected: ExecutorService) {
    private val pool = Executors.newFixedThreadPool(4)
    private val timer = Timer("audit", true)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val buffer = ByteArrayOutputStream()

    fun submit(task: Runnable) {
        pool.execute(task)
        injected.execute(task)
        buffer.write(1)
    }

    @PreDestroy
    fun release() {
        pool.shutdown()
        if (!pool.awaitTermination(5, TimeUnit.SECONDS)) {
            pool.shutdownNow()
        }
        scope.cancel()
        stopTimer()
    }

    private fun stopTimer() = timer.cancel()
}

@Component
class DisposablePool : DisposableBean {
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)

    override fun destroy() = Shutdowns.shutdownQuietly(pool)
}

@Component
class ClosingPool : AutoCloseable {
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)

    override fun close() = pool.close()
}

@Component
class ManagedPool : SmartLifecycle {
    private val pool = Executors.newSingleThreadExecutor()

    override fun start() = Unit

    override fun stop() {
        pool.shutdownNow()
    }

    override fun isRunning() = !pool.isShutdown
}

@Component
class ClosedListener {
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)

    @EventListener(ContextClosedEvent::class)
    fun closed() = pool.shutdown()
}

@Configuration(proxyBeanMethods = false)
class PoolConfig {
    @Bean(destroyMethod = "halt")
    fun haltable() = Haltable()
}

@Component
class Haltable {
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)

    fun halt() = pool.shutdown()
}

@Component
class ScopedRelease {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)

    @PreDestroy
    fun stop() {
        scope.coroutineContext.cancelChildren()
        with(pool) { shutdown() }
    }
}

object Shutdowns {
    fun shutdownQuietly(pool: ExecutorService) {
        pool.shutdownNow()
    }
}

@Component
class GuardedNettyServer {
    private val boss = NioEventLoopGroup(1)
    private val workers = NioEventLoopGroup()

    @PostConstruct
    fun start() {
        try {
            ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel::class.java).bind(1884).sync()
        } catch (failure: InterruptedException) {
            stop()
            throw failure
        }
    }

    @PreDestroy
    fun stop() {
        boss.shutdownGracefully()
        workers.shutdownGracefully()
    }
}

@Component
class LazyPoolServer {
    private val ticks = Executors.newSingleThreadScheduledExecutor()
    private val server = PlainServer()

    @PostConstruct
    fun start() {
        server.start()
        ticks.scheduleAtFixedRate(server::sweep, 1, 1, TimeUnit.SECONDS)
    }

    @PreDestroy
    fun stop() {
        ticks.shutdownNow()
        server.stop()
    }
}

class PlainServer {
    fun start() = Unit

    fun stop() = Unit

    fun sweep() = Unit
}

class NotABean {
    private val pool = Executors.newSingleThreadExecutor()

    fun run(task: Runnable) = pool.execute(task)
}
