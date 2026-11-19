package shop.slips;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import javax.crypto.Mac;
import org.springframework.security.crypto.password.PasswordEncoder;

public final class Passwords {
  private final PasswordEncoder passwordEncoder;
  private final Mac mac;

  public Passwords(PasswordEncoder passwordEncoder, Mac mac) {
    this.passwordEncoder = passwordEncoder;
    this.mac = mac;
  }

  public boolean reused(String raw, String storedPassword) {
    return passwordEncoder.encode(raw).equals(storedPassword); // violation: SecretDigestEquals
  }

  public boolean reusedByLocal(String raw, String storedPassword) {
    String encoded = passwordEncoder.encode(raw);
    return storedPassword.equals(encoded); // violation: SecretDigestEquals
  }

  public boolean verified(String raw, String storedPassword) {
    return passwordEncoder.matches(raw, storedPassword);
  }

  public boolean signed(byte[] payload, byte[] signature) {
    return Arrays.equals(mac.doFinal(payload), signature); // violation: SecretDigestEquals
  }

  public boolean signedConstantTime(byte[] payload, byte[] signature) {
    return MessageDigest.isEqual(mac.doFinal(payload), signature);
  }

  public boolean secretMatches(String secret, byte[] data, MessageDigest digest) {
    return secret.equals(new String(digest.digest(data), StandardCharsets.ISO_8859_1)); // violation: SecretDigestEquals
  }

  public boolean sameFile(byte[] left, byte[] right, MessageDigest digest) {
    return Arrays.equals(digest.digest(left), digest.digest(right));
  }

  public boolean sameName(String name, String other) {
    return name.equals(other);
  }

  public boolean sameTokenPage(String name, String pageToken) {
    return hashOf(name).equals(pageToken);
  }

  public boolean sameEtag(String etag, String cachedToken) {
    return computeHash(etag).equals(cachedToken);
  }

  public boolean sameHint(String raw, String passwordHint) {
    return hashOf(raw).equals(passwordHint);
  }

  public boolean sameCredentialsId(String file, String credentialsId) {
    return hashOf(file).equals(credentialsId);
  }

  public boolean sameTypedSecret(String raw, String storedSecretHash) {
    return sha256Hex(raw).equals(storedSecretHash); // violation: SecretDigestEquals
  }

  public boolean cryptMatches(String raw, String salt, String storedPassword) {
    return crypt(raw, salt).equals(storedPassword); // violation: SecretDigestEquals
  }

  private String crypt(String value, String salt) {
    return hashOf(salt + value);
  }

  private String hashOf(String value) {
    return Integer.toHexString(value.hashCode());
  }

  private String computeHash(String value) {
    return hashOf(value.trim());
  }

  private String sha256Hex(String value) {
    return hashOf(value.toLowerCase());
  }
}
