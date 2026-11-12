package shop.queries;

import org.springframework.data.repository.ListCrudRepository;
import org.springframework.data.repository.ListPagingAndSortingRepository;

public interface AccountRepository
    extends ListCrudRepository<Account, Long>, ListPagingAndSortingRepository<Account, Long> {}
