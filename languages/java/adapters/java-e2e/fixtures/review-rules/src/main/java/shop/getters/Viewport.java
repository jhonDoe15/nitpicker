package shop.getters;

import java.util.List;

public class Viewport {
  private int areaWidth;
  private int areaHeight;
  private int mScrollTop;
  private int mScrollLeft;
  private List<String> videoEncodings;
  private List<String> audioEncodings;
  private String keyStore;
  private String trustStore;
  private String areaName;
  private String areaLabel;
  private String areaNameAlias;
  private String baseDirectory;
  private String baseDir;
  private String blockIndex;
  private List<String> combinedIndex;
  private int width;
  private int left;
  private int right;
  private int depth;
  private int height;

  public int getAreaWidth() {
    return areaWidth;
  }

  public int getAreaHeight() { // violation: GetterReturnsSiblingField
    return areaWidth;
  }

  public int getScrollTop() { // violation: GetterReturnsSiblingField
    return mScrollLeft;
  }

  public int getScrollLeft() { // violation: GetterReturnsSiblingField
    return this.mScrollTop;
  }

  public List<String> getVideoEncodings() { // violation: GetterReturnsSiblingField
    return audioEncodings;
  }

  public List<String> getAudioEncodings() { // violation: GetterReturnsSiblingField
    return videoEncodings;
  }

  public String getTrustStore() { // violation: GetterReturnsSiblingField
    return keyStore;
  }

  public String getKeyStore() {
    return keyStore;
  }

  public String getAreaName() {
    return areaNameAlias;
  }

  public String getAreaLabel() {
    return areaLabel + areaName;
  }

  public String getAreaCaption() {
    return areaLabel;
  }

  public String getBaseDirectory() {
    return baseDir;
  }

  public String getBaseDir() {
    return baseDirectory;
  }

  public List<String> getBlockIndex() {
    return combinedIndex;
  }

  public List<String> getCombinedIndex() {
    return combinedIndex;
  }

  public int getWidth() { // violation: GetterReturnsSiblingField
    return height;
  }

  public int getLeft() { // violation: GetterReturnsSiblingField
    return right;
  }

  public int getRight() {
    return right;
  }

  public int getDepth() {
    return height;
  }

  public int getHeight() {
    return height;
  }

  public int getTotalWidth() {
    return areaWidth + areaHeight;
  }

  public int getAreaDepth(int scale) {
    return areaHeight * scale;
  }

  public int getAreaLength() {
    areaWidth++;
    return areaHeight;
  }
}
