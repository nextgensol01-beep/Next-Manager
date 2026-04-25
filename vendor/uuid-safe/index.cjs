const { randomBytes, randomUUID } = require("crypto");

const NIL = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

function validate(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function assertBufferTarget(buf, offset) {
  if (!buf || typeof buf.length !== "number") {
    throw new TypeError("buf must be an array-like object");
  }
  if (!Number.isInteger(offset) || offset < 0 || offset + 16 > buf.length) {
    throw new RangeError("UUID buffer range is out of bounds");
  }
}

function unsafeStringify(bytes, offset = 0) {
  const hex = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[offset + i].toString(16).padStart(2, "0"));
  }
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function stringify(bytes, offset = 0) {
  assertBufferTarget(bytes, offset);
  const id = unsafeStringify(bytes, offset);
  if (!validate(id)) {
    throw new TypeError("Stringified UUID is invalid");
  }
  return id;
}

function parse(id) {
  if (!validate(id)) {
    throw new TypeError("Invalid UUID");
  }
  return Uint8Array.from(id.replace(/-/g, "").match(/.{2}/g).map((byte) => parseInt(byte, 16)));
}

function version(id) {
  if (!validate(id)) {
    throw new TypeError("Invalid UUID");
  }
  return id === NIL ? 0 : parseInt(id[14], 16);
}

function v4(options, buf, offset = 0) {
  if (buf) {
    assertBufferTarget(buf, offset);
  }

  const random = options && options.random ? options.random : randomBytes(16);
  if (!random || random.length < 16) {
    throw new TypeError("options.random must contain at least 16 bytes");
  }

  random[6] = (random[6] & 0x0f) | 0x40;
  random[8] = (random[8] & 0x3f) | 0x80;

  if (buf) {
    for (let i = 0; i < 16; i += 1) {
      buf[offset + i] = random[i];
    }
    return buf;
  }

  return typeof randomUUID === "function" && !options ? randomUUID() : unsafeStringify(random);
}

function unsupported(name) {
  return function uuidUnsupported() {
    throw new Error(`uuid.${name} is not implemented by this local compatibility package`);
  };
}

module.exports = {
  NIL,
  parse,
  stringify,
  validate,
  version,
  v1: unsupported("v1"),
  v3: unsupported("v3"),
  v4,
  v5: unsupported("v5"),
};
