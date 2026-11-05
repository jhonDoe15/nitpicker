package shop.remote;

import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.List;

public final class Requests {
  private static final Duration DEADLINE = Duration.ofSeconds(10);

  public HttpRequest plain(URI uri) {
    return HttpRequest.newBuilder(uri).build(); // violation: HttpWithoutTimeout
  }

  public HttpRequest post(URI uri, String body) {
    return HttpRequest.newBuilder() // violation: HttpWithoutTimeout
        .uri(uri)
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .build();
  }

  public HttpRequest timed(URI uri) {
    return HttpRequest.newBuilder(uri).timeout(DEADLINE).GET().build();
  }

  public HttpRequest timedLater(URI uri) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(uri);
    builder.timeout(DEADLINE);
    return builder.build();
  }

  public List<HttpRequest> untimedVariable(List<URI> uris) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(); // violation: HttpWithoutTimeout
    return uris.stream().map(uri -> builder.uri(uri).build()).toList();
  }

  public HttpRequest configuredByHelper(URI uri) {
    HttpRequest.Builder builder = HttpRequest.newBuilder(uri);
    withDeadline(builder);
    return builder.build();
  }

  public HttpRequest.Builder base() {
    return HttpRequest.newBuilder();
  }

  public HttpRequest copied(HttpRequest original) {
    return HttpRequest.newBuilder(original, (name, value) -> true).build();
  }

  private static void withDeadline(HttpRequest.Builder builder) {
    builder.timeout(DEADLINE);
  }
}
