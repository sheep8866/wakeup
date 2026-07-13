#!/usr/bin/env node

// ---------------------------------------------------------------------------
// Generates a Homebrew Formula for the `wakeup` CLI from release artifacts.
//
// Mirrors the gtv-desktop-remote render-homebrew-cask.mjs pattern: the CI
// workflow computes SHA256s for each prebuilt binary, then invokes this
// script with --version and one --sha256-<arch> per platform.
//
//   node scripts/render-homebrew-formula.mjs \
//     --version 0.2.0 \
//     --sha256-macos-arm64 abc123... \
//     --sha256-macos-x86_64 def456... \
//     --sha256-linux-x86_64 ghi789... \
//     --sha256-linux-arm64 jkl012... \
//     [--repository usrivastava92/wakeup]
// ---------------------------------------------------------------------------

const DEFAULT_REPOSITORY = "usrivastava92/wakeup";

// Ordered list of architectures the formula supports. Each key maps to a
// `--sha256-<key>` CLI argument. Only architectures with a provided SHA256
// appear in the rendered formula (if CI didn't build a platform, skip it).
const SUPPORTED_ARCHITECTURES = [
  { key: "macos-arm64",  asset: "wakeup-macos-arm64" },
  { key: "macos-x86_64", asset: "wakeup-macos-x86_64" },
  { key: "linux-x86_64", asset: "wakeup-linux-x86_64" },
  { key: "linux-arm64",  asset: "wakeup-linux-arm64" },
];

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);

    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    i++;
  }

  return args;
}

function requireArg(args, key) {
  if (!args[key]) throw new Error(`Missing required argument --${key}`);
  return args[key];
}

function releaseAssetUrl(repository, version, assetName) {
  const encoded = encodeURIComponent(assetName);
  return `https://github.com/${repository}/releases/download/v${version}/${encoded}`;
}

function renderFormula({ version, sha256s, repository }) {
  const macosArches = SUPPORTED_ARCHITECTURES.filter((a) => a.key.startsWith("macos-") && sha256s[a.key]);
  const linuxArches = SUPPORTED_ARCHITECTURES.filter((a) => a.key.startsWith("linux-") && sha256s[a.key]);

  const lines = [];

  lines.push("class Wakeup < Formula");
  lines.push(`  desc "A tiny, auditable caffeinate-compatible keep-awake CLI"`);
  lines.push(`  homepage "https://github.com/${repository}"`);
  lines.push(`  license "MIT"`);
  lines.push(`  version "${version}"`);
  lines.push("");

  // ── macOS ───────────────────────────────────────────────────────────────
  if (macosArches.length > 0) {
    lines.push("  on_macos do");
    for (const arch of macosArches) {
      const url = releaseAssetUrl(repository, version, arch.asset);
      const sha = sha256s[arch.key];
      lines.push(`    if Hardware::CPU.${arch.key === "macos-arm64" ? "arm" : "intel"}?`);
      lines.push(`      url "${url}"`);
      lines.push(`      sha256 "${sha}"`);
      lines.push("    end");
    }
    lines.push("  end");
    lines.push("");
  }

  // ── Linux ───────────────────────────────────────────────────────────────
  if (linuxArches.length > 0) {
    lines.push("  on_linux do");
    for (const arch of linuxArches) {
      const url = releaseAssetUrl(repository, version, arch.asset);
      const sha = sha256s[arch.key];
      const cond = arch.key === "linux-arm64" ? "arm" : "intel";
      lines.push(`    if Hardware::CPU.${cond}?`);
      lines.push(`      url "${url}"`);
      lines.push(`      sha256 "${sha}"`);
      lines.push("    end");
    }
    lines.push("  end");
    lines.push("");
  }

  lines.push("  def install");
  lines.push('    bin.install Dir["wakeup-*"].first => "wakeup"');
  lines.push("  end");
  lines.push("");
  lines.push("  test do");
  lines.push(`    system "#{bin}/wakeup", "--version"`);
  lines.push("  end");
  lines.push("end");

  return lines.join("\n") + "\n";
}

try {
  const args = parseArgs(process.argv.slice(2));
  const version = requireArg(args, "version");
  const repository = args.repository || DEFAULT_REPOSITORY;

  const sha256s = {};
  for (const { key } of SUPPORTED_ARCHITECTURES) {
    if (args[`sha256-${key}`]) {
      sha256s[key] = args[`sha256-${key}`];
    }
  }

  if (Object.keys(sha256s).length === 0) {
    throw new Error("At least one --sha256-<arch> argument is required");
  }

  process.stdout.write(renderFormula({ version, sha256s, repository }));
} catch (error) {
  console.error(error.message);
  console.error(
    "Usage: node scripts/render-homebrew-formula.mjs --version <v> " +
      SUPPORTED_ARCHITECTURES.map((a) => `--sha256-${a.key} <hash>`).join(" ") +
      " [--repository owner/repo]"
  );
  process.exit(1);
}
