# Working with model elements acceptance scenarios

Generated from the Cameo user guide, section 009 Working with model elements. Each scenario tests one requirement in `../cameo-ui-model/ModelElements.sysml` (package `CameoUI_ELM`).

## ACC-ELM-001 pasteListCreatesElements

- Requirement: CAM-ELM-001
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150801/Creating+elements+from+other+resources
- Preconditions: A package exists; a plain-text list of three unique names is on the clipboard
- Steps:
  1. Select the package in the tree
  2. Paste
  3. Pick the element type in the type dialog
- Expected: Three elements of that type appear in the package; duplicate names in one owner are rejected

## ACC-ELM-002 importMapSave

- Requirement: CAM-ELM-002
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150812/Saving+an+Import+Map
- Preconditions: An import dialog is configured with file, element type, properties and target
- Steps:
  1. Click Save Map
  2. Choose a location
  3. Name the map
- Expected: The map exists in the model and can be reloaded

## ACC-ELM-003 mapGroups

- Requirement: CAM-ELM-003
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150815/Managing+Map+Groups
- Preconditions: Two saved maps exist
- Steps:
  1. Open Manage Map Groups
  2. Create a group
  3. Add both maps
  4. Run the group
- Expected: Maps run in group order

## ACC-ELM-004 importDialogAreas

- Requirement: CAM-ELM-004
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150826/Excel+and+CSV+Import+dialog
- Preconditions: A project is open
- Steps:
  1. Open the import dialog
  2. Leave element type empty
  3. Try to import
- Expected: Import is blocked until mandatory options are set

## ACC-ELM-005 importMappingOptions

- Requirement: CAM-ELM-005
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150826/Excel+and+CSV+Import+dialog
- Preconditions: Import dialog open with an Excel file
- Steps:
  1. Set each option
  2. Preview the mapping
- Expected: Options constrain what is created and where

## ACC-ELM-006 migrateLegacyMaps

- Requirement: CAM-ELM-006
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150839/Import+Maps+migration+from+CSV+Import+Plugin
- Preconditions: A project with legacy maps
- Steps:
  1. Choose Import Using Existing Map
  2. Accept migration
- Expected: Maps become current import maps

## ACC-ELM-007 importNestedRequirementsReq

- Requirement: CAM-ELM-007
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150841/Importing+nested+Requirements
- Preconditions: A spreadsheet with name, text, id and owner columns
- Steps:
  1. Map the four properties
  2. Import
- Expected: Nested requirements with ids and text exist under the target

## ACC-ELM-008 importBlocksReq

- Requirement: CAM-ELM-008
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150844/Importing+Blocks+and+their+properties
- Preconditions: A sheet describing an engine and its parts
- Steps:
  1. Import blocks
  2. Save property maps
  3. Run the group
- Expected: Blocks with properties exist

## ACC-ELM-009 importRelationshipsReq

- Requirement: CAM-ELM-009
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150850/Importing+relationships
- Preconditions: Elements exist; a sheet lists name pairs
- Steps:
  1. Map source and target
  2. Import
- Expected: Relationships are created; illegal pairs are reported

## ACC-ELM-010 importInstancesReq

- Requirement: CAM-ELM-010
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150854/Importing+instances
- Preconditions: A block with value properties exists
- Steps:
  1. Choose instances
  2. Pick the classifier
  3. Map nested properties
  4. Import
- Expected: Instances with slots appear

## ACC-ELM-011 specWindowFunctions

- Requirement: CAM-ELM-011
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150863/Functions+of+Specification+window
- Preconditions: An element in the tree
- Steps:
  1. Open its specification
  2. Edit a property
  3. Add documentation
- Expected: The change is saved to the model text

## ACC-ELM-012 specWindowNavigation

- Requirement: CAM-ELM-012
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150866/Specification+window+toolbar
- Preconditions: A specification with a reference
- Steps:
  1. Open the referenced specification
  2. Press Back
- Expected: The first specification returns

## ACC-ELM-013 specSelectInTree

- Requirement: CAM-ELM-013
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150866/Specification+window+toolbar
- Preconditions: A specification is open
- Steps:
  1. Click Select in Containment Tree
- Expected: The tree highlights the element

## ACC-ELM-014 propertyGroupViews

- Requirement: CAM-ELM-014
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150870/Property+group+toolbar
- Preconditions: A specification is open
- Steps:
  1. Switch to alphabetical
  2. Switch to Expert
  3. Show inherited
- Expected: List order and content change

## ACC-ELM-015 quickFilter

- Requirement: CAM-ELM-015
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150881/Quick+filter
- Preconditions: A specification with at least ten properties
- Steps:
  1. Start typing a property name
