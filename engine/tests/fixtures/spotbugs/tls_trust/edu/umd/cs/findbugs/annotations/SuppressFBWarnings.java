package edu.umd.cs.findbugs.annotations;
public @interface SuppressFBWarnings { String[] value() default {}; String justification() default ""; }
