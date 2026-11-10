package shop.lookup;

import com.google.inject.Guice;
import com.google.inject.Injector;
import javax.naming.InitialContext;
import javax.naming.NamingException;

public class Launcher {
  public static void main(String[] args) {
    Injector injector = Guice.createInjector(new GuiceLookups.PricingModule());
    System.out.println(injector.getInstance(GuiceLookups.Pricing.class));
  }

  Object again(Injector injector) {
    return injector.getInstance(GuiceLookups.Pricing.class); // violation: ServiceLocatorLookup
  }

  private static String main(String name) throws NamingException {
    return (String) new InitialContext().lookup(name); // violation: ServiceLocatorLookup
  }

  static class Worker {
    void main() throws NamingException {
      System.out.println(new InitialContext().lookup("java:comp/env/worker"));
    }

    Object run(Injector injector) {
      return injector.getInstance(GuiceLookups.Pricing.class); // violation: ServiceLocatorLookup
    }
  }
}
