package shop.security;

import static org.springframework.security.config.Customizer.withDefaults;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.web.server.SecurityWebFiltersOrder;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.context.NoOpServerSecurityContextRepository;
import org.springframework.security.web.server.util.matcher.ServerWebExchangeMatchers;
import org.springframework.web.server.WebFilter;

@Configuration(proxyBeanMethods = false)
class StatelessChains {
  @Bean
  SecurityFilterChain jwtLoginsDisabled(HttpSecurity http) throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(basic -> basic.disable())
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .build();
  }

  @Bean
  SecurityFilterChain jwtBasicOn(HttpSecurity http) throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable) // violation: SpringCsrfDisabled
        .formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(withDefaults())
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .build();
  }

  @Bean
  SecurityFilterChain nullContext(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .securityContext(c -> c.securityContextRepository(new NullSecurityContextRepository()));
    return http.build();
  }

  @Bean
  SecurityWebFilterChain reactiveStateless(ServerHttpSecurity http, WebFilter jwtFilter) {
    return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
        .securityContextRepository(NoOpServerSecurityContextRepository.getInstance())
        .addFilterAt(jwtFilter, SecurityWebFiltersOrder.AUTHENTICATION)
        .authorizeExchange(ex -> ex
            .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .anyExchange().authenticated())
        .build();
  }

  @Bean
  SecurityWebFilterChain reactiveJwt(ServerHttpSecurity http) {
    return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
        .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
        .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .build();
  }

  @Bean
  SecurityWebFilterChain reactiveSession(ServerHttpSecurity http) {
    return http.csrf(ServerHttpSecurity.CsrfSpec::disable) // violation: SpringCsrfDisabled
        .formLogin(withDefaults())
        .build();
  }

  @Bean
  SecurityWebFilterChain reactiveAnyExchange(ServerHttpSecurity http) {
    return http.authorizeExchange(ex -> ex.anyExchange().permitAll()) // violation: SpringPermitAllAnyRequest
        .build();
  }

  @Bean
  SecurityWebFilterChain reactiveAllPaths(ServerHttpSecurity http) {
    return http.authorizeExchange(ex -> ex.pathMatchers("/**").permitAll()) // violation: SpringPermitAllAnyRequest
        .build();
  }

  @Bean
  SecurityWebFilterChain reactivePublicPaths(ServerHttpSecurity http) {
    return http.authorizeExchange(ex -> ex
            .pathMatchers("/public/**").permitAll()
            .anyExchange().authenticated())
        .build();
  }

  @Bean
  SecurityWebFilterChain reactiveAssets(ServerHttpSecurity http) {
    return http.securityMatcher(ServerWebExchangeMatchers.pathMatchers("/assets/**"))
        .authorizeExchange(ex -> ex.anyExchange().permitAll())
        .build();
  }
}
