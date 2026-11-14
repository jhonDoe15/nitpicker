package org.springframework.beans.factory.annotation;

import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
public @interface Qualifier {
  String value() default "";
}
