package org.springframework.web.bind.annotation;

import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
public @interface RequestMapping {
  String[] value() default {};
  String[] path() default {};
  String[] produces() default {};
  RequestMethod[] method() default {};
}
