## ADDED Requirements

### Requirement: Style data for legend, compartments and aspects
The diagram file SHALL store the legend toggle, per-node hidden compartments, and named aspects as optional style keys. Files without them SHALL load unchanged; unknown keys SHALL be kept on save. These keys change only on diagram save.

#### Scenario: Round trip
- **WHEN** the user hides a compartment, saves, and reopens
- **THEN** the compartment is still hidden

#### Scenario: Old file
- **WHEN** a diagram saved before this change is opened
- **THEN** it loads with all compartments shown and no legend

### Requirement: Save and copy diagram as image
Commands SHALL save the open diagram as PNG or SVG to a path the user picks, and copy it to the clipboard as PNG. The image shows the whole diagram in the chosen theme (light, or the editor theme), including the legend, and is independent of zoom. A write failure SHALL show an error.

#### Scenario: Save SVG
- **WHEN** the user runs Save as Image and picks `ship.svg`
- **THEN** `ship.svg` is a valid SVG of the whole diagram

#### Scenario: Copy
- **WHEN** the user runs Copy as Image
- **THEN** the clipboard holds a PNG of the diagram
