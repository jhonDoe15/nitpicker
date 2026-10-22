package shop.outbound;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class Redirects {
  @GetMapping("/next")
  public String next(@RequestParam String next) {
    return "redirect:" + next; // violation: SpringOpenRedirect
  }

  @GetMapping("/view")
  public RedirectView view(@RequestParam String next) {
    String target = next.trim();
    return new RedirectView(target); // violation: SpringOpenRedirect
  }

  @GetMapping("/order")
  public String order(@RequestParam String id) {
    return "redirect:/orders/" + id;
  }

  @GetMapping("/home")
  public RedirectView home() {
    return new RedirectView("/home");
  }
}
