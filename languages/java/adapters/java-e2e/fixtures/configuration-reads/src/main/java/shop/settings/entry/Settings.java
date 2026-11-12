package shop.settings.entry;

import io.micronaut.context.annotation.ConfigurationProperties;

@ConfigurationProperties("shop")
public record Settings(String region, int port) {
  public static Settings fallback() {
    return new Settings(System.getProperty("shop.region", "eu"), 8080);
  }
}
