package org.springframework.transaction.support;

public abstract class TransactionSynchronizationManager {
  public static void registerSynchronization(TransactionSynchronization synchronization) {}
}
