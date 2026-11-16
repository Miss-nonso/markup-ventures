from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, ForeignKey, DateTime, Float, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase): pass
class Asset(Base):
    __tablename__ = 'assets'
    id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID, nullable=False)
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey('assets.id'))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(30))
    reported: Mapped[dict] = mapped_column(JSONB, default=dict)
    desired: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class Reading(Base):
    __tablename__ = 'telemetry'
    device_id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID)
    metrics: Mapped[dict] = mapped_column(JSONB)

class Alert(Base):
    __tablename__ = 'alerts'
    id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID)
    device_id: Mapped[UUID] = mapped_column(ForeignKey('assets.id'))
    metric: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default='open')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)
