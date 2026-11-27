package dagger.producers;

public @interface Produces {
  enum Type {
    UNIQUE,
    SET,
    SET_VALUES,
    MAP
  }

  Type type() default Type.UNIQUE;
}
