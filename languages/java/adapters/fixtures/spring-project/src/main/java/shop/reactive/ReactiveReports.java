package shop.reactive;

import java.util.List;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import shop.catalog.Product;
import shop.catalog.ProductRepository;

@Service
public class ReactiveReports {
  private final ReactiveProducts products;
  private final ProductRepository blocking;

  public ReactiveReports(ReactiveProducts products, ProductRepository blocking) {
    this.products = products;
    this.blocking = blocking;
  }

  public Flux<Product> visible() {
    return products.findAll().filter(product -> product.hashCode() > 0); // violation: SpringDataFilterInQuery
  }

  public Mono<Long> total() {
    return products.findAll().count(); // violation: SpringDataFilterInQuery
  }

  public Mono<Boolean> anyVisible() {
    return products.findAll().any(product -> product.hashCode() > 0); // violation: SpringDataFilterInQuery
  }

  public Mono<Boolean> allVisible() {
    return products.findAll().all(product -> product.hashCode() > 0); // violation: SpringDataFilterInQuery
  }

  public Mono<Boolean> stocked() {
    return products.findAll().hasElements(); // violation: SpringDataFilterInQuery
  }

  public Mono<Product> first() {
    return products.findAll().next(); // violation: SpringDataFilterInQuery
  }

  public Flux<Product> firstTen() {
    return products.findAll().take(10); // violation: SpringDataFilterInQuery
  }

  public Mono<Product> third() {
    return products.findAll().elementAt(2); // violation: SpringDataFilterInQuery
  }

  public Mono<Integer> sized() {
    return products.findAll().collectList().map(List::size); // violation: SpringDataFilterInQuery
  }

  public Mono<Boolean> empty() {
    return products.findAll().collectList().map(all -> all.isEmpty()); // violation: SpringDataFilterInQuery
  }

  public Mono<Long> counted() {
    return products.findAll().collectList().map(all -> all.stream().filter(p -> p.hashCode() > 0).count()); // violation: SpringDataFilterInQuery
  }

  public int blocked() {
    return products.findAll().collectList().block().size(); // violation: SpringDataFilterInQuery
  }

  public Mono<Long> held() {
    Flux<Product> all = products.findAll();
    return all.count(); // violation: SpringDataFilterInQuery
  }

  public long heldList() {
    List<Product> all = blocking.findAll();
    return all.stream().filter(product -> product.hashCode() > 0).count(); // violation: SpringDataFilterInQuery
  }

  public int heldSize() {
    var all = blocking.findAll();
    return all.size(); // violation: SpringDataFilterInQuery
  }

  public int heldAndUsed() {
    List<Product> all = blocking.findAll();
    all.forEach(Product::hashCode);
    return all.size();
  }

  public Mono<Product> sameNameElsewhere(Flux<Product> recent) {
    {
      Flux<Product> all = products.findAll();
      all.subscribe();
    }
    {
      Flux<Product> all = recent;
      return all.next();
    }
  }

  public Runnable inLambda() {
    return () -> {
      Flux<Product> all = products.findAll();
      all.count().subscribe(); // violation: SpringDataFilterInQuery
    };
  }

  public Flux<String> names() {
    return products.findAll().map(Product::toString);
  }

  public Mono<List<Product>> listed() {
    return products.findAll().collectList();
  }

  public Mono<List<String>> mappedList() {
    return products.findAll().collectList().map(all -> all.stream().map(Product::toString).toList());
  }

  public Mono<Product> one(long id) {
    return products.findById(id);
  }

  public Mono<Long> counter() {
    return products.count();
  }
}
