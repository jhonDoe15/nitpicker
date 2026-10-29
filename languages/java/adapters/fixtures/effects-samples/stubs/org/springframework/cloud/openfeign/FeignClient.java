package org.springframework.cloud.openfeign;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface FeignClient {
  String name();
}
