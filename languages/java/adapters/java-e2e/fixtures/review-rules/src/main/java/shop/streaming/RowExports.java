package shop.streaming;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.data.repository.Repository;
import org.springframework.jdbc.core.JdbcTemplate;

public final class RowExports {
  public record Row(long id, String path) {}

  public interface Rows extends Repository<Row, Long> {
    Stream<Row> streamAllBy();

    List<Row> findAllBy();
  }

  private static final int BATCH = 500;

  private final Rows rows;
  private final EntityManager entities;
  private final JdbcTemplate jdbc;

  public RowExports(Rows rows, EntityManager entities, JdbcTemplate jdbc) {
    this.rows = rows;
    this.entities = entities;
    this.jdbc = jdbc;
  }

  public List<String> paths() {
    return rows.streamAllBy().map(Row::path).toList(); // violation: StreamedRowsCollected
  }

  public Map<Long, Row> byId() {
    try (Stream<Row> all = rows.streamAllBy()) {
      return all.collect(Collectors.toMap(Row::id, Function.identity())); // violation: StreamedRowsCollected
    }
  }

  public List<Row> loaded() {
    List<Row> found = new ArrayList<>();
    Stream<Row> streamed = entities.createQuery("select r from Row r", Row.class).getResultStream();
    streamed.forEach(found::add); // violation: StreamedRowsCollected
    return found;
  }

  public List<Long> ids() {
    return jdbc.queryForStream("select id", (rs, n) -> rs.getLong(1)).toList(); // violation: StreamedRowsCollected
  }

  public void exportInBatches(Consumer<List<Row>> sink) {
    List<Row> batch = new ArrayList<>();
    try (Stream<Row> all = rows.streamAllBy()) {
      all.forEach(
          row -> {
            batch.add(row);
            if (batch.size() >= BATCH) {
              sink.accept(List.copyOf(batch));
              batch.clear();
            }
          });
    }
    sink.accept(batch);
  }

  public long count() {
    return rows.streamAllBy().count(); // violation: SpringDataFilterInQuery
  }

  public List<Row> firstPage() {
    return rows.streamAllBy().limit(BATCH).toList();
  }

  public Map<String, Long> perPath() {
    return rows.streamAllBy().collect(Collectors.groupingBy(Row::path, Collectors.counting()));
  }

  public List<Row> reassigned() {
    Stream<Row> all = rows.streamAllBy();
    all = all.limit(BATCH);
    return all.toList();
  }

  public List<Row> listed() {
    return rows.findAllBy();
  }

  public List<String> names(List<Row> given) {
    return given.stream().map(Row::path).toList();
  }
}
