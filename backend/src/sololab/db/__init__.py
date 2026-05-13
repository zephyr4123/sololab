"""Persistence layer.

Holds the SQLAlchemy declarative base, async engine/session factories,
and one ORM module per aggregate root in `db.models`.
"""

from sololab.db.base import Base, create_db_engine, create_session_factory

__all__ = ["Base", "create_db_engine", "create_session_factory"]
