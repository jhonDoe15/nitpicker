import java.lang.ref.Reference;

class S38ReachabilityFenceUsage1 {
  public void run() {
    // BUG: Diagnostic contains:
    Reference.reachabilityFence(this);
  }
}
