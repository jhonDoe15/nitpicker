package shop.rows;

import java.util.List;
import org.springframework.transaction.annotation.Transactional;

public class TicketUpdates {
  private final TicketRepository tickets;

  public TicketUpdates(TicketRepository tickets) {
    this.tickets = tickets;
  }

  public void expire() {
    List<Ticket> stale = tickets.findByStatus("OPEN");
    stale.forEach(ticket -> ticket.setStatus("EXPIRED"));
    tickets.saveAll(stale);
  }

  @Transactional
  public void close(String reason) {
    for (Ticket ticket : tickets.findByStatus("OPEN")) {
      ticket.setStatus(reason);
    }
  }

  public void purge() {
    List<Ticket> old = tickets.findByStatus("OLD");
    tickets.deleteAll(old);
  }
}
