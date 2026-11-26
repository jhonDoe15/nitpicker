package p;

/** Doc. */
@Deprecated
@SuppressWarnings("all")
public
class Br implements Comparable<Br> {
    int x;
    public int compareTo(Br o) { return x - o.x; }
}

@Deprecated
class Br2 implements Comparable<String> {
    public int compareTo(String o) {
        return 0;
    }
}

class Br3<T extends Comparable<T>> implements Comparable<T> {
    public int compareTo(T o) {
        return 0;
    }
}

abstract class Gen<T> {
    abstract int compareTo(T o);
}

class Br4 extends Gen<Integer> {
    int compareTo(Integer o) { return 0; }
}
