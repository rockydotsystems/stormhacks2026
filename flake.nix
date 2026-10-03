{
  description = "StormHacks 2026 application and development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      environments = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          nodejs = pkgs.nodejs_24;
          pnpm = import ./nix/pnpm.nix { inherit pkgs nodejs; };
          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions [
              ./src
              ./public
              ./tests
              ./package.json
              ./pnpm-lock.yaml
              ./pnpm-workspace.yaml
              ./next.config.ts
              ./tsconfig.json
              ./postcss.config.mjs
              ./eslint.config.mjs
              ./vitest.config.ts
              ./.prettierignore
            ];
          };
          package = import ./nix/package.nix {
            inherit
              pkgs
              nodejs
              pnpm
              src
              ;
          };
          task = name: command: {
            type = "app";
            meta.description = "Run ${command} from the source checkout";
            program = nixpkgs.lib.getExe (
              pkgs.writeShellApplication {
                name = "stormhacks-${name}";
                runtimeInputs = [
                  nodejs
                  pnpm
                  pkgs.docker-client
                  pkgs.nixfmt
                ];
                text = ''
                  if [[ ! -f package.json || ! -f flake.nix || ! -d src/features ]]; then
                    echo "Run this command from the StormHacks repository root." >&2
                    exit 1
                  fi
                  exec ${command} "$@"
                '';
              }
            );
          };
          commands = {
            install = "pnpm install --frozen-lockfile";
            dev = "pnpm dev";
            build = "pnpm build";
            test = "pnpm test";
            lint = "pnpm lint";
            typecheck = "pnpm typecheck";
            fmt = "pnpm format";
            fmt-check = "pnpm format:check";
            check = "pnpm check";
            db-up = "pnpm db:up";
            db-down = "pnpm db:down";
            db-generate = "pnpm db:generate";
            db-migrate = "pnpm db:migrate";
            db-studio = "pnpm db:studio";
          };
        in
        {
          inherit
            pkgs
            nodejs
            pnpm
            package
            ;
          apps = builtins.mapAttrs task commands;
          shell = pkgs.mkShell {
            packages = [
              nodejs
              pnpm
              pkgs.jujutsu
              pkgs.direnv
              pkgs.nix-direnv
              pkgs.nixfmt
              pkgs.docker-client
              pkgs.postgresql_18
            ];
            NEXT_TELEMETRY_DISABLED = "1";
          };
        }
      );
    in
    {
      devShells = forAllSystems (system: {
        default = environments.${system}.shell;
      });
      packages = forAllSystems (system: {
        default = environments.${system}.package;
      });
      apps = forAllSystems (
        system:
        environments.${system}.apps
        // {
          default = {
            type = "app";
            meta.description = "Run the packaged StormHacks production server";
            program = nixpkgs.lib.getExe environments.${system}.package;
          };
        }
      );
      checks = forAllSystems (
        system:
        let
          env = environments.${system};
        in
        {
          application = env.package;
          source = env.package.overrideAttrs {
            name = "stormhacks-source-checks";
            buildPhase = ''
              pnpm lint
              pnpm typecheck
              pnpm test
              pnpm format:check
            '';
            installPhase = "touch $out";
          };
          nix-format =
            env.pkgs.runCommand "stormhacks-nix-format" { nativeBuildInputs = [ env.pkgs.nixfmt ]; }
              ''
                nixfmt --check ${./flake.nix} ${./nix/pnpm.nix} ${./nix/package.nix}
                touch $out
              '';
        }
      );
      formatter = forAllSystems (system: environments.${system}.pkgs.nixfmt);
    };
}
