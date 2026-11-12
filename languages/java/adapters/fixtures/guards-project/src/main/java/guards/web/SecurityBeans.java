package guards.web;

import org.springframework.beans.factory.FactoryBean;
import org.springframework.context.annotation.Bean;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;

public class SecurityBeans {
  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration)
      throws Exception {
    return configuration.getAuthenticationManager();
  }

  public void configureGlobal(AuthenticationManagerBuilder builder) throws Exception {
    builder.inMemoryAuthentication();
  }

  public static final class Greeting implements FactoryBean<String> {
    public String getObject() throws Exception {
      return "hello";
    }

    public Class<?> getObjectType() {
      return String.class;
    }
  }
}
