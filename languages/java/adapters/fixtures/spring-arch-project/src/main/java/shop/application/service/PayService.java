package shop.application.service;

import org.springframework.stereotype.Service;
import shop.application.port.in.PayUseCase;
import shop.application.port.out.PaymentStore;
import shop.domain.model.Payment;

@Service
public class PayService implements PayUseCase {
  private final PaymentStore store;

  public PayService(PaymentStore store) {
    this.store = store;
  }

  @Override
  public Payment pay(long cents) {
    return store.save(new Payment(null, cents));
  }
}
