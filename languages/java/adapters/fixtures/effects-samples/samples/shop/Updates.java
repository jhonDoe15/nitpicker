package shop;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import java.util.List;
import org.hibernate.envers.Audited;
import org.springframework.data.repository.CrudRepository;
import org.springframework.transaction.annotation.Transactional;

@Entity
class Ledger {
  @Id Long id;

  @Version Long version;

  String state;

  void setState(String state) {
    this.state = state;
  }
}

interface LedgerRepository extends CrudRepository<Ledger, Long> {
  List<Ledger> findByState(String state);
}

@Entity
class Seat {
  @Id Long id;

  @ElementCollection List<String> tags;

  int position;

  void setPosition(int position) {
    this.position = position;
  }

  void setZone(String zone) {}
}

@Entity
@Audited
class Slot {
  @Id Long id;

  String state;

  void setState(String state) {
    this.state = state;
  }
}

interface SeatRepository extends CrudRepository<Seat, Long> {
  List<Seat> findByZone(String zone);
}

interface SlotRepository extends CrudRepository<Slot, Long> {
  List<Slot> findByState(String state);
}

class Updates {
  SeatRepository seats;
  SlotRepository slots;
  OrderRepository orders;
  LedgerRepository ledgers;

  void forEachThenSave() {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    stale.forEach(order -> order.setStatus("EXPIRED"));
    orders.saveAll(stale);
  }

  void loopThenSave(String status) {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    for (Order order : stale) {
      order.setStatus(status);
    }
    orders.saveAll(stale);
  }

  @Transactional
  void dirtyChecking() {
    for (Order order : orders.findByIdIn(List.of(1L))) {
      order.setStatus("EXPIRED");
    }
  }

  void deleteAllRows() {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    orders.deleteAll(stale);
  }

  void deleteEach() {
    for (Order order : orders.findByIdIn(List.of(1L))) {
      orders.delete(order);
    }
  }

  void dependsOnElement() {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    stale.forEach(order -> order.setStatus(String.valueOf(order.getId())));
    orders.saveAll(stale);
  }

  void callsAnotherBean() {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    stale.forEach(order -> {
      order.setStatus("EXPIRED");
      audit(order);
    });
    orders.saveAll(stale);
  }

  void versioned() {
    List<Ledger> rows = ledgers.findByState("open");
    rows.forEach(row -> row.setState("closed"));
    ledgers.saveAll(rows);
  }

  void usedElsewhere() {
    List<Order> stale = orders.findByIdIn(List.of(1L));
    stale.forEach(order -> order.setStatus("EXPIRED"));
    orders.saveAll(stale);
    System.out.println(stale.size());
  }

  void notWritten() {
    for (Order order : orders.findByIdIn(List.of(1L))) {
      order.setStatus("EXPIRED");
    }
  }

  void audit(Order order) {}

  void collectionTable() {
    seats.deleteAll(seats.findByZone("a"));
  }

  void collectionTableUpdate() {
    List<Seat> rows = seats.findByZone("a");
    rows.forEach(seat -> seat.setZone("b"));
    seats.saveAll(rows);
  }

  void audited() {
    List<Slot> rows = slots.findByState("open");
    rows.forEach(slot -> slot.setState("closed"));
    slots.saveAll(rows);
  }

  void renumber() {
    int position = 0;
    List<Seat> rows = seats.findByZone("a");
    for (Seat seat : rows) {
      seat.setPosition(position++);
    }
    seats.saveAll(rows);
  }
}
