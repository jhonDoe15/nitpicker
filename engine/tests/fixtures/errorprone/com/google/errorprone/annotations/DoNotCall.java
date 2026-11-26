package com.google.errorprone.annotations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Marks a method that should not be called. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.CLASS)
public @interface DoNotCall {
    /** Why the method should not be called. */
    String value() default "";
}
