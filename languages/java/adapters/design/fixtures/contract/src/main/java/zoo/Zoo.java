package zoo;

public class Zoo {
  public String hear(Animal animal) {
    return animal.sound();
  }

  public void teach(Animal animal) {
    animal.noises().add("new");
  }

  public void take(zoo.one.Tag tag) {
    System.out.println(tag);
  }

  public void take(zoo.two.Tag tag) {
    System.out.println(tag);
  }

  protected static class Keeper {
    public void feed() {
      System.out.println("fed");
    }
  }
}
