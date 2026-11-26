package shop.lifecycle;

import jakarta.annotation.PostConstruct;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class StartupDefaults implements InitializingBean {
  private final AtomicInteger loaded = new AtomicInteger();

  @PostConstruct
  @Transactional // violation: SpringAnnotationBeforeProxy
  public void loadDefaults() {
    loaded.incrementAndGet();
  }

  @PostConstruct
  @Async("startupExecutor") // violation: SpringAnnotationBeforeProxy
  public void warmUp() { // violation: SpringAsyncExecutor
    loaded.incrementAndGet();
  }

  @Override
  @PreAuthorize("hasRole('ADMIN')") // violation: SpringAnnotationBeforeProxy
  public void afterPropertiesSet() {
    loaded.incrementAndGet();
  }

  @EventListener(ApplicationReadyEvent.class)
  @Transactional
  public void loadWhenReady() {
    loaded.incrementAndGet();
  }

  @PostConstruct
  public void index() {
    loaded.incrementAndGet();
  }
}
