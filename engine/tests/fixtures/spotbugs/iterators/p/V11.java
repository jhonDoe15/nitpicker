package p;
public class V11 extends U2 {
    int i;
    public String next() {
        i++;
        if (i > 3) {
            return "b";
        }
        return "a";
    }
}
