# 群晖助手（uni-app X 版）

自研群晖 DSM 手机客户端，基于 **uni-app X（蒸汽模式，Vue 3 + TS）**，适配 **DSM 7.x（含 7.4）**。
一套代码编译到：Android / iOS / Web(H5) / 微信小程序 / 鸿蒙。

> 本项目曾以 Flutter 实现首版并完成实机联调，2026-11 起迁移到 uni-app X，Flutter 版代码已清理。

## 功能

| 模块 | API 族 | 说明 |
|---|---|---|
| 📁 文件管理 | `SYNO.FileStation.*` | 共享目录浏览、新建文件夹、删除、共享链接、**下载到本机**（后台队列 / 进度 / 取消 / 断点记录） |
| 🖼 照片相册 | `SYNO.Foto.*` / `SYNO.FotoTeam.*` | 个人 / 共享空间时间线网格、缩略图、**原图下载到本机** |
| 📥 下载管理页 | 本地下载队列（`utils/download_manager.uts`） | **设置 → 下载管理**独立页面：任务列表、实时进度条、取消/重试/打开/删除、清空已结束；任意 tab 底部有进行中浮条，点击直达 |
| 🔄 备份与恢复 | `SYNO.FileStation.Upload` / `Download` / `Foto.*` | **手机 → NAS**：相册多选、**整个手机文件夹（含子目录，保留目录结构）**、**任意文件（PDF/Word/压缩包）** 上传，批量入队、串行上传、单个/全部取消、重试；**NAS → 手机**：整个文件夹递归备份、相册全量备份（单次上限 10 万，实际按队列逐个处理）；文件页长按文件夹可一键备份 |
| ⬇️ Download Station | `SYNO.DownloadStation.*` | NAS 端任务列表与进度、新建任务（http/ftp/magnet）、暂停/恢复/删除，30s 轮询 |
| 🔐 登录 | `SYNO.API.Auth` v6+ | 账号密码、两步验证（OTP）、设备令牌免 OTP、账号本地记忆 |
| 🌐 QuickConnect | QuickConnect 云服务（CN: `global.quickconnect.cn` / Intl: `cnc.synology.com`） | QuickConnect ID 登录，自动切换 直连(LAN/WAN) → 中继；记住上次可用通道优先重试；运行中断网自动换通道（App 原生端），Web 端由 dev_proxy 自动轮换候选 |
| ⬆️ 应用更新 | GitHub Releases API（`releases/latest`） | **设置 → 检查更新**：取 `tag_name` 与本地 `versionName` 比较；Android 端下载 asset 中的 `.apk` 后调起系统安装，Web 端或无 apk 时复制下载链接 |

## 目录结构

```
uniappx/                     # uni-app X 工程（HBuilderX 打开此目录）
├── manifest.json            # uni-app-x 标记 + app-android.distribute 打包配置（packagename/图标/minSdk/targetSdk/abi/权限）
├── pages.json
├── App.uvue / main.uts / index.html
├── pages/
│   ├── login/login.uvue     # 登录（Web 端自动预填代理地址 + Logo）
│   ├── home/home.uvue       # 自定义底部导航（v-show 保留各 tab 状态）
│   ├── downloads/downloads.uvue  # 下载管理页（任务列表 / 进度 / 取消重试）
│   └── backup/backup.uvue   # 备份与恢复（手机→NAS 上传 / NAS→手机 批量下载）
├── components/              # easycom 组件
│   ├── files-view/
│   ├── photos-view/
│   ├── downloads-view/      # NAS Download Station 任务
│   ├── dl-banner/           # 全局下载进度浮条（点击进下载页）
│   └── settings-view/       # 账号卡 + 分组入口（下载管理 / 备份与恢复）
├── static/                  # 应用图标：logo.png(1024 主图)/logo_72~192(各密度)/favicon.png(64)
├── nativeResources/android/res/   # Android 原生资源（仅云打包生效）
│   ├── drawable/icon_background.xml        # 自适应图标背景层（蓝青渐变 vector）
│   ├── drawable/icon_foreground.png        # 自适应图标前景层（432px，主体在 72/108 安全区）
│   └── mipmap-anydpi-v26/icon.xml          # 自适应图标声明（Android 8+ 生效）
├── uni_modules/
│   └── qh-file-picker/      # 自研 UTS 插件：Android 选择文件 / 整个文件夹（SAF）
└── utils/
    ├── syno.uts             # DSM API 客户端（发现/登录/调用/错误映射/上传）
    ├── download_manager.uts # 本机下载队列（串行执行/进度/取消/重试）
    ├── upload_manager.uts   # 上传队列（支持本地路径或 content:// 按需导出）
    ├── device_picker.uts    # 原生插件封装（Promise 化 + 平台降级）
    └── backup_helper.uts    # 批量备份：整文件夹递归 / 相册全量
tools/
└── dev_proxy.js             # 本地开发代理（CORS + 静态托管 + NAS 转发 + QuickConnect）
docs/
└── API-REFERENCE.md         # DSM Web API 对接手册
```

