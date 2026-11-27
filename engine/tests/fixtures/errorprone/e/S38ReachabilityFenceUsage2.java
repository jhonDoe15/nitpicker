import java.lang.ref.Reference;

class S38ReachabilityFenceUsage2 {
  public void run() {
    try {
      // BUG: Diagnostic contains:
      Reference.reachabilityFence(this);
    } catch (Exception e) {
    }
  }
}
