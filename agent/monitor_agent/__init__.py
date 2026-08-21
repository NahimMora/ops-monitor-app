"""Ops Monitor Windows Agent.

Small, dependency-light process that runs 24/7 on the production machine,
observes the three local projects through their existing structured
contracts, and reports to the Ops Monitor cloud app over outbound HTTPS.
See docs/WINDOWS_AGENT.md for the full design.
"""

__version__ = "0.1.0"
