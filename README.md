# 🍺 Пивной Район

A 3D game for Android in the style of the early GTA games. The hero is a guy in a black beanie and a black puffer jacket with white stripes. The police are **gorillas on sofas**, and the weapon is a **banana gun** whose bananas calm the gorillas down.

## How to install on your phone

1. Download [`dist/PivnoyRayon.apk`](dist/PivnoyRayon.apk) to your phone.
2. Open the file. Android will ask for permission to install apps from this source: allow it.
3. Launch **«Пивной Район»**. The game runs in landscape orientation and works offline.

You can also play in a browser: open `dist/PivnoyRayon.html` (everything is in one file).

## What's in the game

- **3D city**: khrushchevka apartment blocks, autumn birch trees, roads with markings, crosswalks, street lamps, a bus stop, yards with playgrounds.
- **Hero**: a 3D model with the face from the photo, a black ribbed beanie, a black puffer jacket with white stripes and jeans.
- **Beer 🍺**: buy it ($40) or **rob beer shops** (6 shops around the district). Drinking restores health and gives a **БУЛЬ-БУЛЬ** buzz: points ×1.25 per bottle, but the hero sways and the camera wobbles. The sixth bottle in a row puts him to sleep on the spot.
- **Police: gorillas on sofas 🦍🛋** with flashing lights. The more ★ wanted stars you have, the more sofas there are and the faster they go. If a gorilla grabs you, you're **ПРИНЯЛИ** (busted) and taken to the zoo.
- **Banana gun 🍌**: aims automatically. A banana **calms a gorilla**: it starts eating and drives off home. A missed banana leaves a **peel** that sends cars and sofas into a skid.
- **Cars**: Lada (Жигули), Niva, Gazelle, Bumer. Steal any of them (you can throw out the driver). The car has «БАНАН FM» radio.
- **Shaking off the wanted level**: hide, go **home 🏠** (that also saves the game), or get your car resprayed at **Uncle Vitya's garage 🔧** for $100.
- **Missions** come in on the pager from the guys in the district. The last one is a boss fight with the **MAIN GORILLA** on a black leather sofa. After that you get free play with endless jobs.

## Controls

| Action | Phone | Keyboard |
|---|---|---|
| Walk / drive | joystick on the left half of the screen | WASD / arrows |
| Rotate camera | drag on the right half of the screen | Z / X |
| Shoot bananas | 🍌 (hold) | Space |
| Get in / out of a car | 🚗 | E |
| Drink beer | 🍺 | Q |
| Rob / buy | buttons near the shop | R / B |
| Pause, map | ❚❚ | Esc, M |

## Building the APK

No Android Studio needed; the build runs from a script:

```bash
sudo apt-get install -y aapt zipalign apksigner dalvik-exchange android-sdk-platform-23
./build.sh
```

The result goes to `dist/PivnoyRayon.apk` (and `dist/PivnoyRayon.html` for the browser).
`android/debug.keystore` is a debug key with the password `android`. It keeps the signature the same between builds, so a new version installs over the old one.

## Structure

- `game/` — the game itself (HTML5 + [Three.js r149](https://threejs.org), MIT, file `game/lib/three.min.js`)
  - `js/core.js` — input, synthesized sound, saves
  - `js/world.js` — city generation, collisions, pathfinding for the gorillas
  - `js/entities.js` — hero, cars, sofas with gorillas, pedestrians, bananas
  - `js/render3d.js` — 3D rendering: city, models, camera
  - `js/game.js` — main loop, missions, HUD, screens
- `android/` — WebView wrapper (manifest, `MainActivity.java`, icons)
- `tools/inline_html.py` — packs the game into a single HTML file
