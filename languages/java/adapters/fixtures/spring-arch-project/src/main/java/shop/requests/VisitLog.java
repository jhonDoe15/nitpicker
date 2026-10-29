package shop.requests;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class VisitLog {
  private final List<Object> recent = new ArrayList<>();

  void remember(Object visit) {
    keep(visit);
  }

  String describe(Object visit) {
    return String.valueOf(visit);
  }

  private void keep(Object visit) {
    recent.add(visit);
  }
}
