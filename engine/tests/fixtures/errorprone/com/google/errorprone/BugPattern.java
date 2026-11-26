package com.google.errorprone;

public @interface BugPattern {
  String name() default "";

  String summary() default "";

  SeverityLevel severity();

  enum SeverityLevel {
    ERROR,
    WARNING,
    SUGGESTION
  }
}
