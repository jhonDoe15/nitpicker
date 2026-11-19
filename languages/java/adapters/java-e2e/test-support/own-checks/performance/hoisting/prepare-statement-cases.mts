import { PREPARE_STATEMENT_DECLINED as DECLINED } from './prepare-statement-declines.mts';

const MAIN = 'src/main/java/demo';

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
    if (!items.isEmpty()) {
      try (PreparedStatement statement = connection.prepareStatement(SQL)) {
        for (Item item : items) {
          statement.setLong(1, item.id());
          statement.setString(2, item.name());
          statement.executeUpdate();
        }
      }
    }
  }

  int count(Connection connection, int times) throws SQLException {
    int total = 0;
    if (0 < times) {
      try (PreparedStatement statement = connection.prepareStatement("delete from item where id < 5")) {
        for (int index = 0; index < times; index++) {
          total += statement.executeUpdate();
          if (total > 100) {
            continue;
          }
          total++;
        }
      }
    }
    return total;
  }

  void loop(Connection connection, List<Item> items) throws SQLException {
    int next = 0;
    if (next < items.size()) {
      try (PreparedStatement statement = connection.prepareStatement("update item set name = ? where id = ?")) {
        while (next < items.size()) {
          statement.setLong(2, items.get(next).id());
          statement.setString(1, items.get(next++).name());
          statement.execute();
        }
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
