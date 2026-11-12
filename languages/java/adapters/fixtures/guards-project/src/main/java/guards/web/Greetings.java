package guards.web;

import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.RequestParam;

public class Greetings {
  public String greet(@RequestParam Optional<String> name) {
    return "Hello " + name.orElse("guest");
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http.build();
  }
}
