const path = require("path");
const puppeteer = require("puppeteer-core");
const { startStaticServer, stopStaticServer } = require("./static_server");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const webDirectory = path.resolve(__dirname, "..", "web");

/**
 * Captures the current client interface for documentation.
 * @returns {Promise<void>}
 */
async function main() {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("请传入截图输出路径");

  const { server, baseUrl } = await startStaticServer(webDirectory);
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 448,
      height: 1040,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle0" });
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await stopStaticServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
