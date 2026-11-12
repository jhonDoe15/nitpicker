package shop.proxied;

import org.springframework.stereotype.Service;

@Service
public class PriceList {
  public long total(String sku) {
    return price(sku) * 2; // violation: SpringProxySelfCall
  }

  @Cached
  public long price(String sku) {
    return sku.length();
  }

  @Cached // violation: SpringProxyMethodVisibility
  long hiddenPrice(String sku) {
    return sku.length();
  }
}
