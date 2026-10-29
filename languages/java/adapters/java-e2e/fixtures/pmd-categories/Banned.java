package demo;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.IvParameterSpec;
public class Banned {
  public String copy(String value) { return new String(value); }
  public void start(Thread worker) { worker.run(); }
  public SecretKeySpec key() { return new SecretKeySpec("embedded key here".getBytes(StandardCharsets.UTF_8), "AES"); }
  public InputStream open(String file) throws IOException { return new FileInputStream(file); }
  public IvParameterSpec iv() { return new IvParameterSpec("constant iv here".getBytes(StandardCharsets.UTF_8)); }
  public void copy(int[] from, int[] to) { for (int i = 0; i < from.length; i++) { to[i] = from[i]; } }
  public void all(String[] names, List<String> into) { for (String name : names) { into.add(name); } }
}
