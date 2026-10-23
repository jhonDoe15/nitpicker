package shop.good

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.factory.PasswordEncoderFactories
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.cors.CorsConfiguration

@Configuration(proxyBeanMethods = false)
class SecurityConfig {
    @Bean
    fun api(http: HttpSecurity): SecurityFilterChain {
        http {
            securityMatcher("/api/**")
            csrf { disable() }
            sessionManagement { sessionCreationPolicy = SessionCreationPolicy.STATELESS }
            authorizeHttpRequests {
                authorize("/api/public/**", permitAll)
                authorize(anyRequest, authenticated)
            }
        }
        return http.build()
    }

    @Bean
    fun encoder() = PasswordEncoderFactories.createDelegatingPasswordEncoder()

    @Bean
    fun cors(origins: List<String>): CorsConfiguration {
        val config = CorsConfiguration()
        config.allowedOrigins = origins
        config.allowCredentials = true
        return config
    }
}
