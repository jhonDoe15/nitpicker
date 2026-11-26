package com.google.testing.junit.testparameterinjector;

import java.lang.annotation.ElementType;
import java.lang.annotation.Repeatable;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.CONSTRUCTOR})
@Repeatable(TestParameters.RepeatedTestParameters.class)
public @interface TestParameters {
  String[] value() default {};

  String customName() default "";

  @Retention(RetentionPolicy.RUNTIME)
  @Target({ElementType.METHOD, ElementType.CONSTRUCTOR})
  @interface RepeatedTestParameters {
    TestParameters[] value();
  }
}
