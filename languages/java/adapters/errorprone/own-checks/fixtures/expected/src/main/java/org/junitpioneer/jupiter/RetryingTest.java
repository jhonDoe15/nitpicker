package org.junitpioneer.jupiter;

import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
public @interface RetryingTest {
  int value() default 3;
}
