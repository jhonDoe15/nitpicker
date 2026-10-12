package shop.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration // violation: SpringLiteConfiguration
@ComponentScan("shop.extra") // violation: SpringNoComponentScan
public class AppConfig {
  @Bean
  @Profile("local")
  PasswordEncoder localEncoder() {
    return NoOpPasswordEncoder.getInstance(); // violation: SpringPasswordEncoder
  }

  @Bean
  PasswordEncoder encoder(@Value("${shop.pepper}") String pepper) {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }
}
