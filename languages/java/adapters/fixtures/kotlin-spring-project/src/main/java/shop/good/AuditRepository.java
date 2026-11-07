package shop.good;

import java.util.ArrayList;
import java.util.List;

public class AuditRepository {
  private final List<Object> entries = new ArrayList<>();

  public void save(Object entry) {
    entries.add(entry);
  }

  public List<Object> findAll() {
    return entries;
  }
}
