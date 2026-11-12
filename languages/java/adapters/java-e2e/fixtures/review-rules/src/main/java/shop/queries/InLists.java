package shop.queries;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

public final class InLists {
  private static final String BY_IDS = "select a from Account a where a.id in :ids";
  private static final int CHUNK = 1000;

  private final EntityManager entityManager;
  private final AccountRepository accounts;

  public InLists(EntityManager entityManager, AccountRepository accounts) {
    this.entityManager = entityManager;
    this.accounts = accounts;
  }

  public List<Account> byIds(List<Long> ids) {
    return entityManager.createQuery(BY_IDS, Account.class).setParameter("ids", ids).getResultList(); // violation: UnboundedQueryArray
  }

  public List<Account> guarded(List<Long> ids) {
    if (ids.isEmpty()) {
      return List.of();
    }
    return entityManager.createQuery(BY_IDS, Account.class).setParameter("ids", ids).getResultList();
  }

  public List<Account> bounded(List<Long> ids) {
    if (ids.size() > CHUNK) {
      throw new IllegalArgumentException("at most 1000 ids");
    }
    return accounts.findAllById(ids);
  }

  public List<Account> loaded(Set<Long> ids) {
    return accounts.findAllById(ids); // violation: UnboundedQueryArray
  }

  public void removed(List<Long> ids) {
    accounts.deleteAllById(ids);
  }

  public void chunked(List<List<Long>> chunks) {
    for (List<Long> chunk : chunks) {
      entityManager.createQuery(BY_IDS, Account.class).setParameter("ids", chunk).getResultList();
    }
  }

  public List<Account> fixed(Long first, Long second) {
    List<Long> ids = List.of(first, second);
    return entityManager.createQuery(BY_IDS, Account.class).setParameter("ids", ids).getResultList();
  }

  public MapSqlParameterSource named(List<Long> ids) {
    return new MapSqlParameterSource("ids", ids); // violation: UnboundedQueryArray
  }

  public MapSqlParameterSource added(List<Long> ids, String owner) {
    return new MapSqlParameterSource().addValue("owner", owner).addValue("ids", ids); // violation: UnboundedQueryArray
  }
}
