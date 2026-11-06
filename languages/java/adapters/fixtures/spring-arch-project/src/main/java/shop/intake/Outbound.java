package shop.intake;

import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

record OutboundOrder(Map<String, Object> attributes) {}

record IntakeReceipt(Map<String, Object> details) {}

interface Outbound {
  @PostMapping("/remote/orders")
  IntakeReceipt send(@RequestBody OutboundOrder order);
}
