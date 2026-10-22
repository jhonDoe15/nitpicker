package shop.application.port.in;

import shop.domain.model.Payment;

public interface PayUseCase {
  Payment pay(long cents);
}
