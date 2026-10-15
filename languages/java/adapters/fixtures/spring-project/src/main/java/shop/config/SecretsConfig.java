package shop.config;

import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.ConfigurableEnvironment;

@Configuration(proxyBeanMethods = false)
public class SecretsConfig {
  @Bean
  SecretKeySpec jwtKey(@Value("${jwt.secret:changeit-super-secret-key-123456}") String secret) { // violation: SpringValueSecretDefault
    return new SecretKeySpec(secret.getBytes(), "HmacSHA256");
  }

  @Bean
  String stripe(@Value("${stripe.api-key:sk_test_abc123}") String key) { // violation: SpringValueSecretDefault
    return key;
  }

  @Bean
  String refresh(@Value("${auth.refresh-token:abc123xyz}") String token) { // violation: SpringValueSecretDefault
    return token;
  }

  @Bean
  String required(
      @Value("${jwt.secret}") String secret,
      @Value("${jwt.secret:}") String optional,
      @Value("${auth.token-type:bearer}") String type,
      @Value("${auth.reset-token:header}") String where,
      @Value("${app.region:eu}") String region,
      @Value("${db.password:${DB_PASSWORD}}") String password,
      @Value("${db.passwordless:true}") String passwordless) {
    return secret;
  }
}

class EnvHelper {
  static String region() {
    return System.getenv("APP_REGION"); // violation: SpringTypedConfiguration
  }

  static String home() {
    return System.getProperty("user.home");
  }

  public static void main(String[] args) {
    System.out.println(System.getenv("MODE"));
  }
}

class RegionPostProcessor implements EnvironmentPostProcessor {
  @Override
  public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
    String region = System.getenv("APP_REGION");
  }
}
