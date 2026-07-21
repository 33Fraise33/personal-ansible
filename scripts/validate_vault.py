#!/usr/bin/env python3
"""Validate every Ansible Vault payload without templating variable values."""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

from ansible.parsing.dataloader import DataLoader
from ansible.parsing.vault import VaultLib, VaultSecret, is_encrypted


VAULT_HEADER = b"$ANSIBLE_VAULT;"
YAML_SUFFIXES = {".yaml", ".yml"}
EXCLUDED_PARTS = {".ansible", ".git", ".venv"}


def encrypted_payloads(value: object):
    """Yield ciphertext from parsed Vault-tagged scalars without rendering Jinja."""
    ciphertext = getattr(value, "_ciphertext", None)
    if ciphertext is not None and is_encrypted(ciphertext):
        yield ciphertext
        return

    if isinstance(value, Mapping):
        for key, item in value.items():
            yield from encrypted_payloads(key)
            yield from encrypted_payloads(item)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for item in value:
            yield from encrypted_payloads(item)


def candidate_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or EXCLUDED_PARTS.intersection(path.parts):
            continue

        contents = path.read_bytes()
        if contents.lstrip().startswith(VAULT_HEADER) or (
            path.suffix.lower() in YAML_SUFFIXES and VAULT_HEADER in contents
        ):
            yield path, contents


def validate_file(path: Path, contents: bytes, vault: VaultLib) -> int:
    expected = contents.count(VAULT_HEADER)
    if contents.lstrip().startswith(VAULT_HEADER):
        vault.decrypt(contents.strip())
        return 1

    parsed = DataLoader().load_from_file(str(path))
    payloads = list(encrypted_payloads(parsed))
    if len(payloads) != expected:
        raise ValueError(
            f"found {expected} Vault header(s), but parsed {len(payloads)} encrypted value(s)"
        )

    for payload in payloads:
        vault.decrypt(payload)
    return len(payloads)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--password-file",
        type=Path,
        default=os.environ.get("ANSIBLE_VAULT_PASSWORD_FILE"),
    )
    args = parser.parse_args()

    if args.password_file is None:
        parser.error("--password-file or ANSIBLE_VAULT_PASSWORD_FILE is required")

    password = args.password_file.read_bytes().rstrip(b"\r\n")
    if not password:
        parser.error("the Vault password file is empty")

    vault = VaultLib([("default", VaultSecret(password))])
    files = list(candidate_files(args.root.resolve()))
    if not files:
        print("No Ansible Vault payloads found.", file=sys.stderr)
        return 1

    decrypted = 0
    failures = 0
    for path, contents in files:
        try:
            decrypted += validate_file(path, contents, vault)
        except Exception as error:  # Ansible exposes several version-specific Vault errors.
            failures += 1
            print(f"{path.relative_to(args.root.resolve())}: {error}", file=sys.stderr)

    if failures:
        return 1

    print(f"Validated {decrypted} Vault value(s) in {len(files)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
