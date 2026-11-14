export const JAVA_COPIES = `
package com.example.adapters;

import java.io.IOException;
import java.net.URI;
import java.net.URL;

public final class Adapters {
  private static final Logger LOG = Logger.create();
  private int reads;

  public static final Adapter<URL> URL_ADAPTER = new Adapter<URL>() {
    @Override
    public URL read(JsonReader in) throws IOException {
      if (in.peek() == JsonToken.NULL) {
        in.nextNull();
        return null;
      }
      String nextString = in.nextString();
      LOG.debug("read url");
      return "null".equals(nextString) ? null : new URL(nextString);
    }
  };

  public static final Adapter<URL> SAFE_URL_ADAPTER = new Adapter<URL>() {
    @Override
    public URL read(JsonReader reader) throws IOException {
      if (reader.peek() == JsonToken.NULL) {
        reader.nextNull();
        return null;
      }
      String text = reader.nextString();
      LOG.debug("read safe url");
      return "null".equals(text) ? null : new URL(text);
    }
  };

  long sumWeights(List<Item> items) {
    long total = 0;
    for (Item item : items) {
      if (item.weight() > 0 && item.visible()) {
        total += item.weight() * item.count();
      }
    }
    reads++;
    return normalize(total);
  }

  long addWeights(List<Item> entries) {
    long sum = 0;
    for (Item entry : entries) {
      if (entry.weight() > 0 && entry.visible()) {
        sum += entry.weight() * entry.count();
      }
    }
    reads++;
    return round(sum);
  }

  Float maxFloat(Float[] values) {
    Float best = values[0];
    for (Float value : values) {
      if (value != null && value.compareTo(best) > 0 && !value.isNaN()) {
        best = value;
      }
    }
    return best;
  }

  Double maxDouble(Double[] values) {
    Double best = values[0];
    for (Double value : values) {
      if (value != null && value.compareTo(best) > 0 && !value.isNaN()) {
        best = value;
      }
    }
    return best;
  }

  void importUsers(List<Row> rows) {
    long started = System.nanoTime();
    List<Row> batch = rows.stream().filter(row -> row.kind() == Kind.USER).toList();
    List<Row> valid = batch.stream().filter(row -> row.email().contains("@") && !row.name().isEmpty()).toList();
    Map<String, Row> unique = valid.stream().collect(Collectors.toMap(row -> row.email().toLowerCase(), row -> row));
    store.write("users", unique.values());
    LOG.info("took " + (System.nanoTime() - started));
  }

  void inviteUsers(List<Row> rows, String team) {
    List<Row> batch = rows.stream().filter(row -> row.kind() == Kind.USER).toList();
    List<Row> valid = batch.stream().filter(row -> row.email().contains("@") && !row.name().isEmpty()).toList();
    Map<String, Row> unique = valid.stream().collect(Collectors.toMap(row -> row.email().toLowerCase(), row -> row));
    store.invite(team, unique.values());
  }
}
`;

export const JAVA_FORMS = `
package com.example;

public class Forms {
  private final Runnable onClose = () -> System.out.println("closed");
  public Forms() {}
  public Forms(int size) { this(); }
  void load(String path) {}
  void load(java.nio.file.Path path) {}
  abstract void hidden();
  enum Mode { ON { void run() {} } }
  record Point(int x, int y) { Point { } }
  interface Shape { default double area() { return 0; } }
}
`;
