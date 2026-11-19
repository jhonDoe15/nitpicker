package jakarta.persistence;

public interface EntityManager {
  void persist(Object entity);

  <T> T merge(T entity);

  void refresh(Object entity);

  void flush();

  void clear();

  <T> T find(Class<T> type, Object id);

  <T> T getReference(Class<T> type, Object id);

  boolean contains(Object entity);

  <T> TypedQuery<T> createQuery(String text, Class<T> type);
}
