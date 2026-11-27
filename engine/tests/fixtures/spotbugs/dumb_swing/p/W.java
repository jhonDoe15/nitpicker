package p;

import javax.swing.JFrame;

public class W {
    public static void main(String[] args) {
        new JFrame().setVisible(true);
    }

    static class B {
        public static void main(String[] args) {
            new JFrame().show();
        }
    }

    static class C {
        public static void main(String[] args) {
            new java.awt.Frame().pack();
        }
    }

    static class D {
        public static void main(String[] args) {
            JFrame f = new JFrame();
            f.add(new javax.swing.JLabel("x"));
            f.setSize(1, 1);
            f.setVisible(true);
        }
    }
}
