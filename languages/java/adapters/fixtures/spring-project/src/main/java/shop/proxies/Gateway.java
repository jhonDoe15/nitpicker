package shop.proxies;

import io.github.resilience4j.retry.annotation.Retry;
import io.micrometer.core.annotation.Timed;
import org.springframework.stereotype.Service;

@Service
public class Gateway {
  @Retry(name = "remote")
  public void fetch() {}

  @Timed("shop.gateway")
  public void timed() {}
}
