{
  description = "Pins for toybox";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  inputs.unstable.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs, unstable }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      each = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system} unstable.legacyPackages.${system});
    in {
      devShells = each (pkgs: next: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bashInteractive git jq shellcheck gnutar ffmpeg
            python3 ruff basedpyright
            next.blender
          ];
          shellHook = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
            export LD_LIBRARY_PATH=${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.zlib}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
          '';
        };
      });
    };
}
