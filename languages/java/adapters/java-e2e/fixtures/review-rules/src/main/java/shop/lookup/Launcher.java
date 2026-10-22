package shop.lookup;

import com.google.inject.Guice;
import com.google.inject.Injector;

public class Launcher {
  public static void main(String[] args) {
    Injector injector = Guice.createInjector(new GuiceLookups.PricingModule());
    System.out.println(injector.getInstance(GuiceLookups.Pricing.class));
  }

  Object again(Injector injector) {
    return injector.getInstance(GuiceLookups.Pricing.class);
  }
}
