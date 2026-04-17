#!/usr/bin/env bash

openclaw_swift_env_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

openclaw_extract_swiftlang_tag() {
  local input="$1"
  printf '%s\n' "$input" | sed -n 's#.*\(swiftlang-[^ )]*\).*#\1#p' | head -n 1
}

openclaw_find_macos_sdk() {
  local developer_dir="$1"
  local candidate=""

  for candidate in \
    "$developer_dir/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk" \
    "$developer_dir/SDKs/MacOSX.sdk"
  do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  candidate="$(
    find "$developer_dir" -maxdepth 5 -type d -name 'MacOSX*.sdk' 2>/dev/null \
      | sort -Vr \
      | head -n 1
  )"
  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

openclaw_find_sdk_swiftlang_tag() {
  local sdk_path="$1"
  local swiftinterface=""

  swiftinterface="$(
    find "$sdk_path/usr/lib/swift/Swift.swiftmodule" -maxdepth 1 -type f -name '*-apple-macos*.swiftinterface' 2>/dev/null \
      | sort \
      | head -n 1
  )"
  [[ -n "$swiftinterface" ]] || return 1

  sed -n 's#// swift-compiler-version: .*\(swiftlang-[^ )]*\).*#\1#p' "$swiftinterface" | head -n 1
}

openclaw_find_compatibility_lib() {
  local developer_dir="$1"
  find \
    "$developer_dir/usr/lib" \
    "$developer_dir/Toolchains" \
    -path '*/macosx/libswiftCompatibilitySpan.dylib' \
    -print -quit 2>/dev/null
}

openclaw_collect_developer_candidates() {
  local -a candidates=()

  if [[ -n "${OPENCLAW_DEVELOPER_DIR:-}" ]]; then
    candidates+=("${OPENCLAW_DEVELOPER_DIR}")
  fi
  if [[ -n "${DEVELOPER_DIR:-}" ]]; then
    candidates+=("${DEVELOPER_DIR}")
  fi

  while IFS= read -r dir; do
    [[ -n "$dir" ]] && candidates+=("$dir")
  done < <(find /Applications -maxdepth 2 -type d \( -name 'Xcode.app' -o -name 'Xcode*.app' \) -print 2>/dev/null | sort -Vr | sed 's#$#/Contents/Developer#')

  if xcode-select -p >/dev/null 2>&1; then
    candidates+=("$(xcode-select -p)")
  fi

  local -A seen=()
  local dir=""
  for dir in "${candidates[@]}"; do
    [[ -d "$dir" ]] || continue
    if [[ -n "${seen[$dir]+x}" ]]; then
      continue
    fi
    seen["$dir"]=1
    printf '%s\n' "$dir"
  done
}

