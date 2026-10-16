package shop.smells;

import java.util.Map;
import java.util.logging.Logger;

public final class Secrets {
  private static final Logger log = Logger.getLogger("secrets");
  private static final String CSRF_TOKEN = "X-CSRF-TOKEN";
  private static final String TOKEN_KEY = "auth_token";
  private final String password = "hunter2hunter2"; // violation: HardcodedSecret
  private final char[] signingKey = "s3cretSigning".toCharArray(); // violation: HardcodedSecret
  private final String apiToken = "abc123" + "def456ghi"; // violation: HardcodedSecret
  private final Map<String, String> settings = Map.of("db.password", "s3cretValue1"); // violation: HardcodedSecret
  private final String url = "jdbc:postgresql://db/shop?user=app&password=s3cr3tValue"; // violation: CredentialLiteral
  private final String key = "AKIAIOSFODNN7EXAMPLE"; // violation: CredentialLiteral
  private final String environmentToken = System.getenv("SHOP_TOKEN");
  private final String apiKey =
      java.util.Optional.ofNullable(System.getenv("API_KEY")).orElse("sk29x8dj3k2l"); // violation: HardcodedSecret
  private final String clientSecret = System.getenv().getOrDefault("CLIENT_SECRET", "c1ient5ecret"); // violation: HardcodedSecret
  private final String dbPassword = System.getProperty("db.password", "pa55word9"); // violation: HardcodedSecret
  private final String webhookToken = environmentToken != null ? environmentToken : "wh00ktoken"; // violation: HardcodedSecret
  private final String sessionSecret = System.getProperty("SESSION_SECRET");

  public void report() {
    log.info("token " + environmentToken); // violation: SecretInLog
    log.info("token set: " + (environmentToken != null));
    log.info("token length " + environmentToken.length());
    log.info(CSRF_TOKEN + TOKEN_KEY + password.length() + signingKey.length + apiToken.length());
    log.info(settings.size() + url.length() + key.length() + "");
    log.info(apiKey.length() + clientSecret.length() + dbPassword.length() + webhookToken.length() + "");
    log.info(sessionSecret.length() + "");
  }
}
