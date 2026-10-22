package com.acme.features.orders;

import java.sql.Connection;
import java.util.List;
import java.util.function.Supplier;

public class OrderStore {
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
