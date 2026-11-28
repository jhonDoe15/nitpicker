package p;

public class R {
    private static final int MAX_CHAR_BYTES = 3;
    private int pageIndex = -1;
    private int currentOffset;
    private int maxOffset;
    private byte[] currentBufferPool;

    void writeVInt(int v) { maxOffset = v; }
    void writeCharUtf8(char c) { pageIndex++; }
    static int putCharUtf8(byte[] b, char c, int p) { return p + 1; }

    void write(int charCount, String str) {
        writeVInt(charCount);
        int i = 0;
        int position = currentOffset;
        while (i < charCount) {
            final int lastSafePosition = this.maxOffset - MAX_CHAR_BYTES;
            final var currentBufferPool = this.currentBufferPool;
            while (i < charCount && position <= lastSafePosition) {
                position = putCharUtf8(currentBufferPool, str.charAt(i++), position);
            }
            this.currentOffset = position;
            final int oldPageIndex = this.pageIndex;
            while (this.pageIndex == oldPageIndex && i < charCount) {
                writeCharUtf8(str.charAt(i++));
            }
            position = this.currentOffset;
        }
    }
}
