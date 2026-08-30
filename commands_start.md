# Start the web backend and Android app

Run the backend from the project root:

```bash
cd /Applications/Coding/peek-poke.com
npm run dev
```

In a second terminal, start the Android emulator:

```bash
/Users/andy/Library/Android/sdk/emulator/emulator @Pixel_6
```

Then build, install, and launch the Android app:

```bash
cd /Applications/Coding/peek-poke.com
npm run native:android
```

If the release APK is already built, install and launch it directly:

```bash
cd /Applications/Coding/peek-poke.com/apps/native/android
/Users/andy/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
/Users/andy/Library/Android/sdk/platform-tools/adb shell monkey -p com.peekpoke.app -c android.intent.category.LAUNCHER 1
```
