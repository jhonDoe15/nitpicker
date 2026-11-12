package shop.requests;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

public interface VisitApi {
  @PostMapping("/track")
  void track(@RequestBody VisitDto visit);
}
