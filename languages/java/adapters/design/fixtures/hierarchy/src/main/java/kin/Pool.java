package kin;

public class Pool extends AbstractRes implements Named {
  public void acquire() {}

  @Override
  public String name() {
    return "pool";
  }
}
