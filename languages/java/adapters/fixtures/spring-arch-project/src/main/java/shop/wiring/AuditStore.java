package shop.wiring;

@Store
public class AuditStore {
  private final WiringService service;

  public AuditStore(WiringService service) {
    this.service = service;
  }
}
