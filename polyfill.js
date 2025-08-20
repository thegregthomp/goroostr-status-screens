// Polyfill for URLSearchParams compatibility issues
if (typeof global !== 'undefined' && !global.URLSearchParams) {
  global.URLSearchParams = require('url').URLSearchParams;
}

// Fix for Remix web-fetch URLSearchParams issue
const originalURLSearchParams = global.URLSearchParams;
if (originalURLSearchParams) {
  global.URLSearchParams = class extends originalURLSearchParams {
    constructor(init) {
      super(init);
    }
  };
}