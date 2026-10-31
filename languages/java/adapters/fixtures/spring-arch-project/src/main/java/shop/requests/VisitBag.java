package shop.requests;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

@Component
@RequestScope
public class VisitBag {
  private final List<VisitDto> items = new ArrayList<>();

  public void keep(VisitDto visit) {
    items.add(visit);
  }
}
