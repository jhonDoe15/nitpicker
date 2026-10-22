package demo

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.builders.WebSecurity
import org.springframework.security.config.annotation.web.invoke
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.web.SecurityFilterChain
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.cors.CorsConfiguration

@Configuration(proxyBeanMethods = false)
class Chains {
    @Bean
    fun open(http: HttpSecurity): SecurityFilterChain {
        http.csrf { it.disable() } // violation: SpringCsrfDisabled
        http.authorizeHttpRequests { it.anyRequest().permitAll() } // violation: SpringPermitAllAnyRequest
        return http.build()
    }

    @Bean
    fun stateless(http: HttpSecurity): SecurityFilterChain {
        http.csrf { it.disable() }
        http.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        http.authorizeHttpRequests {
            it.requestMatchers("/public/**").permitAll().anyRequest().authenticated()
        }
        return http.build()
    }

    @Bean
    fun everything(http: HttpSecurity): SecurityFilterChain {
        http.authorizeHttpRequests { it.requestMatchers("/**").permitAll() } // violation: SpringPermitAllAnyRequest
        return http.build()
    }

    @Bean
    fun scoped(http: HttpSecurity): SecurityFilterChain {
        http.securityMatcher("/open/**")
        http.authorizeHttpRequests { it.anyRequest().permitAll() }
        return http.build()
    }

    @Bean
    fun dsl(http: HttpSecurity): SecurityFilterChain {
        http {
            csrf { disable() } // violation: SpringCsrfDisabled
            authorizeHttpRequests { authorize(anyRequest, permitAll) } // violation: SpringPermitAllAnyRequest
        }
        return http.build()
    }

    fun ignoreAll(web: WebSecurity) {
        web.ignoring().requestMatchers("/**") // violation: SpringPermitAllAnyRequest
    }

    @Bean
    fun users(): UserDetailsService {
        val admin = User.withUsername("admin").password("{noop}secret").roles("ADMIN").build() // violation: SpringHardcodedUser
        return InMemoryUserDetailsManager(admin)
    }

    fun memory(auth: AuthenticationManagerBuilder) {
        auth.inMemoryAuthentication().withUser("guest").password("{noop}guest").roles("USER") // violation: SpringHardcodedUser
    }

    @Bean
    fun cors(): CorsConfiguration {
        val config = CorsConfiguration()
        config.allowedOrigins = listOf("*") // violation: SpringCorsWildcard
        config.allowCredentials = true
        return config
    }

    @Bean
    fun corsPatterns(): CorsConfiguration =
        CorsConfiguration().apply {
            addAllowedOriginPattern("*") // violation: SpringCorsWildcard
            allowCredentials = true
        }

    @Bean
    fun corsOpen(): CorsConfiguration {
        val config = CorsConfiguration()
        config.allowedOrigins = listOf("*")
        return config
    }
}

@Controller
@CrossOrigin(origins = ["*"], allowCredentials = "true") // violation: SpringCorsWildcard, SpringNoCrossOrigin
class CorsPage
