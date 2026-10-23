package shop.wiring;

import jakarta.annotation.Resource;
import jakarta.inject.Inject;
import java.util.Map;
import org.springframework.beans.factory.ObjectFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

@Service
public class WiringService {
  @Inject private Wallet[] wallets;
  @Resource private Badge badge;

  @Autowired
  public WiringService(Checkout checkout, Account account) {}

  public WiringService(Pass unused) {}

  @Autowired
  void setLedgers(Map<String, Ledger> ledgers) {}

  @Lazy
  @Autowired
  void setCoupon(Coupon coupon) {}

  @Autowired
  void setFactory(ObjectFactory<Coupon> coupons) {}

  @Autowired
  void setToken(@Lazy(false) Token token) {}
}
