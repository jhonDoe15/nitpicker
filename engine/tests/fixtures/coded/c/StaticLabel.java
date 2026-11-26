package c;

public interface StaticLabel {
    static String label() {
        return "interface";
    }
}

class InstanceLabel implements StaticLabel {
    public String label() {
        return "instance";
    }
}
