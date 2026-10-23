package shop.bad

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.core.userdetails.User
import org.springframework.security.crypto.password.NoOpPasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.bind.annotation.CrossOrigin

@Configuration(proxyBeanMethods = false)
class SecurityConfig {
    @Bean
    fun chain(http: HttpSecurity): SecurityFilterChain {
        http {
            csrf { disable() }
            authorizeHttpRequests {
                authorize("/admin/**", hasRole("ADMIN"))
                authorize(anyRequest, permitAll)
            }
        }
        return http.build()
    }

    @Bean
    fun javaStyle(http: HttpSecurity): SecurityFilterChain =
        http.csrf { it.disable() }.authorizeHttpRequests { it.requestMatchers("/**").permitAll() }.build()

    @Bean
    fun encoder() = NoOpPasswordEncoder.getInstance()

    @Bean
    fun users() = User.withUsername("admin").password("{noop}admin").roles("ADMIN").build()

    @Bean
    fun cors(): CorsConfiguration {
        val config = CorsConfiguration()
        config.allowedOrigins = listOf("*")
        config.allowCredentials = true
        return config
    }
}

@CrossOrigin(origins = ["*"], allowCredentials = "true")
class Open
