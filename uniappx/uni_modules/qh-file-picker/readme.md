# qh-file-picker

Android 端「选择任意文件 / 选择整个文件夹」的 UTS 原生插件，基于系统 SAF（Storage Access Framework）实现，**不需要申请存储权限**。

> 为什么需要它：uni-app x 只提供 `uni.chooseImage`（相册媒体），没有 `uni.chooseFile`，也没有目录选择 API。浏览器/小程序端的同名能力在 App 上不可用。

## 平台支持

| 平台 | 支持 |
|---|---|
| Android App | ✅ |
| iOS App | ❌（未实现） |
| Web / 小程序 | ❌ |

## 使用前提

UTS 原生插件**必须使用自定义基座**调试（标准基座不含原生代码）：

1. HBuilderX → 发行 → 原生 App-云打包 → 勾选「制作自定义调试基座」
2. 运行 → 运行到手机或模拟器 → 选择「自定义调试基座」

## API

### pickFiles(options)

调起系统文件选择器，可多选、可按 MIME 过滤。

| 参数 | 类型 | 说明 |
|---|---|---|
| count | number | 最多可选数量，默认 20 |
| mimeType | string | 过滤类型，默认 `*/*`；如 `image/*`、`application/pdf` |
| success | (res) => void | `res.files: PickedFile[]` |
| fail | (res) => void | 用户取消时 errCode=9020002 |

### pickDirectory(options)

调起目录选择器，选中后**递归扫描**其中全部文件。

| 参数 | 类型 | 说明 |
|---|---|---|
| maxFiles | number | 最多扫描文件数，默认 2000，超出会置 `truncated` |
| success | (res) => void | `{ dirName, treeUri, files, totalSize, truncated }` |

### exportToCache(options)

把 `content://` 文件流式拷贝到应用缓存目录（`cache/qh_pick`），返回本地绝对路径，可直接喂给 `uni.uploadFile`。

| 参数 | 类型 | 说明 |
|---|---|---|
| uri | string | PickedFile.uri |
| name | string | 缓存文件名（会自动做非法字符转换） |

### clearCache(options)

清空 `cache/qh_pick` 目录，返回删除的文件个数。

## PickedFile

```ts
{
  name: string          // 文件名
  size: number          // 字节数，取不到时为 0
  uri: string           // content:// 地址
  relativePath: string  // 相对所选文件夹的路径，如 sub/a.jpg
  mimeType: string
}
```

## 调用示例

```ts
import { pickDirectory, exportToCache } from '@/uni_modules/qh-file-picker'

pickDirectory({
  maxFiles: 200,
  success: (res) => {
    console.log('文件夹', res.dirName, res.files.length, '个文件')
    const f = res.files[0]
    exportToCache({
      uri: f.uri,
      name: f.name,
      success: (r) => {
        // r.path 可直接上传
        uni.uploadFile({ url: '...', filePath: r.path, name: 'file' })
      }
    })
  },
  fail: (err) => console.log(err.errCode, err.errMsg)
})
```

## 实现要点

- 目录遍历用 `DocumentsContract.buildChildDocumentsUriUsingTree` + `ContentResolver.query`，不依赖 androidx.documentfile
- 用栈做广度遍历，避免深目录递归爆栈
- 选中文件夹时调用 `takePersistableUriPermission` 申请持久读权限
- 导出用 64KB 缓冲流式拷贝，大文件不会一次性读进内存

## 错误码

| errCode | 含义 |
|---|---|
| 9020001 | 当前平台不支持 |
| 9020002 | 用户取消 |
| 9020003 | 未获取到文件地址 |
| 9020004 | 读取文件失败 |
| 9020005 | 无法启动系统文件选择器 |
| 9020006 | 没有读取该文件的权限 |
