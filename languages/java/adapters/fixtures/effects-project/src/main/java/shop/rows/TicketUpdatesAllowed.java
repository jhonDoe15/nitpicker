package shop.rows;

import java.util.List;

public class TicketUpdatesAllowed {
  private final TicketRepository tickets;
  private final ReceiptRepository receipts;

  public TicketUpdatesAllowed(TicketRepository tickets, ReceiptRepository receipts) {
    this.tickets = tickets;
    this.receipts = receipts;
  }

  public void fromElement() {
    List<Ticket> open = tickets.findByStatus("OPEN");
    open.forEach(ticket -> ticket.setStatus(ticket.getStatus() + "-seen"));
    tickets.saveAll(open);
  }

  public void versioned() {
    List<Receipt> open = receipts.findByStatus("OPEN");
    open.forEach(receipt -> receipt.setStatus("PAID"));
    receipts.saveAll(open);
  }

  public int usedAfterwards() {
    List<Ticket> open = tickets.findByStatus("OPEN");
    open.forEach(ticket -> ticket.setStatus("EXPIRED"));
    tickets.saveAll(open);
    return open.size();
  }

  public void notWritten() {
    for (Ticket ticket : tickets.findByStatus("OPEN")) {
      ticket.setStatus("EXPIRED");
    }
  }
}
