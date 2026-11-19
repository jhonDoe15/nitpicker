package shop.values;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.yaml.snakeyaml.Yaml;

public class Installments {
  private final JdbcTemplate jdbc;

  public Installments(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  Integer installment(String yaml) {
    Map<String, Object> details = new Yaml().load(yaml);
    return (Integer) details.get("installment"); // violation: MapValueCastToNumber
  }

  LocalDate dueDate(long id) {
    Map<String, ?> details = jdbc.queryForMap("select due_date from payments where id = ?", id);
    return (LocalDate) details.get("dueDate"); // violation: MapValueCastToNumber
  }

  int maxRetries(Properties props) {
    return props.containsKey("maxRetries") ? (int) props.get("maxRetries") : 3; // violation: MapValueCastToNumber
  }

  long statusType(long id) {
    Map<String, Object> statusMap = jdbc.queryForMap("select type from status where id = ?", id);
    return (Long) statusMap.get("type"); // violation: MapValueCastToNumber
  }

  int total() {
    int sum = 0;
    List<Map<String, Object>> rows = jdbc.queryForList("select amount from payments");
    for (Map<String, Object> row : rows) {
      sum += (int) row.get("amount"); // violation: MapValueCastToNumber
    }
    return sum;
  }

  BigDecimal firstPrice() {
    return (BigDecimal) jdbc.queryForMap("select price from prices").get("price"); // violation: MapValueCastToNumber
  }

  int fromParameter(Map<String, Object> details) {
    return (Integer) details.get("installment");
  }

  int numberValue(Map<String, Object> details) {
    return ((Number) details.get("installment")).intValue();
  }

  int parsed(Map<String, Object> details) {
    return Integer.parseInt(String.valueOf(details.get("installment")));
  }

  String text(Map<String, Object> details) {
    return (String) details.get("name");
  }

  int typedMap(Map<String, Integer> counts) {
    return (int) counts.get("installment");
  }

  int ownMap() {
    Map<String, Object> own = new HashMap<>();
    own.put("installment", 3);
    return (Integer) own.get("installment");
  }

  int literalMap() {
    Map<String, Object> fixed = Map.of("installment", 3);
    return (Integer) fixed.get("installment");
  }

  int filledProperties() {
    Properties filled = new Properties();
    filled.put("a", 1);
    return (Integer) filled.get("a");
  }

  int guardedByInstanceof(Properties props) {
    if (props.get("maxRetries") instanceof Integer) {
      return (Integer) props.get("maxRetries");
    }
    return props.get("maxRetries") instanceof Integer ? (int) props.get("maxRetries") : 0;
  }
}
