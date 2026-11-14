package org.neo4j.driver;

public interface QueryRunner {
  Object run(String query);
}
