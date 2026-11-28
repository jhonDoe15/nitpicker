package e;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import javax.inject.Qualifier;

@Qualifier
@Retention(RetentionPolicy.RUNTIME)
@interface S24Qual {}

@Qualifier
@Retention(RetentionPolicy.RUNTIME)
@interface S24ProvidesSomething {}

@com.google.inject.BindingAnnotation
@Retention(RetentionPolicy.RUNTIME)
@interface S24Binding {}

@Retention(RetentionPolicy.RUNTIME)
@interface S24Plain {}
