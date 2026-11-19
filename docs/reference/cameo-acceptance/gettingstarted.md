# Getting started acceptance scenarios

Generated from the Cameo user guide, section 001 Getting started. Each scenario tests one requirement in `../cameo-ui-model/GettingStarted.sysml` (package `CameoUI_GST`).

## ACC-GST-001 mainMenuGroups

- Requirement: CAM-GST-001
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Launch the tool with a project open
  2. Read the menu bar
  3. Open each menu
- Expected: The listed menus exist, each holding the command group the guide describes.

## ACC-GST-002 fileMenuProject

- Requirement: CAM-GST-002
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the File menu
  2. Look for New Project, Open Project, Save Project, import, export and print entries
- Expected: Each project command is present and runs.

## ACC-GST-003 editMenuDiagram

- Requirement: CAM-GST-003
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open a diagram
  2. Open the Edit menu
- Expected: Select, cut, copy, paste and find commands are listed for the active diagram.

## ACC-GST-004 viewMenuZoomGridToolbars

- Requirement: CAM-GST-004
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the View menu
- Expected: Zoom, grid, tab and toolbar commands are listed.

## ACC-GST-005 layoutMenu

- Requirement: CAM-GST-005
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open a diagram
  2. Select one symbol and open the Layout menu
  3. Select two symbols and open it again
- Expected: Commands needing several symbols are disabled for one symbol and enabled for two.

## ACC-GST-006 diagramsMenu

- Requirement: CAM-GST-006
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Diagrams menu
- Expected: Create Diagram, wizards, history and custom types are listed.

## ACC-GST-007 optionsMenu

- Requirement: CAM-GST-007
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Options menu
- Expected: Project, Environment, Perspectives and Look and Feel entries are present.

## ACC-GST-008 toolsAnalyzeMenus

- Requirement: CAM-GST-008
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Tools menu
  2. Open the Analyze menu
- Expected: Transformation, report, evaluate, macro and analysis commands exist.

## ACC-GST-009 collaborateWindowHelpMenus

- Requirement: CAM-GST-009
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open Collaborate, Window and Help
- Expected: Each menu lists its documented commands.

## ACC-GST-010 toolbarCustomizeFromView

- Requirement: CAM-GST-010
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148421/Toolbars
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open View > Toolbars
  2. Hide a toolbar button
- Expected: The chosen toolbar entry disappears from the toolbar.

## ACC-GST-011 browserShownWithProject

- Requirement: CAM-GST-011
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open a workspace containing .sysml files
  2. Look at the side bar
  3. Drag the view to the other side
- Expected: The SysML Model view shows and can be repositioned.

## ACC-GST-012 browserHierarchy

- Requirement: CAM-GST-012
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the SysML Model view
  2. Expand a package
  3. Collapse it
- Expected: Nodes with children expand and collapse; leaf nodes have no marker.

## ACC-GST-013 browserOperations

- Requirement: CAM-GST-013
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element in the browser
  2. Try create, rename, delete, copy, cut and paste
- Expected: All listed operations work on the selected element.

## ACC-GST-014 browserTabsSet

- Requirement: CAM-GST-014
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Model Browser
  2. Count the tab headers
- Expected: The five default tabs are visible; Search Results appears after a search.

## ACC-GST-015 browserDividerResize

- Requirement: CAM-GST-015
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Drag the bar between the browser parts
- Expected: Both parts resize.

## ACC-GST-016 browserZoom

- Requirement: CAM-GST-016
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select a browser tab
  2. Press Ctrl+wheel up
- Expected: The tab contents are enlarged.

## ACC-GST-017 browserPositionOption

- Requirement: CAM-GST-017
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Change the position
  2. Check the layout
- Expected: The browser sits at the chosen side.

## ACC-GST-018 browserTabClosing

- Requirement: CAM-GST-018
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Close a tab
  2. Reopen it
  3. Run Reset Windows Configuration
- Expected: The tab returns to its default place.

## ACC-GST-019 browserSortAlphabetical

- Requirement: CAM-GST-019
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Add elements out of order
  2. Look at the order
- Expected: With the option on, siblings are ordered by name.

## ACC-GST-020 containmentGroupsModel

- Requirement: CAM-GST-020
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Containment tab
  2. Expand the root
- Expected: Elements are reachable from the root package.

## ACC-GST-021 containmentOpening

- Requirement: CAM-GST-021
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Hide the tab
  2. Reopen it from the Window menu