## 快速开始

### 前置：原生插件需要自定义基座

工程内含自研 UTS 原生插件 `uni_modules/qh-file-picker`（Android 选任意文件 / 选整个文件夹）。**标准基座不含原生代码**，调试该功能必须：

1. 运行 → 运行到手机或模拟器 → **制作自定义调试基座**（或 CLI：`cli.exe pack --project <uniappx路径> --platform android --android.androidpacktype 3 --iscustom true --ignoreWarnings true`）
2. 运行 → 运行到手机或模拟器 → **运行基座选择 → 自定义调试基座**

其余功能（文件/照片/下载/备份的相册部分）在标准基座与 Web 端均可用。

### 前置：应用图标（含 Android 8+ 自适应图标）

桌面图标由两层配置组成，**都必须云端打包后才生效**：

| 层 | 位置 | 作用 |
|---|---|---|
| 普通图标（回退用） | `manifest.json` → `app-android.distribute.icons` 四档 PNG（72/96/144/192，取自 `static/`） | Android 7 及以下、以及未命中自适应图标时使用 |
| 自适应图标（Android 8+） | `nativeResources/android/res/mipmap-anydpi-v26/icon.xml` | 系统按启动器形状（圆形 / 圆角方形）自动裁切，避免图标被塞进白底板、显得偏小 |
| ├ 背景层 | `nativeResources/android/res/drawable/icon_background.xml` | 蓝青渐变 vector，铺满 108dp 画布 |
| └ 前景层 | `nativeResources/android/res/drawable/icon_foreground.png` | 432px，logo 主体位于中心 72/108 安全区内，四角圆角+透明 |

设计要点：前景层只放主体、内容控制在安全区（72/108），四周留透明，由背景层补色——这样无论启动器裁成圆形还是圆角方形都不会切到主体。

> ⚠️ 注意：`nativeResources` 里的资源会与云打包基础工程合并。**不要在 `mipmap-<密度>/` 下放与基础工程同名的 `icon.png`**（如 `mipmap-xxhdpi/icon.png`），那会触发 `Duplicate resources` 打包失败；`mipmap-anydpi-v26/icon.xml` 是不同限定符，属合法叠加。若某版本打包仍报 icon 资源重复，删除 `nativeResources` 目录即可回退到普通图标（不影响其他功能）。

### 方式一：HBuilderX（推荐）

1. 用 HBuilderX 5.25+ 打开 `uniappx/` 目录；
2. 运行到浏览器 / 微信开发者工具 / 手机基座；
3. 发行 Web：菜单【发行 → 网站】或 CLI：
   ```powershell
   <HBuilderX安装目录>/cli.exe publish web --project uniappx
   # 产物：uniappx/unpackage/dist/build/web/
   ```

### 方式二：命令行构建 + 本地代理联调

浏览器无法直连 NAS（CORS 限制），需要本地代理：

```powershell
# 构建（需 HBuilderX 已启动并登录 DCloud 账号）
<HBuilderX安装目录>/cli.exe publish web --project uniappx

# 启动代理：静态托管 H5 产物 + 转发 /webapi 到 NAS + 注入 CORS 头
dart run tools/dev_proxy.dart <NAS_IP> <NAS端口> 8091 uniappx/unpackage/dist/build/web

# 浏览器打开 http://localhost:8091 ，登录页主机/端口已自动预填
```

### NAS 侧准备

1. 控制面板开放 DSM 的 HTTP 5000 / HTTPS 5001 访问；
2. 照片功能：安装 **Synology Photos**；下载功能：安装 **Download Station**；
3. 外网访问：DDNS / 端口映射（暂不支持 QuickConnect 中继）。

### 联调脚本的环境变量

`tools/` 下的脚本不含硬编码地址，可按需用环境变量覆盖：

| 变量 | 用途 | 默认值 |
|---|---|---|
| `NAS_HOST` | NAS 地址（含协议） | `http://192.168.1.100:5000` |
| `NAS_SSH_HOST` | SSH 主机 | `192.168.1.100` |
| `NAS_USER` / `NAS_SSH_USER` | NAS 账号 | `tester` |
| `H5_BASE` | 本地代理地址 | `http://localhost:8091` |
| `PLAYWRIGHT_PATH` | 指定 playwright 包路径（默认自动查找） | 自动 |

