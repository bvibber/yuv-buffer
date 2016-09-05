/*
Copyright (c) 2014-2016 Brion Vibber <brion@pobox.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
MPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
ONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * Represents a (width,height) dimensional pair.
 * @typedef {Object} YUVSize
 * @property {number} width - horizontal units
 * @property {number} height - vertical units
 */

/**
 * Represents a rectangular area.
 * @typedef {Object} YUVRect
 * @property {number} left - x coordinate of left side
 * @property {number} top - y coordinate of top
 * @property {number} width - width in units
 * @property {number} height - height in units
 */

/**
 * Represents the chroma subsampling pixel format.
 * Use one of the YUVBuffer.CHROMA_* constants.
 * @typedef {Object} YUVChroma
 * @property {number} hdec - number of times to halve horizontal resolution on chroma planes
 * @property {number} vdec - number of times to halve vertical resolution on chroma planes
 */

/**
 * Represents metadata about a YUV frame format.
 * @typedef {Object} YUVFormat
 * @property {YUVSize} frame - size of the encoded frame
 * @property {YUVRect} crop - area within the frame to be displayed
 * @property {YUVSize} display - display size of the crop area
 * @property {YUVChroma} chroma - subsampling layout for chroma
 */

/**
 * Represents underlying image data for a single luma or chroma plane.
 * Cannot be interpreted without the format data from a frame buffer.
 * @typedef {Object} YUVPlane
 * @property {Uint8Array} bytes - typed array containing image data bytes
 * @property {number} stride - byte distance between rows in data
 */

/**
 * Represents a YUV image frame buffer, with enough format information
 * to interpret the data usefully. Buffer objects use generic objects
 * under the hood and can be transferred between worker threads using
 * the structured clone algorithm.
 *
 * @typedef {Object} YUVFrame
 * @property {YUVFormat} format
 * @property {YUVPlane} y
 * @property {YUVPlane} u
 * @property {YUVPlane} v
 */

/**
 * Holder namespace for utility functions and constants related to
 * YUV frame and plane buffers.
 *
 * @namespace
 */
var YUVBuffer = {
  /**
   * Allocate a new YUVPlane object of the given size.
   * @param {number} stride - byte distance between rows
   * @param {number} rows - number of rows to allocate
   * @returns {YUVPlane} - freshly allocated planar buffer
   */
  allocPlane: function(stride, rows) {
    return {
      bytes: new Uint8Array(stride * rows),
      stride: stride
    }
  },

  /**
   * Pick a suitable stride for a custom-allocated thingy
   * @param {number} width - width in bytes
   * @returns {number} - new width in bytes at least as large
   */
  suitableStride: function(width) {
    var alignment = 4,
      remainder = width % alignment;
    if (remainder == 0) {
      return width;
    } else {
      return width + (alignment - remainder);
    }
  },

  /**
   * Allocate a new YUVPlane object big enough for a luma plane in the given format
   * @param {YUVFormat} format - target frame format
   * @returns {YUVPlane} - freshly allocated planar buffer
   */
  allocLumaPlane: function(format) {
    return this.allocPlane(this.suitableStride(format.frame.width), format.frame.height);
  },

  /**
   * Allocate a new YUVPlane object big enough for a chroma plane in the given format
   * @param {YUVFormat} format - target frame format
   * @returns {YUVPlane} - freshly allocated planar buffer
   */
  allocChromaPlane: function(format) {
    return this.allocPlane(this.suitableStride(this.chromaWidth(format)), this.chromaHeight(format));
  },

  /**
   * Allocate a new YUVFrame object big enough for the given format
   * @param {YUVFormat} format - target frame format
   * @returns {YUVFrame} - freshly allocated frame buffer
   */
  allocFrame: function(format) {
    return {
      format: this.copyFormat(format),
      y: this.allocLumaPlane(format),
      u: this.allocChromaPlane(format),
      v: this.allocChromaPlane(format)
    }
  },

  /**
   * Duplicate a plane using new buffer memory.
   * @param {YUVPlane} plane - input plane to copy
   * @returns {YUVPlane} - freshly allocated and filled planar buffer
   */
  copyPlane: function(plane) {
    return {
      bytes: plane.bytes.slice(),
      stride: plane.stride
    };
  },

  /**
   * Duplicate a frame using new buffer memory.
   * @param {YUVFrame} frame - input frame to copyFrame
   * @returns {YUVFrame} - freshly allocated and filled frame buffer
   */
  copyFrame: function(frame) {
    return {
      format: JSON.parse(JSON.stringify(frame.format)),
      y: this.copyPlane(frame.y),
      u: this.copyPlane(frame.u),
      v: this.copyPlane(frame.v)
    }
  },

  /**
   * Convert X coordinate from luma to chroma resolution
   * @param {YUVFormat} format - the target format
   * @param {number} x - the X coordinate in luma resolution
   * @returns {number} - the X coordinate in chroma resolution
   */
  xToChroma: function(format, x) {
    return x >> format.chroma.hdec;
  },

  /**
   * Convert Y coordinate from luma to chroma resolution
   * @param {YUVFormat} format - the target format
   * @param {number} y - the Y coordinate in luma resolution
   * @returns {number} - the Y coordinate in chroma resolution
   */
  yToChroma: function(format, y) {
    return y >> format.chroma.vdec;
  }

  /**
   * Convert X coordinate from chroma to luma resolution
   * @param {YUVFormat} format - the target format
   * @param {number} x - the X coordinate in chroma resolution
   * @returns {number} - the X coordinate in luma resolution
   */
  xToLuma: function(format, x) {
    return x << format.chroma.hdec;
  },

  /**
   * Convert Y coordinate from chroma to luma resolution
   * @param {YUVFormat} format - the target format
   * @param {number} y - the Y coordinate in chroma resolution
   * @returns {number} - the Y coordinate in luma resolution
   */
  yToLuma: function(format, y) {
    return y << format.chroma.vdec;
  },

  /**
   * Return the chroma-resolution width of the frame format
   * @param {YUVFormat} format - the target format
   * @returns {number} - the width in chroma resolution
   */
  chromaWidth: function(format) {
    return this.xToChroma(format, format.frame.width);
  },

  /**
   * Return the chroma-resolution height of the frame format
   * @param {YUVFormat} format - the target format
   * @returns {number} - the height in chroma resolution
   */
  chromaHeight: function(format) {
    return this.yToChroma(format, format.frame.height);
  },

  /**
   * Chroma subsampling constant for 4:4:4.
   * @constant {YUVChroma}
   */
  CHROMA_444: {hdec: 0, vdec: 0},

  /**
   * Chroma subsampling constant for 4:2:2.
   * @constant {YUVChroma}
   */
  CHROMA_422: {hdec: 1, vdec: 0},

  /**
   * Chroma subsampling constant for 4:1:1.
   * @constant {YUVChroma}
   */
  CHROMA_411: {hdec: 2, vdec: 0},

  /**
   * Chroma subsampling constant for 4:2:0.
   * @constant {YUVChroma}
   */
  CHROMA_420: {hdec: 1, vdec: 1}
};

module.exports = YUVBuffer;
