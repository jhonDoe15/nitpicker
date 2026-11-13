package shop.orders;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JoinedTransactions {
  @Transactional
  public void update() {
    readOnly();
    required();
    supports();
    mandatory();
    labelled();
    this.readOnly();
    List.of(1).forEach(id -> readOnly());
    isolated(); // violation: SpringProxySelfCall
    requiresNew(); // violation: SpringProxySelfCall
    nested(); // violation: SpringProxySelfCall
    notSupported(); // violation: SpringProxySelfCall
    never(); // violation: SpringProxySelfCall
    rollsBack(); // violation: SpringProxySelfCall
    async(); // violation: SpringProxySelfCall
    timed(); // violation: SpringProxySelfCall
  }

  @Transactional(readOnly = true, timeout = 5, rollbackFor = IllegalStateException.class)
  public void query() {
    readOnly();
    sameTimeout();
    sameRollback();
    timed(); // violation: SpringProxySelfCall
    rollsBack(); // violation: SpringProxySelfCall
  }

  @Transactional(propagation = Propagation.SUPPORTS)
  public void maybe() {
    readOnly(); // violation: SpringProxySelfCall
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void outside() {
    readOnly(); // violation: SpringProxySelfCall
  }

  public void plain() {
    readOnly(); // violation: SpringProxySelfCall
    required(); // violation: SpringProxySelfCall
  }

  @Transactional(readOnly = true)
  public void readOnly() {}

  @Transactional(propagation = Propagation.REQUIRED)
  public void required() {}

  @Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
  public void supports() {}

  @Transactional(propagation = Propagation.MANDATORY)
  public void mandatory() {}

  @Transactional(label = "audit")
  public void labelled() {}

  @Transactional(isolation = Isolation.SERIALIZABLE)
  public void isolated() {}

  @Transactional(propagation = Propagation.REQUIRES_NEW) // violation: SpringNoRequiresNew
  public void requiresNew() {}

  @Transactional(propagation = Propagation.NESTED)
  public void nested() {}

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void notSupported() {}

  @Transactional(propagation = Propagation.NEVER)
  public void never() {}

  @Transactional(rollbackFor = Exception.class)
  public void rollsBack() {}

  @Transactional(readOnly = true, timeout = 5)
  public void sameTimeout() {}

  @Transactional(rollbackFor = IllegalStateException.class)
  public void sameRollback() {}

  @Transactional(timeout = 30)
  public void timed() {}

  @Async("shopExecutor")
  @Transactional
  public CompletableFuture<Void> async() {
    return CompletableFuture.completedFuture(null);
  }
}
