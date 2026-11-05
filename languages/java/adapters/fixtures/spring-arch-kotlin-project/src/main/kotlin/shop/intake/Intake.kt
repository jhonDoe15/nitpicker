package shop.intake

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.messaging.handler.annotation.Header
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class IntakeController {
    @PostMapping("/intake/orders")
    fun create(@RequestBody order: CreateOrder) {}

    @PostMapping("/intake/profiles")
    fun profile(@RequestBody profile: Profile) {}

    @PostMapping("/intake/shapes")
    fun shapes(@RequestBody shapes: List<Shape>) {}

    @MessageMapping("/intake/chat")
    fun chat(message: ChatMessage, @Header("trace") trace: Trace) {}
}

data class CreateOrder(
    val customerId: String,
    val attributes: Map<String, Any>,
    val payload: JsonNode,
    val lines: List<OrderLine>,
    val labels: Map<String, String>,
    @field:JsonIgnore val cache: Any? = null,
    @get:JsonIgnore val secret: Any? = null,
)

data class OrderLine(val sku: String, val options: List<Any?>, val tags: Set<String>)

class Profile {
    var name: String = ""

    @JsonAnySetter
    fun put(key: String, value: Any) {}
}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)
sealed interface Shape

data class Circle(val radius: Double) : Shape

data class Freeform(val points: ObjectNode) : Shape

data class ChatMessage(val text: String, val meta: Map<String, *>)

data class Trace(val details: Map<String, Any>)

data class OutboundOrder(val attributes: Map<String, Any>)

interface Outbound {
    @PostMapping("/remote/orders")
    fun send(@RequestBody order: OutboundOrder)
}
