#!/usr/bin/env python3
"""Сборка APK «Пивной Угон» без Android SDK.

Что происходит:
  1. С Maven Central скачиваются android-all (классы Android API 34),
     dx (компилятор в .dex) и apksig (подпись APK). Кэш: build/tools.
  2. Бинарный AndroidManifest.xml и resources.arsc (одна иконка)
     генерируются прямо здесь.
  3. MainActivity.java компилируется javac и переводится в classes.dex.
  4. Игра (game/index.html) кладётся в assets/, всё пакуется и
     подписывается ключом android/debug.keystore (схема v2, Android 7.0+).

Запуск:  python3 tools/build_apk.py   (нужны python3 и JDK 11+)
Результат: release/PivnoyUgon.apk
"""
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
TOOLS = os.path.join(BUILD, "tools")
OUT_APK = os.path.join(ROOT, "release", "PivnoyUgon.apk")
KEYSTORE = os.path.join(ROOT, "android", "debug.keystore")
KS_PASS, KS_ALIAS = "android", "pivnoy"

PKG = "com.pivnoy.ugon"
LABEL = "Пивной Угон"
VERSION_CODE = 1
VERSION_NAME = "1.0"
MIN_SDK, TARGET_SDK = 24, 34   # Android 7.0+
ICON_ZIP_PATH = "res/mipmap-xxxhdpi-v4/ic_launcher.png"

MAVEN = "https://repo1.maven.org/maven2/"
DEPS = {
    "android-all.jar": "org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar",
    "dx.jar": "com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar",
    "apksig.jar": "com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar",
}


def log(msg):
    print("[build] " + msg, flush=True)


def fetch_tools():
    os.makedirs(TOOLS, exist_ok=True)
    for name, path in DEPS.items():
        dst = os.path.join(TOOLS, name)
        if os.path.exists(dst):
            continue
        log("скачиваю " + name)
        sha1 = urllib.request.urlopen(MAVEN + path + ".sha1", timeout=60).read().decode().split()[0].strip()
        tmp = dst + ".part"
        with urllib.request.urlopen(MAVEN + path, timeout=600) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
        h = hashlib.sha1(open(tmp, "rb").read()).hexdigest()
        if h != sha1:
            os.remove(tmp)
            sys.exit("контрольная сумма не совпала для " + name)
        os.replace(tmp, dst)


# ---------------------------------------------------------------- бинарный XML / ARSC

class StringPool:
    def __init__(self):
        self.strings, self.index = [], {}

    def add(self, s):
        if s not in self.index:
            self.index[s] = len(self.strings)
            self.strings.append(s)
        return self.index[s]

    def chunk(self):
        data, offsets = b"", []
        for s in self.strings:
            offsets.append(len(data))
            enc = s.encode("utf-16-le")
            n = len(enc) // 2
            if n > 0x7FFF:
                data += struct.pack("<HH", (n >> 16) | 0x8000, n & 0xFFFF)
            else:
                data += struct.pack("<H", n)
            data += enc + b"\x00\x00"
        while len(data) % 4:
            data += b"\x00"
        start = 28 + 4 * len(self.strings)
        hdr = struct.pack("<HHIIIIII", 0x0001, 28, start + len(data), len(self.strings), 0, 0, start, 0)
        return hdr + b"".join(struct.pack("<I", o) for o in offsets) + data


ANDROID_NS = "http://schemas.android.com/apk/res/android"
ATTR_IDS = {
    "theme": 0x01010000, "label": 0x01010001, "icon": 0x01010002, "name": 0x01010003,
    "exported": 0x01010010, "screenOrientation": 0x0101001E, "configChanges": 0x0101001F,
    "minSdkVersion": 0x0101020C, "versionCode": 0x0101021B, "versionName": 0x0101021C,
    "targetSdkVersion": 0x01010270, "hardwareAccelerated": 0x010102D3,
}
T_REF, T_STR, T_DEC, T_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12
A = "android"
THEME_BLACK_NOTITLE_FULLSCREEN = 0x0103000A
ICON_RES_ID = 0x7F010000
SENSOR_LANDSCAPE = 6
CONFIG_CHANGES = 0x10 | 0x20 | 0x40 | 0x80 | 0x100 | 0x200 | 0x400 | 0x800


