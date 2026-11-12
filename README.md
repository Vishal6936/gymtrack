# GymTrack v2

An offline workout log. Everything is stored on the phone. There are no accounts and nothing goes to the cloud, and the app doesn't load any internet libraries.

## Structure
```
index.html            app shell
css/app.css           the whole design system
js/ui.js              element builder, icons, sheets, toasts, SVG charts
js/store.js           data model, saving, v1 import, streaks/PRs/stats
js/timer.js           session/stopwatch/countdown/rest engine + Timer tab + live bar
js/app.js             navigation, Android back button, boot
js/screens/*.js       Today, Log, Snapshot, Activity, Plan, Progress, Settings
sw.js                 offline cache
manifest.webmanifest  install info + icons
```

## 1. Bring over your old data
1. Open the **old** app and go to **Settings → Data Management → Export Data**. Save the `.json` file.
2. Open the **new** app and go to **Today → ⚙ → Backup & restore → Import from file**. Pick that file.

Everything comes across: workouts, swaps, omitted days, measurements, goals, saved workouts, timer sessions and settings.

## 2. (Optional) Try it on your laptop
The app needs to be served over http; opening the file directly won't run the offline part. In this folder, run:
```
python -m http.server 8080
```
Then open http://localhost:8080.

## 3. Put it on GitHub and install it on your Android phone (free)
No git or terminal needed — just the GitHub website:
1. github.com → **New repository** → name it `gymtrack` → **Public** → Create.
2. On the empty repo page click **uploading an existing file**, then drag in **everything inside this folder**
   (index.html, sw.js, manifest.webmanifest, .nojekyll, and the css, js, icons folders) → **Commit changes**.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → Save.
   After about a minute your app is live at `https://<your-username>.github.io/gymtrack/`.
4. Open that link in **Chrome on your phone** → **⋮ → Install app**. It gets its own icon, opens full-screen and works with no internet.
5. In the app: ⚙ → Backup & restore → Import your old v1 export.

**Updating later:** upload the changed files to the repo again (same names overwrite). Open the app on your phone twice — the new version loads on the second open. Your data is not touched by updates.

**Keep backups:** the app lives on the phone, so export a backup now and then (Today shows a reminder).

## 4. Build a real APK (optional, for sharing with friends)
You need Node.js and Android Studio installed. In a new folder next to this one, run:
```
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init GymTrack com.yourname.gymtrack --web-dir www
# copy all files of gymtrack-v2 into ./www
npx cap add android
npx cap open android      # Android Studio → Build → Build APK(s)
```
The APK will be in `android/app/build/outputs/apk/debug/`. Send it to your phone and install it; you'll need to allow "install unknown apps" for that one time.

Note: a PWA and an APK have **separate storage**. Export a backup from one and import it into the other.
