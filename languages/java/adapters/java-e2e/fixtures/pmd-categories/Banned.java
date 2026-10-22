package demo;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
public class Banned {
  public String copy(String value) { return new String(value); }
  public void start(Thread worker) { worker.run(); }
  public SecretKeySpec key() { return new SecretKeySpec("embedded key here".getBytes(StandardCharsets.UTF_8), "AES"); }
  public InputStream open(String file) throws IOException { return new FileInputStream(file); }
  public IvParameterSpec iv() { return new IvParameterSpec("constant iv here".getBytes(StandardCharsets.UTF_8)); }
}
