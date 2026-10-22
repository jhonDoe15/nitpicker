package shop.billing;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;

@Service
public class Refunds {
  public String refund(ServerWebExchange exchange) {
    if (exchange.getRequest().getQueryParams().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }
    return "refunded";
  }
}