def manifest_tree():
    return ("manifest", [(None, "package", T_STR, PKG), (A, "versionCode", T_DEC, VERSION_CODE), (A, "versionName", T_STR, VERSION_NAME)], [
        ("uses-sdk", [(A, "minSdkVersion", T_DEC, MIN_SDK), (A, "targetSdkVersion", T_DEC, TARGET_SDK)], []),
        ("uses-permission", [(A, "name", T_STR, "android.permission.VIBRATE")], []),
        ("application", [(A, "label", T_STR, LABEL), (A, "icon", T_REF, ICON_RES_ID),
                         (A, "theme", T_REF, THEME_BLACK_NOTITLE_FULLSCREEN), (A, "hardwareAccelerated", T_BOOL, True)], [
            ("activity", [(A, "name", T_STR, PKG + ".MainActivity"), (A, "exported", T_BOOL, True),
                          (A, "screenOrientation", T_DEC, SENSOR_LANDSCAPE), (A, "configChanges", T_HEX, CONFIG_CHANGES)], [
                ("intent-filter", [], [
                    ("action", [(A, "name", T_STR, "android.intent.action.MAIN")], []),
                    ("category", [(A, "name", T_STR, "android.intent.category.LAUNCHER")], []),
                ]),
            ]),
        ]),
    ])


def build_axml(root):
    sp = StringPool()
    with_ids = []

    def collect(e):
        for ns, n, _, _ in e[1]:
            if ns and n not in with_ids:
                with_ids.append(n)
        for c in e[2]:
            collect(c)

    collect(root)
    for n in with_ids:          # строки атрибутов с ресурсными ID идут первыми
        sp.add(n)
    resmap = [ATTR_IDS[n] for n in with_ids]
    sp.add(A)
    sp.add(ANDROID_NS)

    def collect2(e):
        sp.add(e[0])
        for _, n, t, v in e[1]:
            sp.add(n)
            if t == T_STR:
                sp.add(v)
        for c in e[2]:
            collect2(c)

    collect2(root)
    prefix, uri = sp.index[A], sp.index[ANDROID_NS]
    out, line = [], [1]
    out.append(struct.pack("<HHIIIII", 0x0100, 16, 24, line[0], 0xFFFFFFFF, prefix, uri))

    def emit(e):
        name, attrs, kids = e
        ordered = sorted([a for a in attrs if a[0]], key=lambda a: ATTR_IDS[a[1]]) + [a for a in attrs if not a[0]]
        abuf = b""
        for ns, n, t, v in ordered:
            if t == T_STR:
                raw = data = sp.index[v]
            else:
                raw = 0xFFFFFFFF
                data = (0xFFFFFFFF if v else 0) if t == T_BOOL else v
            abuf += struct.pack("<IIIHBBI", uri if ns else 0xFFFFFFFF, sp.index[n], raw, 8, 0, t, data)
        ext = struct.pack("<IIHHHHHH", 0xFFFFFFFF, sp.index[name], 20, 20, len(ordered), 0, 0, 0)
        body = struct.pack("<II", line[0], 0xFFFFFFFF) + ext + abuf
        out.append(struct.pack("<HHI", 0x0102, 16, 8 + len(body)) + body)
        line[0] += 1
        for k in kids:
            emit(k)
        out.append(struct.pack("<HHIIIII", 0x0103, 16, 24, line[0], 0xFFFFFFFF, 0xFFFFFFFF, sp.index[name]))
        line[0] += 1

    emit(root)
    out.append(struct.pack("<HHIIIII", 0x0101, 16, 24, line[0], 0xFFFFFFFF, prefix, uri))
    rmap = struct.pack("<HHI", 0x0180, 8, 8 + 4 * len(resmap)) + b"".join(struct.pack("<I", i) for i in resmap)
    content = sp.chunk() + rmap + b"".join(out)
    return struct.pack("<HHI", 0x0003, 8, 8 + len(content)) + content


