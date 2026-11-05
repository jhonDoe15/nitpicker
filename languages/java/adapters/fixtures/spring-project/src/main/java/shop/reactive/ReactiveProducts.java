package shop.reactive;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import shop.catalog.Product;

public interface ReactiveProducts extends ReactiveCrudRepository<Product, Long> {}
