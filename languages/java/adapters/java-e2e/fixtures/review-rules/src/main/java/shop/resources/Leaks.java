package shop.resources;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.jar.JarFile;
import java.util.jar.Manifest;
import javax.sql.DataSource;
import org.springframework.core.io.Resource;
import org.springframework.util.StreamUtils;

public final class Leaks {
  private Leaks() {}

  public static byte[] content(Resource content) throws IOException {
    return content.getInputStream().readAllBytes(); // violation: UnclosedInlineResource
  }

  public static String text(Resource resource, Charset charset) throws IOException {
    return StreamUtils.copyToString(resource.getInputStream(), charset); // violation: UnclosedInlineResource
  }

  public static Properties settings(Resource resource) throws IOException {
    Properties properties = new Properties();
    properties.load(resource.getInputStream()); // violation: UnclosedInlineResource
    return properties;
  }

  public static Manifest manifest(File root) throws IOException {
    return new JarFile(root).getManifest(); // violation: UnclosedInlineResource
  }

  public static String archive(File root) throws IOException {
    return nameOf(new JarFile(root)); // violation: UnclosedInlineResource
  }

  private static String nameOf(JarFile jar) {
    return jar.getName();
  }

  public static Class<?> type(URL[] urls, String name) throws ClassNotFoundException {
    return new URLClassLoader(urls).loadClass(name); // violation: UnclosedInlineResource
  }

  public static int rows(DataSource dataSource, String sql) throws SQLException {
    return dataSource.getConnection().prepareStatement(sql).executeUpdate(); // violation: UnclosedInlineResource
  }

  public static String firstLine(File file) throws IOException {
    return new BufferedReader(new FileReader(file)).readLine(); // violation: UnclosedInlineResource
  }

  public static String header(Path path) throws IOException {
    return Files.newBufferedReader(path).readLine(); // violation: UnclosedInlineResource
  }

  public static List<String> names(Path directory) throws IOException {
    List<String> names = new ArrayList<>();
    for (Path entry : Files.newDirectoryStream(directory)) { // violation: UnclosedInlineResource
      names.add(entry.toString());
    }
    return names;
  }

  public static Source source(Resource resource) throws IOException {
    return new Source(resource.getInputStream()); // violation: UnclosedInlineResource
  }

  public static byte[] bundled(String name) throws IOException {
    return Leaks.class.getResourceAsStream(name).readAllBytes(); // violation: UnclosedInlineResource
  }

  public record Source(InputStream in) {}
}
