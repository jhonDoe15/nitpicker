package shop;

import jakarta.persistence.EntityManager;
import java.util.List;

public class PlainJpa {
  private final EntityManager em;

  public PlainJpa(EntityManager em) {
    this.em = em;
  }

  public void retag(List<Order> orders) {
    for (Order order : orders) {
      em.createQuery("update Order o set o.tags = :t where o.id = :id")
          .setParameter("t", order.tags())
          .setParameter("id", order.id())
          .executeUpdate();
    }
  }

  public void persistAll(List<Order> orders) {
    for (int i = 0; i < orders.size(); i++) {
      em.persist(orders.get(i));
      if (i % 50 == 0) {
        em.flush();
        em.clear();
      }
    }
  }

  public void mergeAll(List<Order> orders) {
    orders.forEach(em::merge);
  }

  public Object byName(String name) {
    return em.createNativeQuery("select id from orders where name = :n")
        .setParameter("n", name)
        .getResultList();
  }

  public String mode() {
    return System.getProperty("app.mode", "default");
  }

  public record Order(Long id, String tags) {}
}
