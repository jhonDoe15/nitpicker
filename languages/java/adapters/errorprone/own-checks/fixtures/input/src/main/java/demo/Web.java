package demo;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

@Controller
@ResponseBody
class Web {
  @GetMapping("/x")
  String one() {
    return "x";
  }
}

@RestController
class Rest {
  @ResponseBody
  @GetMapping("/r")
  String one() {
    return "r";
  }
}
