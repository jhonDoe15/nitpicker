package shop.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {
  public void attach(HttpServletResponse response, String token) {}
}
