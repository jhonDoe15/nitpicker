package shop.proxies;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Traced {
  String value() default "";

  @Target(ElementType.TYPE_USE)
  @Retention(RetentionPolicy.RUNTIME)
  @jakarta.validation.Constraint(validatedBy = {})
  @jakarta.validation.constraints.Pattern(regexp = "[A-Z]{3}")
  @interface Code {
    String message() default "code";

    Class<?>[] groups() default {};

    Class<? extends jakarta.validation.Payload>[] payload() default {};
  }
}
