package org.springframework.data.repository;

import java.util.List;
import java.util.Optional;

public interface CrudRepository<T, ID> extends Repository<T, ID> {
  Optional<T> findById(ID id);

  List<T> findAll();

  List<T> findAllById(Iterable<ID> ids);

  <S extends T> S save(S entity);

  void delete(T entity);
}
