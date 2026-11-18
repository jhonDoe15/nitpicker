package org.springframework.security.access.prepost;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface PreAuthorize {
  String value();
}
