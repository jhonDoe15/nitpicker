package shop.lookup;

import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.Produces;
import jakarta.enterprise.inject.spi.BeanManager;
import jakarta.enterprise.inject.spi.CDI;
import jakarta.inject.Inject;

public class CdiLookups {
  private final BeanManager beans;
  private final Instance<Mailer> mailers;

  @Inject
  CdiLookups(BeanManager beans, Instance<Mailer> mailers) {
    this.beans = beans;
    this.mailers = mailers;
  }

  Mailer current() {
    return CDI.current().select(Mailer.class).get(); // violation: ServiceLocatorLookup
  }

  Mailer reference() {
    return (Mailer) beans.getReference(null, Mailer.class, null); // violation: ServiceLocatorLookup
  }

  Instance<Object> created() {
    return beans.createInstance(); // violation: ServiceLocatorLookup
  }

  Mailer injected() {
    return mailers.get();
  }

  Mailer selected() {
    return mailers.select(Mailer.class).get();
  }

  @Produces
  Mailer produced() {
    return CDI.current().select(Mailer.class).get();
  }

  public static class Mailer {}
}
