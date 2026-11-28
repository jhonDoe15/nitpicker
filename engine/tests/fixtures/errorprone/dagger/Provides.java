package dagger;

public @interface Provides {
  enum Type {
    UNIQUE,
    SET,
    SET_VALUES,
    MAP
  }

  Type type() default Type.UNIQUE;
}
