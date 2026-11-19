package shop.queries;

import java.text.MessageFormat;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class QueryForms {
  private final JdbcTemplate jdbc;
  private static final List<String> COLUMNS = List.of("id", "name", "price");

  private final JdbcClient client;

  public QueryForms(JdbcTemplate jdbc, JdbcClient client) {
    this.jdbc = jdbc;
    this.client = client;
  }

  public List<Map<String, Object>> ordered(boolean descending) {
    return client.sql("select * from product order by id " + (descending ? "desc" : "asc")).query().listOfRows();
  }

  public List<Map<String, Object>> table() {
    return jdbc.queryForList(String.format("select * from %s", "product"));
  }

  public List<Map<String, Object>> inList(List<Long> ids) {
    String marks = String.join(",", Collections.nCopies(ids.size(), "?"));
    return jdbc.queryForList("select * from product where id in (" + marks + ")", ids.toArray());
  }

  public List<Map<String, Object>> reassigned(String name) {
    String sql = "select * from product";
    sql = sql + " where name = '" + name + "'";
    return jdbc.queryForList(sql); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> concatenated(String name) {
    String sql = "select * from product where name = ";
    sql = sql.concat(name);
    return jdbc.queryForList(sql); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> joined(List<String> parts) {
    return jdbc.queryForList(String.join(" ", parts)); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> messageFormat(String name) {
    return jdbc.queryForList(MessageFormat.format("select * from product where name = {0}", name)); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> inlineBuilder(String name) {
    return jdbc.queryForList(new StringBuilder("select * from product where name = ").append(name).toString()); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> chosen(boolean archived) {
    String table = archived ? "product_archive" : "product";
    return jdbc.queryForList("select * from " + table);
  }

  enum Direction { ASC, DESC }

  public List<Map<String, Object>> columns() {
    String sql = "insert into product (" + String.join(",", COLUMNS) + ") values ("
        + String.join(",", Collections.nCopies(COLUMNS.size(), "?")) + ")";
    return jdbc.queryForList(sql);
  }

  public List<Map<String, Object>> byType() {
    return jdbc.queryForList("select * from " + QueryForms.class.getSimpleName() + " where 1 = 1");
  }

  public List<Map<String, Object>> directed(Direction direction, long id) {
    return jdbc.queryForList("select * from product where id = " + id + " order by name " + direction.name());
  }

  public List<Map<String, Object>> rawParameter(String column) {
    return jdbc.queryForList("select " + column + " from product"); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> shoutedParameter(String column) {
    String ORDER = column;
    return jdbc.queryForList("select * from product order by " + ORDER); // violation: SpringQueryConcatenation
  }

  public List<Map<String, Object>> shoutedConstant() {
    final String ORDER = "name";
    return jdbc.queryForList("select * from product order by " + ORDER);
  }
}
