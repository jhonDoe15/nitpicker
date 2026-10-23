package shop.requests;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VisitController {
  private static final List<String> SEEN = new ArrayList<>();
  private final Map<String, VisitDto> last = new HashMap<>();
  private final Map<String, VisitDto> byId = new ConcurrentHashMap<>();
  private final Map<String, List<VisitDto>> grouped = new HashMap<>();
  private final AtomicLong count = new AtomicLong();
  private final Map<String, String> pages = new HashMap<>();
  private final List<String> trail = new ArrayList<>();
  private final Notes notes = new Notes();
  private final VisitLog log;
  private final Visits visits;
  private final VisitBag bag;
  private final Cache cache;
  private String current;

  VisitController(VisitLog log, Visits visits, VisitBag bag, CacheManager caches) {
    this.log = log;
    this.visits = visits;
    this.bag = bag;
    this.cache = caches.getCache("visits");
    pages.put("home", "/");
  }

  @PostMapping("/visits")
  public void create(@RequestBody VisitDto visit) {
    last.put(visit.id(), visit);
  }

  @GetMapping("/visits/{id}")
  public void show(@PathVariable String id) {
    current = id;
  }

  @GetMapping("/audit")
  public void audit(HttpServletRequest request) {
    SEEN.add(request.getHeader("X-Trace"));
  }

  @PostMapping("/visits/all")
  public void importAll(@RequestBody List<VisitDto> all) {
    all.forEach(visit -> byId.put(visit.id(), visit));
  }

  @PostMapping("/visits/grouped")
  public void group(@RequestBody VisitDto visit) {
    grouped.computeIfAbsent(visit.page(), page -> new ArrayList<>()).add(visit);
  }

  @PostMapping("/visits/log")
  public void delegate(@RequestBody VisitDto visit) {
    log.remember(visit);
  }

  @PostMapping("/visits/save")
  public void save(@RequestBody VisitDto visit) {
    visits.save(visit);
  }

  @PostMapping("/visits/note")
  public void note(@RequestBody VisitDto visit) {
    notes.record(visit);
  }

  @GetMapping("/visits/count")
  public long counted() {
    return count.incrementAndGet();
  }

  @GetMapping("/visits/search")
  public List<String> search(@RequestParam String query) {
    List<String> found = new ArrayList<>();
    found.add(query);
    return found;
  }

  @PostMapping("/visits/cached")
  public void cached(@RequestBody VisitDto visit) {
    cache.put(visit.id(), visit);
  }

  @PostMapping("/visits/scoped")
  public void scoped(@RequestBody VisitDto visit) {
    bag.keep(visit);
  }

  @GetMapping("/pages")
  public String page(@RequestParam String name) {
    return pages.get(name) + log.describe(name);
  }

  @PostMapping("/visits/trail")
  public void follow(@RequestBody VisitDto visit) {
    trail().add(visit.page());
  }

  @PostMapping("/visits/later")
  public Supplier<String> later(@RequestBody VisitDto visit) {
    return visit::page;
  }

  List<String> trail() {
    return trail;
  }
}
