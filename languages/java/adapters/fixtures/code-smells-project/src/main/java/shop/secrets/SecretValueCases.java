package shop.secrets;

final class SecretValueCases {
  static final class Case1 {
    final String password = "Password1!"; // violation: HardcodedSecret
  }

  static final class Case2 {
    final String token = "Token2024"; // violation: HardcodedSecret
  }

  static final class Case3 {
    final String secret = "s3cret"; // violation: HardcodedSecret
  }

  static final class Case4 {
    final String adminPassword = "Admin123"; // violation: HardcodedSecret
  }

  static final class Case5 {
    final String apiKey = "a1b2c3d4e5"; // violation: HardcodedSecret
  }

  static final class Case6 {
    final String adminPassword = "CorrectHorseBatteryStaple"; // violation: HardcodedSecret
  }

  static final class Case7 {
    final String dbPasswordValue = "Pa55word2024"; // violation: HardcodedSecret
  }

  static final class Case8 {
    final String hmacKey = "s3cr3t-hmac-2024"; // violation: HardcodedSecret
  }

  static final class Case9 {
    final String clientSecret = "abc123def"; // violation: HardcodedSecret
  }

  static final class Case10 {
    final String password = "password1"; // violation: HardcodedSecret
  }

  static final class Case11 {
    final String password = ":password1"; // violation: HardcodedSecret
  }

  static final class Case12 {
    final String password = ":dbPassword";
  }

  static final class Case13 {
    final String password = "Elephantine";
  }

  static final class Case14 {
    final String password = "Passwort";
  }

  static final class Case15 {
    final String password = "hunterhunter";
  }

  static final class Case16 {
    final String token = "Authorization";
  }

  static final class Case17 {
    final String token = "CorrectHorseBatteryStaple";
  }

  static final class Case18 {
    final String password = "Password";
  }

  static final class Case19 {
    final String password = "{{secrets.DB_PASSWORD}}";
  }

  static final class Case20 {
    final String password = "%(db_pw)s";
  }

  static final class Case21 {
    final String password = "{db_pw1}";
  }

  static final class Case22 {
    final String password = "$prefix1";
  }

  static final class Case23 {
    final String password = "changeme";
  }

  static final class Case24 {
    final String token = "****1234";
  }

  static final class Case25 {
    final String token = "00000000-0000-0000-0000-000000000000";
  }

  static final class Case26 {
    final String token = "errors.token.expired_v2";
  }

  static final class Case27 {
    final String dbSecret = "prod/db-creds-v2";
  }

  static final class Case28 {
    final String secret = "secret/data/app1";
  }

  static final class Case29 {
    final String credentials = "/etc/app/creds-v2.json";
  }

  static final class Case30 {
    final String token = "extra_token_1";
  }

  static final class Case31 {
    final String password = "pass_word1";
  }

  static final class Case32 {
    final String password = "newPassword";
  }

  static final class Case33 {
    final String apiKey = "X-API-Key";
  }

  static final class Case34 {
    final String token = "API_TOKEN";
  }

  static final class Case35 {
    final String password = "https://x.com/reset1";
  }

  static final class Case36 {
    final String token = "abc1";
  }

  static final class Case37 {
    final String password = "^(?=.*\\d).{8,}$";
  }

  static final class Case38 {
    final String token = "ghp_a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2"; // violation: CredentialLiteral
  }

  static final class Case39 {
    final String secretKey = "django-insecure-abcdef"; // violation: CredentialLiteral
  }

  static final class Case40 {
    final String apiKey = "AKIAABCDEFGHIJKLMNOP"; // violation: CredentialLiteral
  }

  static final class Case41 {
    final String token = "Bearer abc123def456"; // violation: CredentialLiteral
  }

  static final class Case42 {
    final String dsn = "postgres://app:Hunter22@db/app"; // violation: CredentialLiteral
  }
}
