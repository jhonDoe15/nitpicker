package shop

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

class Pages(private val client: HttpClient) {
    private val permits = Semaphore(8)

    fun page(url: String): String = client.send(request(url), HttpResponse.BodyHandlers.ofString()).body()

    fun relay(url: String): String = page(url)

    suspend fun guarded(url: String): String = permits.withPermit { page(url) }

    fun request(url: String): HttpRequest = HttpRequest.newBuilder(URI.create(url)).build()
}
