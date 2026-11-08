package shop

import org.springframework.web.reactive.function.client.WebClient
import reactor.core.publisher.Mono

class Feeds(private val client: WebClient) {
    fun fetch(id: String): Mono<String> =
        client.get().uri("/feeds/{id}", id).retrieve().bodyToMono(String::class.java)

    fun fetchAll(ids: List<String>): Mono<String> =
        client.post().uri("/feeds").bodyValue(ids).retrieve().bodyToMono(String::class.java)

    fun relay(id: String): Mono<String> = fetch(id)
}
