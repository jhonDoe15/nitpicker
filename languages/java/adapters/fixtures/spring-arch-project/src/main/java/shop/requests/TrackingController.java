package shop.requests;

import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TrackingController extends Auditing implements VisitApi {
  private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();
  private final List<VisitDto> tracked = new ArrayList<>();
  private final List<VisitDto> queued = new ArrayList<>();
  private String summary;

  @Override
  public void track(VisitDto visit) {
    tracked.add(visit);
  }

  @GetMapping("/track/{id}")
  public void mark(@PathVariable String id) {
    remember(id);
  }

  @PostMapping("/track/later")
  public void later(@RequestBody VisitDto visit) {
    new Runnable() {
      @Override
      public void run() {
        queued.add(visit);
      }
    }.run();
  }

  @GetMapping("/track/trail")
  public void trail(@RequestParam List<String> steps) {
    StringBuilder all = new StringBuilder();
    steps.forEach(all::append);
    summary = all.toString();
  }

  @GetMapping("/track/current")
  public void current(@RequestParam String user) {
    CURRENT.set(user);
  }
}
