package shop.trash;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface InvoiceRepository extends JpaRepository<Invoice, Long> {
  List<Invoice> findByNumber(String number);

  List<Invoice> findByNumberStartingWith(String prefix);

  List<Invoice> findByNumberEndingWith(String suffix);

  List<Invoice> findByNumberContaining(String part);

  List<Invoice> findByNumberIn(List<String> numbers);
}

interface NoteRepository extends JpaRepository<Note, Long> {
  List<Note> findByTitleAndArchivedFalse(String title);

  List<Note> findByAuthorAndArchivedFalse(String author);

  List<Note> findByTitle(String title);

  List<Note> findByAuthor(String author);

  List<Note> findByTitleContaining(String part);
}
