package p;
import java.io.File;
import org.springframework.web.bind.annotation.*;
@RestController
public class R {
  @GetMapping("/a") public String m1(@RequestParam String s) { new File(s); return ""; }
  @GetMapping("/b") public String m2(String s) { new File(s); return ""; }
  public String m3(@RequestParam String s) { new File(s); return ""; }
  @RequestMapping("/c") public String m4(@PathVariable String s, int n) { new File(s); return ""; }
  @GetMapping("/d") public String m5(@RequestParam String s) { new File(s + "x"); return ""; }
  @GetMapping("/e") private String m6(String s) { new File(s); return ""; }
  @GetMapping("/f") public String m7(@RequestParam String s) { helper(s); return ""; }
  private void helper(String s) { new File(s); }
  @GetMapping("/g") public String m8(@RequestBody Body b) { new File(b.name); return ""; }
}
class Body { public String name; }
class NotController {
  @GetMapping("/a") public String m1(@RequestParam String s) { new File(s); return ""; }
}
