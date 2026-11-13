## ADDED Requirements

### Requirement: Feature direction in read tools
Agent read tools SHALL report the direction (`in`, `out`, `inout`) of features. The diagram agent tools SHALL stay unchanged.

#### Scenario: Read a directed feature
- **WHEN** an agent reads part def `Frigate` with `out defenseStatus : ShipReport;`
- **THEN** the feature is reported with direction `out`
