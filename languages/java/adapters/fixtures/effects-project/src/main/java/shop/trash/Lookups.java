package shop.trash;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
class Lookups {
  private final InvoiceRepository invoices;
  private final NoteRepository notes;

  Lookups(InvoiceRepository invoices, NoteRepository notes) {
    this.invoices = invoices;
    this.notes = notes;
  }

  List<Invoice> invoice(String number) {
    return invoices.findByNumber(number);
  }

  List<Note> byTitle(String title) {
    return notes.findByTitle(title);
  }

  List<Note> byAuthor(String author) {
    return notes.findByAuthor(author);
  }
}