- Expected: A filter box appears and narrows the list

## ACC-ELM-016 defaultPropertiesProject

- Requirement: CAM-ELM-016
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values
- Preconditions: A project is open
- Steps:
  1. Change a default
  2. Create an element
  3. Reset defaults
- Expected: New elements use the defaults; old ones are unchanged

## ACC-ELM-017 defaultPropertiesDiagram

- Requirement: CAM-ELM-017
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values
- Preconditions: A diagram type exists
- Steps:
  1. Edit the type's button defaults
  2. Create the element
- Expected: The element has the diagram-level defaults

## ACC-ELM-018 longTextEditor

- Requirement: CAM-ELM-018
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150886/Editing+long+textual+values
- Preconditions: An element with a documentation property
- Steps:
  1. Click edit on the value
  2. Type several lines
  3. Confirm
- Expected: The text is stored

## ACC-ELM-019 multilineValueEditor

- Requirement: CAM-ELM-019
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150887/Editing+multiline+textual+values
- Preconditions: A property with several text values
- Steps:
  1. Add a row
  2. Move it up
  3. Remove another
- Expected: Values change in order

## ACC-ELM-020 booleanToggle

- Requirement: CAM-ELM-020
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150888/Editing+logical+values
- Preconditions: An element with a boolean property
- Steps:
  1. Tick the box
  2. Clear it
- Expected: Value is true then false

## ACC-ELM-021 pickFromFixedList

- Requirement: CAM-ELM-021
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150890/Selecting+single+property+value+from+non-editable+list
- Preconditions: A property with predefined values
- Steps:
  1. Open the list
  2. Choose one
  3. Choose unspecified
- Expected: Value set then cleared

## ACC-ELM-022 pickFromEditableList

- Requirement: CAM-ELM-022
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150893/Selecting+single+property+value+from+editable+list
- Preconditions: A reference property
- Steps:
  1. Open Select Element
  2. Pick an element
- Expected: Reference is set

## ACC-ELM-023 pickMultipleValues

- Requirement: CAM-ELM-023
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150899/Selecting+multiple+property+values
- Preconditions: A multi-valued property
- Steps:
  1. Open the dialog
  2. Select two elements
- Expected: Both are assigned

## ACC-ELM-024 innerElementValue

- Requirement: CAM-ELM-024
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150904/Creating+inner+element+as+property+value
- Preconditions: An element with an owned-element property
- Steps:
  1. Click Add
  2. Choose a type
  3. Fill its specification
  4. Remove it
- Expected: Element appears in model; removing deletes it

## ACC-ELM-025 valueSpecificationValue

- Requirement: CAM-ELM-025
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150906/Assigning+value+specification+as+property+value
- Preconditions: A property with a default value
- Steps:
  1. Choose a value specification
  2. Change it
- Expected: New value stored

## ACC-ELM-026 ownedElementGroups

- Requirement: CAM-ELM-026
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150908/Editing+property+values+in+property+groups
- Preconditions: A state
- Steps:
  1. Set an entry behaviour type
  2. Fill its properties
- Expected: Owned element is created

## ACC-ELM-027 sortInnerElements

- Requirement: CAM-ELM-027
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150911/Sorting+elements
- Preconditions: An owner with several elements
- Steps:
  1. Select one
  2. Move up and down
- Expected: Order in the tree changes in source

## ACC-ELM-028 redefinePart

- Requirement: CAM-ELM-028
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150915/Redefinition
- Preconditions: A part inherited from a definition
- Steps:
  1. Choose Redefine To
  2. Pick or name a type
- Expected: A redefining part replaces it

## ACC-ELM-029 convertElementKind

- Requirement: CAM-ELM-029
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150918/Incompatible+properties+and+related+elements
- Preconditions: A component with a port
- Steps:
  1. Convert to package
- Expected: Warning shown; port is removed

## ACC-ELM-030 replaceElement

- Requirement: CAM-ELM-030
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150920/Replacing+elements
- Preconditions: Two elements of one kind, one referenced
- Steps:
  1. Replace one with the other
- Expected: References point to the target

## ACC-ELM-031 reverseRelationship

- Requirement: CAM-ELM-031
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150922/Reversing+relationships+direction
- Preconditions: A transition between two states
- Steps:
  1. Reverse direction
- Expected: Source and target swap

## ACC-ELM-032 swapShapes

- Requirement: CAM-ELM-032
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150924/Swapping
- Preconditions: Two actions linked by control flow
- Steps:
  1. Drag one onto the other
- Expected: They exchange positions in the flow

## ACC-ELM-033 reverseInfoFlowReq

