package shop.loops;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.List;
import java.util.Map;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import shop.catalog.Product;

public final class LoopCalls {
  private LoopCalls() {}

  interface ProductClient {
    Mono<Product> fetch(Long id);
  }

  public static Mono<Product> single(ProductClient client, Long id) {
    return Mono.just(id).filter(value -> value > 0).flatMap(value -> client.fetch(value));
  }

  public static Flux<Product> each(ProductClient client, List<Long> ids) {
    return Flux.fromIterable(ids).flatMap(id -> client.fetch(id)); // violation: IoCallInLoop
  }

  public static void headers(HttpURLConnection conn, Map<String, List<String>> headers)
      throws IOException {
    for (Map.Entry<String, List<String>> header : headers.entrySet()) {
      for (String value : header.getValue()) {
        conn.addRequestProperty(header.getKey(), value);
        conn.setRequestProperty("X-Seen", value);
      }
      conn.connect(); // violation: IoCallInLoop
    }
  }
}
