package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

@RequestMapping("/a")
class Mappings {
  @RequestMapping(value = "/x", method = RequestMethod.GET)
  String one() {
    return "x";
  }

  @RequestMapping(path = "/y", method = {RequestMethod.POST}, produces = "text/plain")
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
