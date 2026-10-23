package shop.application.port.out;

import shop.domain.model.Payment;

public interface PaymentStore {
  Payment save(Payment payment);
}
