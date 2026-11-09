package shop.returns;

import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ReturnController extends ReturnBase {
  private final ReturnService service;

  public ReturnController(ReturnService service) {
    this.service = service;
  }

  @GetMapping("/returns/{id}")
  public String show(@PathVariable Long id) {
    return service.find(id);
  }

  @GetMapping("/returns")
  public String lookup() {
    return service.lookup(Optional.empty());
  }

  @GetMapping("/returns/search")
  public String search() {
    return service.search(Optional.empty(), 1L);
  }

  @DeleteMapping("/returns/{id}")
  public void cancel(@PathVariable Long id) {
    if (id > 0) {
      throw new ReturnLocked();
    }
    if (id < -10) {
      throw new ReturnClosed();
    }
    throw new ReturnExpired();
  }

  @PostMapping("/returns/{id}/retry")
  public String retry(@PathVariable Long id) {
    try {
      return service.find(id);
    } catch (ReturnNotFound missing) {
      return "none";
    }
  }

  @GetMapping("/returns/wrapped")
  public String wrapped() {
    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "missing", new ReturnNotFound());
  }

  @GetMapping("/returns/mismatch")
  public String mismatch() {
    throw new ReturnMismatch();
  }

  @PostMapping("/returns/{id}")
  public String open(@PathVariable Long id) {
    return new ReturnRequest(id).toString();
  }

  @GetMapping("/returns/{id}/owner")
  public String owner(@PathVariable Long id) {
    if (id > 0) {
      throw new Orders.NotFound();
    }
    throw new Users.NotFound();
  }

  String helper(Long id) {
    throw new ReturnNotFound(id);
  }
}
