package org.springframework.transaction.annotation;

public enum Propagation {
  REQUIRED,
  REQUIRES_NEW,
  NOT_SUPPORTED,
  NEVER
}
