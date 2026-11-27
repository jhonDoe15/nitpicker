package p;

import javax.swing.JDialog;
import javax.swing.JFrame;

public class H {
    public static void main(String[] args) {
        JFrame f = new JFrame();
        f.pack();
        f.setVisible(true);
        f.show();
        java.awt.Frame g = new java.awt.Frame();
        g.setVisible(true);
        JDialog d = new JDialog();
        d.setVisible(false);
    }

    void notMain(JFrame f) {
        f.setVisible(true);
        f.pack();
    }

    static void main2(String[] args) {
        new JFrame().setVisible(true);
    }

    public void main(int x) {
        new JFrame().setVisible(true);
    }

    static class I {
        public static void main(String... args) {
            JFrame f = new JFrame();
            f.setVisible(true);
            java.awt.Window w = f;
            w.pack();
            java.awt.Component c = f;
            c.setVisible(true);
        }
    }
}
