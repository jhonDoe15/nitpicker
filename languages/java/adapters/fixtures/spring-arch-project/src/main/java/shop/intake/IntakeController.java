package shop.intake;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;

interface IntakeApi {
  @PostMapping("/intake/imports")
  void imported(@RequestBody ImportJob job);
}

@RestController
public class IntakeController implements IntakeApi {
  @PostMapping("/intake/orders")
  public void create(@RequestBody CreateOrder order) {}

  @PostMapping("/intake/orders/bulk")
  public void bulk(@RequestBody List<Optional<CreateOrder>> orders) {}

  @PostMapping("/intake/envelopes")
  public void envelope(@RequestBody Envelope<Map<String, Object>> envelope) {}

  @PostMapping("/intake/addresses")
  public void addresses(@RequestBody Envelope<Address> envelope) {}

  @PostMapping("/intake/shapes")
  public void shape(@RequestBody Shape shape) {}

  @PostMapping("/intake/profiles")
  public void profile(@RequestBody Profile profile) {}

  @PostMapping("/intake/remainders")
  public void remainder(@RequestBody Remainder remainder) {}

  @PostMapping("/intake/uploads")
  public void upload(@RequestPart("meta") UploadMeta meta) {}

  @PostMapping("/intake/search")
  public void search(@ModelAttribute SearchForm form) {}

  @PostMapping("/intake/settings")
  public void settings(@RequestBody Settings settings) {}

  @Override
  public void imported(ImportJob job) {}

  @MessageMapping("/intake/chat")
  public void chat(ChatMessage message, Principal principal, @CurrentMember Member member) {}

  @PostMapping("/intake/deliveries")
  public void delivery(HttpEntity<Delivery> delivery) {}

  @PostMapping("/intake/trees")
  public void tree(@RequestBody TreeNode tree) {}

  public void helper(Unbound unbound) {}
}