- Expected: The tab returns.

## ACC-GST-022 relationsBranch

- Requirement: CAM-GST-022
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Create a relationship in the root package
  2. Look under the root
- Expected: A Relations branch lists it.

## ACC-GST-023 auxiliaryResourcesToggle

- Requirement: CAM-GST-023
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Options menu in the toolbar
  2. Choose Show Auxiliary Resources
- Expected: Profiles and used modules appear.

## ACC-GST-024 hyperlinksBranch

- Requirement: CAM-GST-024
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Add a hyperlink to an element
- Expected: A Hyperlinks branch lists it.

## ACC-GST-025 codeEngineeringSets

- Requirement: CAM-GST-025
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Switch on Show Code Engineering Sets
- Expected: Code engineering sets appear in the browser.

## ACC-GST-026 treeToolbarCollapseAll

- Requirement: CAM-GST-026
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Expand several nodes
  2. Click Collapse All
  3. Select a node and click Collapse Selected Recursively
- Expected: All, or only the selected subtree, collapse.

## ACC-GST-027 openInNewTree

- Requirement: CAM-GST-027
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Open in New Tree > New Containment Tree
- Expected: A new tab shows the element as root.

## ACC-GST-028 favorites

- Requirement: CAM-GST-028
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Favorites > Add
- Expected: The element is listed and navigable.

## ACC-GST-029 quickFind

- Requirement: CAM-GST-029
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Press the Quick Find shortcut
  2. Type a name
- Expected: The element is located and selected.

## ACC-GST-030 treeOptionsMenu

- Requirement: CAM-GST-030
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Click Options in the toolbar
- Expected: The listed toggles are offered.

## ACC-GST-031 elementTypeFilter

- Requirement: CAM-GST-031
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open Filter
  2. Tick one kind
- Expected: Only that kind is shown.

## ACC-GST-032 appliedStereotypesToggle

- Requirement: CAM-GST-032
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Switch on Show Applied Stereotypes
- Expected: Stereotype names appear next to elements.

## ACC-GST-033 fullTypesToggle

- Requirement: CAM-GST-033
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Switch on Show Full Types
- Expected: Types appear qualified.

## ACC-GST-034 treeContextMenu

- Requirement: CAM-GST-034
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Right-click an element
- Expected: The listed commands are offered when applicable.

## ACC-GST-035 createElementInTree

- Requirement: CAM-GST-035
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Right-click a package
  2. Choose Create Element
  3. Choose Create Diagram
- Expected: The new items appear inside the package.

## ACC-GST-036 createRelationFromTree

- Requirement: CAM-GST-036
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Right-click an element
  2. Choose Create Relation > Outgoing
- Expected: A relation is created.

## ACC-GST-037 openSpecificationWindow

- Requirement: CAM-GST-037
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Specification
- Expected: A window lists the element's properties.

## ACC-GST-038 validationCommands

- Requirement: CAM-GST-038
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Validation
- Expected: Validation commands are offered.

## ACC-GST-039 goToCommand

- Requirement: CAM-GST-039
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Go To
- Expected: The associated item opens.

## ACC-GST-040 refactorConvert

- Requirement: CAM-GST-040
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Refactor > Convert To
- Expected: The element changes kind.

## ACC-GST-041 relatedElementsList

- Requirement: CAM-GST-041
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Related Elements
- Expected: A list of functions appears.

## ACC-GST-042 applyProfilesProjectUsages

- Requirement: CAM-GST-042
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Expand the menu
  2. Choose Apply Profiles
- Expected: Applicable profiles are listed.

## ACC-GST-043 generateReportFromTree

- Requirement: CAM-GST-043
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Generate Report
- Expected: Templates are listed.

## ACC-GST-044 structureTab

- Requirement: CAM-GST-044
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open Window > Structure
  2. Expand a typed property
- Expected: Nested properties of the type appear.

## ACC-GST-045 structureOpenNewTree

- Requirement: CAM-GST-045
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Click Open in New Tree
- Expected: A new tree opens.

## ACC-GST-046 inheritedStructureOption

- Requirement: CAM-GST-046
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open Options
  2. Choose Show Inherited Structure
- Expected: Inherited properties appear.

## ACC-GST-047 nestSatisfiedRequirements

- Requirement: CAM-GST-047
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open Options
  2. Choose Nest Satisfied Requirements
