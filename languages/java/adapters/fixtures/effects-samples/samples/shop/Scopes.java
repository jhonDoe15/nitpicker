package shop;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.function.Supplier;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

class Scopes {
  OrderRepository repo;
  Gateway gateway;
  Callees callees;
  Supplier<String> later;

  @Transactional
  public void confirm(Order order) {
    repo.save(order);
    gateway.fetch(order.getId());
  }

  @Transactional
  private void hidden(Order order) {
    repo.save(order);
    gateway.fetch(order.getId());
  }

  @Transactional
  public void onThread(Order order) {
    repo.save(order);
    new Thread(() -> gateway.fetch(order.getId())).start();
  }

  @Transactional
  public void stored(Order order) {
    repo.save(order);
    later = () -> gateway.fetch(order.getId());
  }

  @Transactional
  public void callsAsync(Order order) {
    repo.save(order);
    callees.notifyLater(order.getId());
    callees.outside(order.getId());
  }

  void manual(Connection connection, Order order, boolean undo) throws SQLException {
    connection.setAutoCommit(false);
    repo.save(order);
    if (undo) {
      connection.rollback();
      return;
    }
    gateway.fetch(order.getId());
    connection.commit();
  }
}

class Callees {
  Gateway gateway;

  @Async
  public void notifyLater(long id) {
    gateway.fetch(id);
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void outside(long id) {
    gateway.fetch(id);
  }
}