- Requirement: CAM-ELM-033
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150927/Reversing+Information+Flow+direction
- Preconditions: A connector with flow
- Steps:
  1. Choose Reverse Flow Direction
- Expected: Flow direction changes everywhere

## ACC-ELM-034 extractSequence

- Requirement: CAM-ELM-034
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150932/Rules+of+extracting+in+Sequence+diagram
- Preconditions: A sequence diagram
- Steps:
  1. Select messages
  2. Choose Extract
  3. Complete wizard
- Expected: New diagram and gates exist

## ACC-ELM-035 extractActivity

- Requirement: CAM-ELM-035
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150941/Extraction+rules+in+Activity+diagram
- Preconditions: An activity diagram
- Steps:
  1. Select valid actions
  2. Extract
  3. Complete wizard
- Expected: New activity and call action exist; invalid selection is warned

## ACC-ELM-036 extractStateMachine

- Requirement: CAM-ELM-036
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150961/Extract+State+Machine+Wizard
- Preconditions: A state machine diagram
- Steps:
  1. Select states
  2. Extract
  3. Complete wizard
- Expected: Submachine state replaces them

## ACC-ELM-037 extractStructure

- Requirement: CAM-ELM-037
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150970/Extract+Structure+Wizard
- Preconditions: An internal structure diagram
- Steps:
  1. Select parts
  2. Extract
  3. Complete wizard
- Expected: New block and property exist

## ACC-ELM-038 symbolPropertiesDialog

- Requirement: CAM-ELM-038
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150977/Symbol+Properties+dialog
- Preconditions: A symbol is selected
- Steps:
  1. Open Symbol Properties
  2. Change fill
  3. Observe
- Expected: The diagram updates live

## ACC-ELM-039 applyImageToSymbol

- Requirement: CAM-ELM-039
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150982/Applying+image
- Preconditions: A class symbol
- Steps:
  1. Drag an image on it
- Expected: Symbol shows the image

## ACC-ELM-040 rakeIcon

- Requirement: CAM-ELM-040
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150998/Displaying+rake+icon
- Preconditions: A part with an interconnection
- Steps:
  1. Double-click it
- Expected: Inner diagram opens

## ACC-ELM-041 symbolStyles

- Requirement: CAM-ELM-041
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151001/Symbol+styles+option+group
- Preconditions: A project
- Steps:
  1. Clone the default style
  2. Edit
  3. Make default
- Expected: New symbols use it

## ACC-ELM-042 styleInheritance

- Requirement: CAM-ELM-042
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151008/Properties+Inheritance
- Preconditions: A symbol with inherited fill
- Steps:
  1. Change fill
- Expected: Inherited flag clears

## ACC-ELM-043 stereotypeStyles

- Requirement: CAM-ELM-043
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151016/Customizing+stereotype+style+properties
- Preconditions: A stereotype is in use
- Steps:
  1. Set a colour
  2. Apply
- Expected: Stereotyped symbols use it

## ACC-ELM-044 usedProjectStyles

- Requirement: CAM-ELM-044
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151019/Collecting+symbol+styles+from+used+projects
- Preconditions: A used project defines styles
- Steps:
  1. Copy one
- Expected: Editable local copy exists

## ACC-ELM-045 pasteStyle

- Requirement: CAM-ELM-045
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151025/Copy+and+paste+symbol+style
- Preconditions: Two symbols of one type
- Steps:
  1. Copy
  2. Paste Style
- Expected: Target takes source style

## ACC-ELM-046 defaultStyleTemplate

- Requirement: CAM-ELM-046
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151029/Making+your+own+default+style+for+new+projects
- Preconditions: A modified template
- Steps:
  1. Create project from template
- Expected: Styles are present

## ACC-ELM-047 customizeLists

- Requirement: CAM-ELM-047
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151030/Customizing+lists+of+properties+and+commands
- Preconditions: Any properties list
- Steps:
  1. Open Customize
  2. Hide one
- Expected: It is hidden

## ACC-ELM-048 hyperlinkTabs

- Requirement: CAM-ELM-048
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151052/Address+tab
- Preconditions: A hyperlink dialog
- Steps:
  1. Pick a tab
  2. Enter target
  3. Tick Active
- Expected: Link saved and active

## ACC-ELM-049 hyperlinkElementDisplay

- Requirement: CAM-ELM-049
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151060/Element+Symbol+tab
- Preconditions: A link to a class
- Steps:
  1. Choose Name
  2. Rename the class
- Expected: Link text follows

## ACC-ELM-050 hyperlinkDefaults

- Requirement: CAM-ELM-050
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151068/Default+settings+of+hyperlinks+to+model+elements
- Preconditions: Project options
- Steps:
  1. Change the defaults
