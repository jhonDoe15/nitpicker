package shop;

import jakarta.persistence.EntityManager;
import java.util.List;

class Paging {
  EntityManager em;

  void references(List<Long> ids, List<Order> orders) {
    for (long id : ids) {
      em.getReference(Order.class, id);
    }
    for (Order order : orders) {
      em.contains(order);
    }
  }

  void pagedQueries(int pages, List<Long> ids) {
    for (int page = 0; page < pages; page++) {
      em.createQuery("select o from Order o order by o.id", Order.class)
          .setFirstResult(page * 500)
          .setMaxResults(500)
          .getResultList();
    }
    for (int from = 0; from < ids.size(); from += 100) {
      em.createQuery("select o from Order o where o.id in :ids", Order.class)
          .setParameter("ids", ids.subList(from, Math.min(from + 100, ids.size())))
          .getResultList();
    }
  }

  void perIdQueries(List<Long> ids) {
    for (long id : ids) {
      em.createQuery("select o from Order o where o.id = :id", Order.class)
          .setParameter("id", id)
          .getResultList();
    }
  }

  void lookups(List<Long> ids) {
    for (long id : ids) {
      em.find(Order.class, id);
    }
  }

  void singles(int count) {
    for (int index = 0; index < count; index++) {
      em.createQuery("select o from Order o order by o.id", Order.class)
          .setFirstResult(index)
          .setMaxResults(1)
          .getSingleResult();
    }
  }

  void comparisons(List<Tracked> items, Tracked target) {
    for (Tracked item : items) {
      item.equals(target);
    }
  }
}

class Tracked {
  static OrderRepository known;
  static List<Order> loaded;

  @Override
  public boolean equals(Object other) {
    loaded = known.findAll();
    return other == this;
  }

  @Override
  public int hashCode() {
    return 1;
  }
}
