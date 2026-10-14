package shop.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("prod") // violation: SpringProfileOnConfiguration
public class Pricing {
  @jakarta.transaction.Transactional // violation: SpringTransactionalAnnotation
  public void apply() {}

  @Transactional
  public void applySpring() {}
}
