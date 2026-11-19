package shop.nullable;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;

public final class TemplateLocator {
  public boolean exists(URL location) {
    return new File(location.getFile()).exists(); // violation: UrlPathUsedAsFile
  }

  public Path rootOf(URL location) {
    String stripped = location.getPath().replace("file:", "");
    return Paths.get(stripped); // violation: UrlPathUsedAsFile
  }

  public Path resource(Class<?> owner, String name) {
    return Path.of(owner.getResource(name).getPath()); // violation: UrlPathUsedAsFile
  }

  public FileInputStream open(URL location) throws IOException {
    return new FileInputStream(location.getPath().substring(1)); // violation: UrlPathUsedAsFile
  }

  public boolean existsByUri(URL location) throws URISyntaxException {
    return new File(location.toURI()).exists();
  }

  public Path rootByUri(URL location) throws URISyntaxException {
    return Path.of(location.toURI());
  }

  public File decoded(URL location) {
    return new File(URLDecoder.decode(location.getFile(), StandardCharsets.UTF_8));
  }

  public String describe(URL location) {
    return location.getProtocol() + ":" + location.getPath();
  }

  public File fallback(URL location) {
    try {
      return new File(location.toURI());
    } catch (URISyntaxException ex) {
      return new File(location.getFile());
    }
  }

  public File fallbackByIllegalArgument(URL location) {
    try {
      return Path.of(location.toURI()).toFile();
    } catch (URISyntaxException | IllegalArgumentException ex) {
      return new File(location.getPath());
    }
  }

  public File decodedFallback(URL location, String entry) {
    File direct = new File(location.getFile());
    if (direct.exists()) {
      return direct;
    }
    return new File(location.getFile() + URLDecoder.decode(entry, StandardCharsets.UTF_8));
  }

  public boolean sameUri(URL location) throws URISyntaxException {
    File byUri = new File(location.toURI());
    return byUri.equals(new File(location.getFile()));
  }
}
