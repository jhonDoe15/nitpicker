package org.springframework.transaction.support;

public interface TransactionSynchronization {
  default void afterCommit() {}

  default void afterCompletion(int status) {}
}
