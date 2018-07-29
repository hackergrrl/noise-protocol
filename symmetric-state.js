var sodium = require('sodium-native')
var assert = require('nanoassert')
var cipherState = require('./cipher-state')
var hash = require('./hash')

var STATELEN = hash.HASHLEN + hash.HASHLEN + cipherState.STATELEN
var HASHLEN = hash.HASHLEN

module.exports = {
  STATELEN,
  initializeSymmetric,
  mixKey,
  mixHash,
  mixKeyAndHash,
  getHandshakeHash,
  encryptAndHash,
  decryptAndHash,
  split
}

var CHAINING_KEY_BEGIN = 0
var CHAINING_KEY_END = hash.HASHLEN
var HASH_BEGIN = CHAINING_KEY_END
var HASH_END = HASH_BEGIN + hash.HASHLEN
var CIPHER_BEGIN = HASH_END
var CIPHER_END = CIPHER_BEGIN + cipherState.STATELEN

function initializeSymmetric (state, protocolName) {
  assert(state.byteLength === STATELEN)
  assert(protocolName.byteLength != null)

  sodium.sodium_memzero(state)
  if (protocolName.byteLength <= HASHLEN) state.set(protocolName, HASH_BEGIN)
  else hash.hash(state.subarray(HASH_BEGIN, HASH_END), protocolName)

  state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END).set(state.subarray(HASH_BEGIN, HASH_END))

  cipherState.initializeKey(state.subarray(CIPHER_BEGIN, CIPHER_END), null)
}

var TempKey = sodium.sodium_malloc(HASHLEN)
function mixKey (state, inputKeyMaterial) {
  assert(state.byteLength === STATELEN)
  assert(inputKeyMaterial.byteLength != null)

  hash.HKDF(
    state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END),
    TempKey,
    null,
    state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END),
    inputKeyMaterial
  )

  // HASHLEN is always 64 here, so we truncate to 32 bytes per the spec
  cipherState.initializeKey(TempKey.subarray(0, 32))
  sodium.sodium_memzero(TempKey)
}

function mixHash (state, data) {
  assert(state.byteLength === STATELEN)

  var h = state.subarray(HASH_BEGIN, HASH_END)

  hash.hash(h, [h, data])
}

var TempHash = sodium.sodium_malloc(HASHLEN)
function mixKeyAndHash (state, inputKeyMaterial) {
  assert(state.byteLength === STATELEN)
  assert(inputKeyMaterial.byteLength != null)

  hash.HKDF(
    state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END),
    TempHash,
    TempKey,
    state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END),
    inputKeyMaterial
  )

  mixHash(state, TempHash)
  sodium.sodium_memzero(TempHash)

  // HASHLEN is always 64 here, so we truncate to 32 bytes per the spec
  cipherState.initializeKey(TempKey.subarray(0, 32))
  sodium.sodium_memzero(TempKey)
}

function getHandshakeHash (state, out) {
  assert(state.byteLength === STATELEN)
  assert(out.byteLength === HASHLEN)

  out.set(state.subarray(HASH_BEGIN, HASH_END))
}

// ciphertext is the output here
function encryptAndHash (state, ciphertext, plaintext) {
  assert(state.byteLength === STATELEN)
  assert(ciphertext.byteLength != null)
  assert(plaintext.byteLength != null)

  var cstate = state.subarray(CIPHER_BEGIN, CIPHER_END)
  var h = state.subarray(HASH_BEGIN, HASH_END)

  cipherState.encryptWithAd(cstate, ciphertext, h, plaintext)
  encryptAndHash.bytes = cipherState.encryptWithAd.bytes
  mixHash(state, ciphertext)
}
encryptAndHash.bytes = 0

// plaintext is the output here
function decryptAndHash (state, plaintext, ciphertext) {
  assert(state.byteLength === STATELEN)
  assert(plaintext.byteLength != null)
  assert(ciphertext.byteLength != null)

  var cstate = state.subarray(CIPHER_BEGIN, CIPHER_END)
  var h = state.subarray(HASH_BEGIN, HASH_END)

  cipherState.decryptWithAd(cstate, plaintext, h, ciphertext)
  decryptAndHash.bytes = cipherState.decryptWithAd.bytes
  mixHash(state, ciphertext)
}
decryptAndHash.bytes = 0

var TempKey1 = sodium.sodium_malloc(HASHLEN)
var TempKey2 = sodium.sodium_malloc(HASHLEN)
var zerolen = Buffer.alloc(0)
function split (state, cipherstate1, cipherstate2) {
  assert(state.byteLength === STATELEN)
  assert(cipherstate1.byteLength === cipherState.STATELEN)
  assert(cipherstate2.byteLength === cipherState.STATELEN)

  hash.HKDF(
    TempKey1,
    TempKey2,
    null,
    state.subarray(CHAINING_KEY_BEGIN, CHAINING_KEY_END),
    zerolen
  )

  // HASHLEN is always 64 here, so we truncate to 32 bytes per the spec
  cipherstate1.initializeKey(TempKey1.subarray(0, 32))
  cipherstate2.initializeKey(TempKey2.subarray(0, 32))
  sodium.sodium_memzero(TempKey1)
  sodium.sodium_memzero(TempKey2)
}
