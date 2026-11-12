package shop;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Optional;

public final class Links {
  private static final String HOME = "https://shop.example/";
  private static final String HELP = HOME + "help";
  private static final URI DOCS = URI.create("https://shop.example/docs");
  private static final URI BLOCK = URI.create("""
      https://shop.example/block""");
  private static final URI CONFIGURED = URI.create(System.getenv("SHOP_URL")); // violation: UriCreateDynamic

  private Links() {}

  public static URI home() {
    return URI.create(HOME);
  }

  public static URI help() {
    return URI.create(HELP + "/faq");
  }

  public static URI cover(String path) {
    return URI.create(path.strip()); // violation: UriCreateDynamic
  }

  public static URI joined(String path) {
    return URI.create(HOME + path); // violation: UriCreateDynamic
  }

  public static Optional<URI> parsed(String text) {
    try {
      return Optional.of(URI.create(text));
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
  }

  public static List<URI> mapped(List<String> texts) {
    return texts.stream().map(URI::create).toList(); // violation: UriCreateDynamic
  }

  public static List<URI> all(List<String> texts) {
    try {
      return texts.stream().map(text -> URI.create(text)).toList();
    } catch (RuntimeException e) {
      return List.of();
    }
  }

  public static List<URI> mappedInTry(List<String> texts) {
    try {
      return texts.stream().map(URI::create).toList();
    } catch (IllegalArgumentException e) {
      return List.of();
    }
  }

  public static Optional<URI> multi(String text) {
    try {
      return Optional.of(URI.create(text));
    } catch (IllegalStateException | IllegalArgumentException e) {
      return Optional.empty();
    }
  }

  public static Optional<URI> wrongCatch(String text) {
    try {
      return Optional.of(URI.create(text)); // violation: UriCreateDynamic
    } catch (IllegalStateException e) {
      return Optional.empty();
    }
  }

  public static URI inCatch(String text) {
    try {
      return URI.create(HOME);
    } catch (IllegalArgumentException e) {
      return URI.create(text); // violation: UriCreateDynamic
    }
  }

  public static Runnable later(String text) {
    try {
      return new Runnable() {
        @Override
        public void run() {
          URI.create(text); // violation: UriCreateDynamic
        }
      };
    } catch (IllegalArgumentException e) {
      return () -> {};
    }
  }

  public static Optional<URI> encoded(String host, String path) {
    try {
      return Optional.of(new URI("https", host, path, null));
    } catch (URISyntaxException e) {
      return Optional.empty();
    }
  }
}
