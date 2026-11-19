# Self-hosted libraries

OnTrace loads **no third-party code**. The Solana libraries it needs are bundled into a single file, `solana.bundle.js`, and served from ontrace.space itself.

## Contents

| Package | Version |
|---|---|
| `@solana/web3.js` | 1.98.0 |
| `@solana/spl-token` | 0.4.9 |
| `@solana/spl-token-metadata` | 0.1.6 |
| `buffer` | 6.0.3 |

Bundled with `esbuild` 0.24.0 from `entry.js` (exports) and `buffer-shim.js` (provides `Buffer` to the libraries).

## Rebuild and verify

```bash
mkdir build && cd build
npm init -y
npm install @solana/web3.js@1.98.0 @solana/spl-token@0.4.9 @solana/spl-token-metadata@0.1.6 buffer@6.0.3 esbuild@0.24.0
cp ../vendor/entry.js ../vendor/buffer-shim.js .
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify \
  --define:global=globalThis --inject:./buffer-shim.js --legal-comments=eof --outfile=solana.bundle.js
sha256sum solana.bundle.js
```

SHA-256 of the published bundle:

```
693e83e65e257abc5ba58ad57f7c078c2b059dc64ba95afe792e36d389fc4dad  solana.bundle.js
```

Open-source licenses of the bundled packages are preserved at the end of the bundle file.