- Expected: Requirements nest under satisfying elements.

## ACC-GST-048 inheritanceTab

- Requirement: CAM-GST-048
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Inheritance tab
- Expected: Specialization hierarchy is shown.

## ACC-GST-049 inheritanceInvertTree

- Requirement: CAM-GST-049
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Options > Invert Tree
- Expected: Children appear at the top.

## ACC-GST-050 inheritanceSelectInTrees

- Requirement: CAM-GST-050
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Right-click an inheritance node
  2. Choose Select in Containment Tree
- Expected: The element is selected in the other tab.

## ACC-GST-051 diagramsTab

- Requirement: CAM-GST-051
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148466/Diagrams+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Diagrams tab
- Expected: Diagrams are grouped by type.

## ACC-GST-052 diagramsTabCommands

- Requirement: CAM-GST-052
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148466/Diagrams+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Right-click a diagram
- Expected: Open, Print, Select in Containment Tree and Group by Diagram Name are offered.

## ACC-GST-053 modelExtensionsTab

- Requirement: CAM-GST-053
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148472/Model+Extensions+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open the Model Extensions tab
- Expected: Stereotypes appear grouped.

## ACC-GST-054 searchResultsTab

- Requirement: CAM-GST-054
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148478/Search+Results+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Run Find
  2. Look for the Search Results tab
- Expected: Results appear in two groups.

## ACC-GST-055 searchResultsToolbar

- Requirement: CAM-GST-055
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148478/Search+Results+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Click Rerun Search after a model change
- Expected: Results refresh.

## ACC-GST-056 lockViewTab

- Requirement: CAM-GST-056
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148486/Lock+View+tab
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Open a server project
  2. Open Lock View
- Expected: Locked elements and owners are listed.

## ACC-GST-057 treeRename

- Requirement: CAM-GST-057
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Press F2
  3. Type a name and confirm
- Expected: The element is renamed.

## ACC-GST-058 treeCopyCutPaste

- Requirement: CAM-GST-058
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Copy
  3. Paste into another package
- Expected: The element is duplicated there.

## ACC-GST-059 copyElementReference

- Requirement: CAM-GST-059
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser
- Preconditions: A project is open; the feature under test is available.
- Steps:
  1. Choose Copy URL
- Expected: A URL is on the clipboard.

## ACC-GST-060 treeDelete

- Requirement: CAM-GST-060
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select an element
  2. Choose Delete
- Expected: The element is gone.

## ACC-GST-061 treeDragMove

- Requirement: CAM-GST-061
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Drag an element onto another package
- Expected: The element is owned by the new package.

## ACC-GST-062 editorTabTypes

- Requirement: CAM-GST-062
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Launch the tool
  2. Open two diagrams
- Expected: A Welcome tab is shown and two diagram tabs coexist.

## ACC-GST-063 editorTabsCommands

- Requirement: CAM-GST-063
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Window > Editor Tabs
- Expected: The tab commands are listed.

## ACC-GST-064 samplesView

- Requirement: CAM-GST-064
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Help > Show Samples
- Expected: Samples appear.

## ACC-GST-065 welcomeSearchBar

- Requirement: CAM-GST-065
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+F
  2. Type a keyword
- Expected: Matches are highlighted.

## ACC-GST-066 statusLineIndications

- Requirement: CAM-GST-066
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148497/Status+line
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Look at the bottom of the window
- Expected: All listed controls are present.

## ACC-GST-067 statusLineVisibility

- Requirement: CAM-GST-067
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148497/Status+line
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open View > Status line
  2. Hide the memory monitor
- Expected: The item disappears.

## ACC-GST-068 quickPropertiesPanel

- Requirement: CAM-GST-068
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148509/Quick+properties+panel
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open the panel
- Expected: Three tabs are present.

## ACC-GST-069 zoomTabPreview

- Requirement: CAM-GST-069
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open the Zoom tab
  2. Drag the blue square
- Expected: The diagram pane follows.

## ACC-GST-070 zoomTabFitInWindow

- Requirement: CAM-GST-070
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Click Fit in Window
- Expected: The whole diagram is visible.

## ACC-GST-071 zoomSliderOption

- Requirement: CAM-GST-071
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Enable the option
- Expected: The slider appears.

## ACC-GST-072 documentationTab

- Requirement: CAM-GST-072
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148514/Documentation+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select an element
  2. Type in the Documentation tab
