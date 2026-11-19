package shop.close;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.CharArrayReader;
import java.io.CharArrayWriter;
import java.io.Closeable;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.Reader;
import java.io.StringReader;
import java.io.StringWriter;
import java.io.Writer;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Formatter;
import javax.sql.DataSource;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class Handles {
  private final InputStream held;
  private final Reader wrapped;
  private InputStream cached;

  public Handles(File file, InputStream source) throws IOException {
    InputStream stream = new FileInputStream(file);
    this.held = stream;
    this.wrapped = new StringReader("x");
  }

  public static int memory(byte[] data, char[] chars) throws IOException {
    ByteArrayInputStream in = new ByteArrayInputStream(data);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    CharArrayReader reader = new CharArrayReader(chars);
    CharArrayWriter writer = new CharArrayWriter();
    StringReader text = new StringReader("a");
    StringWriter sink = new StringWriter();
    out.write(in.read());
    writer.write(reader.read());
    return text.read() + sink.toString().length();
  }

  public static String format(int n) {
    Formatter f = new Formatter(new StringBuilder());
    f.format("%d items", n);
    return f.toString();
  }

  public static void pool() throws InterruptedException {
    ExecutorService executor = Executors.newFixedThreadPool(2);
    executor.submit(() -> 1);
    executor.shutdown();
    executor.awaitTermination(1, TimeUnit.SECONDS);
  }

  public static void poolNow() {
    ExecutorService executor = Executors.newSingleThreadExecutor();
    executor.submit(() -> 1);
    executor.shutdownNow();
  }

  public static void helper(File file) throws IOException {
    InputStream in = null;
    try {
      in = new FileInputStream(file);
      in.read();
    } finally {
      closeQuietly(in);
    }
  }

  public static InputStream handedBack(File file) throws IOException {
    InputStream in = new FileInputStream(file);
    return in;
  }

  public static Wrapper wrapper(File file) throws IOException {
    InputStream in = new FileInputStream(file);
    return new Wrapper(in);
  }

  public static void assigned(Handles target, File file) throws IOException {
    InputStream in = new FileInputStream(file); // violation: CloseResource
    target.attach(in);
  }

  public void keep(File file) throws IOException {
    InputStream in = new FileInputStream(file);
    cached = in;
  }

  public static void rendered(Renderer renderer, File file) throws IOException {
    InputStream in = new FileInputStream(file);
    renderer.renderBinary(in);
  }

  public static void late(File file) throws IOException {
    InputStream in = new FileInputStream(file); // violation: CloseResource
    in.read();
    closeQuietly(in);
  }

  public static boolean checked(File file) throws IOException {
    InputStream in = new FileInputStream(file); // violation: CloseResource
    boolean closed = isClosed(in);
    return closed;
  }

  public static void leak(File file) throws IOException {
    InputStream in = new FileInputStream(file); // violation: CloseResource
    in.read();
  }

  public static int connection(String url) throws SQLException {
    Connection connection = DriverManager.getConnection(url); // violation: CloseResource
    return connection.getNetworkTimeout();
  }

  public static int poolLeak() {
    ExecutorService executor = Executors.newCachedThreadPool(); // violation: CloseResource
    executor.submit(() -> 1);
    return 1;
  }

  public static int borrowed(Owner owner) throws Exception {
    Handle session = owner.unwrap(Handle.class);
    Handle current = owner.getCurrentSession();
    return session.size() + current.size();
  }

  public static int owned(Owner owner) throws Exception {
    Handle session = owner.openSession(); // violation: CloseResource
    return session.size();
  }

  interface Handle extends AutoCloseable {
    int size();
  }

  interface Renderer {
    void renderBinary(InputStream in);
  }

  interface Owner {
    Handle unwrap(Class<Handle> type);

    Handle getCurrentSession();

    Handle openSession();
  }

  public static int bound(DataSource source) throws SQLException {
    return DataSourceUtils.getConnection(source).getNetworkTimeout();
  }

  public static int inline(String url) throws SQLException {
    return DriverManager.getConnection(url).getNetworkTimeout(); // violation: UnclosedInlineResource
  }

  static final class DataSourceUtils {
    static Connection getConnection(DataSource source) throws SQLException {
      return source.getConnection();
    }
  }

  void attach(InputStream in) {}

  static boolean isClosed(Closeable closeable) {
    return closeable == null;
  }

  static void closeQuietly(Closeable closeable) {
    try {
      if (closeable != null) {
        closeable.close();
      }
    } catch (IOException ignored) {
      return;
    }
  }

  record Wrapper(InputStream in) {}
}
