package shop.settings;

import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

@Configuration(proxyBeanMethods = false)
public class TokenConfig {
  private final TokenProperties properties;
  private final String region;

  public TokenConfig(TokenProperties properties, @Value("${shop.region:}") String region) {
    this.properties = properties;
    this.region = region;
  }

  @Bean
  public String tokenIssuer() {
    if (properties.getIssuerUri() != null) { // violation: SpringNullOnlyConfigCheck
      return properties.getIssuerUri();
    }
    return "local";
  }

  @Bean
  public String tokenKey() {
    if (StringUtils.hasText(properties.getSigning().getKeyId())) {
      return properties.getSigning().getKeyId();
    }
    return Objects.requireNonNullElse(region, "eu"); // violation: SpringNullOnlyConfigCheck
  }

  @Bean
  public String tokenAudience(Environment environment) {
    if (environment.containsProperty("shop.audience")) { // violation: SpringNullOnlyConfigCheck
      return environment.getRequiredProperty("shop.audience");
    }
    return "all";
  }
}
