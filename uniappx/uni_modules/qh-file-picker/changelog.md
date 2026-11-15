## 1.0.0（2026-11-11）

- 首个版本：`pickFiles`（多选文件）、`pickDirectory`（选文件夹 + 递归扫描）、`exportToCache`（content:// → 本地缓存路径）、`clearCache`
- 基于 Android SAF，无需存储权限
- 目录遍历使用 DocumentsContract，兼容 Android 5.0+

## 1.1.0（2026-11-15）

- 新增 `notifyUploadDone`：本地通知（备份完成提醒），通知权限未授予时静默跳过
- 新增 `biometricAuth` / `isBiometricAvailable`：系统生物识别验证框（androidx.biometric 1.1.0），回调经主线程派发，避免后台线程回调丢失
- 新增 `setTrustAllCerts`：信任自签 HTTPS 证书（仅影响本插件的 HttpURLConnection 上传通道）
- 插件自带 `utssdk/app-android/AndroidManifest.xml`，声明 POST_NOTIFICATIONS / USE_BIOMETRIC / USE_FINGERPRINT，打基座时 manifest merger 自动合并
- config.json 增加 androidx.biometric:biometric:1.1.0 依赖
