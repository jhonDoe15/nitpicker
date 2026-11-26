package q;
public class Native { 
    public boolean equals(Object o) { return o == this; }
    public static class SubIn extends Native { int x; }
}
