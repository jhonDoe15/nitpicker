package shop.bad

import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.nio.NioServerSocketChannel
import jakarta.annotation.PostConstruct
import jakarta.annotation.PreDestroy
import java.util.Timer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.apache.kafka.clients.admin.AdminClient
import org.springframework.beans.factory.InitializingBean
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service

@Service
class LeakyWorkers {
    private val pool = Executors.newFixedThreadPool(4)
    private val timer = Timer("audit")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val admin = AdminClient.create(mapOf<String, Any>())
    private val wrapped = Executors.unconfigurableExecutorService(Executors.newSingleThreadExecutor())
    private lateinit var loops: NioEventLoopGroup
    private lateinit var poller: Thread

    @PostConstruct
    fun start() {
        loops = NioEventLoopGroup(2)
        poller = Thread(::poll)
        poller.start()
    }

    private fun poll() = pool.execute {}

    fun submit(task: Runnable) {
        pool.execute(task)
        wrapped.execute(task)
        timer.purge()
        loops.execute(task)
        admin.listTopics()
        scope.launchAudit()
    }

    fun shutdown() {
        pool.shutdown()
    }
}

private fun CoroutineScope.launchAudit(): String = coroutineContext.toString()

@Component
class CachedPools {
    private val pool: ExecutorService = Executors.newCachedThreadPool()

    fun run(task: Runnable) = pool.execute(task)
}

@Component
class LeakyNettyServer {
    private val boss = NioEventLoopGroup(1)
    private val workers = NioEventLoopGroup()

    @PostConstruct
    fun start() {
        val bootstrap = ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel::class.java)
        bootstrap.bind(1883).sync()
    }

    @PreDestroy
    fun stop() {
        boss.shutdownGracefully()
        workers.shutdownGracefully()
    }
}

@Component
class LeakyScheduledServer : InitializingBean {
    private val ticks = Executors.newSingleThreadScheduledExecutor()
    private val server = ShopServer()

    override fun afterPropertiesSet() {
        ticks.scheduleAtFixedRate(server::sweep, 1, 1, TimeUnit.SECONDS)
        server.start()
    }

    @PreDestroy
    fun stop() {
        ticks.shutdownNow()
        server.stop()
    }
}

@Component
class LeakyInitServer {
    private val loops = NioEventLoopGroup()

    init {
        ServerBootstrap().group(loops).channel(NioServerSocketChannel::class.java).bind(1885).sync()
    }

    @PreDestroy
    fun stop() {
        loops.shutdownGracefully()
    }
}

class ShopServer {
    fun start() = Unit

    fun stop() = Unit

    fun sweep() = Unit
}
