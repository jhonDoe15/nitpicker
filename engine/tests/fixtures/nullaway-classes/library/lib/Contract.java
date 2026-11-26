package lib;

public @interface Contract {
  boolean pure() default false;

  String value() default "";
}
