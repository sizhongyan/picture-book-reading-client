const path = require("path");
const puppeteer = require("puppeteer-core");
const { startStaticServer, stopStaticServer } = require("./static_server");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const webDirectory = path.resolve(__dirname, "..", "web");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function installFakeBle(page) {
  return page.evaluate(() => {
    window.__bleCalls = {
      written: [],
      services: [],
      characteristics: [],
      requestDeviceCalls: 0,
      connectCalls: 0,
      notificationsStarted: false,
      notificationsStopped: false,
    };
    window.fetch = async () => ({ status: 404, ok: false });

    const encode = value => new TextEncoder().encode(value);
    const jsonView = value => {
      const bytes = encode(JSON.stringify(value));
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };
    const textView = value => {
      const bytes = encode(value);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };

    let statusCallback = null;
    const fakeClient = {
      initialize: async () => {},
      isEnabled: async () => true,
      getDevices: async () => [],
      requestDevice: async () => {
        window.__bleCalls.requestDeviceCalls += 1;
        return { deviceId: "ble-device-1", name: "PicBook-Test" };
      },
      connect: async () => {
        window.__bleCalls.connectCalls += 1;
      },
      read: async (deviceId, service, characteristic) => {
        window.__bleCalls.services.push(service);
        window.__bleCalls.characteristics.push(characteristic);
        return textView("esp32_book_001");
      },
      startNotifications: async (deviceId, service, characteristic, callback) => {
        window.__bleCalls.services.push(service);
        window.__bleCalls.characteristics.push(characteristic);
        window.__bleCalls.notificationsStarted = true;
        statusCallback = callback;
        window.__emitBleStatus = value => statusCallback(jsonView(value));
      },
      stopNotifications: async () => {
        window.__bleCalls.notificationsStopped = true;
      },
      write: async (deviceId, service, characteristic, value) => {
        window.__bleCalls.services.push(service);
        window.__bleCalls.characteristics.push(characteristic);
        window.__bleCalls.written.push(new TextDecoder().decode(value));
        setTimeout(() => {
          statusCallback(jsonView({
            type: "book_switch_status",
            requestId: "book-001",
            status: "success",
            bookId: "book_abc123",
            title: "测试绘本",
          }));
        }, 10);
      },
      disconnect: async () => {},
    };
    window.PicBookBle = { BleClient: fakeClient };
  });
}

async function loadModules(page) {
  return page.evaluate(async () => {
    window.__testModules = {
      deviceController: await import("/js/device-controller.js"),
      bleCommands: await import("/js/ble-commands.js"),
    };
  });
}

async function main() {
  const { server, baseUrl } = await startStaticServer(webDirectory);
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle0" });
    await loadModules(page);
    await installFakeBle(page);

    await page.evaluate(async () => {
      await window.__testModules.deviceController.connectBoardAndSubscribe();
      await window.__testModules.bleCommands.switchBoardBook();
    });

    const result = await page.evaluate(() => ({
      calls: window.__bleCalls,
      currentBookText:
        document.getElementById("currentBookIdDisplay").textContent,
    }));

    assert(result.calls.requestDeviceCalls === 1, "扫描次数异常");
    assert(result.calls.connectCalls === 1, "GATT 连接没有复用");
    assert(result.calls.notificationsStarted, "没有订阅 Status");
    assert(!result.calls.notificationsStopped, "Status 监听被错误停止");
    assert(
      result.calls.written[0] ===
        '{"type":"switch_book","requestId":"book-001"}',
      `换书命令错误：${result.calls.written[0]}`,
    );
    assert(
      result.currentBookText.includes("book_abc123"),
      `当前书本没有显示：${result.currentBookText}`,
    );

    await page.evaluate(() => {
      window.__emitBleStatus({
        type: "page_turning_status",
        status: "failed",
        message: "图像上传超时",
        httpStatus: 504,
      });
    });
    const pageStatusText = await page.evaluate(
      () => document.getElementById("bleCommandStatus").textContent,
    );
    assert(
      pageStatusText.includes("翻页状态：failed") &&
      pageStatusText.includes("图像上传超时"),
      `翻页失败详情未显示：${pageStatusText}`,
    );
    assert(pageErrors.length === 0, `页面异常：${pageErrors.join(" | ")}`);

    console.log(JSON.stringify({
      result: "PASS",
      serviceUuid: "12345678-1234-5678-1234-56789abcdef0",
      controlUuid: "12345678-1234-5678-1234-56789abcdef3",
      statusUuid: "12345678-1234-5678-1234-56789abcdef4",
      written: result.calls.written[0],
      requestDeviceCalls: result.calls.requestDeviceCalls,
      connectCalls: result.calls.connectCalls,
      currentBookText: result.currentBookText,
      pageStatusText,
      pageErrors,
    }, null, 2));
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
