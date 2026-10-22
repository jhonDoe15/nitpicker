package shop.bad

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.client.RestClient
import org.springframework.web.bind.annotation.ExceptionHandler as OnError

@RestController
class InferredController {
    @GetMapping("/inferred")
    fun inferred() = mapOf<String, Any>("x" to 1)

    @PostMapping("/echo")
    fun echo(@RequestBody body: Map<String, Any>) = body
}

@RestControllerAdvice
class AliasedErrors {
    @OnError
    fun failed(e: IllegalStateException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.message ?: "conflict")
}

@Configuration(proxyBeanMethods = false)
class FactoryConfig {
    @Bean
    fun configured(): RestClient =
        RestClient.builder()
            .requestFactory(SimpleClientHttpRequestFactory().apply { setConnectTimeout(1000) })
            .build()

    @Bean
    fun bare(): SimpleClientHttpRequestFactory = SimpleClientHttpRequestFactory()

    @Bean
    fun named(): SimpleClientHttpRequestFactory {
        val factory = SimpleClientHttpRequestFactory()
        return factory
    }

    @Bean
    fun qualified() = org.springframework.web.client.RestTemplate()

    fun tune(factory: SimpleClientHttpRequestFactory) {
        factory.setReadTimeout(1000)
    }
}
