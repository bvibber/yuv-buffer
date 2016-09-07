#yuv-buffer

Utility package for manipulating video image frames in planar YUV encoding (also known as YCbCr).

Folded out from [ogv.js](https://github.com/brion/ogv.js) in-browser implementation of HTML5 media stack.

#Data format

Actual frames are stored in plain JS objects to facilitate transfer between worker threads via structured clone; behavior is provided through static methods on the `YUVBuffer` utility namespace.

A suitably-formatted frame buffer object looks like this:

```
{
  format: {
    frame: { width, height },
    crop: { left, top, width, height },
    display: { width, height },
    chroma: { hdec, vdec }
  },
  y: { bytes, stride },
  u: { bytes, stride },
  v: { bytes, stride }
}
```

The `format` object provides information necessary for interpreting or displaying frame data, and can be shared between many frame buffers:

* `frame` lists the dimensions of the full encoded frame in raw pixels.
* `crop` specifies a rectangle within the encoded frame containing data meant for display. Pixels outside this area are still encoded in the raw data, but are meant to be cropped out when displaying.
* `display` lists final display dimensions, which may have a different aspect ratio than the crop rectangle (anamorphic / non-square pixels).
* `chroma` lists the chroma subsampling ratios in horizontal and vertical dimensions. `hdec` and `vdec` are specified as a power of 2 (number of bits to shift), so for instance if `hdec` is 0 then the u and v planes have the same width as the y plane, whereas at 1 the u and v planes are half the width.

The `y`, `u`, and `v` properties contain the data for luma, chroma (blue), and chroma (red) components of the image:
* `bytes` holds a `UInt8Array` with raw pixel data. Beware that using a view into a larger array buffer (such as an emscripten-compiled C module's heap) is valid but may lead to inefficient data transfers between worker threads. Currently only 8-bit depth is supported.
* `stride` specifies the number of bytes between the start of each row in the `bytes` array; this may be larger than the number of pixels in a row, and should usually be a multiple of 4 for alignment purposes.

# Creating a frame buffer

First, you'll need a `YUVFormat` object describing the memory layout of the pixel data:

```
// 1080p for a format that requires 16-pixel blocks, showing crop region
var format = {
  frame: {
    width: 1920,
    height: 1088
  }
  crop: {
    left: 0,
    top: 4,
    width: 1920,
    height: 1080
  },
  display: {
    width: 1920,
    height: 1080
  },
  chroma: YUVBuffer.CHROMA_420
};
```

```
// 480p anamorphic DVD, showing non-default aspect ratio
var format = {
  frame: {
    width: 720,
    height: 480
  },
  crop: {
    left: 0,
    top: 0,
    width: 720,
    height: 480
  },
  display: {
    width: 854,
    height: 480
  },
  chroma: YUVBuffer.CHROMA_420
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
      bytes: Module.HEAPU8.slice(yptr, yptr + ystride * this.format.frame.height),
      stride: ystride
    },
    u: {
      bytes: Module.HEAPU8.slice(uptr, uptr + ustride * YUVBuffer.yToChroma(this.format, this.format.frame.height)),
      stride: ustride
    },
    v: {
      bytes: Module.HEAPU8.slice(vptr, vptr + vstride * YUVBuffer.yToChroma(this.format, this.format.frame.height)),
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
