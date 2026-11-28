package dagger;

public @interface Module {
  Class<?>[] includes() default {};

  Class<?>[] injects() default {};

  Class<?>[] staticInjections() default {};

  Class<?>[] overrides() default {};

  Class<?>[] addsTo() default {};

  boolean complete() default true;

  boolean library() default false;
}
