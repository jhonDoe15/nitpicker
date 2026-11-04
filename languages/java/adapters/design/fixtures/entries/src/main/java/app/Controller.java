package app;

import jakarta.annotation.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;

@Service
public class Controller {
  private final Repo repo;

  public Controller(Repo repo) {
    this.repo = repo;
  }

  @GetMapping("/x")
  public String index(String request) {
    return request;
  }

  @Marker
  public void marked() {}

  @Nullable
  public String maybe() {
    return null;
  }

  @SuppressWarnings("unused")
  public void quiet() {}

  public static void main(String[] args) {}

  private void hidden() {}

  public String label(Marker marker) {
    return marker.value();
  }
}
