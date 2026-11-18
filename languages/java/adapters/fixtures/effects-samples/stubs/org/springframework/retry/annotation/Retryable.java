package org.springframework.retry.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface Retryable {
  Class<? extends Throwable>[] retryFor() default {};

  Class<? extends Throwable>[] include() default {};

  int maxAttempts() default 3;
}
