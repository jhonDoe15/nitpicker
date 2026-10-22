package shop.orders

import java.math.BigDecimal
import java.nio.file.Files
import java.nio.file.Path
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.repository.findByIdOrNull
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.web.client.RestClient

class OrderLoader(
    private val repository: OrderRepository,
    private val client: RestClient,
    private val kafka: KafkaTemplate<String, String>,
) {
    fun load(id: Long): Order? = repository.findByIdOrNull(id)

    fun page(number: Int): Page<Order> = repository.findAll(PageRequest.of(number, 100))

    fun forget(chunk: List<Long>) = repository.deleteAllById(chunk)

    fun price(id: Long): BigDecimal? = client.get().uri("/prices/{id}", id).retrieve().body(BigDecimal::class.java)

    fun placed(id: Long) {
        kafka.send("orders", id.toString())
    }

    fun read(path: Path): String = Files.readString(path)
}
