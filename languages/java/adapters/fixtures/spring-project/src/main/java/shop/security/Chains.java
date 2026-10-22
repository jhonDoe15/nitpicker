package shop.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

@Configuration(proxyBeanMethods = false)
class Chains {
  @Bean
  SecurityFilterChain preflight(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(a -> a
        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
        .anyRequest().authenticated());
    return http.build();
  }

  @Bean
  @Order(1)
  SecurityFilterChain assets(HttpSecurity http) throws Exception {
    http.securityMatcher("/assets/**")
        .authorizeHttpRequests(a -> a.anyRequest().permitAll());
    return http.build();
  }

  @Bean
  @Order(2)
  SecurityFilterChain assetsSplit(HttpSecurity http) throws Exception {
    http.securityMatcher("/docs/**");
    http.authorizeHttpRequests(a -> a.anyRequest().permitAll());
    return http.build();
  }

  @Bean
  WebSecurityCustomizer ignoreAll() {
    return web -> web.ignoring().requestMatchers("/**"); // violation: SpringPermitAllAnyRequest
  }

  @Bean
  WebSecurityCustomizer ignoreStatic() {
    return web -> web.ignoring().requestMatchers("/static/**");
  }

  @Bean
  SecurityFilterChain otherChainStateless(HttpSecurity http, HttpSecurity other) throws Exception {
    http.csrf(c -> c.disable()); // violation: SpringCsrfDisabled
    other.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    return http.build();
  }

  @Bean
  SecurityFilterChain statelessSplit(HttpSecurity http) throws Exception {
    http.csrf(c -> c.disable());
    http.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
    return http.build();
  }

  @Bean
  SecurityFilterChain jwt(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
        .authorizeHttpRequests(a -> a.anyRequest().authenticated());
    return http.build();
  }

  @Bean
  SecurityFilterChain jwtWithLogin(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable) // violation: SpringCsrfDisabled
        .formLogin(Customizer.withDefaults())
        .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
    return http.build();
  }

  @Bean
  CorsConfiguration addOrigin() {
    CorsConfiguration c = new CorsConfiguration();
    c.addAllowedOrigin("*"); // violation: SpringCorsWildcard
    c.setAllowCredentials(Boolean.TRUE);
    return c;
  }

  @Bean
  CorsConfiguration addPattern() {
    CorsConfiguration c = new CorsConfiguration();
    c.addAllowedOriginPattern("*"); // violation: SpringCorsWildcard
    c.setAllowCredentials(true);
    return c;
  }

  @Bean
  CorsConfiguration addPatternNoCredentials() {
    CorsConfiguration c = new CorsConfiguration();
    c.addAllowedOriginPattern("*");
    c.setAllowCredentials(false);
    return c;
  }

  void registry(CorsRegistry registry) {
    registry.addMapping("/**").allowedOriginPatterns("*").allowCredentials(true); // violation: SpringCorsWildcard
  }

  @Bean
  UserDetails localPassword() {
    String pw = "secret";
    return User.withUsername("ops").password(pw).roles("OPS").build(); // violation: SpringHardcodedUser
  }
}

@CrossOrigin(origins = "*", allowCredentials = "true") // violation: SpringNoCrossOrigin, SpringCorsWildcard
class Crossed {}
