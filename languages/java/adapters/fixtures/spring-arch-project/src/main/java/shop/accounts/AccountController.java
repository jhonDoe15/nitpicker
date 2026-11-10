package shop.accounts;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.ResultSet;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AccountController {
  private final AccountService accounts;

  public AccountController(AccountService accounts) {
    this.accounts = accounts;
  }

  @GetMapping("/accounts/me")
  public AccountView me(HttpServletRequest request) {
    return accounts.find(request.getContentLength());
  }

  public ResultSet export() {
    return null;
  }

  public int count(JdbcTemplate jdbc) {
    return 0;
  }
}
