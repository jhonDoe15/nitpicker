package demo;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.security.SecureRandom;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class Allowed {
  private volatile Object published;

  public String copy(String value) { return value; }
  public void start(Thread worker) { worker.start(); }
  public SecretKeySpec key(byte[] externalKey) { return new SecretKeySpec(externalKey, "AES"); }
  public IvParameterSpec iv(SecureRandom random) {
    byte[] nonce = new byte[16];
    random.nextBytes(nonce);
    return new IvParameterSpec(nonce);
  }
  public List<Object> distinct(int count) {
    List<Object> values = new ArrayList<>();
    for (int i = 0; i < count; i++) { values.add(new Object()); }
    return values;
  }
  public Map<String, String> localMap(String value) {
    Map<String, String> values = new HashMap<>();
    values.put(value, value);
    return values;
  }
  public String describe(List<String> names) {
    StringBuilder text = new StringBuilder();
    for (String name : names) { text.append(name).append(", and more text than sixteen chars"); }
    return text.toString();
  }
  public String choice(int value) {
    return switch (value) { case 0 -> "zero"; default -> "other"; };
  }
  public InputStream open(Path file) throws IOException { return Files.newInputStream(file); }
  public Object published() { return published; }
}