- Expected: New links use them

## ACC-ELM-051 hyperlinkOnElements

- Requirement: CAM-ELM-051
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151069/Hyperlinks+on+elements
- Preconditions: An element with an active link
- Steps:
  1. Double-click it
- Expected: Target opens

## ACC-ELM-052 openAndLocateHyperlink

- Requirement: CAM-ELM-052
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151072/Opening+hyperlinks
- Preconditions: A text link to an element
- Steps:
  1. Alt double-click
- Expected: Tree selects target

## ACC-ELM-053 selectionDialogMultiple

- Requirement: CAM-ELM-053
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151095/Elements+multiple+selection
- Preconditions: A multi-capable dialog
- Steps:
  1. Select several
  2. Switch to single
- Expected: One remains

## ACC-ELM-054 selectionDialogCreateClone

- Requirement: CAM-ELM-054
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151096/Creating+new+elements
- Preconditions: A selection dialog
- Steps:
  1. Turn creation on
  2. Create
- Expected: New element is selectable

## ACC-ELM-055 typeFilters

- Requirement: CAM-ELM-055
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151098/Hide+Uncommon+Elements+filter
- Preconditions: A type picker
- Steps:
  1. Enable the filter
- Expected: List shrinks

## ACC-ELM-056 typeSelectionMode

- Requirement: CAM-ELM-056
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151109/Selecting+port+and+part+types
- Preconditions: Mode on
- Steps:
  1. Create a part
- Expected: Type dialog appears

## ACC-ELM-057 numberingAutomatic

- Requirement: CAM-ELM-057
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151117/Automatic+numbering
- Preconditions: Numbering customization
- Steps:
  1. Enable auto-numbering
  2. Create
- Expected: Number assigned

## ACC-ELM-058 numberingManual

- Requirement: CAM-ELM-058
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151121/Manual+numbering
- Preconditions: Numbered elements
- Steps:
  1. Increase one
- Expected: Order changes

## ACC-ELM-059 favoritesList

- Requirement: CAM-ELM-059
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151131/Adding+removing+and+changing+order+of+favorites
- Preconditions: An element
- Steps:
  1. Add to favorites
- Expected: It appears in the menu

## ACC-ELM-060 htmlEditor

- Requirement: CAM-ELM-060
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151164/Advanced+HTML+Editor+dialog
- Preconditions: A documentation field
- Steps:
  1. Open the editor
  2. Insert image
- Expected: Image in text

## ACC-ELM-061 synchronizeParameters

- Requirement: CAM-ELM-061
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151180/Synchronization+dialog+environment
- Preconditions: An activity with an unsynchronized call
- Steps:
  1. Open Synchronization
  2. Synchronize all
- Expected: They match

## ACC-ELM-062 elementUrls

- Requirement: CAM-ELM-062
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151183/Copying+and+opening+element+URLs
- Preconditions: An element
- Steps:
  1. Copy URL
  2. Open from URL
- Expected: Element is shown

## ACC-ELM-063 dateTimeDialog

- Requirement: CAM-ELM-063
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151184/Setting+date+and+time
- Preconditions: A date property
- Steps:
  1. Open dialog
  2. Pick a day
- Expected: Value stored

## ACC-ELM-064 ownerDisplay

- Requirement: CAM-ELM-064
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151188/Owner+display+mode
- Preconditions: A nested element
- Steps:
  1. Set owner display
  2. Observe
- Expected: Owner shown

## ACC-ELM-065 qualifiedNameStyle

- Requirement: CAM-ELM-065
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151194/Qualified+name+display+style
- Preconditions: Library element
- Steps:
  1. Change option
- Expected: Name display changes

## ACC-ELM-066 selectElementTypeDialog

- Requirement: CAM-ELM-066
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151195/Selecting+element+types
- Preconditions: A tree
- Steps:
  1. Open filter by type
  2. Tick one kind
- Expected: Only that kind shown

## ACC-ELM-067 tooltipStyle

- Requirement: CAM-ELM-067
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151209/Changing+the+tooltips+style
- Preconditions: A diagram
- Steps:
  1. Set tooltips to documentation
  2. Hover
- Expected: Doc text shown

## ACC-ELM-068 auxiliaryElements

- Requirement: CAM-ELM-068
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151210/Marking+elements+as+auxiliary
- Preconditions: An element
- Steps:
  1. Set tag
  2. Hide auxiliary
- Expected: Element hidden

## ACC-ELM-069 reorderInLists

- Requirement: CAM-ELM-069
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151213/Reordering+elements
- Preconditions: A list dialog
- Steps:
  1. Select
  2. Press Ctrl+Up
- Expected: Row moves up
