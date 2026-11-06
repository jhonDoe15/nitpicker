package shop.resources;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.io.StringWriter;
import java.net.Socket;
import java.util.List;
import java.util.Objects;
import java.util.Scanner;
import org.springframework.core.io.Resource;
import org.springframework.util.FileCopyUtils;

public final class Owned implements Closeable {
  private final BufferedReader reader;

  public Owned(File file) throws IOException {
    this.reader = new BufferedReader(new FileReader(file, UTF_8));
  }

  public static byte[] content(Resource content) throws IOException {
    try (InputStream in = content.getInputStream()) {
      return in.readAllBytes();
    }
  }

  public static String firstLine(Resource resource) throws IOException {
    try (BufferedReader lines = new BufferedReader(new InputStreamReader(resource.getInputStream(), UTF_8))) {
      return lines.readLine();
    }
  }

  public static InputStream open(Resource resource) throws IOException {
    return resource.getInputStream();
  }

  public static BufferedReader lines(File file) throws IOException {
    return new BufferedReader(new FileReader(file, UTF_8));
  }

  public static byte[] checked(Resource resource) throws IOException {
    try (InputStream in = Objects.requireNonNull(resource.getInputStream())) {
      return in.readAllBytes();
    }
  }

  public static byte[] copied(Resource resource) throws IOException {
    return FileCopyUtils.copyToByteArray(resource.getInputStream());
  }

  public static int memory(byte[] bytes, String text) throws IOException {
    int first = new ByteArrayInputStream(bytes).read();
    int second = new StringReader(text).read();
    int third = new DataInputStream(new ByteArrayInputStream(bytes)).readInt();
    return first + second + third + new Scanner(text).nextInt();
  }

  public static String trace(Throwable error) {
    StringWriter trace = new StringWriter();
    error.printStackTrace(new PrintWriter(trace));
    return new StringWriter().append(trace.toString()).append('.').toString();
  }

  public static String console() throws IOException {
    return new BufferedReader(new InputStreamReader(System.in, UTF_8)).readLine();
  }

  public static int borrowed(Socket socket, Process process, byte[] bytes) throws IOException {
    socket.getOutputStream().write(bytes);
    return process.getInputStream().read();
  }

  public static List<Integer> doubled(List<Integer> values) {
    return values.stream().map(value -> value * 2).toList();
  }

  public String next() throws IOException {
    return reader.readLine();
  }

  @Override
  public void close() throws IOException {
    reader.close();
  }
}
