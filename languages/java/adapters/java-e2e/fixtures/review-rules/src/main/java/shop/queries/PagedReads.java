package shop.queries;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public final class PagedReads {
  private static final String ACTIVE = "select a from Account a where a.active = true";
  private static final String NEWEST = ACTIVE + " order by a.createdAt desc, a.id";
  private static final String EXISTS = "select 1 from Account a where a.name = :name";

  private final EntityManager entityManager;
  private final AccountRepository accounts;

  public PagedReads(EntityManager entityManager, AccountRepository accounts) {
    this.entityManager = entityManager;
    this.accounts = accounts;
  }

  public List<Account> firstPage() {
    return entityManager.createQuery(ACTIVE, Account.class).setMaxResults(20).getResultList(); // violation: UnorderedQuery
  }

  public List<Account> laterPage(int page) {
    TypedQuery<Account> query = entityManager.createQuery(ACTIVE, Account.class);
    query.setFirstResult(page * 20); // violation: UnorderedQuery
    return query.getResultList();
  }

  public List<Account> newestPage() {
    return entityManager.createQuery(NEWEST, Account.class).setMaxResults(20).getResultList();
  }

  public List<Account> named(String name) {
    return entityManager
        .createQuery("select a from Account a where a.name = :name", Account.class)
        .setParameter("name", name)
        .setMaxResults(1) // violation: UnorderedQuery
        .getResultList();
  }

  public boolean taken(String name) {
    return !entityManager.createQuery(EXISTS).setParameter("name", name).setMaxResults(1).getResultList().isEmpty();
  }

  public List<Account> criteriaPage() {
    CriteriaBuilder builder = entityManager.getCriteriaBuilder();
    CriteriaQuery<Account> criteria = builder.createQuery(Account.class);
    criteria.from(Account.class);
    return entityManager.createQuery(criteria).setMaxResults(20).getResultList(); // violation: UnorderedQuery
  }

  public List<Account> sortedCriteriaPage() {
    CriteriaBuilder builder = entityManager.getCriteriaBuilder();
    CriteriaQuery<Account> criteria = builder.createQuery(Account.class);
    criteria.orderBy(builder.asc(criteria.from(Account.class).get("id")));
    return entityManager.createQuery(criteria).setMaxResults(20).getResultList();
  }

  public List<Account> dynamicPage(String jpql) {
    return entityManager.createQuery(jpql, Account.class).setMaxResults(20).getResultList();
  }

  public Page<Account> unsortedPage(int page) {
    return accounts.findAll(PageRequest.of(page, 20)); // violation: UnorderedQuery
  }

  public Page<Account> heldPage(int page) {
    Pageable pageable = PageRequest.of(page, 20); // violation: UnorderedQuery
    return accounts.findAll(pageable);
  }

  public Page<Account> sizedPage() {
    return accounts.findAll(Pageable.ofSize(50)); // violation: UnorderedQuery
  }

  public Page<Account> sortedPage(int page) {
    return accounts.findAll(PageRequest.of(page, 20, Sort.by("createdAt", "id")));
  }

  public Pageable forwarded(int page) {
    return PageRequest.of(page, 20);
  }
}
