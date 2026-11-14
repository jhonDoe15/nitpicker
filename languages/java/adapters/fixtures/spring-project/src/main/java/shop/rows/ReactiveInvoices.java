package shop.rows;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;

public interface ReactiveInvoices extends ReactiveCrudRepository<Invoice, Long> {
  @Query("select i from Invoice i where i.customerName = :name")
  Flux<Invoice> forCustomer(@Param("name") String name);
}
