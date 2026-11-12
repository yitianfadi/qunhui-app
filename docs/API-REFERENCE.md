# DSM Web API 对接手册（适配 DSM 7.x / 7.4）

> 本项目自研 DSM 客户端所依赖的官方 Web API 汇总。所有 API 均通过 `http(s)://<host>:<port>/webapi/` 前缀访问，
> 建议运行时先用 `SYNO.API.Info` 动态发现每个 API 的 `path` 与 `maxVersion`，避免硬编码（本项目 `SynologyClient.discoverApis()` 已实现）。

## 0. 通用约定

- 入口脚本：`entry.cgi`（新）或各 API 自带 `path`（如 `auth.cgi`、`DownloadStation/task.cgi`）。
- 通用参数：`api=<API名>`、`version=<版本>`、`method=<方法>`、`_sid=<会话ID>`。
- 响应格式：`{"data": {...}, "success": true}` 或 `{"error": {"code": 400}, "success": false}`。
- 端口：HTTP `5000`，HTTPS `5001`（HTTPS 支持自签证书，客户端需允许跳过校验）。

## 1. API 发现

```
GET /webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth,SYNO.FileStation.List,...
```

返回每个 API 的 `path / minVersion / maxVersion`。DSM 7.0–7.4 各版本 maxVersion 可能不同，必须动态读取。

## 2. 鉴权 SYNO.API.Auth

| 项 | 值 |
|---|---|
| path | `auth.cgi` 或 `entry.cgi` |
| 建议版本 | `maxVersion`（≥6 支持 OTP 与 device_token） |

**登录** `method=login`：
```
account=<用户名>&passwd=<密码>&session=QunHuiApp&format=sid&enable_device_token=yes
&otp=<6位验证码，如启用两步验证>&device_id=<上次保存的设备令牌，可免OTP>
```
成功返回 `{ "data": { "sid": "...", "did": "..." } }`。

**登出** `method=logout&session=QunHuiApp&_sid=...`

**关键错误码**：

| code | 含义 | 客户端处理 |
|---|---|---|
| 400 | 账号或密码错误 | 提示重输 |
| 401 | 账号被禁用 | 提示 |
| 402 | 无登录权限（IP 被拒） | 提示 |
| 403 | 需要 OTP | 弹出 OTP 输入框重试 |
| 404 | OTP 错误 | 重新输入 |
| 409/410 | 设备令牌问题 | 清除本地 device_id，走完整登录 |
| 119 | sid 失效 | 自动重登 |

> 安全建议：OTP 用过一次后保存 `did`（设备令牌），之后登录不再需要 OTP。
> 密码、sid、did 必须用系统安全存储（本机用 `flutter_secure_storage`）。

## 3. 文件管理 SYNO.FileStation.*

| API | 常用方法 | 说明 |
|---|---|---|
| `SYNO.FileStation.Info` | `getinfo`、`list_share` | DSM 信息、共享根目录列表 |
| `SYNO.FileStation.List` (v2) | `list` | 列目录：`folder_path`、`sort_by`、`additional=["size","time"]` |
| `SYNO.FileStation.Thumb` (v2) | `get` | 缩略图：`path`、`size=small/medium/large`，返回图片二进制 |
| `SYNO.FileStation.Download` (v2) | `download` | 文件下载：`path`、`mode=open`，返回文件流 |
| `SYNO.FileStation.Upload` (v2) | `upload` | **POST multipart**：`path`、`overwrite`、file 字段 |
| `SYNO.FileStation.CreateFolder` | `create` | `folder_path` + `name` |
| `SYNO.FileStation.Rename` | `rename` | `path` + `name` |
| `SYNO.FileStation.Delete` | `start` | `path`（数组）+ `recursive`，异步后台任务 |
| `SYNO.FileStation.Search` | `start` / `list` / `stop` | 全局搜索，先 start 拿 taskid |
| `SYNO.FileStation.Share` | `create` | 生成共享链接，返回 `link` |

## 4. 照片 Synology Photos（SYNO.Foto.* / SYNO.FotoTeam.*）

> ⚠️ DSM 7.2 起 Photo Station（SYNO.PhotoStation.*）已废弃；DSM 7.4 只用 Synology Photos 的 Foto API。

- 个人空间：`SYNO.Foto.*`（home/Photos）；共享空间：`SYNO.FotoTeam.*`。
- path 均为 `entry.cgi`。

| API | 常用方法 | 说明 |
|---|---|---|
| `SYNO.Foto.Browse.Item` (v1) | `list` | 照片列表：`offset/limit/sort_by=taken_time/additional=["thumbnail"]`；`type=photo/video` |
| `SYNO.Foto.Browse.Folder` (v1) | `list` | 按文件夹浏览 |
| `SYNO.Foto.Browse.Album` (v1) | `list` / `get_items` | 相册列表与相册内容（仅个人空间） |
| `SYNO.Foto.Thumbnail` (v1) | `get` | 缩略图：`cache_key`（来自 item.thumbnail.cache_key）+ `size=sm/md/lg/xl` + `staff_id=1` |
| `SYNO.Foto.Download` (v1) | `download_photo` | 原图下载：`unit_id` |
| `SYNO.Foto.Search.Search` (v1) | `list` | 关键字搜索：`keyword` |

## 5. 下载管理 SYNO.DownloadStation.*

> 需要 NAS 安装 Download Station 套件，否则 SYNO.API.Info 查不到对应 API。

| API | 常用方法 | 说明 |
|---|---|---|
| `SYNO.DownloadStation.Info` | `getinfo` | 套件配置 |
| `SYNO.DownloadStation.Task` (≤v3) | `list` | 任务列表 + `additional=["detail","transfer"]`（含进度 `detail.progress`、速度 `transfer.speed_download`） |
| 同上 | `create` | 新建：`uri=[...]`（http/ftp/magnet/ed2k） |
| 同上 | `pause` / `resume` | `id=[...]` |
| 同上 | `delete` | `id=[...]` |
| `SYNO.DownloadStation.Schedule` | `setconfig` | 速度计划 |

## 6. 客户端健壮性要点（本项目已实现）

1. **动态版本**：所有调用取 `maxVersion`，DSM 升级（如 7.2→7.4）无需改代码。
2. **会话过期**：错误 119/105 时自动重登一次（需缓存密码）。
3. **OTP / 设备令牌**：登录用 Auth v6，保存 `did` 后免 OTP。
4. **自签证书**：可按账号开关 `badCertificateCallback`。
5. **套件缺失**：Download Station / Photos 未安装时友好降级提示，而不是崩溃。
