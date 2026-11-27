import java.util.*;

int LIMIT = 10;
private String name = null;
List<String> items = new ArrayList<>();

record Point(int x, int y) { }

enum Color { RED, GREEN }

interface Shape { double area(); }

class Helper {
    private int unused;
    public void doIt() { }
}

void main(String[] args) {
    int total = 0;
    for (int i = 0; i < args.length; i++) {
        total += args[i].length();
    }
    if (total > LIMIT) {
        System.out.println("big " + total);
    }
    try {
        risky();
    } catch (Exception e) {
    }
    String s = new String("x");
    Object o = args;
    if (o instanceof String[] arr && arr.length > 0) {
        System.out.println(arr[0]);
    }
    switch (Color.RED) {
        case RED: System.out.println("r");
        case GREEN: break;
    }
}

private void risky() throws Exception { throw new Exception("x"); }

public int Compute(int a, int b) { return a == b ? 1 : 0; }

int count = 0;
private int hidden = 1;

void run() {
    int x = 1;
    x = 2;
    count = x;
    (count) = helper(count);
}

int helper(int y) {
    count = y;
    return count;
}
