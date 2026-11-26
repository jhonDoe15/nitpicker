package p;
public class Rev {
    public static class R1 { 
        public int compareTo(Object o) { return 0; }
        public int compareTo(R1 o) { return 0; }
    }
    public static class R2 { 
        public int compareTo(R2 o) {
            return 0; }
        public int compareTo(Object o) {
            return 0; }
    }
    public static class R3 { 
        public int compareTo(Object o) {
            return 0; }
        public int compareTo(R3 o) {
            return 0; }
    }
}
