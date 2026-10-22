package shop.orders;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

public class OrderLoader {
  private final OrderRepository repository;

  public OrderLoader(OrderRepository repository) {
    this.repository = repository;
  }

  public Order load(Long id) {
    return repository.findById(id).orElseThrow();
  }

  public List<Order> loadAll(Collection<Long> ids) {
    return repository.findAllById(ids);
  }

  public Page<Order> page(int number) {
    return repository.findAll(PageRequest.of(number, 100));
  }

  public void forget(Collection<Long> chunk) {
    repository.deleteAllById(chunk);
  }

  public String readFile(Path path) throws java.io.IOException {
    return Files.readString(path);
  }
}
