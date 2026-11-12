## 1.0.0（2026-11-11）

- 首个版本：`pickFiles`（多选文件）、`pickDirectory`（选文件夹 + 递归扫描）、`exportToCache`（content:// → 本地缓存路径）、`clearCache`
- 基于 Android SAF，无需存储权限
- 目录遍历使用 DocumentsContract，兼容 Android 5.0+
