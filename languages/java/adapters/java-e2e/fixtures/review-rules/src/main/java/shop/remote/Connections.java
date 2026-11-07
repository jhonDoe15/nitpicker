package shop.remote;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

public final class Connections {
  public int status(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection(); // violation: HttpWithoutTimeout
    return connection.getResponseCode();
  }

  public int timedStatus(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setConnectTimeout(2_000);
    connection.setReadTimeout(5_000);
    return connection.getResponseCode();
  }

  public int configuredStatus(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    withTimeouts(connection);
    return connection.getResponseCode();
  }

  public String read(String address) throws IOException {
    URLConnection connection = URI.create(address).toURL().openConnection(); // violation: HttpWithoutTimeout, UriCreateDynamic
    try (InputStream body = connection.getInputStream()) {
      return new String(body.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  public byte[] download(String address) throws IOException {
    URL url = URI.create(address).toURL(); // violation: UriCreateDynamic
    try (InputStream body = url.openStream()) { // violation: HttpWithoutTimeout
      return body.readAllBytes();
    }
  }

  public byte[] fetch() throws IOException {
    try (InputStream body = new URL("https://example.com/feed").openStream()) { // violation: HttpWithoutTimeout
      return body.readAllBytes();
    }
  }

  public byte[] relative(String base) throws IOException {
    try (InputStream body = new URL(base + "/feed").openStream()) { // violation: HttpWithoutTimeout
      return body.readAllBytes();
    }
  }

  public HttpURLConnection opened(URL url) throws IOException {
    return (HttpURLConnection) url.openConnection();
  }

  public byte[] local(String path) throws IOException {
    try (InputStream body = new URL("file:" + path).openStream()) {
      return body.readAllBytes();
    }
  }

  public byte[] resource() throws IOException {
    try (InputStream body = Connections.class.getResource("/defaults.json").openStream()) {
      return body.readAllBytes();
    }
  }

  public byte[] file(Path path) throws IOException {
    try (InputStream body = path.toUri().toURL().openStream()) {
      return body.readAllBytes();
    }
  }

  public byte[] classpathUrl(URL url) throws IOException {
    try (InputStream body = url.openStream()) {
      return body.readAllBytes();
    }
  }

  private static void withTimeouts(HttpURLConnection connection) {
    connection.setConnectTimeout(2_000);
    connection.setReadTimeout(5_000);
  }
}
