package shop.outbound;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ResponseEntity.BodyBuilder;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class Redirects {
  private static final String ROOT = "/orders/";

  public record Form(String next, int page) {}

  @GetMapping("/next")
  public String next(@RequestParam String next) {
    return "redirect:" + next; // violation: SpringOpenRedirect
  }

  @GetMapping("/view")
  public RedirectView view(@RequestParam String next) {
    String target = next.trim();
    return new RedirectView(target); // violation: SpringOpenRedirect
  }

  @GetMapping("/joined")
  public String joined(@RequestParam String next) {
    return "redirect:" + ROOT + next;
  }

  @GetMapping("/order")
  public String order(@RequestParam String id) {
    return "redirect:/orders/" + id;
  }

  @GetMapping("/home")
  public RedirectView home() {
    return new RedirectView("/home");
  }

  @GetMapping("/form")
  public String form(Form form) {
    return "redirect:" + form.next(); // violation: SpringOpenRedirect
  }

  @GetMapping("/page")
  public String page(Form form) {
    return "redirect:" + form.page();
  }

  @GetMapping("/request")
  public String request(HttpServletRequest request) {
    return "redirect:" + request.getParameter("next"); // violation: SpringOpenRedirect
  }

  @GetMapping("/params")
  public String params(@RequestParam Map<String, String> params) {
    return "forward:" + params.get("next"); // violation: SpringOpenRedirect
  }

  @GetMapping("/servlet")
  public void servlet(HttpServletResponse response, @RequestParam String next) throws IOException {
    response.sendRedirect("/home");
    response.sendRedirect(next); // violation: SpringOpenRedirect
  }

  @GetMapping("/legacy")
  public void legacy(javax.servlet.http.HttpServletResponse response, @RequestParam String next)
      throws IOException {
    response.sendRedirect(next); // violation: SpringOpenRedirect
  }

  @GetMapping("/found")
  public ResponseEntity<Void> found(@RequestParam URI next) {
    return ResponseEntity.status(HttpStatus.FOUND).location(next).build(); // violation: SpringOpenRedirect
  }

  @GetMapping("/fixed")
  public ResponseEntity<Void> fixed() {
    return ResponseEntity.status(HttpStatus.FOUND).location(URI.create("/home")).build();
  }

  @GetMapping("/created")
  public ResponseEntity<Void> created(@RequestParam URI next) {
    return ResponseEntity.created(next).build(); // violation: SpringOpenRedirect
  }

  @GetMapping("/stored")
  public ResponseEntity<Void> stored() {
    return ResponseEntity.created(URI.create("/orders/1")).build();
  }

  @GetMapping("/entity")
  public ResponseEntity<Void> entity(@RequestParam String next) {
    BodyBuilder found = ResponseEntity.status(HttpStatus.FOUND);
    found.header("location", next); // violation: SpringOpenRedirect
    found.header("X-Next", next);
    return found.header(HttpHeaders.LOCATION, next).build(); // violation: SpringOpenRedirect
  }

  @GetMapping("/headers")
  public ResponseEntity<Void> headers(@RequestParam String next, HttpServletResponse response) {
    HttpHeaders headers = new HttpHeaders();
    headers.setLocation(URI.create(next)); // violation: SpringOpenRedirect
    headers.set("Location", next); // violation: SpringOpenRedirect
    headers.add(HttpHeaders.LOCATION, next); // violation: SpringOpenRedirect
    headers.add("X-Next", next);
    headers.setLocation(URI.create("/home"));
    response.setHeader("Location", next); // violation: SpringOpenRedirect
    response.addHeader("LOCATION", next); // violation: SpringOpenRedirect
    response.setHeader("Cache-Control", next);
    return ResponseEntity.ok().headers(headers).build();
  }

  @GetMapping("/logged")
  public String logged(@RequestParam String next) {
    System.getLogger("redirects").log(System.Logger.Level.INFO, "redirect:" + next + " requested");
    return "redirect:/home";
  }
}
