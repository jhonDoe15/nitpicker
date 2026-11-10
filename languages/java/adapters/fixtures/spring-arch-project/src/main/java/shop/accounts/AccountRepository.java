package shop.accounts;

import org.springframework.data.repository.Repository;

public interface AccountRepository extends Repository<Account, Long> {
  Account findOne(Long id);
}
