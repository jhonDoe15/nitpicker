package shop.customers;

import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CustomerReport {
  private final JdbcTemplate jdbc;
  private final EntityManager entities;

  public CustomerReport(JdbcTemplate jdbc, EntityManager entities) {
    this.jdbc = jdbc;
    this.entities = entities;
  }

  @GetMapping("/customers/count")
  public Integer count() {
    entities.clear();
    return jdbc.queryForObject("select count(*) from customer", Integer.class);
  }
}
