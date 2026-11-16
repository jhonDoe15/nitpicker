package shop.rows;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {
  List<Receipt> findByStatus(String status);
}
