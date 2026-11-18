package jakarta.persistence;

public interface EntityManager {
  void persist(Object entity);

  <T> T merge(T entity);

  void refresh(Object entity);

  void flush();

  void clear();
}
