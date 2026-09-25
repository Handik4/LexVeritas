#!/usr/bin/env python3
"""Deploy contracts/lex_veritas.py to GenLayer Studio Next and record the artifact.

Usage:
    .venv/bin/python scripts/deploy.py                  # studio-next, ephemeral key
    PRIVATE_KEY=0x... .venv/bin/python scripts/deploy.py
    .venv/bin/python scripts/deploy.py --rpc http://127.0.0.1:4000/api --name localnet

Studio networks fund accounts on request (sim_fundAccount), so an ephemeral key
is enough to deploy. The script refuses to write the artifact unless the
deployment reaches consensus AND a post-deploy read of get_config() returns the
expected version, so a recorded address is always a live, callable contract.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import localnet, studio_devnet, studionet

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contracts" / "lex_veritas.py"
DEFAULT_RPC = "https://studio-next.genlayer.com/api"
EXPLORER = "https://explorer-studio-next.genlayer.com"
EXPECTED_VERSION = "0.3.0"


def chain_for(rpc: str):
    """Pick the preset whose chain id the endpoint actually reports; signing
    with the wrong id is rejected as InvalidChainId."""
    import urllib.request

    req = urllib.request.Request(
        rpc,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "lexveritas-deploy/0.3.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        chain_id = int(json.loads(resp.read())["result"], 16)
    for preset in (studio_devnet, studionet, localnet):
        if preset.id == chain_id:
            return preset
    raise SystemExit(f"no genlayer_py chain preset for chain id {chain_id}")


def runner_of(source: str) -> str:
    for line in source.splitlines()[:5]:
        if '"Depends"' in line:
            return json.loads(line.lstrip("# ").strip())["Depends"]
    raise SystemExit("contract has no runner Depends header")


def contract_address_of(receipt: dict) -> str:
    """Studio receipts have carried the address under several keys across
    releases; accept any of them rather than pin one."""
    candidates = [
        receipt.get("data", {}).get("contract_address") if isinstance(receipt.get("data"), dict) else None,
        receipt.get("recipient"),
        receipt.get("to_address"),
        receipt.get("contract_address"),
    ]
    for c in candidates:
        if isinstance(c, str) and c.startswith("0x") and len(c) == 42 and int(c, 16) != 0:
            return c
    raise SystemExit(f"could not find contract address in receipt keys: {sorted(receipt.keys())}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rpc", default=os.environ.get("GENLAYER_RPC", DEFAULT_RPC))
    ap.add_argument("--name", default="studio-next", help="network label used in the artifact file name")
    ap.add_argument("--retries", type=int, default=120)
    ap.add_argument("--fees", default=None, help="fee options JSON; default is a live estimate")
    ap.add_argument("--revision", default=None, help="free-text note recorded in the artifact")
    args = ap.parse_args()

    source = CONTRACT.read_text(encoding="utf-8")
    if not source.startswith("# v0.3.0\n"):
        raise SystemExit("contract must start with '# v0.3.0'")

    key = os.environ.get("PRIVATE_KEY")
    account = create_account(key) if key else create_account()
    client = create_client(chain=chain_for(args.rpc), endpoint=args.rpc, account=account)
    print(f"network : {args.name} ({args.rpc})")
    print(f"deployer: {account.address}{'' if key else ' (ephemeral)'}")

    try:
        client.fund_account(address=account.address, amount=10 * 10**18)
    except Exception as exc:  # non-studio networks have no faucet method
        print(f"funding skipped: {exc}")

    # Studio Next has no on-chain FeeManager. Passing no fees resolves the
    # deposit to zero, which the consensus contract rejects
    # (FeesDistributionMissing / FeeValueMustBeNonZero). estimate_transaction_fees
    # reads the live fee policy and returns a distribution plus deposit.
    fees = json.loads(args.fees) if args.fees else client.estimate_transaction_fees({})
    print(f"fees    : deposit {fees.get('feeValue', fees.get('fee_value'))}")
    tx_hash = client.deploy_contract(code=source, account=account, args=[], fees=fees)
    print(f"tx      : {tx_hash}")
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, wait_until="decided", retries=args.retries, interval=3000
    )
    if not isinstance(receipt, dict):
        receipt = dict(receipt)
    status = receipt.get("status_name") or receipt.get("status")
    result = receipt.get("result_name") or receipt.get("result")
    print(f"status  : {status} / {result}")
    address = contract_address_of(receipt)
    print(f"contract: {address}")

    config = client.read_contract(address=address, function_name="get_config", args=[])
    if not isinstance(config, dict) or config.get("version") != EXPECTED_VERSION:
        raise SystemExit(f"post-deploy read returned unexpected config: {config!r}")
    accounting = client.read_contract(address=address, function_name="get_accounting", args=[])

    artifact = {
        "network": args.name,
        "rpc_url": args.rpc,
        "chain_id": client.chain.id,
        "contract": "LexVeritas",
        "contract_address": address,
        "explorer_url": f"{EXPLORER}/address/{address}" if "studio-next" in args.rpc else None,
        "deploy_tx": tx_hash if isinstance(tx_hash, str) else tx_hash.hex(),
        "deployer": account.address,
        "deployed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "contracts/lex_veritas.py",
        "source_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "runner": runner_of(source),
        "version": config["version"],
        "config": config,
        "accounting_at_deploy": accounting,
        # wait_for_transaction_receipt returned, so the tx reached "decided";
        # some receipt shapes carry only the result name, not the status.
        "consensus": {"status": status or "DECIDED", "result": result},
        "revision": args.revision,
    }
    out = ROOT / "deployments" / f"{args.name}.json"
    out.parent.mkdir(exist_ok=True)
    # Keep an audit trail: a redeploy records what it replaced instead of
    # silently overwriting the previous address.
    if out.exists():
        prior = json.loads(out.read_text(encoding="utf-8"))
        history = list(prior.pop("supersedes", []))
        history.insert(0, {
            k: prior.get(k)
            for k in ("contract_address", "deploy_tx", "deployed_at", "source_sha256", "revision")
            if prior.get(k) is not None
        })
        artifact["supersedes"] = history
    out.write_text(json.dumps(artifact, indent=2, default=str) + "\n", encoding="utf-8")
    print(f"artifact: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
