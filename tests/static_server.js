const fs = require("fs");
const http = require("http");
const path = require("path");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/**
 * Starts a local HTTP server needed because browser ES modules do not load
 * reliably from file:// URLs.
 * @param {string} rootDirectory
 * @returns {Promise<{server: import("http").Server, baseUrl: string}>}
 */
function startStaticServer(rootDirectory) {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const filePath = path.resolve(rootDirectory, relativePath);
    if (!filePath.startsWith(path.resolve(rootDirectory))) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(content);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

/**
 * @param {import("http").Server} server
 * @returns {Promise<void>}
 */
function stopStaticServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

module.exports = { startStaticServer, stopStaticServer };
