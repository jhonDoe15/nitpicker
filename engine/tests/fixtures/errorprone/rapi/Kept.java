package rapi;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Target;

@Inherited
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface Kept {}
