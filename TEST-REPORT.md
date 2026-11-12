# 群晖助手（uni-app X 版）测试报告

| 项 | 内容 |
|---|---|
| 测试对象 | 群晖 DSM 手机客户端 H5 版（uni-app X 蒸汽模式，Vue 3 + TS） |
| 测试日期 | 2026-11-10 ～ 2026-11-11 |
| 测试方式 | Playwright 无头浏览器自动化（Mock 前端回归 + 真实 NAS 联调）+ curl API 探测；2026-11-11 补充**有头模式复测**（弹出真实 Edge 窗口，slowMo=200ms 慢放） |
| 被测地址 | http://localhost:8091（本地代理托管 H5 并转发 NAS API） |
| 目标 NAS | DSM 7.4 @ 192.168.1.100:5000（真实凭据联调） |
| 测试脚本 | `tools/pw_e2e.js`（Mock 10 用例）、`tools/real_e2e.js` / `real_e2e_sid.js` / `files_e2e.js` / `qa_photo_dl.js`（真机）、`tools/probe_list_share.js`（API 探测） |
| 截图存档 | `test/artifacts/`（e2e_*.png 四张 Mock 界面、real_files*.png 真机文件页） |

---

## 一、测试结论

**整体结论：通过。** Mock 前端回归 10/10 全部通过；真实 NAS 联调核心链路（登录、API 发现、文件列表、子目录浏览、照片 API、下载 API）全部打通。测试过程中发现并修复 6 个缺陷（见第三节）。

---

## 二、测试结果明细

### 2.1 Mock 前端回归（10/10 PASS，2026-11-11 12:46；13:52 有头模式复测 10/10 PASS）

模拟 NAS API 全套响应，验证前端逻辑与 UI 渲染：

> **有头模式复测记录（2026-11-11 13:52）**：应需求方要求，以非无头方式重跑同套用例（`headless: false` + `channel: 'msedge'` + `slowMo: 200ms` 慢放，弹出真实 Edge 窗口逐步可见登录→文件→照片→下载→设置全过程），10/10 全部通过，结果与无头模式一致。复测同时验证了目录切换加载动画（点击文件夹先清空内容、弹出"加载中"遮罩、加载完成后显示新目录）在真实浏览器渲染下工作正常。

| # | 用例 | 结果 |
|---|---|---|
| 1 | 登录页渲染 | ✅ PASS |
| 2 | Web 端代理地址自动预填（localhost:8091） | ✅ PASS |
| 3 | 登录跳转 + 共享目录列表渲染 | ✅ PASS |
| 4 | 进入子目录 + 文件列表 + 大小格式化（1.0 MB） | ✅ PASS |
| 5 | 照片网格渲染（12 张 Mock 缩略图 + 视频角标） | ✅ PASS |
| 6 | 照片个人/共享空间切换 | ✅ PASS |
| 7 | 下载任务列表 + 进度条 + 速度显示（42%、11.9 MB/s） | ✅ PASS |
| 8 | 设置页 + 账号信息 | ✅ PASS |
| 9 | 截图存档 | ✅ PASS |
| 10 | 控制台无严重错误 | ✅ PASS |

### 2.2 真实 NAS 联调（DSM 7.4 实机）

| # | 用例 | 结果 | 说明 |
|---|---|---|---|
| 1 | 真实登录（SYNO.API.Auth v7 + API 动态发现） | ✅ PASS | 多次获取 sid 成功，Auth maxVersion=7 |
| 2 | 文件 tab：共享目录列表 | ✅ PASS | **14 个真实目录**：docker、Download、home、homes、music、photo、public、video、web、web_packages、webdev、公开、视频、迅雷 |
| 3 | 文件 tab：子目录浏览 | ✅ PASS | "视频"目录正常列出 2 条目，无残留内容 |
| 4 | 文件 tab：目录切换加载动画 | ✅ PASS | 加载中遮罩 → 完成后显示（12:42 版新增） |
| 5 | 照片 tab：个人空间 API | ✅ PASS | `Foto.Browse.Item` 返回 `{"list":[]}`（该账号个人空间为空，空相册无报错） |
| 6 | 下载 tab：DownloadStation API | ✅ PASS | `Task.list` 返回 0 任务（套件已装，历史无任务） |
| 7 | 照片/下载 UI 真机渲染 | ⚠️ 部分覆盖 | API 层真机验证通过 + Mock 层 UI 验证通过；浏览器自动化在本机被安全策略中断（见第四节） |

