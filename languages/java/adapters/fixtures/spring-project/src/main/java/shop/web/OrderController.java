package shop.web;

import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
@CrossOrigin("*") // violation: SpringNoCrossOrigin
public class OrderController {
  @GetMapping("/{id}")
  public OrderView show() {
    return new OrderView("1");
  }

  @RequestMapping(value = "/legacy", method = RequestMethod.GET) // violation: SpringComposedMapping
  public OrderView legacy() {
    return new OrderView("2");
  }

  @PostMapping
  public OrderView create(@RequestBody NewOrder order) { // violation: SpringValidRequestBody
    return new OrderView(order.sku());
  }

  @PostMapping("/checked")
  public OrderView createChecked(@Valid @RequestBody NewOrder order) {
    return new OrderView(order.sku());
  }

  @PostMapping("/raw")
  public void raw(@RequestBody String body, @RequestBody Map<String, String> fields) {}

  @Transactional // violation: SpringNoTransactionalController
  @PostMapping("/bulk")
  @ResponseBody // violation: SpringRestController
  public OrderView bulk() {
    return new OrderView("3");
  }

  public record NewOrder(String sku) {}

  public record OrderView(String id) {}
}
