package shop.catalog;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class ProductQueries {
  private static final String BASE = "select name from product";
  private static final String BY_NAME = BASE + " where name = :name";

  private final JdbcTemplate jdbc;
  private final NamedParameterJdbcTemplate named;
  private final JdbcClient client;
  private final EntityManager entityManager;

  public ProductQueries(
      JdbcTemplate jdbc,
      NamedParameterJdbcTemplate named,
      JdbcClient client,
      EntityManager entityManager) {
    this.jdbc = jdbc;
    this.named = named;
    this.client = client;
    this.entityManager = entityManager;
  }

  public List<String> search(String term) {
    return jdbc.queryForList("select name from product where name like '%" + term + "%'", String.class); // violation: SpringQueryConcatenation
  }

  public List<String> sorted(String column) {
    return jdbc.queryForList(String.format("select name from product order by %s", column), String.class); // violation: SpringQueryConcatenation
  }

  public List<String> formatted(String column) {
    return jdbc.queryForList("select name from product order by %s".formatted(column), String.class); // violation: SpringQueryConcatenation
  }

  public Long byId(long id) {
    String sql = "select version from product where id = " + id;
    return jdbc.queryForObject(sql, Long.class); // violation: SpringQueryConcatenation
  }

  public int clear(long id) {
    String sql = "update product set version = 0";
    sql += " where id = " + id;
    return jdbc.update(sql); // violation: SpringQueryConcatenation
  }

  public int namedUpdate(String name) {
    return named.update("delete from product where name = '" + name + "'", java.util.Map.of()); // violation: SpringQueryConcatenation
  }

  public Object clientSql(String name) {
    return client.sql("select * from product where name = '" + name + "'").query().rowSet(); // violation: SpringQueryConcatenation
  }

  public List<Product> jpql(String category) {
    return entityManager
        .createQuery("select p from Product p where p.name = '" + category + "'", Product.class) // violation: SpringQueryConcatenation
        .getResultList();
  }

  public int nativeUpdate(String name) {
    Query query = entityManager.createNativeQuery("update product set version = 0 where name = '" + name + "'"); // violation: SpringQueryConcatenation, SpringDataNativeQuery
    return query.executeUpdate();
  }

  public List<String> built(String name) {
    StringBuilder sql = new StringBuilder("select name from product where 1 = 1");
    if (name != null) {
      sql.append(" and name = '").append(name).append("'");
    }
    return jdbc.queryForList(sql.toString(), String.class); // violation: SpringQueryConcatenation
  }

  public List<String> fixedParts(boolean onlyNamed) {
    StringBuilder sql = new StringBuilder("select name from product");
    if (onlyNamed) {
      sql.append(" where name is not null");
    }
    return jdbc.queryForList(sql.toString(), String.class);
  }

  public List<String> bound(String term) {
    return jdbc.queryForList("select name from product where name like ?", String.class, "%" + term + "%");
  }

  public List<String> constants() {
    return jdbc.queryForList(BASE + " order by name", String.class);
  }

  public int byName(String name) {
    return named.update(BY_NAME, java.util.Map.of("name", name));
  }

  public List<Product> jpqlBound(String category) {
    return entityManager
        .createQuery(
            """
            select p from Product p
            where p.name = :name
            """,
            Product.class)
        .setParameter("name", category)
        .getResultList();
  }

  @SuppressWarnings("PMD.SpringDataNativeQuery")
  public Object lockOne() {
    return entityManager.createNativeQuery("select 1 for update skip locked").getSingleResult();
  }

  public Object unmarked() {
    return entityManager.createNativeQuery("select 1").getSingleResult(); // violation: SpringDataNativeQuery
  }
}