- Expected: The doc comment is stored on the element.

## ACC-GST-073 propertiesTab

- Requirement: CAM-GST-073
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148516/Properties+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select two kinds of elements
  2. Open the Properties tab
- Expected: Common properties only.

## ACC-GST-074 imageLibrary

- Requirement: CAM-GST-074
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148519/Image+Library+tab
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Window > Image Library
  2. Drop an image on a symbol
- Expected: The symbol shows the image.

## ACC-GST-075 lookAndFeel

- Requirement: CAM-GST-075
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148521/Changing+interface+style
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Change the VS Code color theme
- Expected: The browser and diagrams follow the theme.

## ACC-GST-076 shortcutFindDialogs

- Requirement: CAM-GST-076
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+Shift+F
- Expected: The Find dialog opens.

## ACC-GST-077 shortcutDeleteSymbolOrElement

- Requirement: CAM-GST-077
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select a symbol
  2. Press Delete
  3. Undo and press Ctrl+D
- Expected: Delete keeps the element; Ctrl+D removes it.

## ACC-GST-078 shortcutSelectAll

- Requirement: CAM-GST-078
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+A in a diagram
- Expected: All shapes are selected.

## ACC-GST-079 shortcutSelectInTree

- Requirement: CAM-GST-079
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select a symbol
  2. Press Alt+B
- Expected: The element is selected in the tree.

## ACC-GST-080 shortcutMultiSelect

- Requirement: CAM-GST-080
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Shift+click two symbols
  2. Alt+click one
- Expected: All of the same type are selected.

## ACC-GST-081 shortcutOpenSpecification

- Requirement: CAM-GST-081
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select a symbol
  2. Press Enter
  3. Press Alt+Enter
- Expected: Specification then Symbol Properties open.

## ACC-GST-082 shortcutAssignOnSymbol

- Requirement: CAM-GST-082
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Start typing on a symbol
  2. Press Ctrl+Space
- Expected: A list opens.

## ACC-GST-083 shortcutNewLineInCompartment

- Requirement: CAM-GST-083
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Edit a compartment
  2. Press Shift+Enter
- Expected: A new line starts.

## ACC-GST-084 shortcutClipboard

- Requirement: CAM-GST-084
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Copy a symbol
  2. Paste with new element
- Expected: A new element and symbol appear.

## ACC-GST-085 shortcutSaveUndoRedo

- Requirement: CAM-GST-085
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Edit
  2. Press Ctrl+Z
  3. Ctrl+Y
- Expected: Edit is undone then redone.

## ACC-GST-086 shortcutPrint

- Requirement: CAM-GST-086
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+P
- Expected: The Print dialog opens.

## ACC-GST-087 shortcutServerCommit

- Requirement: CAM-GST-087
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+K
- Expected: Changes are committed.

## ACC-GST-088 shortcutRecentDiagrams

- Requirement: CAM-GST-088
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press F12
- Expected: A list shows.

## ACC-GST-089 shortcutFullScreen

- Requirement: CAM-GST-089
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press F11
- Expected: Full screen starts.

## ACC-GST-090 shortcutReportWizard

- Requirement: CAM-GST-090
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+Shift+G
- Expected: The wizard opens.

## ACC-GST-091 shortcutReversePath

- Requirement: CAM-GST-091
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Hold Alt
  2. Draw a path
- Expected: The path direction is reversed.

## ACC-GST-092 shortcutReorder

- Requirement: CAM-GST-092
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select an item
  2. Press Ctrl+Down
- Expected: The item moves down.

## ACC-GST-093 shortcutNextResult

- Requirement: CAM-GST-093
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press F3
- Expected: Next result is selected.

## ACC-GST-094 shortcutBrowserZoom

- Requirement: CAM-GST-094
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press Ctrl+numpad +
- Expected: Text grows.

## ACC-GST-095 assignShortcut

- Requirement: CAM-GST-095
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Options > Environment > Keyboard
  2. Search a command
  3. Press the new keys
  4. Click Assign
  5. Click OK
- Expected: The key appears in Current keys and runs the command.

## ACC-GST-096 shortcutConflict

- Requirement: CAM-GST-096
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Press a taken combination
  2. Click Assign
- Expected: The old command loses the key.

## ACC-GST-097 removeShortcut

- Requirement: CAM-GST-097
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select a key in Current keys
  2. Click Remove
- Expected: The key is gone.

## ACC-GST-098 restoreShortcuts

