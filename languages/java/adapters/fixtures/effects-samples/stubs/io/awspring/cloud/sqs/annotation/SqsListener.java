package io.awspring.cloud.sqs.annotation;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface SqsListener {
  String[] value() default {};
}
