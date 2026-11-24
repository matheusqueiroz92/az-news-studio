const path = require('node:path');

// The target file often does not exist yet. The boundary check only needs the path.
module.exports = {
  interfaceVersion: 2,
  resolve(source, file) {
    if (!source.startsWith('.') || !file) {
      return { found: false };
    }
    return {
      found: true,
      path: path.resolve(path.dirname(file), source),
    };
  },
};