- Requirement: CAM-GST-098
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Click Reset to Defaults
- Expected: Defaults are back.

## ACC-GST-099 envDialogStructure

- Requirement: CAM-GST-099
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Options > Environment
  2. Type in the quick filter
  3. Click an option
- Expected: Matching options show with descriptions.

## ACC-GST-100 envGeneralDisplay

- Requirement: CAM-GST-100
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open General > Display
  2. Change Language
- Expected: The GUI language changes after restart.

## ACC-GST-101 envEditingOptions

- Requirement: CAM-GST-101
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open General > Editing
- Expected: The options are listed.

## ACC-GST-102 envGeneralMisc

- Requirement: CAM-GST-102
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Editor Tab Limit to 2
  2. Open three diagrams
- Expected: The oldest tab closes.

## ACC-GST-103 envImageExport

- Requirement: CAM-GST-103
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Image Export
  2. Set Image Resolution
- Expected: Exported images follow the settings.

## ACC-GST-104 envInternalErrors

- Requirement: CAM-GST-104
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Internal Errors
- Expected: Options listed.

## ACC-GST-105 envMemorySettings

- Requirement: CAM-GST-105
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Memory Settings
- Expected: Values are editable.

## ACC-GST-106 envMergeCompare

- Requirement: CAM-GST-106
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Merge and Compare
- Expected: Options listed.

## ACC-GST-107 envNavigationOptions

- Requirement: CAM-GST-107
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Default Action for Opening Diagram from Model
  2. Double-click a diagram
- Expected: It opens in the chosen tab.

## ACC-GST-108 envSaveLoad

- Requirement: CAM-GST-108
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Save/Load
- Expected: Options listed.

## ACC-GST-109 envSpecificationOptions

- Requirement: CAM-GST-109
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Specifications
- Expected: Options listed.

## ACC-GST-110 envUsageAnalyticsOption

- Requirement: CAM-GST-110
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Usage Analytics
- Expected: Option toggles sharing.

## ACC-GST-111 envDiagramEditing

- Requirement: CAM-GST-111
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Diagram > Editing
- Expected: Options listed.

## ACC-GST-112 envDiagramDisplay

- Requirement: CAM-GST-112
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Diagram > Display
- Expected: Options listed.

## ACC-GST-113 envSymbolManipulation

- Requirement: CAM-GST-113
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set coverage to complete
  2. Drag a rectangle
- Expected: Only fully covered symbols are selected.

## ACC-GST-114 envZoomOptions

- Requirement: CAM-GST-114
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Zoom Step Size to 0.5
  2. Zoom in
- Expected: The zoom step is larger.

## ACC-GST-115 envSmartManipulators

- Requirement: CAM-GST-115
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Smart Manipulators
- Expected: Options listed.

## ACC-GST-116 envToolbarOptions

- Requirement: CAM-GST-116
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Toolbar Position to Right
- Expected: Toolbar moves.

## ACC-GST-117 envRelationMap

- Requirement: CAM-GST-117
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Relation Map
- Expected: Options listed.

## ACC-GST-118 envBrowserOptions

- Requirement: CAM-GST-118
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Browser
- Expected: Options listed.

## ACC-GST-119 envCompositionInspection

- Requirement: CAM-GST-119
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Composition Inspection
- Expected: Options listed.

## ACC-GST-120 envCollaboration

- Requirement: CAM-GST-120
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Collaboration
- Expected: Options listed.

## ACC-GST-121 envLicensing

- Requirement: CAM-GST-121
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Floating
- Expected: Options listed.

## ACC-GST-122 envNetworkProxy

- Requirement: CAM-GST-122
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Network
- Expected: Options listed.

## ACC-GST-123 envPluginsResources

- Requirement: CAM-GST-123
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Plugins
- Expected: Plugins listed.

## ACC-GST-124 envSpelling

- Requirement: CAM-GST-124
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Type a misspelled name
- Expected: The word is underlined.

## ACC-GST-125 envExperienceModes

- Requirement: CAM-GST-125
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Experience
  2. Set Context Menu Expert Mode
- Expected: Menus show complete lists.

## ACC-GST-126 envExternalTools

- Requirement: CAM-GST-126
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open External Tools
- Expected: Tools can be added.

## ACC-GST-127 envNotifications

- Requirement: CAM-GST-127
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Notifications
- Expected: Options listed.

## ACC-GST-128 envServerCertificates

