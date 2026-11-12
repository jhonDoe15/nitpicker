plugins {
    id("com.android.library")
    kotlin("android")
}

android {
    namespace = "demo.lib"
    compileSdk = 35
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
