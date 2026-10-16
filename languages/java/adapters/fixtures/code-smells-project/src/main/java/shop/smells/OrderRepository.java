package shop.smells;

import java.util.List;

public interface OrderRepository {
  String findById(String id);

  List<String> findPage(int page);

  void save(String id);

  void delete(String id);

  void saveAll(List<String> ids);
}
