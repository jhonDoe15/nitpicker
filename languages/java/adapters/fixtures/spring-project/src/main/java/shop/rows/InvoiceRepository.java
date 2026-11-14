package shop.rows;

import java.util.List;
import java.util.stream.Stream;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
  @Query("select i from Invoice i where i.customerName = :name")
  List<Invoice> forCustomer(@Param("name") String name);

  @Query("select i from Invoice i where i.status = :status")
  Stream<Invoice> streamWith(@Param("status") Invoice.Status status);

  @Query("select i from Invoice i where i.customerName = :name")
  Page<Invoice> pageFor(@Param("name") String name, Pageable page);

  @Query("select i from Invoice i order by i.total desc")
  List<Invoice> largest(Limit limit);

  @Query("select i.customerName from Invoice i")
  List<String> customerNames();

  @Query("select count(i) from Invoice i where i.customerName = :name")
  long countFor(@Param("name") String name);
}
