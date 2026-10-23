package shop.billing;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
  interface Total {
    BigDecimal getAmount();
  }

  @Query("select i from Invoice i where i.id > :from")
  List<Invoice> findFrom(Long from);

  @Query("select distinct i from Invoice i left join fetch i.lines")
  List<Invoice> findWithLines();

  @EntityGraph(attributePaths = {"customer"})
  List<Invoice> findByPayerId(Long payerId);

  @EntityGraph("Invoice.lines")
  List<Invoice> findByCustomerId(Long customerId);

  List<Total> findTotalsBy();
}
