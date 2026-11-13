package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class Web {
  @GetMapping("/x")
  String one() {
    return "x";
  }
}

@RestController
class Rest {
  @GetMapping("/r")
  String one() {
    return "r";
  }
}
