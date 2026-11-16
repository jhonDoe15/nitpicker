package shop.api;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/invoices")
@PreAuthorize("hasRole('BILLING')")
public class InvoiceController {
  @GetMapping
  public String list() {
    return "";
  }

  @GetMapping("/{id}")
  public String get() {
    return "";
  }

  @PostMapping
  public String create() {
    return "";
  }
}
