package jakarta.persistence;

import java.util.List;

public interface TypedQuery<T> extends Query {
  @Override
  TypedQuery<T> setParameter(String name, Object value);

  @Override
  TypedQuery<T> setFirstResult(int start);

  @Override
  TypedQuery<T> setMaxResults(int count);

  @Override
  List<T> getResultList();

  @Override
  T getSingleResult();
}
