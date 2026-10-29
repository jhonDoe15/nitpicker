package shop.secrets;

final class PropertyDefaults {
  static final String DATABASE = "${db.password:Hunter22x}"; // violation: HardcodedSecret
  static final String SIGNING = "jdbc:h2:mem:${app.signing-key:Signing2024}"; // violation: HardcodedSecret
  static final String UNSET = "${auth.token:changeme}";
  static final String TTL = "${auth.token-ttl:3600}";
  static final String NESTED = "${db.password:${DB_PASSWORD}}";
  static final String EMPTY = "${jwt.secret:}";
}
