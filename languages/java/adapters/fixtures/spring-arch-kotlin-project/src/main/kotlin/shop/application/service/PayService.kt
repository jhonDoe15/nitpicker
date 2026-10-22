package shop.application.service

import org.springframework.stereotype.Service
import shop.domain.model.Payment

@Service
class PayService {
    fun pay(cents: Long): Payment = Payment(null, cents)
}
