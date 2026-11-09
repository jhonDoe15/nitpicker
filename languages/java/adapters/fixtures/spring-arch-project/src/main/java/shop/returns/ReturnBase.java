package shop.returns;

import org.springframework.web.bind.annotation.GetMapping;

abstract class ReturnBase {
  @GetMapping("/returns/gone")
  public String gone() {
    throw new ReturnGone();
  }
}
