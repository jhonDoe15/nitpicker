package shop.lookup;

import com.google.inject.AbstractModule;
import com.google.inject.Binding;
import com.google.inject.Inject;
import com.google.inject.Injector;
import com.google.inject.Provider;
import com.google.inject.Provides;
import java.util.function.Function;

public class GuiceLookups {
  private final Injector injector;
  private final Provider<Pricing> pricing;

  @Inject
  GuiceLookups(Injector injector, Provider<Pricing> pricing) {
    this.injector = injector;
    this.pricing = pricing;
  }

  Pricing pricing() {
    return injector.getInstance(Pricing.class); // violation: ServiceLocatorLookup
  }

  Provider<Pricing> provider() {
    return injector.getProvider(Pricing.class); // violation: ServiceLocatorLookup
  }

  Binding<Pricing> binding() {
    return injector.getBinding(Pricing.class); // violation: ServiceLocatorLookup
  }

  Function<Class<Pricing>, Pricing> reference() {
    return injector::getInstance; // violation: ServiceLocatorLookup
  }

  Pricing viaConstructor() {
    return pricing.get();
  }

  public static class Pricing {}

  public static class PricingModule extends AbstractModule {
    private Injector parent;

    @Override
    protected void configure() {
      bind(Pricing.class).toInstance(parent.getInstance(Pricing.class));
    }

    Pricing fallback() {
      return parent.getInstance(Pricing.class); // violation: ServiceLocatorLookup
    }

    @Provides
    Pricing pricing(Injector injector) {
      return injector.getInstance(Pricing.class);
    }
  }
}
