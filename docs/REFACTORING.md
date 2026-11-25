# Refactoring Notes

## Motivation

The previous `index.html` contained markup, styling, BLE session management,
audio queues, SSE parsing, hardware commands, logging, and test helpers in one
1,400-line file.

The refactored client separates:

- markup and styling;
- centralized runtime state;
- BLE discovery and persistent sessions;
- BLE status routing;
- hardware commands;
- HTTP/SSE event handling;
- audio queue, cache, download, and playback;
- DOM side effects;
- application event binding.

## File limits

All application source files are below 300 lines. The largest production file
is `web/js/audio-workers.js`, which contains the two asynchronous workers and
their lifecycle handling.

## Behavior preserved

- iOS-style visual layout and Tailwind styling
- PicBook BLE name filter and all protocol UUIDs
- persistent BLE connection and Device ID memory
- Wi-Fi provisioning
- fixed book switch command with `requestId: "book-001"`
- Status notification routing
- SSE reconnect
- page and book audio cleanup
- relative audio URL resolution
- Android APK asset-loading compatibility

## Removed behavior

The standalone debugging panel was removed:

- mock device heartbeat
- synthetic device ID
- mobile photo upload through the debug panel
- `?diagnostics=1` test object
- presentation demo state

Automated tests now import production modules directly and serve the web
directory over a temporary local HTTP server.
