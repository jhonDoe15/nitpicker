package shop.orders;

import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReportController extends BaseController {
  @ModelAttribute
  public Order model() {
    return new Order();
  }
}
