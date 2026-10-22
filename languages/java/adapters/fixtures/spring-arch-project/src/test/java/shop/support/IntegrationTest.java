package shop.support;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@Retention(RetentionPolicy.RUNTIME)
public @interface IntegrationTest {}
