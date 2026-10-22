package shop.security;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.MessageDigestPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration(proxyBeanMethods = false)
public class SecurityConfig {
  @Bean
  SecurityFilterChain open(HttpSecurity http) throws Exception {
    http.csrf(csrf -> csrf.disable()); // violation: SpringCsrfDisabled
    http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll()); // violation: SpringPermitAllAnyRequest
    return http.build();
  }

  @Bean
  SecurityFilterChain methodReference(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable); // violation: SpringCsrfDisabled
    http.authorizeHttpRequests(auth -> auth.requestMatchers("/**").permitAll()); // violation: SpringPermitAllAnyRequest
    return http.build();
  }

  @Bean
  SecurityFilterChain legacy(HttpSecurity http) throws Exception {
    http.csrf().disable(); // violation: SpringCsrfDisabled
    return http.build();
  }

  @Bean
  SecurityFilterChain stateless(HttpSecurity http) throws Exception {
    http.csrf(csrf -> csrf.disable())
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth -> auth.requestMatchers("/health").permitAll().anyRequest().authenticated());
    return http.build();
  }

  @Bean
  SecurityFilterChain sessions(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(auth -> auth.anyRequest().authenticated());
    return http.build();
  }

  @Bean
  CorsConfigurationSource credentialed() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOriginPatterns(List.of("*")); // violation: SpringCorsWildcard
    config.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  @Bean
  CorsConfigurationSource anonymous() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("*"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/public/**", config);
    return source;
  }

  @Bean
  CorsConfigurationSource named() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://shop.example.com"));
    config.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
  }

  @Bean
  PasswordEncoder digest() {
    return new MessageDigestPasswordEncoder("MD5"); // violation: SpringPasswordEncoder
  }

  @Bean
  PasswordEncoder delegating() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }

  @Bean
  UserDetails demoUser() {
    return User.withDefaultPasswordEncoder().username("demo").roles("USER").build(); // violation: SpringPasswordEncoder
  }

  @Bean
  UserDetails admin() {
    return User.withUsername("admin").password("admin123").roles("ADMIN").build(); // violation: SpringHardcodedUser
  }

  @Bean
  UserDetails hashedAdmin(PasswordEncoder encoder) {
    return User.withUsername("admin").password(encoder.encode("admin123")).roles("ADMIN").build(); // violation: SpringHardcodedUser
  }

  @Bean
  UserDetails loaded(PasswordEncoder encoder, String stored) {
    return User.withUsername("service").password(stored).roles("SERVICE").build();
  }

  void configure(AuthenticationManagerBuilder auth) throws Exception {
    auth.inMemoryAuthentication().withUser("admin").password("{noop}admin123").roles("ADMIN"); // violation: SpringHardcodedUser
  }
}
