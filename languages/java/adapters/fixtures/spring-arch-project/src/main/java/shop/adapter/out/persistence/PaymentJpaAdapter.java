package shop.adapter.out.persistence;

import org.springframework.stereotype.Component;
import shop.application.port.out.PaymentStore;
import shop.domain.model.Payment;

@Component
public class PaymentJpaAdapter implements PaymentStore {
  @Override
  public Payment save(Payment payment) {
    return new Payment(1L, payment.cents());
  }
}
