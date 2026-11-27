public class S40RevB {
  void g(int i) {
    switch (i) {
      case 1:
        ;
      case 2:
        break;
      default:
        ;
    }
    switch (i) {
      default:
        ;
      case 1:
        break;
    }
    switch (i) {
      case 1:
        break;
      default:
        ;
    }
    switch (i) {
      case 1:
        break;
      case 2:
        System.out.println();
        ;
      case 3:
        break;
    }
  }
}
