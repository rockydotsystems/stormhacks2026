{
  pkgs,
  nodejs,
  pnpm,
  src,
}:
let
  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = "stormhacks2026";
    inherit src pnpm;
    fetcherVersion = 4;
    hash = "sha256-AUm4UIcHPhLqnk9Srh8YUK1diS0Nf/juuI2vjMqHDjY=";
  };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "stormhacks2026";
  version = "0.1.0";
  inherit src pnpmDeps;
  nativeBuildInputs = [
    nodejs
    pnpm
    pkgs.pnpmConfigHook
  ];
  NEXT_TELEMETRY_DISABLED = "1";
  WRANGLER_SEND_METRICS = "false";
  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r dist/. "$out/"
    node --input-type=module - "$out/server/wrangler.json" <<'JS'
    import fs from "node:fs";
    const path = process.argv[2];
    const config = JSON.parse(fs.readFileSync(path, "utf8"));
    delete config.configPath;
    delete config.userConfigPath;
    fs.writeFileSync(path, JSON.stringify(config, null, 2));
    JS
    runHook postInstall
  '';
  passthru = { inherit pnpmDeps; };
  meta = {
    description = "StormHacks 2026 Cloudflare Worker and static assets";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
