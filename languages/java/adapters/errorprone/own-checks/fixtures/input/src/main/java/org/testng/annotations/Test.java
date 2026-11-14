package org.testng.annotations;

public @interface Test {
  Class<?> retryAnalyzer() default Object.class;

  String description() default "";
}
