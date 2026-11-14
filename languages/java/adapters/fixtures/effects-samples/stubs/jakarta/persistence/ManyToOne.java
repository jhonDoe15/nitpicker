package jakarta.persistence;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface ManyToOne {
  FetchType fetch() default FetchType.EAGER;
}
