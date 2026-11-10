package shop.accounts;

import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class AccountConfig {
  @Bean
  public JdbcTemplate accountJdbc(DataSource source) {
    return new JdbcTemplate(source);
  }
}
