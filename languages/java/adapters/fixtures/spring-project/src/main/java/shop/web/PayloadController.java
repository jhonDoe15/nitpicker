package shop.web;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/payloads")
public class PayloadController {
  @GetMapping("/object")
  public Object object() { // violation: SpringTypedResponse
    return new Payload("a");
  }

  @GetMapping("/map")
  public Map<String, Object> map() { // violation: SpringTypedResponse
    return Map.of();
  }

  @GetMapping("/open-map")
  public Map<String, ?> openMap() { // violation: SpringTypedResponse
    return Map.of();
  }

  @GetMapping("/raw-map")
  public Map rawMap() { // violation: SpringTypedResponse
    return Map.of();
  }

  @GetMapping("/wildcard")
  public ResponseEntity<?> wildcard() { // violation: SpringTypedResponse
    return ResponseEntity.ok().build();
  }

  @GetMapping("/raw")
  public ResponseEntity raw() { // violation: SpringTypedResponse
    return ResponseEntity.ok().build();
  }

  @GetMapping("/entity-object")
  public ResponseEntity<Object> entityObject() { // violation: SpringTypedResponse
    return ResponseEntity.ok().build();
  }

  @GetMapping("/entity-map")
  public ResponseEntity<Map<String, Object>> entityMap() { // violation: SpringTypedResponse
    return ResponseEntity.ok().build();
  }

  @GetMapping("/null")
  public Payload nothing(String id) {
    Supplier<String> unused = () -> {
      return null;
    };
    if (id == null) {
      return null; // violation: SpringTypedResponse
    }
    return new Payload(id);
  }

  @GetMapping("/typed")
  public Payload typed() {
    return new Payload("typed");
  }

  @GetMapping("/optional")
  public Optional<Payload> optional() {
    return Optional.empty();
  }

  @GetMapping("/list")
  public List<Payload> list() {
    return List.of();
  }

  @GetMapping("/strings")
  public Map<String, String> strings() {
    return Map.of();
  }

  @GetMapping("/empty")
  public ResponseEntity<Void> empty() {
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/entity")
  public ResponseEntity<Payload> entity() {
    return ResponseEntity.ok(new Payload("entity"));
  }

  @GetMapping("/bytes")
  public ResponseEntity<byte[]> bytes() {
    return ResponseEntity.ok(new byte[0]);
  }

  @DeleteMapping("/{id}")
  public void remove() {}

  @PostMapping("/map")
  public void postMap(@RequestBody Map<String, Object> body) {} // violation: SpringTypedRequestBody

  @PostMapping("/json")
  public void postJson(@RequestBody JsonNode body) {} // violation: SpringTypedRequestBody

  @PostMapping("/object")
  public void postObject(@RequestBody Object body) {} // violation: SpringTypedRequestBody

  @PostMapping("/rows")
  public void postRows(@RequestBody List<Map<String, Object>> rows) {} // violation: SpringTypedRequestBody

  @PostMapping("/typed")
  public void postTyped(@Valid @RequestBody Payload body) {}

  @PostMapping("/typed-list")
  public void postTypedList(@Valid @RequestBody List<@Valid Payload> body) {}

  String helper(String text) {
    return text.isEmpty() ? null : text;
  }

  public record Payload(String id) {}
}
