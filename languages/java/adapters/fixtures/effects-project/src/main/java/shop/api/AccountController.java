package shop.api;

import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import java.util.List;
import org.springframework.security.access.annotation.Secured;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/accounts")
public class AccountController {
  @GetMapping
  @PreAuthorize("hasRole('USER')")
  public List<String> list() {
    return List.of();
  }

  @GetMapping("/{id}")
  @PreAuthorize("hasRole('USER')")
  public String get() {
    return "";
  }

  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public String create() {
    return "";
  }

  @PutMapping("/{id}")
  @Secured("ROLE_ADMIN")
  public String update() {
    return "";
  }

  @DeleteMapping("/{id}")
  @RolesAllowed("ADMIN")
  public void delete() {}

  @GetMapping("/ping")
  @PermitAll
  public String ping() {
    return "pong";
  }

  @GetMapping("/export")
  public List<String> export() {
    return List.of();
  }
}
