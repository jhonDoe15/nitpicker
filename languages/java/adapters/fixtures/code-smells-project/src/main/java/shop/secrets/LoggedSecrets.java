package shop.secrets;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

final class LoggedSecrets {
  private static final Logger log = Logger.getLogger("secrets");
  private static final String API_TOKEN = "Authorization";
  private final Settings settings = new Settings();
  private final Tokenizer tokenizer = new Tokenizer();
  private final String token = System.getenv("TOKEN");
  private final boolean hasToken = token != null;

  void report() {
    log.info(API_TOKEN);
    log.info(settings.API_TOKEN); // violation: SecretInLog
    log.info("set: " + hasToken + isPasswordSet());
    log.info(tokenizer.eosToken + tokenizer.token + tokenizer.getToken());
    log.info("user " + settings.getPassword()); // violation: SecretInLog
    MDC.put("apiToken", settings.current); // violation: SecretInLog
    MDC.put("password", hasToken);
    new Event().addKeyValue("password", settings.current); // violation: SecretInLog
    new Event().addArgument(token); // violation: SecretInLog
  }

  void fail() {
    throw new IllegalStateException("bad token " + token); // violation: SecretInLog
  }

  void expire() {
    throw new IllegalStateException("token expired");
  }

  boolean isPasswordSet() {
    return token != null;
  }

  static final class Settings {
    final String API_TOKEN = "header";
    String current = "";

    String getPassword() {
      return current;
    }
  }

  static final class Tokenizer {
    String eosToken = "";
    String token = "";

    String getToken() {
      return token;
    }
  }

  static final class MDC {
    private static final Map<String, Object> VALUES = new HashMap<>();

    static void put(String key, Object value) {
      VALUES.put(key, value);
    }
  }

  static final class Event {
    private final List<Object> values = new ArrayList<>();

    Event addKeyValue(String key, Object value) {
      values.add(key);
      values.add(value);
      return this;
    }

    Event addArgument(Object value) {
      values.add(value);
      return this;
    }
  }
}
