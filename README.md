# Picture Book Reading Client

绘本智能伴读 Android / WebView 客户端。项目使用原生 ES Modules 分层，
`index.html` 只负责页面结构，交互、BLE、SSE、音频队列和状态管理分别位于独立模块中。

## 功能

- 扫描 PicBook BLE 开发板并读取 Device ID
- 保持并复用 BLE GATT 会话
- 向开发板写入 Wi-Fi 配置
- 发送 `switch_book` 并监听 `book_switch_status`
- 常驻监听开发板 Status 和翻页失败原因
- 订阅服务端 SSE
- 严格按页次、场景和音频序号播放
- 翻页和换书时停止旧音频、取消下载并清空双队列
- 支持相对 `audio_url` 按 SSE base URL 解析

“无需开发板”的模拟心跳、手机拍照上传和测试入口已从正式客户端移除。

## 目录

```text
web/
  index.html                 页面结构
  css/app.css                全局样式
  js/
    app.js                   应用入口与 DOM 事件绑定
    config.js                常量配置
    state.js                 集中运行时状态
    ui.js                    DOM 更新和日志
    audio-cache.js           播放停止、Blob 与队列生命周期
    audio-queue.js           音频优先级与队列插入
    audio-url.js             相对音频 URL 解析
    audio-workers.js         顺序下载与播放
    ble-connection.js        BLE 会话、写入和通知订阅
    ble-session-factory.js   BLE 设备发现与会话恢复
    ble-status.js            BLE Status 路由和翻页诊断
    ble-commands.js          Wi-Fi 配置与换书命令
    device-controller.js     设备身份与 SSE 绑定
    server-settings.js       服务端地址持久化
    sse-client.js            SSE 接收和事件分发
    types.js                 JSDoc 类型定义
tests/                      浏览器自动化测试
docs/                       架构说明和界面截图
```

## 代码规范

- 业务模块均低于 300 行，硬上限 500 行
- 使用可读的完整变量名和函数名
- 导出函数带 JSDoc 参数、返回值与用途说明
- 导入集中在文件顶部
- 业务文件使用原生 ES Module，不写自执行函数
- 页面不包含内联 JavaScript

## 运行前端

ES Modules 需要 HTTP 服务，不能直接双击 `index.html` 使用 `file://`。

```powershell
cd web
python -m http.server 8080
```

打开 `http://127.0.0.1:8080/`。

## 测试

```powershell
npm install
npm test
npm run test:switch
```

## 构建 APK

构建脚本复用已验证的 Capacitor 原生壳，仅替换 `web` 资源：

```powershell
.\build_apk.ps1 `
  -OriginalApk "C:\path\to\base.apk" `
  -OutputApk ".\picture-book-reading-client.apk"
```

需要 Android SDK Build-Tools 35.0.0 和 Android debug keystore。

## 当前客户端版本

`2.0.0-20261125`
