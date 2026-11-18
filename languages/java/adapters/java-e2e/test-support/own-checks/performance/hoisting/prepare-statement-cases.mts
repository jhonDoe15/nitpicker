const MAIN = 'src/main/java/demo';

const DECLINED = `package demo;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class SqlDeclined {
  private static final String SQL = "update item set name = ? where id = ?";
  private Connection held;

  record Item(long id, String name, boolean named) {}

  void conditional(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        if (item.named()) {
          statement.setString(1, item.name());
        }
        statement.executeUpdate();
      }
    }
  }

  void missing(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.executeUpdate();
      }
    }
  }

  void escapes(Connection connection, List<Item> items, List<PreparedStatement> kept) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        kept.add(statement);
        statement.executeUpdate();
      }
    }
  }

  void handlers(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      } catch (SQLException failure) {
        System.out.println(failure);
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      } finally {
        System.out.println("done");
      }
    }
  }

  void resources(Connection connection, Connection other, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL);
          PreparedStatement second = other.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
        second.executeUpdate();
      }
    }
  }

  int jumps(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        if (statement.executeUpdate() == 0) {
          return 0;
        }
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        if (statement.executeUpdate() == 0) {
          break;
        }
      }
    }
    outer:
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
      continue outer;
    }
    return 1;
  }

  void changing(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(item.name())) {
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      String sql = "update item set name = ? where id = " + item.id();
      try (PreparedStatement statement = connection.prepareStatement(sql)) {
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
    }
    Connection current = connection;
    for (Item item : items) {
      current = held;
      try (PreparedStatement statement = current.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = held.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
    }
  }

  void more(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
      System.out.println(item);
    }
    for (Item item : items) {
      System.out.println(item);
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.setFetchSize(10);
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        connection.commit();
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        Runnable run = () -> System.out.println(statement);
        statement.executeUpdate();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(2, item.id());
        statement.setString(1, item.name());
        statement.addBatch();
      }
    }
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(item.name().length(), item.id());
        statement.setString(1, item.name());
        statement.executeUpdate();
      }
    }
  }

  void direct(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      PreparedStatement statement = connection.prepareStatement(SQL);
      statement.setLong(2, item.id());
      statement.setString(1, item.name());
      statement.executeUpdate();
      statement.close();
    }
  }
}
`;

export const PREPARE_STATEMENT_CASES = [
  {
    check: 'IIL_PREPARE_STATEMENT_IN_LOOP',
    file: `${MAIN}/SqlFixed.java`,
    before: `package demo;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

public class SqlFixed {
  private static final String SQL = "insert into item (id, name) values (?, ?)";

  record Item(long id, String name) {}

  void insert(Connection connection, List<Item> items) throws SQLException {
    for (Item item : items) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        statement.setLong(1, item.id());
        statement.setString(2, item.name());
        statement.executeUpdate();
      }
    }
  }

  int count(Connection connection, int times) throws SQLException {
    int total = 0;
    for (int index = 0; index < times; index++) {
      try (PreparedStatement statement = connection.prepareStatement("delete from item where id < 5")) {
        total += statement.executeUpdate();
        if (total > 100) {
          continue;
        }
        total++;
      }
    }
    return total;
  }

  void loop(Connection connection, List<Item> items) throws SQLException {
    int next = 0;
    while (next < items.size()) {
      try (PreparedStatement statement = connection.prepareStatement("update item set name = ? where id = ?")) {
        statement.setLong(2, items.get(next).id());
        statement.setString(1, items.get(next++).name());
        statement.execute();
      }
    }
  }
}
`,
    after: `package demo;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

public class SqlFixed {
  private static final String SQL = "insert into item (id, name) values (?, ?)";

  record Item(long id, String name) {}

  void insert(Connection connection, List<Item> items) throws SQLException {
    try (PreparedStatement statement = connection.prepareStatement(SQL)) {
      for (Item item : items) {
        statement.setLong(1, item.id());
        statement.setString(2, item.name());
        statement.executeUpdate();
      }
    }
  }

  int count(Connection connection, int times) throws SQLException {
    int total = 0;
    try (PreparedStatement statement = connection.prepareStatement("delete from item where id < 5")) {
      for (int index = 0; index < times; index++) {
        total += statement.executeUpdate();
        if (total > 100) {
          continue;
        }
        total++;
      }
    }
    return total;
  }

  void loop(Connection connection, List<Item> items) throws SQLException {
    int next = 0;
    try (PreparedStatement statement = connection.prepareStatement("update item set name = ? where id = ?")) {
      while (next < items.size()) {
        statement.setLong(2, items.get(next).id());
        statement.setString(1, items.get(next++).name());
        statement.execute();
      }
    }
  }
}
`,
    lines: [14, 25, 39],
  },
  {
    check: 'IIL_PREPARE_STATEMENT_IN_LOOP',
    file: `${MAIN}/SqlDeclined.java`,
    before: DECLINED,
    after: DECLINED,
    lines: [],
  },
];
