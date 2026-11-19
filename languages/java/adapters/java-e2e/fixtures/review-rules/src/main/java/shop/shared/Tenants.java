package shop.shared;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

public final class Tenants {
  private Tenants() {
  }

  @Service
  public static class Pricing {
    private String currency;
    private String region = "eu";
    private final ConcurrentMap<String, String> byUser = new ConcurrentHashMap<>();
    private volatile String level = "info";
    private AtomicReference<String> latest = new AtomicReference<>();
    private String mode = "plain";

    public long handlePrice(String user, String requestedCurrency, long cents) {
      currency = requestedCurrency.toUpperCase(Locale.ROOT); // violation: CallValueStoredInSharedField
      return cents + currency.length();
    }

    public String handleRegion(String requestedRegion) {
      this.region = requestedRegion.trim(); // violation: CallValueStoredInSharedField
      return region;
    }

    public String remember(String user, String requestedCurrency) {
      byUser.put(user, requestedCurrency);
      String local = requestedCurrency.toUpperCase(Locale.ROOT);
      return local + byUser.get(user);
    }

    public void forget(String user) {
      byUser.remove(user);
    }

    public void enableMode(String requestedMode) {
      this.mode = requestedMode.trim();
    }

    public String changeLevel(String requestedLevel) {
      level = requestedLevel.trim();
      return level + mode;
    }

    public String handleLatest(String requested) {
      latest = new AtomicReference<>(requested.trim());
      return latest.get();
    }

    public void configure(String defaultRegion) {
      this.region = defaultRegion;
    }

    public String reset() {
      region = "eu";
      return region;
    }

    public String regionOnce(String requestedRegion) {
      if (region == null) {
        region = requestedRegion;
      }
      return region;
    }
  }

  @Component
  @Scope("prototype")
  public static class Cart {
    private String currency;

    public void use(String requestedCurrency) {
      currency = requestedCurrency;
    }

    public String currency() {
      return currency;
    }
  }

  public static class Landing extends HttpServlet {
    private String lastAgent;

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) {
      lastAgent = request.getHeader("User-Agent"); // violation: CallValueStoredInSharedField
      response.setStatus(lastAgent == null ? 400 : 200);
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) {
      String agent = request.getHeader("User-Agent");
      response.setStatus(agent == null ? 400 : 200);
    }
  }
}
