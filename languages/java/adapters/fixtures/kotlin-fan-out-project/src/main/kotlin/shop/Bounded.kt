package shop

import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

enum class Region(val url: String) {
    EU("https://eu.example"),
    US("https://us.example"),
}

class Bounded(private val pages: Pages, private val client: HttpClient) {
    private val permits = Semaphore(8)
    private val gate = java.util.concurrent.Semaphore(4)
    private val pool = Executors.newFixedThreadPool(8)
    private val limited = Dispatchers.IO.limitedParallelism(8)
    private val mirrors = listOf("https://a.example", "https://b.example")

    suspend fun permitted(urls: List<String>) = coroutineScope {
        urls.map { async { permits.withPermit { pages.page(it) } } }.awaitAll()
    }

    suspend fun acquired(urls: List<String>) = coroutineScope {
        urls.forEach {
            launch {
                permits.acquire()
                try {
                    pages.page(it)
                } finally {
                    permits.release()
                }
            }
        }
    }

    suspend fun dispatched(urls: List<String>) = coroutineScope {
        urls.map { async(limited) { pages.page(it) } }.awaitAll()
    }

    suspend fun helperPermit(urls: List<String>) = coroutineScope {
        urls.map { async { pages.guarded(it) } }.awaitAll()
    }

    suspend fun chunks(urls: List<String>) = coroutineScope {
        urls.chunked(20).forEach { chunk -> chunk.map { async { pages.page(it) } }.awaitAll() }
    }

    suspend fun chunkLoop(urls: List<String>) = coroutineScope {
        for (chunk in urls.chunked(20)) {
            chunk.map { async { pages.page(it) } }.awaitAll()
        }
    }

    suspend fun literal() = coroutineScope {
        listOf("https://a.example", "https://b.example").map { async { pages.page(it) } }.awaitAll()
    }

    suspend fun property() = coroutineScope {
        mirrors.map { async { pages.page(it) } }.awaitAll()
    }

    suspend fun regions() = coroutineScope {
        Region.entries.map { async { pages.page(it.url) } }.awaitAll()
    }

    suspend fun workers(channel: Channel<String>, workers: Int) = coroutineScope {
        repeat(workers) { launch { for (url in channel) pages.page(url) } }
    }

    suspend fun numbered(channel: Channel<String>, workers: Int) = coroutineScope {
        for (i in 1..workers) {
            launch { for (url in channel) pages.page(url) }
        }
    }

    suspend fun until(channel: Channel<String>, concurrency: Int) = coroutineScope {
        (0 until concurrency).map { async { pages.page(channel.receive()) } }.awaitAll()
    }

    suspend fun awaited(urls: List<String>) = coroutineScope {
        urls.map { async { pages.page(it) }.await() }
    }

    suspend fun awaitedLoop(urls: List<String>) = coroutineScope {
        for (url in urls) {
            val page = async { pages.page(url) }
            page.await()
        }
    }

    suspend fun firstTen(urls: List<String>) = coroutineScope {
        urls.take(10).map { async { pages.page(it) } }.awaitAll()
    }

    suspend fun window(urls: List<String>) = coroutineScope {
        urls.subList(0, minOf(10, urls.size)).map { async { pages.page(it) } }.awaitAll()
    }

    fun sequential(urls: List<String>) = urls.forEach { pages.page(it) }

    suspend fun untyped(urls: List<String>, client: Any) = coroutineScope {
        urls.map { async { client.toString() } }.awaitAll()
    }

    fun joined(urls: List<String>) = urls.map { CompletableFuture.supplyAsync { pages.page(it) }.join() }

    fun pooled(urls: List<String>) = urls.map { CompletableFuture.supplyAsync({ pages.page(it) }, pool) }

    fun gated(urls: List<String>) =
        urls.map {
            CompletableFuture.supplyAsync {
                gate.acquire()
                try {
                    pages.page(it)
                } finally {
                    gate.release()
                }
            }
        }

    suspend fun guardedSend(requests: List<HttpRequest>) = coroutineScope {
        val body = HttpResponse.BodyHandlers.ofString()
        requests.map { async { permits.withPermit { client.send(it, body) } } }.awaitAll()
    }
}
