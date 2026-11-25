/**
 * Shared JSDoc type definitions for the browser client.
 * This module intentionally has no runtime exports.
 * @module types
 */

/**
 * @typedef {Object} BleSession
 * @property {boolean} isNative
 * @property {any} [bleClient]
 * @property {any} [webDevice]
 * @property {any} [webService]
 * @property {string} bleDeviceId
 * @property {string} deviceId
 * @property {boolean} isConnected
 * @property {string} name
 */

/**
 * @typedef {Object} DownloadTask
 * @property {[number, number, number]} priority
 * @property {string} audioUrl
 * @property {string} sequenceIdentifier
 */

/**
 * @typedef {Object} PlaybackTrack
 * @property {[number, number, number]} priority
 * @property {string} blobUrl
 * @property {string} sequenceIdentifier
 */

/**
 * @typedef {Object} ServerEvent
 * @property {string} type
 * @property {number} [scene_index]
 * @property {number} [audio_index]
 * @property {string} [audio_url]
 * @property {boolean} [done]
 * @property {string} [message]
 * @property {string} [bookId]
 * @property {string} [title]
 */

/**
 * @typedef {Object} BleStatusMessage
 * @property {string} [type]
 * @property {string} [status]
 * @property {string} [state]
 * @property {string} [message]
 * @property {string} [detail]
 * @property {string} [stage]
 * @property {number} [httpStatus]
 * @property {string} [bookId]
 * @property {string} [title]
 * @property {string} [requestId]
 */

export {};
