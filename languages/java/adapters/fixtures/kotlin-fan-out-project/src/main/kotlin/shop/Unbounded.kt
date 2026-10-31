package shop

import java.net.http.HttpClient
import java.net.http.HttpResponse
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import kotlin.concurrent.thread
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerRecord
import org.springframework.web.client.RestTemplate

class Unbounded(
    private val client: HttpClient,
    private val pages: Pages,
    private val rest: RestTemplate,
    private val producer: KafkaProducer<String, String>,
) {
    private val permits = Semaphore(8)

    suspend fun direct(urls: List<String>) = coroutineScope {
        urls.map { async { client.send(pages.request(it), HttpResponse.BodyHandlers.ofString()) } }.awaitAll()
    }

    suspend fun published(events: List<String>) = coroutineScope {
        events.forEach { event -> launch { producer.send(ProducerRecord("events", event)) } }
    }

    suspend fun looped(urls: List<String>) = coroutineScope {
        for (url in urls) {
            launch { rest.getForObject(url, String::class.java) }
        }
    }

    suspend fun filtered(urls: List<String>) = coroutineScope {
        urls.filter { it.isNotBlank() }.map { async { fetch(it) } }.awaitAll()
    }

    suspend fun filteredEach(urls: List<String>) = coroutineScope {
        urls.filter { it.isNotBlank() }.forEach { launch { fetch(it) } }
    }

    suspend fun trimmed(urls: List<String>) = coroutineScope {
        urls.map { it.trim() }.sortedBy { it }.map { async { fetch(it) } }.awaitAll()
    }

    suspend fun indexed(urls: List<String>) = coroutineScope {
        (0 until urls.size).map { async { fetch(urls[it]) } }.awaitAll()
    }

    suspend fun indices(urls: List<String>) = coroutineScope {
        urls.indices.map { async { fetch(urls[it]) } }.awaitAll()
    }

    suspend fun associated(urls: List<String>) = coroutineScope {
        urls.associateWith { async { fetch(it) } }
    }

    suspend fun collected(urls: List<String>) = coroutineScope {
        urls.mapTo(mutableListOf()) { async { fetch(it) } }.awaitAll()
    }

    suspend fun repeated(urls: List<String>) = coroutineScope {
        repeat(urls.size) { launch { fetch(urls[it]) } }
    }

    suspend fun permitElsewhere(urls: List<String>) = coroutineScope {
        urls.map {
            async {
                permits.withPermit { println(it) }
                fetch(it)
            }
        }.awaitAll()
    }

    suspend fun everything(urls: List<String>) = coroutineScope {
        urls.take(urls.size).map { async { fetch(it) } }.awaitAll()
    }

    suspend fun perChunk(urls: List<String>) = coroutineScope {
        urls.chunked(10).map { chunk -> async { chunk.map { fetch(it) } } }.awaitAll()
    }

    suspend fun relayed(urls: List<String>) = coroutineScope {
        urls.map { async { pages.relay(it) } }.awaitAll()
    }

    fun futures(urls: List<String>): List<CompletableFuture<String>> =
        urls.map { url -> CompletableFuture.supplyAsync { fetch(url) } }

    fun pooled(urls: List<String>) {
        val executor = Executors.newCachedThreadPool()
        urls.forEach { executor.execute { fetch(it) } }
    }

    fun threads(urls: List<String>) = urls.map { thread { fetch(it) } }

    suspend fun topLevel(urls: List<String>) = coroutineScope {
        urls.map { async { download(client, it) } }.awaitAll()
    }

    suspend fun referenced(urls: List<String>) = coroutineScope {
        urls.map { url -> async { listOf(url).map(this@Unbounded::fetch) } }.awaitAll()
    }

    suspend fun shared(requests: List<java.net.http.HttpRequest>) = coroutineScope {
        requests.map { async { sharedClient.send(it, HttpResponse.BodyHandlers.ofString()) } }.awaitAll()
    }

    private fun fetch(url: String): String = pages.page(url)
}
