package shop.loops;

import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
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

  public static void bindings(PreparedStatement statement, List<Long> ids) throws SQLException {
    int index = 1;
    for (Long id : ids) {
      statement.setLong(index++, id);
    }
    statement.executeUpdate();
  }

  public static int memory(EntityManager em, List<Product> products, List<Long> ids) {
    int count = 0;
    for (Product product : products) {
      count += em.contains(product) ? 1 : 0;
    }
    for (Long id : ids) {
      em.getReference(Product.class, id);
    }
    return count;
  }

  public static void lookups(EntityManager em, List<Long> ids) {
    for (Long id : ids) {
      em.find(Product.class, id); // violation: IoCallInLoop
    }
  }

  public static void pages(EntityManager em, int pages, List<Long> ids) {
    for (int page = 0; page < pages; page++) {
      em.createQuery("select p from Product p order by p.id", Product.class)
          .setFirstResult(page * 500)
          .setMaxResults(500)
          .getResultList();
    }
    for (int from = 0; from < ids.size(); from += 100) {
      em.createQuery("select p from Product p where p.id in :ids", Product.class)
          .setParameter("ids", ids.subList(from, Math.min(from + 100, ids.size())))
          .getResultList();
    }
    for (Long id : ids) {
      em.createQuery("select p from Product p where p.id = :id", Product.class) // violation: IoCallInLoop
          .setParameter("id", id)
          .getResultList();
    }
  }

  interface OrderDao {
    void setStatus(Long id, String status);
  }

  interface CacheClient {
    boolean setIfAbsent(String key, String value);

    boolean contains(String key);
  }

  public static void writes(OrderDao orderDao, CacheClient cacheClient, List<Long> ids) {
    for (Long id : ids) {
      orderDao.setStatus(id, "DONE"); // violation: IoCallInLoop
      cacheClient.setIfAbsent("seen:" + id, "1"); // violation: IoCallInLoop
      cacheClient.contains("seen:" + id); // violation: IoCallInLoop
    }
  }

  public static void firstOnly(EntityManager em, int count) {
    for (int index = 0; index < count; index++) {
      em.createQuery("select p from Product p order by p.id", Product.class) // violation: IoCallInLoop
          .setFirstResult(index)
          .setMaxResults(1)
          .getSingleResult();
    }
  }
}