- Requirement: CAM-GST-128
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Server Certificates
- Expected: Certificates listed.

## ACC-GST-129 envPluginAreas

- Requirement: CAM-GST-129
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Macros
- Expected: Group options listed.

## ACC-GST-130 perspectiveSet

- Requirement: CAM-GST-130
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148531/Customizing+and+Selecting+Perspective
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Launch first time
  2. Pick System Analyst
  3. Click OK
- Expected: Hidden features follow the role.

## ACC-GST-131 perspectiveCustomize

- Requirement: CAM-GST-131
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148532/Customizing+Perspectives
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Options > Perspectives > Customize
  2. Edit Main Menu
  3. Choose Hidden
- Expected: The item is gone.

## ACC-GST-132 perspectiveExpertToggle

- Requirement: CAM-GST-132
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148532/Customizing+Perspectives
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Clear Expert Menu Mode
- Expected: Menus shorten.

## ACC-GST-133 perspectiveSelectDialog

- Requirement: CAM-GST-133
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148533/Select+Perspective+dialog
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open the dialog
- Expected: List is shown.

## ACC-GST-134 perspectiveManage

- Requirement: CAM-GST-134
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148535/Customize+Perspectives+dialog
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Clone
  2. Rename
  3. Export
- Expected: A .umd file is written.

## ACC-GST-135 perspectiveAreaDialog

- Requirement: CAM-GST-135
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148542/Dialog+for+customizing+selected+modeling+tool+area
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Select an item
  2. Click Hidden
- Expected: Item hidden.

## ACC-GST-136 configFilesLocation

- Requirement: CAM-GST-136
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open About
  2. Click the path
- Expected: Folder opens.

## ACC-GST-137 configFilesRedirect

- Requirement: CAM-GST-137
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Create redirected.location
- Expected: Files are stored there.

## ACC-GST-138 configJavaSettings

- Requirement: CAM-GST-138
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Edit JAVA_ARGS
- Expected: Argument applies.

## ACC-GST-139 disableInboundNetwork

- Requirement: CAM-GST-139
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148545/Disabling+inbound+network+activity
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set -DDISABLEINBOUNDCON=true
  2. Start the tool
- Expected: No inbound listener.

## ACC-GST-140 usageAnalyticsOptOut

- Requirement: CAM-GST-140
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148546/Sharing+Usage+Analytics+information
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open General > Usage Analytics
  2. Clear Share Anonymous Information
- Expected: Sharing stops.

## ACC-GST-141 backgroundTaskManager

- Requirement: CAM-GST-141
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148550/Background+Task+Manager
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Start a search
  2. Click cancel
- Expected: The task stops.

## ACC-GST-142 memoryMonitor

- Requirement: CAM-GST-142
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148552/Memory+monitor
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Enable it
  2. Click Run Garbage Collector
- Expected: Memory is freed.

## ACC-GST-143 memoryAllocation

- Requirement: CAM-GST-143
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148558/Memory+allocation
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Maximum Heap Size
- Expected: New value after restart.

## ACC-GST-144 activeValidationPeriod

- Requirement: CAM-GST-144
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148559/Active+validation+period
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Active Validation Period
- Expected: Validation runs less often.

## ACC-GST-145 performanceAdvice

- Requirement: CAM-GST-145
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148549/Improving+performance
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Set Diagram Tabs Limit
- Expected: Excess tabs close.

## ACC-GST-146 reportUnresponsive

- Requirement: CAM-GST-146
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148560/Reporting+Issues
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Run submit_issue
- Expected: Dump files created.

## ACC-GST-147 internalErrorsDialog

- Requirement: CAM-GST-147
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148560/Reporting+Issues
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Trigger an error
  2. Open Internal Errors
  3. Export To File
- Expected: A log file is saved.

## ACC-GST-148 pathVariables

- Requirement: CAM-GST-148
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148573/Creating+path+variables
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Path Variables
  2. Click Add
- Expected: Variable listed.

## ACC-GST-149 launchers

- Requirement: CAM-GST-149
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148578/Launchers
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Launchers
  2. Click Add
- Expected: Extension opens in the program.

## ACC-GST-150 specialCharacters

- Requirement: CAM-GST-150
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148583/Special+characters
- Preconditions: The tool is running; the feature under test is available.
- Steps:
  1. Open Save/Load
  2. Select XML 1.1
- Expected: Names keep characters.
