export const SOURCES = {
  'src/shop/Base.java': `package shop;

import jakarta.persistence.*;
import java.util.List;

@MappedSuperclass
public abstract class Base {
  @Id private Long id;
  @ElementCollection private List<String> notes;
}
`,
  'src/shop/Customer.java': `package shop;

import jakarta.persistence.*;

@Entity
public class Customer {
  @Id private Long id;
}
`,
  'src/shop/Item.java': `package shop;

import jakarta.persistence.*;
import java.util.List;

@Entity
public class Item {
  @Id private Long id;
  @ManyToOne(fetch = FetchType.LAZY) private Order order;
  @OneToMany private List<Part> parts;
  @OneToMany private List<Part> spares;
  @ManyToOne(fetch = FetchType.LAZY) private Part main;
}
`,
  'src/shop/Order.java': `package shop;

import jakarta.persistence.*;
import java.util.List;
import java.util.Set;

@Entity(name = "PurchaseOrder")
@NamedEntityGraph(name = "Order.all", attributeNodes = {@NamedAttributeNode("items"), @NamedAttributeNode("payments")})
@NamedEntityGraph(name = "Order.deep", attributeNodes = {@NamedAttributeNode(value = "items", subgraph = "item"), @NamedAttributeNode("customer")},
    subgraphs = @NamedSubgraph(name = "item", attributeNodes = {@NamedAttributeNode("parts")}))
@NamedQuery(name = "Order.full", query = "select o from PurchaseOrder o join fetch o.items join fetch o.payments")
public class Order extends Base {
  @OneToMany(mappedBy = "order", cascade = {CascadeType.PERSIST})
  private List<Item> items;
  @OneToMany(mappedBy = "order")
  private Set<Payment> payments;
  @ManyToOne(fetch = FetchType.LAZY)
  private Customer customer;
}
`,
  'src/shop/OrderRepository.java': `package shop;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OrderRepository extends JpaRepository<Order, Long> {
  @Query("select o from PurchaseOrder o join fetch o.items join fetch o.payments")
  List<Order> bad();

  @Query("""
      select distinct o from PurchaseOrder o
      left join fetch o.items i
      left join fetch i.parts
      join fetch o.customer
      """)
  List<Order> chain();

  @Query("select o from PurchaseOrder o left join fetch o.items i left join fetch i.parts left join fetch i.spares")
  List<Order> nested();

  @Query("select o from PurchaseOrder o join fetch o.items join fetch o.customer")
  List<Order> toOne();

  @Query("select o from PurchaseOrder o join fetch o.items join fetch o.notes")
  List<Order> elements();

  @EntityGraph(attributePaths = {"items", "payments"})
  List<Order> findByIdIn(List<Long> ids);

  @EntityGraph(attributePaths = {"items", "customer"})
  List<Order> findByCustomerId(Long id);
}
`,
  'src/shop/Part.java': `package shop;

import jakarta.persistence.*;

@Entity
public class Part {
  @Id private Long id;
}
`,
  'src/shop/Payment.java': `package shop;

import jakarta.persistence.*;

@Entity
public class Payment {
  @Id private Long id;
}
`,
  'src/shop/Queries.java': `package shop;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;

public class Queries {
  private final EntityManager em;

  Queries(EntityManager em) {
    this.em = em;
  }

  List<Order> jpql() {
    return em.createQuery("select o from PurchaseOrder o "
        + "join fetch o.items join fetch o.payments", Order.class).getResultList();
  }

  List<Order> criteria() {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Order> query = cb.createQuery(Order.class);
    Root<Order> root = query.from(Order.class);
    root.fetch("items", JoinType.LEFT);
    root.fetch("payments");
    return em.createQuery(query).getResultList();
  }

  List<Order> criteriaChain() {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Order> query = cb.createQuery(Order.class);
    Root<Order> root = query.from(Order.class);
    Fetch<Order, Item> items = root.fetch("items");
    items.fetch("parts");
    root.fetch("customer");
    return em.createQuery(query).getResultList();
  }

  static Specification<Order> withAll() {
    return (root, query, cb) -> {
      root.fetch("items");
      root.fetch("payments");
      return cb.conjunction();
    };
  }
}
`,
  'src/shop/Shelf.java': `package shop;

import jakarta.persistence.*;
import java.util.List;

@Entity
public class Shelf<T extends Comparable<T>> extends Order {
  @Id private Long id;
  @ManyToOne private Collection collection;
  @OneToMany private List<Item> books;
}
`,
  'src/shop/Collection.java': `package shop;

import jakarta.persistence.*;

@Entity
public class Collection {
  @Id private Long id;
}
`,
  'src/shop/Edges.java': `package shop;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.Root;

public class Edges {
  private EntityManager em;

  void toOneNamedCollection() {
    em.createQuery("select s from Shelf s join fetch s.collection join fetch s.books");
  }

  void twoQueries() {
    var q1 = em.getCriteriaBuilder().createQuery(Order.class);
    var r1 = q1.from(Order.class);
    r1.fetch("items");
    var q2 = em.getCriteriaBuilder().createQuery(Order.class);
    var r2 = q2.from(Order.class);
    r2.fetch("payments");
  }

  static class Inner {
    void p() { Root<Order> root = null; root.fetch("customer"); root.fetch("payments"); }

    void q() { Root<Order> root = null; root.fetch("items"); }
  }

  void sameLine() {
    em.createQuery("select o from PurchaseOrder o join fetch o.items"); em.createQuery("select o from PurchaseOrder o join fetch o.items join fetch o.payments");
  }

  void inherited() {
    em.createQuery("select s from Shelf s join fetch s.books join fetch s.payments");
  }
}
`,
  'src/shop/Odd.java': `package shop;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface Odd extends JpaRepository<Order, Long> {
  @EntityGraph(attributePaths = {"items(", "payments"})
  Order findOddById(Long id);
}
`,
};
