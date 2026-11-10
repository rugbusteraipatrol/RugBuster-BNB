#!/usr/bin/env python3
"""Writes one standalone SVG fragment per design (art only, no tee) plus the shared font CSS."""
import json, os, gen
out = os.path.join(gen.HERE, "print")
os.makedirs(out, exist_ok=True)
data = {"fontCss": gen.font_css(), "designs": {}}
for name, (fn, colour) in gen.DESIGNS.items():
    defs, body = fn()
    data["designs"][name] = {"defs": defs, "body": body, "tee": colour}
json.dump(data, open(os.path.join(out, "designs.json"), "w"))
print(len(data["designs"]))
