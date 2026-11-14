package shop.secrets;

import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

public final class Credentials {
  private static final String PASSWORD = "password";
  private static final String PASSWORD_PROPERTY = "db.password";
  private static final String TOKEN_URL = "https://auth.example.com/token";

  private final String apiKey = "a1b2c3d4e5f6"; // violation: HardcodedSecret
  private final String dbPassword = "Passw0rd!"; // violation: HardcodedSecret
  private final char[] secret = "abc123def".toCharArray(); // violation: HardcodedSecret
  private final String emptyToken = "";
  private final String eosToken = "</s>1";
  private final String passwordField = "Passw0rd1";
  private final String accessKey = "AKIAIOSFODNN7EXAMPLE"; // violation: CredentialLiteral
  private final String endpoint = "postgres://app:Hunter2x@db/app"; // violation: CredentialLiteral

  public void configure(Map<String, String> defaults, Client client) {
    Properties properties = new Properties();
    Map<String, String> settings = new HashMap<>(defaults);
    String password = "s3cr3t-Value"; // violation: HardcodedSecret
    String clientSecret;
    clientSecret = "abc123def456"; // violation: HardcodedSecret
    properties.put("db.password", "abc123def456"); // violation: HardcodedSecret
    properties.setProperty("api.token", "abc123def456"); // violation: HardcodedSecret
    String fallback = properties.getProperty("db.password", "abc123def456"); // violation: HardcodedSecret
    client.setPassword("abc123def456"); // violation: HardcodedSecret
    client.password("abc123def456"); // violation: HardcodedSecret
    client.setPassword("changeme");
    client.setHost("db1.internal");
    String jwtSecret = settings.isEmpty() ? "abc123def456" : defaults.get("jwt"); // violation: HardcodedSecret
    String passphrase = "CorrectHorseBattery"; // violation: HardcodedSecret
    String viaSettings = settings.get("db.password");
    String accessToken = "token";
    String hunter = "hunter2hunter";
    settings.put("host", "db1.internal");
    String dbSecret = "abc" + "123def456"; // violation: HardcodedSecret
    String dbToken = "2024-01-01T00:00:00Z";
    String maskedPassword = "abc123def456";
    String nextToken = "abc123def456";
    String jdbcUrl = "jdbc:postgresql://app:Hunter2x@db/app"; // violation: CredentialLiteral
    Map<String, String> pairs = Map.of("password", "abc123def456"); // violation: HardcodedSecret
    Map.Entry<String, String> pair = Map.entry("apiToken", "abc123def456"); // violation: HardcodedSecret
  }

  interface Client {
    void setPassword(String value);

    void password(String value);

    void setHost(String value);
  }
}
