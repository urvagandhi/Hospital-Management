package com.hospital.management.worker

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

/**
 * Wraps an OkHttp [RequestBody] to emit byte-progress callbacks while writing.
 *
 * The wrapper is **stateless** by design — every retry MUST construct a fresh
 * instance (and a fresh [delegate]) so the byte counter starts at 0. Reusing
 * the same wrapper across an OkHttp/Retrofit retry would resume mid-stream
 * and the foreground notification's progress math would go backwards (or
 * negative). Build the wrapper fresh inside the per-attempt code path; do
 * not memoize it on the repository or worker.
 */
class ProgressRequestBody(
    private val delegate: RequestBody,
    private val onProgress: (uploadedBytes: Long, totalBytes: Long) -> Unit
) : RequestBody() {

    override fun contentType(): MediaType? = delegate.contentType()

    override fun contentLength(): Long = delegate.contentLength()

    override fun writeTo(sink: BufferedSink) {
        val total = contentLength()
        val countingSink = object : ForwardingSink(sink) {
            var bytesWritten = 0L
            override fun write(source: Buffer, byteCount: Long) {
                super.write(source, byteCount)
                bytesWritten += byteCount
                onProgress(bytesWritten, total)
            }
        }
        val bufferedCounting = countingSink.buffer()
        delegate.writeTo(bufferedCounting)
        bufferedCounting.flush()
    }
}
