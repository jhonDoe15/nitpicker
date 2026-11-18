package jakarta.persistence;

import java.util.List;

public interface Query {
  Query setParameter(String name, Object value);

  Query setFirstResult(int start);

  Query setMaxResults(int count);

  List<?> getResultList();

  Object getSingleResult();

  int executeUpdate();
}
