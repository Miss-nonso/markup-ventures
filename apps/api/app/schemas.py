from datetime import datetime, date
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator

class StrictSchema(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Telemetry(StrictSchema):
    device_id: UUID
    timestamp: AwareDatetime
    metrics: dict[str, Annotated[float, Field(strict=True)]] = Field(min_length=1, max_length=100)
    metadata: dict[str, str] = Field(default_factory=dict)

    @field_validator('metrics')
    @classmethod
    def validate_metrics(cls, values):
        from .metrics import METRICS
        for name, value in values.items():
            if name not in METRICS:
                raise ValueError(f'Unknown metric: {name}')
            if not METRICS[name]['min'] <= value <= METRICS[name]['max']:
                raise ValueError(f'{name} is outside its supported range')
        return values

    @field_validator('timestamp')
    @classmethod
    def validate_timestamp(cls, value):
        from datetime import timezone, timedelta
        if value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError('Timestamp cannot be more than five minutes in the future')
        return value


class AssetCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=120, strict=True)
    parent_id: UUID | None = None
    kind: Literal['enterprise', 'region', 'plant', 'line', 'machine', 'sensor']
    desired: dict = Field(default_factory=dict)

    @field_validator('name')
    @classmethod
    def nonblank_name(cls, value):
        if not value.strip(): raise ValueError('Name cannot be blank')
        return value.strip()

    @field_validator('desired')
    @classmethod
    def configuration(cls, values):
        if set(values) & {'maintenance_history','device_epoch','device_settings','config_version','reported_config_version','device_reported_state','device_state_at'}: raise ValueError('Maintenance history is recorded by the server')
        for key in ('site','equipment_type','firmware','data_source','maintenance_note'):
            if key in values and (not isinstance(values[key],str) or len(values[key])>1000):
                raise ValueError(f'{key} must be a bounded string')
        if 'maintenance_status' in values and values['maintenance_status'] not in ('Not scheduled','Scheduled','In progress','Completed'):
            raise ValueError('Invalid maintenance status')
        if values.get('maintenance_due') is not None:
            if not isinstance(values['maintenance_due'],str): raise ValueError('Maintenance due must be an ISO date')
            date.fromisoformat(values['maintenance_due'])
        return values


class Ack(StrictSchema):
    note: str = Field(min_length=1, max_length=1000, strict=True)

class AssetUpdate(StrictSchema):
    name: str = Field(min_length=1, max_length=120, strict=True)
    site: str = Field(min_length=1, max_length=120, strict=True)
    equipment_type: str = Field(min_length=1, max_length=60, strict=True)
    firmware: str = Field(max_length=60, strict=True)
    maintenance_due: date | None = None
    maintenance_status: Literal['Not scheduled', 'Scheduled', 'In progress', 'Completed'] = 'Not scheduled'
    maintenance_note: str = Field(default='', max_length=1000, strict=True)

    @field_validator('name','site','equipment_type')
    @classmethod
    def nonblank_fields(cls,value):
        if not value.strip(): raise ValueError('Value cannot be blank')
        return value.strip()