openclaw_setup_swift_env() {
  local root_dir="$1"
  local state_dir="${OPENCLAW_SWIFT_STATE_DIR:-$root_dir/apps/macos/.swift-tooling}"
  local swift_home="${OPENCLAW_SWIFT_HOME:-$state_dir/home}"
  local xdg_cache_home="${XDG_CACHE_HOME:-$state_dir/xdg-cache}"
  local module_cache_path="${CLANG_MODULE_CACHE_PATH:-$state_dir/clang/ModuleCache}"
  local swiftpm_cache_path="${OPENCLAW_SWIFTPM_CACHE_PATH:-$swift_home/Library/Caches/org.swift.swiftpm}"
  local swiftpm_config_path="${OPENCLAW_SWIFTPM_CONFIG_PATH:-$swift_home/Library/org.swift.swiftpm}"

  mkdir -p \
    "$swift_home" \
    "$xdg_cache_home" \
    "$module_cache_path" \
    "$swiftpm_cache_path" \
    "$swiftpm_config_path/security"

  export OPENCLAW_SWIFT_STATE_DIR="$state_dir"
  export OPENCLAW_SWIFT_HOME="$swift_home"
  export OPENCLAW_SWIFT_XDG_CACHE_HOME="$xdg_cache_home"
  export OPENCLAW_SWIFT_MODULE_CACHE_PATH="$module_cache_path"
  export OPENCLAW_SWIFTPM_CACHE_PATH="$swiftpm_cache_path"
  export OPENCLAW_SWIFTPM_CONFIG_PATH="$swiftpm_config_path"

  local selected_dir=""
  local selected_sdk=""
  local selected_compiler_tag=""
  local selected_sdk_tag=""
  local fallback_dir=""
  local fallback_sdk=""
  local diagnostic_lines=()
  local developer_dir=""

  while IFS= read -r developer_dir; do
    [[ -n "$developer_dir" ]] || continue

    local sdk_path=""
    sdk_path="$(openclaw_find_macos_sdk "$developer_dir" || true)"
    if [[ -z "$sdk_path" ]]; then
      diagnostic_lines+=("$developer_dir | missing macOS SDK")
      continue
    fi

    local compiler_version=""
    compiler_version="$(
      HOME="$swift_home" \
      XDG_CACHE_HOME="$xdg_cache_home" \
      CLANG_MODULE_CACHE_PATH="$module_cache_path" \
      DEVELOPER_DIR="$developer_dir" \
      xcrun swiftc --version 2>/dev/null || true
    )"
    local compiler_tag=""
    compiler_tag="$(openclaw_extract_swiftlang_tag "$compiler_version")"
    local sdk_tag=""
    sdk_tag="$(openclaw_find_sdk_swiftlang_tag "$sdk_path" || true)"

    if [[ -z "$fallback_dir" && -n "$compiler_version" ]]; then
      fallback_dir="$developer_dir"
      fallback_sdk="$sdk_path"
    fi

    if [[ -n "$compiler_tag" && -n "$sdk_tag" && "$compiler_tag" == "$sdk_tag" ]]; then
      selected_dir="$developer_dir"
      selected_sdk="$sdk_path"
      selected_compiler_tag="$compiler_tag"
      selected_sdk_tag="$sdk_tag"
      break
    fi

    diagnostic_lines+=("$developer_dir | compiler=${compiler_tag:-unknown} | sdk=${sdk_tag:-unknown}")
  done < <(openclaw_collect_developer_candidates)

  if [[ -z "$selected_dir" ]]; then
    if [[ "${OPENCLAW_SWIFT_SKIP_TOOLCHAIN_CHECK:-0}" == "1" && -n "$fallback_dir" ]]; then
      selected_dir="$fallback_dir"
      selected_sdk="$fallback_sdk"
      selected_compiler_tag="unchecked"
      selected_sdk_tag="unchecked"
    else
      {
        printf 'ERROR: No compatible Apple Swift toolchain/SDK pair found for OpenClaw macOS builds.\n' >&2
        if [[ "${#diagnostic_lines[@]}" -gt 0 ]]; then
          printf 'Checked:\n' >&2
          printf '  %s\n' "${diagnostic_lines[@]}" >&2
        fi
        printf 'Fixes:\n' >&2
        printf '  1. Install a full Xcode that matches your Swift toolchain, then run:\n' >&2
        printf '     sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer\n' >&2
        printf '  2. Or reinstall Command Line Tools so swiftc and the macOS SDK come from the same release.\n' >&2
        printf '  3. If you need to force a known-good toolchain, set OPENCLAW_DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer.\n' >&2
        printf '  4. To bypass this guard temporarily, set OPENCLAW_SWIFT_SKIP_TOOLCHAIN_CHECK=1.\n' >&2
      }
      return 1
    fi
  fi

  export OPENCLAW_SWIFT_DEVELOPER_DIR="$selected_dir"
  export OPENCLAW_SWIFT_SDK_PATH="$selected_sdk"
  export OPENCLAW_SWIFT_COMPILER_TAG="$selected_compiler_tag"
  export OPENCLAW_SWIFT_SDK_TAG="$selected_sdk_tag"
  export OPENCLAW_SWIFT_COMPAT_LIB_PATH="${OPENCLAW_SWIFT_COMPAT_LIB_PATH:-$(openclaw_find_compatibility_lib "$selected_dir" || true)}"
}

openclaw_xcrun() {
  HOME="$OPENCLAW_SWIFT_HOME" \
  XDG_CACHE_HOME="$OPENCLAW_SWIFT_XDG_CACHE_HOME" \
  CLANG_MODULE_CACHE_PATH="$OPENCLAW_SWIFT_MODULE_CACHE_PATH" \
  SWIFTPM_MODULECACHE_OVERRIDE="$OPENCLAW_SWIFT_MODULE_CACHE_PATH" \
  DEVELOPER_DIR="$OPENCLAW_SWIFT_DEVELOPER_DIR" \
  SDKROOT="$OPENCLAW_SWIFT_SDK_PATH" \
  xcrun "$@"
}

openclaw_swift() {
  openclaw_xcrun swift "$@"
}

openclaw_swift_env_main() {
  set -euo pipefail

  local script_dir
  script_dir="$(openclaw_swift_env_script_dir)"
  local root_dir="${OPENCLAW_ROOT_DIR:-$(cd "$script_dir/.." && pwd)}"

  openclaw_setup_swift_env "$root_dir"
  exec env \
    HOME="$OPENCLAW_SWIFT_HOME" \
    XDG_CACHE_HOME="$OPENCLAW_SWIFT_XDG_CACHE_HOME" \
    CLANG_MODULE_CACHE_PATH="$OPENCLAW_SWIFT_MODULE_CACHE_PATH" \
    SWIFTPM_MODULECACHE_OVERRIDE="$OPENCLAW_SWIFT_MODULE_CACHE_PATH" \
    DEVELOPER_DIR="$OPENCLAW_SWIFT_DEVELOPER_DIR" \
    SDKROOT="$OPENCLAW_SWIFT_SDK_PATH" \
    xcrun swift "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  openclaw_swift_env_main "$@"
fi
