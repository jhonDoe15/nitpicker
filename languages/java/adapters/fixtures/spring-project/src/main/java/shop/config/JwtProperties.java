package shop.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("jwt")
public record JwtProperties(
    @DefaultValue("dev-secret") String secret, // violation: SpringValueSecretDefault
    @DefaultValue("") String fallback,
    @DefaultValue("HS256") String algorithm,
    @DefaultValue("") String signingKey) {}
