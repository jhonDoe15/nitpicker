package values.fallbacks;

import java.net.http.HttpClient;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.OptionalInt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestTemplate;

public class Customers {
  private final CustomerRepository repository;
  private final JdbcTemplate jdbc;
  private final RestTemplate rest;
  private final Map<String, Settings> cache;
  private final Settings defaults = new Settings("default");

  public Customers(CustomerRepository repository, JdbcTemplate jdbc, RestTemplate rest, Map<String, Settings> cache) {
    this.repository = repository;
    this.jdbc = jdbc;
    this.rest = rest;
    this.cache = cache;
  }

  public record Customer(String email) {
  }

  public record Settings(String name) {
  }

  public interface CustomerRepository extends JpaRepository<Customer, Long> {
    Optional<Customer> findByEmail(String email);
  }

  public Customer findOrCreate(String email) {
    return repository.findByEmail(email).orElse(repository.save(new Customer(email)));
  }

  public Settings settings(String tenant) {
    return cache.getOrDefault(tenant, rest.getForObject(tenant, Settings.class));
  }

  public Customer required(String email) {
    Customer found = repository.findById(1L).orElse(null);
    return Objects.requireNonNullElse(found, repository.save(new Customer(email)));
  }

  public int total(OptionalInt cached) {
    return cached.orElse(jdbc.queryForObject("select 1", Integer.class));
  }

  public int fail(Optional<Integer> value) {
    return value.orElse(missing());
  }

  public Customer lazy(String email) {
    return repository.findByEmail(email).orElseGet(() -> repository.save(new Customer(email)));
  }

  public Settings computed(String tenant) {
    return cache.computeIfAbsent(tenant, key -> rest.getForObject("/tenants/" + key, Settings.class));
  }

  public Customer nested(String email) {
    return repository.findByEmail(email).orElse(new Customer(email));
  }

  public Settings constant(String tenant) {
    return cache.getOrDefault(tenant, defaults);
  }

  public Customer lazyThrow(String email) {
    return repository.findByEmail(email).orElseThrow(() -> new IllegalStateException(email));
  }

  public String pure(Optional<String> name, List<String> names) {
    return name.orElse(names.get(0).trim());
  }

  public Customer deferred(String email) {
    return Objects.requireNonNullElseGet(null, () -> repository.save(new Customer(email)));
  }

  public HttpClient client(Optional<HttpClient> existing) {
    return existing.orElse(HttpClient.newHttpClient());
  }

  private int missing() {
    throw new IllegalStateException("missing");
  }

  public Object getter(Optional<Object> value) {
    return value.orElse(jdbc.getDataSource());
  }

  public Object timeout(Optional<Object> value, HttpClient http) {
    return value.orElse(http.connectTimeout());
  }

  public Object handler(Map<String, Object> map, String key) {
    return map.getOrDefault(key, rest.getUriTemplateHandler());
  }

  public Callable<Customer> anonymous(Optional<Callable<Customer>> value, String email) {
    return value.orElse(new Callable<Customer>() {
      @Override
      public Customer call() {
        return repository.save(new Customer(email));
      }
    });
  }
}
