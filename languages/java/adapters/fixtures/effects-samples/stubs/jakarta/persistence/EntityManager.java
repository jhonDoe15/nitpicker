package jakarta.persistence;

public interface EntityManager {
  void persist(Object entity);

  <T> T merge(T entity);

  void flush();

  void clear();
}
