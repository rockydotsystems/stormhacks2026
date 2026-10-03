{ pkgs, nodejs }:
let
  targets = {
    x86_64-linux = {
      name = "linux-x64";
      hash = "sha512-6Rsl+zEWMOmus7v7/9J3OE8EMvHyNAfxYmDfmhQG4J0985OuT3G3Ho9NSGHjkBn4aU4bgklWifRhe1HX8dUSyw==";
    };
    aarch64-linux = {
      name = "linux-arm64";
      hash = "sha512-cXHHW8M4rAPsYNkKZO9WVcpLLK55i9EaIsZPfIqUuY2eopd5LqnFyBge54HCh1GC0yCX8ySn0hYIi+4OyAEoDg==";
    };
    x86_64-darwin = {
      name = "darwin-x64";
      hash = "sha512-Quc3J6c9cGTy+LDgz1cLVgCNOU9IERuyAlDoEj0DCilKqvo50Jx1GV8k74iwn4J9fFSKkm8JrwNvtTDj3uWnUA==";
    };
    aarch64-darwin = {
      name = "darwin-arm64";
      hash = "sha512-sqeoPfVMIfQhbwzDrKraXY2ynyuWClFqzvfImzAS/yczEru1m5SGvQ9kgFPDvQzJZ9AetedgJeDZC6qYvH8/tQ==";
    };
  };
  target = targets.${pkgs.stdenv.hostPlatform.system};
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "pnpm";
  version = "12.0.0";
  src = pkgs.fetchurl {
    url = "https://registry.npmjs.org/@pnpm/exe.${target.name}/-/exe.${target.name}-12.0.0.tgz";
    inherit (target) hash;
  };
  nativeBuildInputs = [
    pkgs.makeWrapper
  ]
  ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
  buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/libexec/pnpm" "$out/bin"
    cp -r . "$out/libexec/pnpm/"
    makeWrapper "$out/libexec/pnpm/pnpm" "$out/bin/pnpm" --prefix PATH : ${
      pkgs.lib.makeBinPath [ nodejs ]
    }
    runHook postInstall
  '';
  passthru.nodejs-slim = nodejs;
  meta = {
    description = "Pinned native pnpm package manager";
    license = pkgs.lib.licenses.mit;
    mainProgram = "pnpm";
    platforms = builtins.attrNames targets;
  };
}
