/**
 * Static configuration shared by the mobile client.
 * @module config
 */

export const APPLICATION_BUILD_ID = "2.0.0-20261125";
export const DEFAULT_SERVER_BASE_URL =
  "https://jerrywumodelscope-picture-book-reading-server.ms.show";

export const BLE_DEVICE_NAME_PREFIX = "PicBook";
export const BLE_SERVICE_UUID =
  "12345678-1234-5678-1234-56789abcdef0";
export const BLE_DEVICE_ID_CHARACTERISTIC_UUID =
  "12345678-1234-5678-1234-56789abcdef1";
export const BLE_WIFI_CONFIG_CHARACTERISTIC_UUID =
  "12345678-1234-5678-1234-56789abcdef2";
export const BLE_CONTROL_CHARACTERISTIC_UUID =
  "12345678-1234-5678-1234-56789abcdef3";
export const BLE_STATUS_CHARACTERISTIC_UUID =
  "12345678-1234-5678-1234-56789abcdef4";

export const SERVER_BASE_URL_STORAGE_KEY = "picbook_server_base_url";
export const BLE_DEVICE_ID_STORAGE_KEY = "picbook_ble_device_id";
export const APPLICATION_BUILD_STORAGE_KEY = "picbook_app_build";

export const AUDIO_CACHE_STORAGE_KEY = "picbook_cached_audio_flag";
export const SWITCH_BOOK_REQUEST_ID = "book-001";
export const SSE_RECONNECT_DELAY_MILLISECONDS = 3000;
