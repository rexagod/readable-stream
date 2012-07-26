module.exports = Readable;

var Stream = require('stream');
var util = require('util');

util.inherits(Readable, Stream);

function Readable(stream) {
  if (stream) this.wrap(stream);
  Stream.apply(this);
}

// override this method.
Readable.prototype.read = function(n) {
  return null;
};

Readable.prototype.pipe = function(dest, opt) {
  if (!(opt && opt.end === false || dest === process.stdout ||
        dest === process.stderr)) {
    this.on('end', dest.end.bind(dest));
  }

  flow.call(this);

  function flow() {
    var chunk;
    while (chunk = this.read()) {
      var written = dest.write(chunk);
      if (!written) {
        dest.once('drain', flow.bind(this));
        return;
      }
    }
    this.once('readable', flow);
  }
};

// wrap a 'data'/pause()/resume() style stream
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  this._buffer = [];
  this._bufferLength = 0;
  var paused = false;
  var ended = false;

  stream.on('end', function() {
    ended = true;
    if (this._bufferLength === 0) {
      this.emit('end');
    }
  }.bind(this));

  stream.on('data', function(chunk) {
    this._buffer.push(chunk);
    this._bufferLength += chunk.length;
    this.emit('readable');
    // if not consumed, then pause the stream.
    if (this._bufferLength > 0 && !paused) {
      paused = true;
      stream.pause();
    }
  }.bind(this));

  // consume some bytes.  if not all is consumed, then
  // pause the underlying stream.
  this.read = function(n) {
    var ret;

    if (this._bufferLength === 0) {
      ret = null;
    } else if (!n || n >= this._bufferLength) {
      // read it all
      ret = Buffer.concat(this._buffer);
      this._bufferLength = 0;
    } else {
      // read just some of it.
      if (n < this._buffer[0].length) {
        // just take a part of the first buffer.
        var buf = this._buffer[0];
        ret = buf.slice(0, n);
        this._buffer[0] = buf.slice(n);
      } else if (n === this._buffer[0].length) {
        // first buffer is a perfect match
        ret = this._buffer.shift();
      } else {
        // complex case.
        ret = new Buffer(n);
        var c = 0;
        for (var i = 0; i < this._buffer.length && c < n; i++) {
          var buf = this._buffer[i];
          var cpy = Math.min(n - c, buf.length);
          buf.copy(ret, c, 0, cpy);
          if (cpy < buf.length) {
            this._buffer[i] = buf.slice(cpy);
            this._buffer = this._buffer.slice(i);
          }
          n -= cpy;
        }
      }
      this._bufferLength -= n;
    }

    if (this._bufferLength === 0) {
      if (paused) {
        stream.resume();
        paused = false;
      }
      if (ended) {
        process.nextTick(this.emit.bind(this, 'end'));
      }
    }
    return ret;
  };
};
