package shop.web;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ShapesController {
  @GetMapping("/shapes/objects")
  List<Object> objects() { // violation: SpringTypedResponse
    return List.of();
  }

  @GetMapping("/shapes/rows")
  List<Map<String, Object>> rows() { // violation: SpringTypedResponse
    return List.of();
  }

  @GetMapping("/shapes/maybe")
  Optional<Object> maybe() { // violation: SpringTypedResponse
    return Optional.empty();
  }

  @GetMapping("/shapes/node")
  ObjectNode node() { // violation: SpringTypedResponse
    throw new UnsupportedOperationException();
  }

  @GetMapping("/shapes/totals")
  Map<String, ? extends Number> totals() {
    return Map.of();
  }

  @GetMapping("/shapes/counts")
  Map<String, Long> counts() {
    return Map.of();
  }

  @PostMapping("/shapes/form")
  void form(@RequestBody MultiValueMap<String, String> form) {}

  @PostMapping("/shapes/tags")
  void tags(@RequestBody Map<String, String> tags) {}

  @PostMapping("/shapes/optional")
  void optional(@RequestBody Optional<Map<String, Object>> body) {} // violation: SpringTypedRequestBody

  @PostMapping("/shapes/any")
  void any(@RequestBody List<? extends Object> body) {} // violation: SpringTypedRequestBody
}
