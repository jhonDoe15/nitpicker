package demo

import jakarta.validation.Valid
import org.springframework.security.crypto.password.NoOpPasswordEncoder
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseBody
import org.springframework.web.bind.annotation.RestController

data class OrderDto(val id: Long)

@RestController
@RequestMapping("/orders")
@CrossOrigin // violation: SpringNoCrossOrigin
class Orders {
    @RequestMapping("/a") // violation: SpringComposedMapping
    fun a(): String = ""

    @GetMapping("/b")
    @ResponseBody // violation: SpringRestController
    fun b(): String = ""

    fun create(
        @RequestBody order: OrderDto, // violation: SpringValidRequestBody
        @RequestBody @Valid checked: OrderDto,
        @RequestBody text: String,
        @RequestBody ids: List<Long>,
        @RequestBody items: List<OrderDto>, // violation: SpringValidRequestBody
        @RequestBody raw: Map<String, Any>, // violation: SpringTypedRequestBody
    ) {}
}

@Controller
@ResponseBody // violation: SpringRestController
class Pages2

fun encoder() = NoOpPasswordEncoder.getInstance() // violation: SpringPasswordEncoder

val unused: NoOpPasswordEncoder? = null // violation: SpringPasswordEncoder
