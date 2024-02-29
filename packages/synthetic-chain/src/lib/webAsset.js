const dbg = label => x => {
  label;
  // console.log(label, x);
  return x;
};

/**
 *
 * @param {string} root
 * @param {{ fetch: typeof fetch }} io
 *
 * @typedef {ReturnType<typeof makeWebRd>} TextRd
 */
export const makeWebRd = (root, { fetch }) => {
  /** @param {string} there */
  const make = there => {
    const join = (...segments) => {
      dbg('web.join')({ there, segments });
      let out = there;
      for (const segment of segments) {
        out = `${new URL(segment, out)}`;
      }
      return out;
    };
    const self = {
      toString: () => there,
      /** @param {string[]} segments */
      join: (...segments) => make(join(...segments)),
      readText: async () => {
        console.log('WebRd fetch:', there);
        const res = await fetch(there);
        if (!res.ok) {
          throw Error(`${res.statusText} @ ${there}`);
        }
        return res.text();
      },
    };
    return self;
  };
  return make(root);
};

/**
 * Reify file read access as an object.
 *
 * @param {string} root
 * @param {object} io
 * @param {Pick<typeof import('fs/promises'), 'stat' | 'readFile'>} io.fsp
 * @param {Pick<typeof import('path'), 'join'>} io.path
 *
 * @typedef {ReturnType<typeof makeFileRd>} FileRd
 */
export const makeFileRd = (root, { fsp, path }) => {
  /** @param {string} there */
  const make = there => {
    const self = {
      toString: () => there,
      /** @param {string[]} segments */
      join: (...segments) => make(path.join(there, ...segments)),
      stat: () => fsp.stat(there),
      readText: () => fsp.readFile(there, 'utf8'),
    };
    return self;
  };
  return make(root);
};

/**
 * Reify file read/write access as an object.
 *
 * @param {string} root
 * @param {object} io
 * @param {Pick<typeof import('fs/promises'),
 *         'stat' | 'readFile' | 'writeFile' | 'unlink' | 'mkdir' | 'rmdir'
 *        >} io.fsp
 * @param {Pick<typeof import('path'), 'join'>} io.path
 *
 * @typedef {ReturnType<typeof makeFileRW>} FileRW
 */
export const makeFileRW = (root, { fsp, path }) => {
  /** @param {string} there */
  const make = there => {
    const ro = makeFileRd(there, { fsp, path });
    const self = {
      toString: () => there,
      readOnly: () => ro,
      /** @param {string[]} segments */
      join: (...segments) =>
        make(dbg('FileRW join')(path.join(there, ...segments))),
      writeText: text => fsp.writeFile(there, text, 'utf8'),
      unlink: () => fsp.unlink(there),
      mkdir: () => fsp.mkdir(there, { recursive: true }),
      rmdir: () => fsp.rmdir(there),
    };
    return self;
  };
  return make(root);
};

/**
 * @param {TextRd} src
 * @param {FileRW} dest
 *
 * @typedef {ReturnType<typeof makeWebCache>} WebCache
 */
export const makeWebCache = (src, dest) => {
  /** @type {Map<string, Promise<FileRd>>} */
  const saved = new Map();

  /** @param {string} segment */
  const getFileP = segment => {
    const target = src.join(segment);
    const addr = `${target}`;
    const cached = saved.get(addr);
    if (cached) return cached;

    const f = dest.join(segment);
    /** @type {Promise<FileRd>} */
    const p = new Promise((resolve, reject) =>
      target
        .readText()
        .then(txt =>
          dest
            .mkdir()
            .then(() => f.writeText(txt).then(_ => resolve(f.readOnly()))),
        )
        .catch(reject),
    );
    saved.set(addr, p);
    return p;
  };

  const remove = async () => {
    await Promise.all([...saved.values()].map(p => p.then(f => f.unlink())));
    await dest.rmdir();
  };

  const self = {
    toString: () => `${src} -> ${dest}`,
    /** @param {string} segment */
    getText: async segment => {
      const fr = await getFileP(segment);
      return fr.readText();
    },
    /** @param {string} segment */
    storedPath: segment => getFileP(segment).then(f => f.toString()),
    /** @param {string} segment */
    size: async segment => {
      const fr = await getFileP(segment);
      const info = await fr.stat();
      return info.size;
    },
    remove,
  };
  return self;
};
