package org.springframework.transaction.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface Transactional {
  Propagation propagation() default Propagation.REQUIRED;
}
