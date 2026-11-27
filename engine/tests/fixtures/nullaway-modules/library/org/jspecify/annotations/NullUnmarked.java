package org.jspecify.annotations;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.MODULE, ElementType.PACKAGE, ElementType.TYPE, ElementType.METHOD, ElementType.CONSTRUCTOR})
public @interface NullUnmarked {}