密码不落仓库：写到项目根目录 `_pw.tmp` / `_nas_pass.tmp`（已在 `.gitignore` 中忽略）。

## 联调沉淀的关键经验（真机验证于 DSM 7.4）

- **FileStation 系 API 是 `requestFormat: "JSON"`**：GET 调用会返回 Synology HTML 错误页（11939 字节），必须 **POST + JSON body**。客户端已实现 GET→POST-JSON→POST-form 三级回退；
- **`list_share` 方法位置变化**：DSM 7.4 在 `SYNO.FileStation.List` 下（旧版在 `SYNO.FileStation.Info`），`list_root` 已移除；
- Foto 系 API（SYNO.Foto.*）GET 仍可用，但 `additional` 必须传 JSON 数组字符串 `'["thumbnail"]'`，且**不能传 sort_by=taken_time**（报 120 参数条件无效）；
- Foto item 时间字段是 `time`（Unix 秒），缩略图在 `additional.thumbnail.cache_key`；缩略图：`Thumbnail get mode=download&id=<unit_id>&type=unit&size=xl&cache_key=...`；
- **错误码：103=方法不存在、120=参数条件无效（`error.errors` 附 `{name, reason}`）、119/105=sid 失效；HTML 错误页无法给出错误码，需靠响应嗅探降级重试；**
- **`SYNO.FileStation.Upload` 三个硬性约束（2026-11 NAS 侧逐项实测）**：
  1. **会话只认 `Cookie: id=<sid>`** —— `_sid` 放 URL query 会返回 401，放 multipart 字段会返回 119；
  2. **multipart 里必须带普通字段**（api/version/method/path/create_parents/overwrite），若只有 `file` 一个字段，服务端会挂住不响应（HTTP 无返回）；
  3. **保存名取 multipart 的 filename**，`formData.filename` 不生效 → 上传前必须把本地文件按目标文件名准备好；
- **Upload 的 `path` 必须是已存在的共享文件夹**（如 `/home`、`/photo`）：不存在的共享返回 **408**，`create_parents` 只能创建共享内的子目录，不能创建共享本身。注意 `/home` 是"我的 home"别名，`/home/xxx` 会多一层目录，正确写法是 `/home`（本目录）或 `/homes/<用户>/...`；
- **`uni.uploadFile` 的 filePath 需要 uni 沙盒内路径或 `file://` 形式**：裸的 `/data/data/...` 会抛 `java.io.FileNotFoundException`，客户端已统一先复制到 `USER_DATA_PATH/qh_upload/<目标文件名>` 再上传；
- HBuilderX 启动会调用 `wmic.exe`，若被安全软件/沙箱拦截会导致启动即崩；
- **正式包必须自带 `AndroidManifest.xml` 才能用 HTTP**：Android 9+（targetSdk≥28）默认禁止明文 HTTP，**自定义调试基座由 HBuilderX 自动注入 `usesCleartextTraffic=true`，而云打包的正式包不会** —— 表现为 `request system error`（日志里 `NetworkSecurityConfig: No Network Security Config specified`），所有接口全挂。解决：在**项目根目录**（`uniappx/AndroidManifest.xml`，不是 nativeResources 下）放清单文件并在 `<application>` 上声明 `android:usesCleartextTraffic="true"`；
- 本地安全审批：包含明文密码的命令可能被拦截，密码建议用环境变量分段传入。

## API 细节

详见 [docs/API-REFERENCE.md](docs/API-REFERENCE.md)。

## 发布新版本（应用内检查更新的数据源）

App 的「检查更新」读取本仓库的 **GitHub Releases**，链路为：
`releases/latest` → `tag_name` 归一化成版本号 → 与本地 `versionName` 比较 → 取 `assets` 里第一个 `*.apk`。

发版步骤：

1. 改 `uniappx/manifest.json`：`versionName`（如 `1.0.2`）+ `versionCode`（递增，如 `102`）
2. 云打包出 apk
3. 建 release 并上传 apk（tag 建议与 versionName 一致，带不带 `v` 都能识别）：

```bash
gh release create v1.0.2 qunhui-1.0.2.apk \
  --title "v1.0.2" \
  --notes "本次更新内容……"
```

> 未认证访问 GitHub API 限流 60 次/小时，足够日常检查；release 未附带 apk 时，App 会复制发布页链接而不是下载。

## 路线图

- [ ] 上传文件（uni.chooseImage / uni.uploadFile）
- [ ] 照片原图预览手势缩放
- [ ] 文件搜索 UI
- [ ] QuickConnect 中继支持
- [ ] 视频播放串流
- [ ] 微信小程序端适配验证
