package demo;
import java.nio.charset.StandardCharsets;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
public class Banned {
  public String copy(String value) { return new String(value); }
  public void start(Thread worker) { worker.run(); }
  public SecretKeySpec key() { return new SecretKeySpec("embedded key here".getBytes(StandardCharsets.UTF_8), "AES"); }
  public IvParameterSpec iv() { return new IvParameterSpec("constant iv here".getBytes(StandardCharsets.UTF_8)); }
}
