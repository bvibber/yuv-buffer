#yuv-buffer

Utility package for manipulating video image frames in planar YUV encoding (also known as YCbCr).

Folded out from [ogv.js](https://github.com/brion/ogv.js) in-browser implementation of HTML5 media stack.

#Data format

Planar YUV image frames represent a color image 

Actual frames are stored in plain JS objects to facilitate transfer between worker threads via structured clone; behavior is provided through static methods on the `YUVBuffer` utility namespace.

A suitably-formatted frame buffer object looks like this:

```
{
  format: {
    width,
    height,
    chromaWidth,
    chromaHeight,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    displayWidth,
    displayHeight
  },
  y: { bytes, stride },
  u: { bytes, stride },
  v: { bytes, stride }
}
```

The `format` object provides information necessary for interpreting or displaying frame data, and can be shared between many frame buffers:

* `width` and `height` list the full encoded dimensions of the luma plane, in luma pixels.
* `chromaWidth` and `chromaHeight` list the full encoded dimensions of the chroma planes, in chroma pixels. These must be in a clean integer ratio to the `width` and `height` dimensions.
* `cropLeft`, `cropTop`, `cropWidth`, and `cropHeight` specify a rectangle within the encoded frame containing data meant for display, in luma pixel units. Pixels outside this area are still encoded in the raw data, but are meant to be cropped out when displaying.
* `displayWidth` and `displayHeight` list final display dimensions, which may have a different aspect ratio than the crop rectangle (anamorphic / non-square pixels).

The `y`, `u`, and `v` properties contain the pixel data for luma (Y) and chroma (U and V) components of the image:
* `bytes` holds a `UInt8Array` with raw pixel data. Beware that using a view into a larger array buffer (such as an emscripten-compiled C module's heap) is valid but may lead to inefficient data transfers between worker threads. Currently only 8-bit depth is supported.
* `stride` specifies the number of bytes between the start of each row in the `bytes` array; this may be larger than the number of pixels in a row, and should usually be a multiple of 4 for alignment purposes.

# Creating a frame buffer

First, you'll need a `YUVFormat` object describing the memory layout of the pixel data:

```
// HDTV 1080p:
var format = {
  // Many video formats require an 8- or 16-pixel block size.
  width: 1920,
  height: 1088,

  // Using common 4:2:0 layout, chroma planes are halved in each dimension.
  chromaWidth: 1920 / 2,
  chromaHeight: 1088 / 2,

  // Crop out a 1920x1080 visible region:
  cropLeft: 0,
  cropTop: 4,
  cropWidth: 1920,
  cropHeight: 1080,

  // Square pixels, so same as the crop size.
  displayWidth: 1920,
  displayHeight: 1080
};
```

```
// 480p anamorphic DVD:
var format = {
  // Encoded size is 720x480, for classic NTSC standard def video
  width: 720,
  height: 480

  // DVD is also 4:2:0, so halve the chroma dimensions.
  chromaWidth: 720 / 2,
  chromaHeight: 480 / 2,

  // Full frame is visible.
  cropLeft: 0,
  cropTop: 0,
  cropWidth: 720,
  cropHeight: 480

  // Final display size stretches back out to 16:9 widescreen:
  displayWidth: 853,
  displayHeight: 480
};
```

All fields are required. A common format object can be passed in to multiple frames, so be sure not to change them unexpectedly!


You can allocate a blank frame with enough memory to work with using the `YUVBuffer.allocFrame` helper function:

```
var frame = YUVBuffer.allocFrame(format);
console.log(frame.y.bytes.length); // bunch o' bytes
```

Or, you can create one yourself, such as when extracting from a different data structure. For instance when extracting data from a C library translated with emscripten, you might do something like this:

```
function extractFromHeap(yptr, ystride, uptr, ustride, vptr, vstride) {
  var frame = {
    format: this.format,
    y: {
      bytes: Module.HEAPU8.slice(yptr, yptr + ystride * this.format.height),
      stride: ystride
    },
    u: {
      bytes: Module.HEAPU8.slice(uptr, uptr + ustride * this.format.chromaHeight),
      stride: ustride
    },
    v: {
      bytes: Module.HEAPU8.slice(vptr, vptr + vstride * this.format.chromaHeight),
      stride: vstride
    }
  }
  // And pass back to caller
  this.onFrameCallback(frame);
}
```

# Performance concerns

*Threading*

Since video processing is CPU-intensive, it is expected that frame data may need to be shuffled between multiple Web Worker threads -- for instance a video decoder in a background thread sending frames to be displayed back to the main thread. Frame buffer objects are plain JS objects to facilitate being sent via [`postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)'s "structured clone" algorithm. To transfer the raw pixel data buffers instead of copying them in this case, list an array containing the `bytes` subproperties as transferables:

```
// video-worker.js
while (true) {
  buffer = processNextFrame();
  postMessage({nextFrame: buffer}, [buffer.y.bytes, buffer.u.bytes, buffer.v.bytes]);
}
```

*Heap extraction*

Producers can avoid a data copy by using `Uint8Array` byte arrays that are views of a larger buffer, such as an emscripten-compiled C library's heap array. However this introduces several potential sources of bugs:

* If the consumer keeps data around asynchronously before use, the underlying data representation might be changed under it.
* If the consumer tries to modify the data (including transferring it between threads), the producer might be very surprised.
* If the consumer tries to copy the data between threads or to storage, a large backing ArrayBuffer might be inefficiently copied/stored instead of just the frame data.

You can use the `YUVBuffer.copyFrame` static method to duplicate a frame object from an unknown source and "normalize" its heap representation to a fresh copy; or when creating one manually be sure to create a copy with `slice` instead of a view with `subarray`.

If deliberately using `subarray` views, be careful to avoid data corruption or bloated copies.

*Recycling*

Creating and deleting many frame buffer objects may cause some garbage collection churn or memory fragmentation; it may be advantageous to recycle spare buffers in a producer-consumer loop.

It can be difficult to avoid GC churn when sending data between threads as objects will be created and destroyed on each end, but the pixel buffers can be transferred back and forth without deallocation.

#Now what?

So you have a YUV image frame buffer format. What do you do with it?

* Draw it in a browser with [yuv-canvas](https://github.com/brion/yuv-canvas)
* Decode it from a video with [ogv.js](https://github.com/brion/ogv.js)
