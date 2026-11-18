package shop.secrets;

import org.slf4j.Logger;
import org.slf4j.MDC;

public final class Logs {
  private static final Logger log = null;
  private static final String PASSWORD = "x";

  private String password;
  private boolean hasToken;
  private Config config;

  void run(String token, char[] secret, String apiKey, User user) {
    log.info("token {}", token); // violation: SecretInLog
    log.info("token is " + token); // violation: SecretInLog
    log.warn("password {}", user.getPassword()); // violation: SecretInLog
    log.error("secret {}", String.valueOf(secret)); // violation: SecretInLog
    System.out.println("key " + apiKey); // violation: SecretInLog
    System.err.printf("%s", this.password); // violation: SecretInLog
    throw new IllegalStateException("bad " + password); // violation: SecretInLog
  }

  void environment(String token) {
    log.info("{}", System.getenv("API_TOKEN")); // violation: SecretInLog, ConfigurationReadOutsideCompositionRoot
    MDC.put("token", token); // violation: SecretInLog
    log.info("{}", token == null ? "none" : token); // violation: SecretInLog
  }

  void forms(String token, String secret, char[] password, java.util.Map<String, String> env) {
    log.info(String.format("%s", token)); // violation: SecretInLog
    log.info("x %s".formatted(token)); // violation: SecretInLog
    log.info("{}", java.util.Optional.of(token)); // violation: SecretInLog
    log.info("{}", java.util.List.of(token)); // violation: SecretInLog
    log.info("{}", secret.trim()); // violation: SecretInLog
    log.info("{}", new String(password)); // violation: SecretInLog
    log.info("{}", env.get("API_TOKEN")); // violation: SecretInLog
    org.slf4j.LoggerFactory.getLogger(Logs.class).info("x {}", token); // violation: SecretInLog
  }

  void allowed(String token, String maskedToken, String nextToken) {
    log.info("{} {}", maskedToken, nextToken);
    log.info("token refreshed");
    log.info("token set: {}", hasToken);
    log.info("length {}", token.length());
    log.info("masked {}", mask(token));
    log.info("parameter {}", PASSWORD);
    log.info("count {}", config.getTokenCount());
    MDC.put("user", token);
    other.info(token);
  }

  String mask(String value) {
    return value.substring(0, 2);
  }

  interface User {
    String getPassword();
  }

  interface Config {
    int getTokenCount();
  }

  interface Other {
    void info(String value);
  }

  Other other;
}
