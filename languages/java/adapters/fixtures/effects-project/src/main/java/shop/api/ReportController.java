package shop.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReportController {
  @AdminOnly
  @GetMapping("/reports")
  public String reports() {
    return "";
  }
}
