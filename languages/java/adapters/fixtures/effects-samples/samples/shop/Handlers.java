package shop;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

interface Secured {
  @PreAuthorize("hasRole('USER')")
  String viaInterface();
}

@PreAuthorize("hasRole('USER')")
abstract class Base {}

@Retention(RetentionPolicy.RUNTIME)
@RequestMapping
@interface Fetch {}

@RestController
class Derived extends Base {
  @GetMapping
  String viaClass() {
    return "";
  }
}

@RestController
class Handlers implements Secured {
  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded0() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded1() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded2() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded3() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded4() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded5() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded6() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded7() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded8() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded9() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded10() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded11() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded12() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded13() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded14() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded15() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded16() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded17() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded18() {
    return "";
  }

  @GetMapping
  @PreAuthorize("hasRole('USER')")
  String guarded19() {
    return "";
  }

  @GetMapping
  public String viaInterface() {
    return "";
  }

  @GetMapping
  String open() {
    return "";
  }

  @Fetch
  String composed() {
    return "";
  }

  String notAHandler() {
    return "";
  }
}
