package shop.carts;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import org.springframework.context.annotation.Scope;

@Retention(RetentionPolicy.RUNTIME)
@Scope("request")
public @interface PerRequest {}
