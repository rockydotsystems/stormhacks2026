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
    hash = "sha256-9rFDHW03FmUvgvpwj6mvAcYlkHA5hHyQVSe8EcfTxtk=";
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
    pkgs.makeWrapper
  ];
  NEXT_TELEMETRY_DISABLED = "1";
  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/lib/stormhacks2026" "$out/bin"
    cp -r .next/standalone/. "$out/lib/stormhacks2026/"
    cp -r public "$out/lib/stormhacks2026/"
    cp -r .next/static "$out/lib/stormhacks2026/.next/"
    makeWrapper ${nodejs}/bin/node "$out/bin/stormhacks2026" \
      --add-flags "$out/lib/stormhacks2026/server.js" \
      --set-default HOSTNAME 127.0.0.1 \
      --set-default NEXT_TELEMETRY_DISABLED 1
    runHook postInstall
  '';
  passthru = { inherit pnpmDeps; };
  meta = {
    description = "StormHacks 2026 Next.js application";
    mainProgram = "stormhacks2026";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