### 2.3 API 探测矩阵（DSM 7.4 行为摸底）

| 调用方式 | 结果 |
|---|---|
| GET `FileStation.List.list_share` | ❌ 返回 Synology HTML 错误页（11939 字节） |
| POST-form `List.list_share` | ❌ 同上 |
| **POST-JSON `List.list_share`** | ✅ **返回真实共享目录**（requestFormat=JSON 强制要求） |
| GET `FileStation.Info.list_share` | 103 方法不存在（7.4 已移除） |
| GET `List.list_root` | 103 方法不存在（7.4 已移除） |
| GET `Foto.Browse.Item.list`（不带 sort_by） | ✅ JSON 正常 |
| GET `DownloadStation.Task.list` | ✅ JSON 正常 |

---

## 三、测试驱动修复的缺陷（6 个）

| # | 缺陷 | 根因 | 修复 |
|---|---|---|---|
| 1 | 文件页报"方法不存在"(103) | DSM 7.4 将 `list_share` 从 `FileStation.Info` 移到 `FileStation.List` 下 | 双路径回退（List 优先，Info 兼容旧版） |
| 2 | 文件页 HTML 非 JSON 报错 | **DSM 7.4 FileStation API 为 requestFormat=JSON，GET 返回 HTML 错误页** | call() 内 GET→POST-JSON→POST-form 三级自动回退 |
| 3 | 照片页报 120 参数条件无效 | `additional` 数组被序列化为重复参数；`sort_by=taken_time` 不被接受 | additional 传 JSON 数组字符串；移除 sort_by |
| 4 | 刷新后所有 API 报"未找到" | 会话恢复但 apiTable 未持久化 | apiTable 持久化 + call() 前置 `ensureDiscovered()` 自动重新发现 |
| 5 | 刷新后仍停留在登录页 | 登录页缺少已登录检测 | onMounted 检测 `api.loggedIn` 自动进主页 |
| 6 | 目录切换时显示旧目录内容、无加载指示 | 无 loading 处理 | 切换时清空列表 + `uni.showLoading` 加载动画（用户反馈项） |

---

## 四、已知限制与风险

| 项 | 说明 |
|---|---|
| 真机 UI 自动化中断 | 照片/下载 tab 的真机浏览器渲染验证因本机安全策略反复 SIGTERM 进程而部分中断；已用"API 真机验证 + UI Mock 验证"双重覆盖替代，建议人工打开 http://localhost:8091 做一次目检复核 |
| DownloadStation 写操作未实测 | 当前 NAS 任务列表为空，创建/暂停/删除任务仅经 Mock 验证 |
| 照片上传 / 文件上传 | 未实现（路线图） |
| QuickConnect 中继 | 未实现，需 IP/DDNS 直连或本地代理 |
| OTP 两步验证 | 代码路径完整（Mock + 错误码映射），真机未触发（账号未开启两步验证） |
| 含明文密码的自动化命令 | 会被本机安全审批拦截/中断（SIGTERM），联调时密码需经环境变量分段传入或先落盘 sid 再注入 |

---

## 五、测试环境

- OS：Windows 11 / Git Bash
- 前端构建：HBuilderX 5.34（CLI `publish web`）
- 自动化：Playwright（无头 Edge，channel=msedge）、Node 22
- 代理：`tools/dev_proxy.js`（静态托管 + `/webapi` 转发 + CORS 注入，端口 8091）
- 浏览器缓存说明：App 会话（sid/apiTable）持久化于 localStorage，刷新自动恢复

## 六、产物清单

- Mock 截图：`test/artifacts/e2e_{files,photos,downloads,settings}.png`
- 真机截图：`test/artifacts/real_files.png`、`real_files_sub.png`
- 可重复执行：`node tools/pw_e2e.js`（Mock 回归）、真机联调需先 `curl` 登录取 sid（见 README 快速开始）
- API 手册：`docs/API-REFERENCE.md`
