package shop.adapter.in.web;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import shop.application.port.in.PayUseCase;

@RestController
public class PaymentController {
  private final PayUseCase payments;

  public PaymentController(PayUseCase payments) {
    this.payments = payments;
  }

  @PostMapping("/payments")
  public Long pay(@RequestBody Long cents) {
    return payments.pay(cents).id();
  }
}
