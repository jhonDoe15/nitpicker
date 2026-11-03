package shop.requests;

import org.springframework.stereotype.Component;

@Component
public class MemoryVisits implements Visits {
  private final VisitDto[] slots = new VisitDto[8];

  @Override
  public void save(VisitDto visit) {
    slots[0] = visit;
  }
}