def build_arsc():
    values = StringPool()
    values.add(ICON_ZIP_PATH)
    types = StringPool()
    types.add("mipmap")
    keys = StringPool()
    keys.add("ic_launcher")

    spec = struct.pack("<HHIBBHI", 0x0202, 16, 20, 1, 0, 0, 1) + struct.pack("<I", 0x0100)
    config = bytearray(64)
    struct.pack_into("<I", config, 0, 64)
    struct.pack_into("<H", config, 14, 640)   # density = xxxhdpi
    struct.pack_into("<H", config, 24, 4)     # sdkVersion = 4 (как у aapt для плотностей)
    entry = struct.pack("<HHI", 8, 0, 0) + struct.pack("<HBBI", 8, 0, T_STR, 0)
    type_hdr = 8 + 4 + 4 + 4 + 64
    type_chunk = (struct.pack("<HHIBBHII", 0x0201, type_hdr, type_hdr + 4 + len(entry), 1, 0, 0, 1, type_hdr + 4)
                  + bytes(config) + struct.pack("<I", 0) + entry)

    tpool, kpool = types.chunk(), keys.chunk()
    name16 = PKG.encode("utf-16-le").ljust(256, b"\x00")
    pkg_hdr_size = 288
    pkg_body = tpool + kpool + spec + type_chunk
    pkg = (struct.pack("<HHII", 0x0200, pkg_hdr_size, pkg_hdr_size + len(pkg_body), 0x7F) + name16
           + struct.pack("<IIIII", pkg_hdr_size, 1, pkg_hdr_size + len(tpool), 1, 0) + pkg_body)
    vpool = values.chunk()
    return struct.pack("<HHII", 0x0002, 12, 12 + len(vpool) + len(pkg), 1) + vpool + pkg


# ---------------------------------------------------------------- сборка

def run(cmd):
    log(" ".join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))[:200])
    subprocess.run(cmd, check=True)


def main():
    fetch_tools()
    work = os.path.join(BUILD, "work")
    shutil.rmtree(work, ignore_errors=True)
    classes = os.path.join(work, "classes")
    signer_classes = os.path.join(work, "signer")
    os.makedirs(classes)
    os.makedirs(signer_classes)
    android_all = os.path.join(TOOLS, "android-all.jar")
    apksig = os.path.join(TOOLS, "apksig.jar")

    srcs = []
    for d, _, files in os.walk(os.path.join(ROOT, "android", "src")):
        srcs += [os.path.join(d, f) for f in files if f.endswith(".java")]
    run(["javac", "-nowarn", "--release", "8", "-encoding", "UTF-8", "-cp", android_all, "-d", classes] + srcs)

    dex_dir = os.path.join(work, "dex")
    os.makedirs(dex_dir)
    run(["java", "-cp", os.path.join(TOOLS, "dx.jar"), "com.android.dx.command.Main", "--dex",
         "--min-sdk-version=%d" % MIN_SDK, "--output=" + os.path.join(dex_dir, "classes.dex"), classes])

    if not os.path.exists(KEYSTORE):
        run(["keytool", "-genkeypair", "-keystore", KEYSTORE, "-storetype", "PKCS12", "-alias", KS_ALIAS,
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Pivnoy Ugon",
             "-storepass", KS_PASS, "-keypass", KS_PASS])

    unsigned = os.path.join(work, "unsigned.apk")
    with zipfile.ZipFile(unsigned, "w") as z:
        def put(name, data, stored=False):
            zi = zipfile.ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
        put("AndroidManifest.xml", build_axml(manifest_tree()))
        put("classes.dex", open(os.path.join(dex_dir, "classes.dex"), "rb").read())
        put("resources.arsc", build_arsc(), stored=True)
        put(ICON_ZIP_PATH, open(os.path.join(ROOT, "android", "ic_launcher.png"), "rb").read())
        put("assets/index.html", open(os.path.join(ROOT, "game", "index.html"), "rb").read())

    run(["javac", "-nowarn", "--release", "8", "-cp", apksig, "-d", signer_classes, os.path.join(ROOT, "tools", "SignApk.java")])
    os.makedirs(os.path.dirname(OUT_APK), exist_ok=True)
    # apksig 2.3.0 обращается к внутренним классам JDK, их нужно открыть
    exports = []
    for pkg in ("sun.security.x509", "sun.security.pkcs", "sun.security.util"):
        exports += ["--add-exports", "java.base/%s=ALL-UNNAMED" % pkg]
    run(["java"] + exports + ["-cp", apksig + os.pathsep + signer_classes, "SignApk", unsigned, OUT_APK, KEYSTORE, KS_PASS, KS_ALIAS])
    log("готово: %s (%d КБ)" % (os.path.relpath(OUT_APK, ROOT), os.path.getsize(OUT_APK) // 1024))


if __name__ == "__main__":
    main()
