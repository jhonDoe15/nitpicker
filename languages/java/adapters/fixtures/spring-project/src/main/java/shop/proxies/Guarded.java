package shop.proxies;

import io.github.resilience4j.bulkhead.annotation.Bulkhead;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.ratelimiter.annotation.RateLimiter;
import io.github.resilience4j.retry.annotation.Retry;
import io.github.resilience4j.timelimiter.annotation.TimeLimiter;
import io.micrometer.core.annotation.Counted;
import io.micrometer.core.annotation.Timed;
import io.micrometer.observation.annotation.Observed;
import jakarta.annotation.security.DenyAll;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.springframework.security.access.prepost.PreFilter;
import org.springframework.stereotype.Service;

@Service
public class Guarded {
  private final Gateway gateway;

  public Guarded(Gateway gateway) {
    this.gateway = gateway;
  }

  public void sync() {
    fetch(); // violation: SpringProxySelfCall
    open(); // violation: SpringProxySelfCall
    throttled(); // violation: SpringProxySelfCall
    isolated(); // violation: SpringProxySelfCall
    timed(); // violation: SpringProxySelfCall
    counted(); // violation: SpringProxySelfCall
    observed(); // violation: SpringProxySelfCall
    adminOnly(); // violation: SpringProxySelfCall
    never(); // violation: SpringProxySelfCall
    filtered(List.of()); // violation: SpringProxySelfCall
    bounded(); // violation: SpringProxySelfCall
    audited(); // violation: SpringProxySelfCall
    traced(); // violation: SpringProxySelfCall
    anyone();
    gateway.fetch();
    gateway.timed();
  }

  @Retry(name = "remote")
  public void fetch() {}

  @CircuitBreaker(name = "remote")
  public void open() {}

  @RateLimiter(name = "remote")
  public void throttled() {}

  @Bulkhead(name = "remote")
  public void isolated() {}

  @Timed("shop.sync")
  public void timed() {}

  @Counted("shop.sync")
  public void counted() {}

  @Observed(name = "shop.sync")
  public void observed() {}

  @RolesAllowed("ADMIN")
  public void adminOnly() {}

  @DenyAll
  public void never() {}

  @PermitAll
  public void anyone() {}

  @PreFilter("filterObject.owner == authentication.name")
  public void filtered(List<String> names) {}

  @TimeLimiter(name = "remote")
  public CompletableFuture<String> bounded() {
    return CompletableFuture.completedFuture("done");
  }

  @Audited
  public void audited() {}

  @Traced
  public void traced() {}

  @Retry(name = "remote") // violation: SpringProxyMethodVisibility
  void retriedQuietly() {}

  @Timed("shop.hidden") // violation: SpringProxyMethodVisibility
  protected void timedQuietly() {}

  @RolesAllowed("ADMIN") // violation: SpringProxyMethodVisibility
  public final void lockedDown() {}

  @Audited // violation: SpringProxyMethodVisibility
  void auditedQuietly() {}

  @Traced // violation: SpringProxyMethodVisibility
  void tracedQuietly() {}

  @PermitAll
  void openQuietly() {}
}
