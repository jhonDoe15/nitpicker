package shop.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.support.GenericApplicationContext;

class BeansInitializer implements ApplicationContextInitializer<GenericApplicationContext> {
  @Override
  public void initialize(GenericApplicationContext context) {
    context.registerBean(String.class, () -> "bean");
  }
}

@ConfigurationProperties("auth")
class AuthProperties {
  private String secret = "dev-secret"; // violation: SpringValueSecretDefault
  private String algorithm = "HS256";
  private String apiKey = "";

  String getSecret() {
    return secret;
  }

  void setSecret(String secret) {
    this.secret = secret;
  }

  String getAlgorithm() {
    return algorithm;
  }

  void setAlgorithm(String algorithm) {
    this.algorithm = algorithm;
  }

  String getApiKey() {
    return apiKey;
  }

  void setApiKey(String apiKey) {
    this.apiKey = apiKey;
  }
}
