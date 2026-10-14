package shop.orders;

import org.springframework.transaction.annotation.Transactional;

public interface AuditPort {
  @Transactional
  void record(String event);
}
