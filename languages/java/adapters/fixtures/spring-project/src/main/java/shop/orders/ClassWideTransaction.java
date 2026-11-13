package shop.orders;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ClassWideTransaction {
  public void update() {
    readOnly();
    timed(); // violation: SpringProxySelfCall
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void outside() {
    readOnly(); // violation: SpringProxySelfCall
  }

  private void helper() {
    readOnly(); // violation: SpringProxySelfCall
  }

  @Transactional(readOnly = true)
  public void readOnly() {}

  @Transactional(timeout = 30)
  public void timed() {}
}
