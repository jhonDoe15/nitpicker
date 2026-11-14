package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@RequestMapping("/a")
class Mappings {
  @GetMapping("/x")
  String one() {
    return "x";
  }

  @PostMapping(path = "/y", produces = "text/plain")
  String two() {
    return "y";
  }

  @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
  String three() {
    return "z";
  }

  @GetMapping("/g")
  String four() {
    return "g";
  }
}
