import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.spec.SecretKeySpec;

class Keys {
  static final String CONSTANT = "abc";
  private String configured;
  static final String SECRET = System.getenv("K");
  private final String fixed = "lit";

  Object param(String secret, long timestamp) {
    String sign = timestamp + "\n" + secret; // param
    return new SecretKeySpec(sign.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
  }

  Object inline(String secret) {
    return new SecretKeySpec(("pre" + secret).getBytes(), "AES"); // inline
  }

  Object field() {
    String key = configured + "x"; // field
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object env() {
    String key = "p" + System.getenv("K"); // env
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object call(Config config) {
    return new SecretKeySpec(config.key("x").getBytes(), "AES"); // call
  }

  Object viaLocal(String secret) {
    String inner = "i" + secret;
    String key = "k" + inner; // viaLocal
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object member(Config config) {
    return new SecretKeySpec(("a" + config.secret).getBytes(), "AES"); // member
  }

  Object literal() {
    return new SecretKeySpec("hardcoded".getBytes(StandardCharsets.UTF_8), "AES"); // literal
  }

  Object constant() {
    String key = CONSTANT + "x"; // constant
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object bytes() {
    byte[] key = "abc".getBytes(); // bytes
    return new SecretKeySpec(key, "AES");
  }

  Object decoded() {
    return new SecretKeySpec(Base64.getDecoder().decode("c2VjcmV0"), "AES"); // decoded
  }

  Object localLiteral() {
    String base = "a";
    String key = base + "b"; // localLiteral
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object hexInline() {
    return new SecretKeySpec(new byte[] {0x01, 0x02}, "AES"); // hexInline
  }

  Object hexLocal() {
    byte[] key = {0x1, 0x2}; // hexLocal
    return new SecretKeySpec(key, "AES");
  }

  Object hexCast() {
    byte[] key = {(byte) 0xAB, (byte) 0xCD}; // hexCast
    return new SecretKeySpec(key, "AES");
  }

  String otherMethod(String s) {
    String key = s;
    return key;
  }

  Object scoped() {
    String key = "k" + "v"; // scoped
    return new SecretKeySpec(key.getBytes(), "AES");
  }

  Object thisField() {
    return new SecretKeySpec(("a" + this.fixed).getBytes(), "AES"); // thisField
  }

  Object envConstant() {
    return new SecretKeySpec((SECRET + "x").getBytes(), "AES"); // envConstant
  }
}
