package com.acme.features.orders;

import java.sql.Connection;
import java.util.List;
import java.util.function.Supplier;
import javax.sql.DataSource;

public class OrderStore {
  public static OrderStore over(DataSource source) {
    return new OrderStore();
  }

  public static OrderView first(DataSource source) {
    return null;
  }

  public Supplier<List<Connection>> connections() {
    return List::of;
  }

  public OrderView find(long id) {
    return new OrderView(id);
  }

  Connection packagePrivate() {
    return null;
  }
}
