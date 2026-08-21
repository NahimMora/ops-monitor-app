"""Adapter registry — maps a project's ``adapter`` config key to its class.

Adding a fourth monitored project later means adding one adapter module
and one line here; nothing else in the agent core should ever branch on
project identity (see docs/ARCHITECTURE.md, "Project Adapter Architecture").
"""

from __future__ import annotations

from typing import Callable

from monitor_agent.adapters.base import ProjectAdapter
from monitor_agent.adapters.holasalta_manager import HolaSaltaManagerAdapter
from monitor_agent.adapters.holasalta_scrapping import HolaSaltaScrappingAdapter
from monitor_agent.adapters.lvr import LvrAdapter

_REGISTRY: dict[str, Callable[..., ProjectAdapter]] = {
    "holasalta_manager": HolaSaltaManagerAdapter,
    "lvr": LvrAdapter,
    "holasalta_scrapping": HolaSaltaScrappingAdapter,
}


def build_adapter(adapter_key: str, root_path: str, options: dict) -> ProjectAdapter:
    try:
        cls = _REGISTRY[adapter_key]
    except KeyError as exc:
        raise ValueError(f"Unknown adapter key: {adapter_key!r}. Known: {sorted(_REGISTRY)}") from exc
    return cls(root_path, options)
