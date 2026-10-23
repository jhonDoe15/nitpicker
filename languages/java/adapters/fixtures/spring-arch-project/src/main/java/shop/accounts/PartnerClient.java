package shop.accounts;

import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

@Component
public class PartnerClient {
  public ResponseEntity<String> charge(RequestEntity<AccountView> request) {
    return null;
  }
}
