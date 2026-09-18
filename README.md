# 🦅 SkyPeck 3D - Android TV & Telefon Hareket Kumandası

Bu proje, *Sky Peck* vücut hareketleriyle uçuş oyununun **Xiaomi Mi TV Stick (1080p Android TV)** ve **Redmi 13C (60 FPS Yapay Zeka Kamera Kumandası)** için yerel Android uygulaması (APK) sürümüdür.

---

## 🌟 Sistem Mimarisi

```
+-------------------------------------------------------------------------+
|                           YEREL EV WI-FI AĞI                            |
|                                                                         |
|   +-----------------------+     UDP Port 9876    +--------------------+ |
|   |   AKILLI TELEFON      | -------------------> |  XIAOMI MI STICK   | |
|   |  (Kamera + Edge AI)   |    Sıfır Gecikme     |    (Android TV)    | |
|   |                       |  Telemetri Paketleri |                    | |
|   | - Google ML Kit Pose  |  (~100 bayt / 60fps) | - 1080p Three.js   | |
|   | - Wingspan Oranı      |                      | - Tropik Takımada  | |
|   | - Kol Açısı (atan2)   |                      | - Altın Halkalar   | |
|   | - Kanat Çırpış Hızı   |                      | - Canlı İskelet HUD| |
|   | - Dalış (Dive) Algı   |                      | - Leanback TV Başl.| |
|   +-----------------------+                      +--------------------+ |
+-------------------------------------------------------------------------+
```

---

## 📥 Hazır APK İndirme

Projenin derlenmiş en güncel `.apk` dosyalarına **[GitHub Releases](https://github.com/powerlinegoyome-wq/skypeck-android/releases)** sekmesinden ulaşabilirsiniz:

* 📺 **TV İçin**: `skypeck_tv.apk` (Xiaomi Mi TV Stick)
* 📱 **Telefon İçin**: `skypeck_controller.apk` (Redmi 13C)

---

## 🚀 Hızlı Kurulum ve Başlatma (ADB ile)

### 1. Xiaomi Mi TV Stick'e Yükleme
```bash
# TV'ye bağlanın
adb connect <TV_IP_ADRESI>:5555

# APK'yı kurun
adb install -r skypeck_tv.apk
```

### 2. Telefona Yükleme
```bash
adb install -r skypeck_controller.apk
```

### 3. Oyuna Başlama
1. TV'de **SkyPeck TV** uygulamasını açın.
2. Telefonda **SkyPeck Kumanda** uygulamasını açıp telefonu TV'nin önüne dik koyun (1.5 - 2 metre).
3. İki cihaz aynı Wi-Fi'da birbirini **otomatik bulur**. Kollarınızı açıp uçmaya başlayın!
