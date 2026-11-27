package p;
import lombok.NoArgsConstructor;
@NoArgsConstructor
public class S3 {
    private static final S3 INSTANCE = new S3();
    public static S3 getInstance() { return INSTANCE; }
}
