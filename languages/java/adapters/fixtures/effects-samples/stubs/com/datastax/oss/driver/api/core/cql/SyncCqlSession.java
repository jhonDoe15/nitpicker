package com.datastax.oss.driver.api.core.cql;

public interface SyncCqlSession {
  Object execute(String statement);
}
