package shop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
  private static final Logger LOG = LoggerFactory.getLogger(OrderService.class);

  public boolean cancel(Status status) {
    if (!Orders.isOpen(status)) {
      LOG.warn("Order in status {} cannot be cancelled", status);
      return false;
    }
    return true;
  }
}
