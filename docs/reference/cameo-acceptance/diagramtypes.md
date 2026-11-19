# Acceptance scenarios: 005 Diagrams (DGT)

One scenario per requirement in `docs/reference/cameo-ui-model/DiagramTypes.sysml`. Written in our own words from the Cameo user guide.

## ACC-DGT-001: offerUmlDiagramTypes

- Requirement: CAM-DGT-001
- Preconditions: A project is open.
- Steps: Open the Create Diagram dialog; read the list of types.
- Expected: All UML 2 diagram kinds are listed and can be created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149068/UML+diagrams

## ACC-DGT-002: groupViewsByArchitecture

- Requirement: CAM-DGT-002
- Preconditions: Create Diagram dialog open.
- Steps: Look for viewpoint grouping.
- Expected: Kinds are associated with a view and can be browsed by view.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149084/Architectural+views

## ACC-DGT-003: showClassAndInterfaceStructure

- Requirement: CAM-DGT-003
- Preconditions: A model with two class-like definitions related by specialization.
- Steps: Create a general diagram; add both definitions.
- Expected: Both appear with compartments and a specialization path.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149086/Class+diagram

## ACC-DGT-004: showObjectInstancesAndLinks

- Requirement: CAM-DGT-004
- Preconditions: A model with a part usage typed by a definition.
- Steps: Add the usage to a general diagram.
- Expected: The usage is drawn with its type; slots are visible.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149088/Object+diagram

## ACC-DGT-005: modelActorsAndUseCases

- Requirement: CAM-DGT-005
- Preconditions: A model with an actor and a use case.
- Steps: Create a general diagram and add them.
- Expected: Both are drawn and the association between them is shown.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149090/Use+Case+diagram

## ACC-DGT-006: modelMessagesBetweenParts

- Requirement: CAM-DGT-006
- Preconditions: A model with interacting parts.
- Steps: Create a communication diagram.
- Expected: Parts and numbered messages are drawn.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149094/Communication+diagram

## ACC-DGT-007: modelLifelinesAndMessages

- Requirement: CAM-DGT-007
- Preconditions: A model with an interaction.
- Steps: Create a sequence diagram.
- Expected: Lifelines and messages appear in time order.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149096/Sequence+diagram

## ACC-DGT-008: enableExecutionSpecMode

- Requirement: CAM-DGT-008
- Preconditions: An open sequence diagram.
- Steps: Click Enable Execution Specification Modeling.
- Expected: Activation bars become execution specifications; the mode cannot be turned off.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications

## ACC-DGT-009: dropBehaviorOnExecSpec

- Requirement: CAM-DGT-009
- Preconditions: Execution spec mode on; a behavior and an action in the tree.
- Steps: Drag the behavior onto a bar; then the action onto the same bar.
- Expected: Bar shows behavior kind, then converts to action kind.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications

## ACC-DGT-010: openBehaviorFromExecSpec

- Requirement: CAM-DGT-010
- Preconditions: A bar with a behavior set.
- Steps: Double-click the bar.
- Expected: The behavior diagram opens.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications

## ACC-DGT-011: setMethodFromMessageOperation

- Requirement: CAM-DGT-011
- Preconditions: A message between two bars; an operation with a method.
- Steps: Drag the operation to the message; open the end bar specification.
- Expected: Behavior property holds the operation method.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications

## ACC-DGT-012: anchorTimeConstraintToBar

- Requirement: CAM-DGT-012
- Preconditions: An execution specification bar.
- Steps: Draw a time constraint near the top, then another near the bottom.
- Expected: First has firstEvent true, second false.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications

## ACC-DGT-013: displayInnerStateElements

- Requirement: CAM-DGT-013
- Preconditions: A state machine with states.
- Steps: Create a state machine diagram from the state machine.
- Expected: Inner states and transitions appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149104/Working+with+State+Machine+diagram

## ACC-DGT-014: convertStateBehavior

- Requirement: CAM-DGT-014
- Preconditions: A state with an entry behavior.
- Steps: Select the behavior; choose Refactor > Convert To > Do Activity.
- Expected: The behavior becomes a do activity.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149104/Working+with+State+Machine+diagram

## ACC-DGT-015: restrictProtocolStateMachine

- Requirement: CAM-DGT-015
- Preconditions: A classifier with operations.
- Steps: Create a protocol state machine diagram.
- Expected: Only protocol transitions are offered.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149106/Protocol+State+Machine+diagram

## ACC-DGT-016: toggleBehaviorCreationMode

- Requirement: CAM-DGT-016
- Preconditions: Activity diagram open.
- Steps: Turn on Behavior Creation Mode; draw a call behavior action; type its name.
- Expected: An activity with that name exists and is its behavior.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-017: pasteListAsActions

- Requirement: CAM-DGT-017
- Preconditions: A text list of three lines copied.
- Steps: Paste on the diagram; choose Action; answer Yes to connect.
- Expected: Three actions joined by control flows.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-018: showDynamicCenterlines

- Requirement: CAM-DGT-018
- Preconditions: Activity diagram with two shapes.
- Steps: Drag a shape until centers align.
- Expected: A centerline appears; pressing C turns it off.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-019: setDiagramOrientation

- Requirement: CAM-DGT-019
- Preconditions: Activity diagram with offset shapes.
- Steps: Change Diagram Orientation in Diagram Properties.
- Expected: Paths reroute to match.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-020: cascadeDeleteInActivity

- Requirement: CAM-DGT-020
- Preconditions: An action with one symbol.
- Steps: Delete the symbol.
- Expected: The model element is removed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-021: displayInnerActivityElements

- Requirement: CAM-DGT-021
- Preconditions: An activity with actions.
- Steps: Create an Activity Diagram under the activity.
- Expected: Inner actions and flows appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram

## ACC-DGT-022: modelComponentsAndDependencies

- Requirement: CAM-DGT-022
- Preconditions: Components in a model.
- Steps: Add them to a general diagram.
- Expected: Components and dependencies are drawn.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149124/Component+diagram

## ACC-DGT-023: modelNodesAndDeployment

- Requirement: CAM-DGT-023
- Preconditions: Nodes in a model.
- Steps: Add them to a general diagram.
- Expected: Nodes and nesting are drawn.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149126/Deployment+diagram

## ACC-DGT-024: showPackageStructure

- Requirement: CAM-DGT-024
- Preconditions: A model with packages.
- Steps: Add packages to a general diagram.
- Expected: Packages and import paths appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149128/Package+diagram

## ACC-DGT-025: offerPackageRelationships

- Requirement: CAM-DGT-025
- Preconditions: Package diagram open.
- Steps: Open the palette.
- Expected: The six items appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149130/Package+diagram+elements

## ACC-DGT-026: offerProfileDiagram

- Requirement: CAM-DGT-026
- Preconditions: Expert mode on.
- Steps: Create a profile diagram.
- Expected: Stereotype tools are offered.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149140/Profile+diagram

## ACC-DGT-027: decomposeClassifierInternals

- Requirement: CAM-DGT-027
- Preconditions: A part definition with parts.
- Steps: Create an interconnection diagram for it.
- Expected: Parts, ports and connectors appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149142/Composite+Structure+diagram

## ACC-DGT-028: autoCreateDiagramContext

- Requirement: CAM-DGT-028
- Preconditions: A package selected.
- Steps: Create a composite structure diagram.
- Expected: A context class is created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context

## ACC-DGT-029: chooseContextCreationPolicy

- Requirement: CAM-DGT-029
- Preconditions: Option set to Do Not Create.
- Steps: Create the diagram on a package.
- Expected: Select Diagram Context dialog opens.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context

## ACC-DGT-030: changeDiagramContext

- Requirement: CAM-DGT-030
- Preconditions: An existing diagram.
- Steps: Open Specification; set Context.
- Expected: Diagram shows the new context.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context

## ACC-DGT-031: nestPartsThatAreAssociationEnds

- Requirement: CAM-DGT-031
- Preconditions: Composition between two classes.
- Steps: Drag one part into the other.
- Expected: The composition changes accordingly.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149146/Nesting+parts+that+are+association+ends

## ACC-DGT-032: mapPortsAutomaticallyOnTypeChange

- Requirement: CAM-DGT-032
- Preconditions: Part with ports and connectors.
- Steps: Change the part type to one with matching ports.
- Expected: Ports and connectors map automatically.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149150/Mapping+ports+on+a+Part+type+change

## ACC-DGT-033: mapPortsManually

- Requirement: CAM-DGT-033
- Preconditions: Type change with no automatic match.
- Steps: Drag a From port onto a To port; delete a line.
- Expected: Mapping created, then removed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149150/Mapping+ports+on+a+Part+type+change

## ACC-DGT-034: pasteListAsNestedParts

- Requirement: CAM-DGT-034
- Preconditions: An indented text list copied.
- Steps: Paste; choose Elements; answer Yes.
- Expected: Nested parts follow the indentation.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149156/Creating+nested+parts+by+pasting+items+from+the+list

## ACC-DGT-035: modelInteractionFlow

- Requirement: CAM-DGT-035
- Preconditions: Interactions exist.
- Steps: Create the diagram.
- Expected: Frames with interactions appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149158/Interaction+Overview+diagram

## ACC-DGT-036: createDependencyMatrix

- Requirement: CAM-DGT-036
- Preconditions: An owner selected.
- Steps: Create Diagram > Dependency Matrix.
- Expected: A matrix opens and appears in the browser.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149163/Creating+Dependency+Matrix

## ACC-DGT-037: setMatrixCriteriaFields

- Requirement: CAM-DGT-037
- Preconditions: An open matrix.
- Steps: Read the criteria area.
- Expected: All seven boxes exist.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149247/Dependency+Matrix+Criteria+area

## ACC-DGT-038: chooseMatrixElementTypes

- Requirement: CAM-DGT-038
- Preconditions: An open matrix.
- Steps: Drag a block to Row Element Type.
- Expected: The type is accepted.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria

## ACC-DGT-039: scopeMatrixByPackages

- Requirement: CAM-DGT-039
- Preconditions: Open matrix; packages in browser.
- Steps: Drag two packages with Ctrl.
- Expected: Both are in scope.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149180/Specifying+scope

## ACC-DGT-040: buildMatrixHierarchyByQuery

- Requirement: CAM-DGT-040
- Preconditions: Matrix open.
- Steps: Open Row Query; choose Structure.
- Expected: Rows show a part hierarchy.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149180/Specifying+scope

## ACC-DGT-041: chooseDependencyCriteria

- Requirement: CAM-DGT-041
- Preconditions: Matrix open.
- Steps: Open Dependency Criteria; tick Include Relationship Subtypes.
- Expected: Subtype relations appear in cells.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria

## ACC-DGT-042: chooseMatrixDirection

- Requirement: CAM-DGT-042
- Preconditions: Matrix open.
- Steps: Change Direction.
- Expected: Cells change after refresh.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria

## ACC-DGT-043: filterMatrixByRelationState

- Requirement: CAM-DGT-043
- Preconditions: Matrix with mixed relations.
- Steps: Pick Without relations; Refresh.
- Expected: Only unrelated elements appear.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria

## ACC-DGT-044: refreshMatrix

- Requirement: CAM-DGT-044
- Preconditions: Criteria changed.
- Steps: Click Refresh.
- Expected: Matrix matches criteria.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar

## ACC-DGT-045: drawCellDependencies

- Requirement: CAM-DGT-045
- Preconditions: Matrix with relations.
- Steps: Inspect a cell.
- Expected: Arrow points client to supplier.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content

## ACC-DGT-046: showCellCounts

- Requirement: CAM-DGT-046
- Preconditions: Matrix with relations.
- Steps: Read counts.
- Expected: Counts are correct.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content

## ACC-DGT-047: showCellTooltip

- Requirement: CAM-DGT-047
- Preconditions: Matrix with a related cell.
- Steps: Hover over it.
- Expected: Tooltip lists relations.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content

## ACC-DGT-048: createRelationFromCell

- Requirement: CAM-DGT-048
- Preconditions: Empty cell.
- Steps: Double-click the cell.
- Expected: Relationship exists in the model.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix

## ACC-DGT-049: createManyRelationsFromCells

- Requirement: CAM-DGT-049
- Preconditions: Matrix with unrelated pairs.
- Steps: Ctrl-select cells; choose Create New.
- Expected: All relationships are created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix

## ACC-DGT-050: deleteRelationFromCell

- Requirement: CAM-DGT-050
- Preconditions: Related cells.
- Steps: Right-click; Delete > Delete All.
- Expected: Relations are removed from model.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix

## ACC-DGT-051: navigateFromCell

- Requirement: CAM-DGT-051
- Preconditions: Related cell.
- Steps: Right-click; Navigate.
- Expected: Tree highlights relation.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149228/Navigation+from+cell

## ACC-DGT-052: sortAndShiftMatrixAxes

- Requirement: CAM-DGT-052
- Preconditions: Matrix open.
- Steps: Select rows; press Ctrl+Down.
- Expected: Rows move; sort order becomes Custom.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149231/Rearranging+rows+and+columns

## ACC-DGT-053: styleMatrixRelations

- Requirement: CAM-DGT-053
- Preconditions: Matrix open.
- Steps: Open Style dialog; set color.
- Expected: Legend shows color.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149189/Specifying+relationship+line+styles

## ACC-DGT-054: highlightMatrixViolations

- Requirement: CAM-DGT-054
- Preconditions: Invalid relation.
- Steps: Validate.
- Expected: Cell is highlighted.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149237/Validation+in+Dependency+Matrix

## ACC-DGT-055: transposeMatrix

- Requirement: CAM-DGT-055
- Preconditions: Matrix open.
- Steps: Click Change Axes.
- Expected: Axes swap.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar

## ACC-DGT-056: exportMatrixToCsv

- Requirement: CAM-DGT-056
- Preconditions: Matrix open.
- Steps: Click Export.
- Expected: CSV file written.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar

## ACC-DGT-057: removeVersusDeleteMatrixElement

- Requirement: CAM-DGT-057
- Preconditions: Row selected.
- Steps: Press Delete; then Ctrl+D on another.
- Expected: First stays in model, second removed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar

## ACC-DGT-058: offerMatrixContextMenus

- Requirement: CAM-DGT-058
- Preconditions: Matrix open.
- Steps: Right-click pane and a row.
- Expected: Both menus list commands.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149250/Dependency+Matrix+shortcut+menu

## ACC-DGT-059: createRelationMap

- Requirement: CAM-DGT-059
- Preconditions: Element selected.
- Steps: Related Elements > Create Relation Map.
- Expected: Map opens with context as root.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149264/Creating+relation+map

## ACC-DGT-060: setRelationMapCriteria

- Requirement: CAM-DGT-060
- Preconditions: Map open.
- Steps: Set depth to 2.
- Expected: Two levels expanded.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149265/Specifying+criteria+layout+and+depth

## ACC-DGT-061: changeRelationMapContext

- Requirement: CAM-DGT-061
- Preconditions: Map open.
- Steps: Drag another element in.
- Expected: It becomes the root.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149275/Changing+the+context

## ACC-DGT-062: cutRelationMapNames

- Requirement: CAM-DGT-062
- Preconditions: Long names.
- Steps: Select Cut Element Names.
- Expected: Names truncated.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149276/Cutting+element+names

## ACC-DGT-063: toggleSingleNodePerElement

- Requirement: CAM-DGT-063
- Preconditions: Element in two branches.
- Steps: Toggle option.
- Expected: Node count changes.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149278/Showing+single+node+per+element

## ACC-DGT-064: showMapElementNumbers

- Requirement: CAM-DGT-064
- Preconditions: Map open.
- Steps: Select Show Element Numbers.
- Expected: Numbers shown.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149281/Displaying+element+numbering

## ACC-DGT-065: colorMapRelations

- Requirement: CAM-DGT-065
- Preconditions: Map open.
- Steps: Edit style.
- Expected: Legend updated.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149283/Specifying+colors+and+legend

## ACC-DGT-066: collapseMapBranches

- Requirement: CAM-DGT-066
- Preconditions: Map with branches.
- Steps: Click suppress.
- Expected: Branch hidden.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-067: zoomAndPanMap

- Requirement: CAM-DGT-067
- Preconditions: Map open.
- Steps: Press Ctrl+W.
- Expected: Map fits window.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-068: hideOrDeleteMapNode

- Requirement: CAM-DGT-068
- Preconditions: Node selected.
- Steps: Press Delete.
- Expected: Hidden, still in model.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-069: restoreMapLayout

- Requirement: CAM-DGT-069
- Preconditions: Edited map.
- Steps: Click Refresh.
- Expected: Layout restored.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-070: createRelatedElementInMap

- Requirement: CAM-DGT-070
- Preconditions: Node selected.
- Steps: Press Insert.
- Expected: Related element created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-071: createSiblingWhileNaming

- Requirement: CAM-DGT-071
- Preconditions: Naming a new node.
- Steps: Press Ctrl+Enter.
- Expected: Another is created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map

## ACC-DGT-072: followRobustnessRules

- Requirement: CAM-DGT-072
- Preconditions: Diagram with the three types.
- Steps: Connect an actor to an entity.
- Expected: Rule violation is flagged.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149291/Robustness+diagram

## ACC-DGT-073: prototypeUserInterfaces

- Requirement: CAM-DGT-073
- Preconditions: Package selected.
- Steps: Create UI Modeling Diagram; drag a Frame.
- Expected: Frame appears.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149325/Working+with+User+Interface+Modeling+diagrams

## ACC-DGT-074: editUiTablesAndTrees

- Requirement: CAM-DGT-074
- Preconditions: UI table in diagram.
- Steps: Create Element > Column; use Element Numbering.
- Expected: Column added and reordered.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149332/User+Interface+Modeling

## ACC-DGT-075: saveUiPrototypeAsImage

- Requirement: CAM-DGT-075
- Preconditions: UI diagram.
- Steps: Save as image.
- Expected: Image written.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149368/Case+Studies+for+User+Interface+Modeling

## ACC-DGT-076: drawContentDiagram

- Requirement: CAM-DGT-076
- Preconditions: Project with diagrams.
- Steps: Create Content diagram.
- Expected: Diagrams listed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149389/Content+diagram

## ACC-DGT-077: drawNetworkTopology

- Requirement: CAM-DGT-077
- Preconditions: Profile enabled.
- Steps: Create Networking diagram.
- Expected: Icons available.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149392/Networking+diagram

## ACC-DGT-078: drawCorbaIdl

- Requirement: CAM-DGT-078
- Preconditions: Plugin enabled.
- Steps: Create CORBA IDL diagram.
- Expected: Patterns offered.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149392/Networking+diagram

## ACC-DGT-079: drawTimingDiagram

- Requirement: CAM-DGT-079
- Preconditions: Plugin enabled.
- Steps: Create Time diagram.
- Expected: Time shapes offered.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149399/Time+diagram

## ACC-DGT-080: drawFreeFormShapes

- Requirement: CAM-DGT-080
- Preconditions: Project open.
- Steps: Create Free Form diagram.
- Expected: Shapes can be drawn.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149407/Free+Form+diagram

## ACC-DGT-081: composeTableAreas

- Requirement: CAM-DGT-081
- Preconditions: A table open.
- Steps: Inspect layout.
- Expected: Five areas present.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149409/Tables

## ACC-DGT-082: offerTableToolbars

- Requirement: CAM-DGT-082
- Preconditions: A table open.
- Steps: Open each toolbar.
- Expected: Commands listed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149424/Table+toolbars

## ACC-DGT-083: specifyTableScope

- Requirement: CAM-DGT-083
- Preconditions: Table open.
- Steps: Drag package to Scope.
- Expected: Elements listed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149510/Specifying+the+scope+for+the+table

## ACC-DGT-084: collectRowsByExpression

- Requirement: CAM-DGT-084
- Preconditions: Table open.
- Steps: Query > Custom.
- Expected: Rows follow expression.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149510/Specifying+the+scope+for+the+table

## ACC-DGT-085: editCellsIntoModel

- Requirement: CAM-DGT-085
- Preconditions: Table with editable cell.
- Steps: Double-click; type; Enter.
- Expected: Model updated.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells

## ACC-DGT-086: selectTableRegions

- Requirement: CAM-DGT-086
- Preconditions: Table open.
- Steps: Click row number.
- Expected: Row selected.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells

## ACC-DGT-087: openSpecFromCell

- Requirement: CAM-DGT-087
- Preconditions: Table open.
- Steps: Right-click cell > Specification.
- Expected: Window opens.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells

## ACC-DGT-088: clearCellValues

- Requirement: CAM-DGT-088
- Preconditions: Table with values.
- Steps: Select; Delete.
- Expected: Values empty.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells

## ACC-DGT-089: moveBetweenCellsByKeys

- Requirement: CAM-DGT-089
- Preconditions: Cell selected.
- Steps: Press Tab.
- Expected: Right cell active.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells

## ACC-DGT-090: manageTableColumns

- Requirement: CAM-DGT-090
- Preconditions: Table open.
- Steps: Columns > untick one.
- Expected: Column disappears.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns

## ACC-DGT-091: defineCustomColumns

- Requirement: CAM-DGT-091
- Preconditions: Table open.
- Steps: Columns > New Custom Column.
- Expected: Column appears.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns

## ACC-DGT-092: showDetailedColumnNames

- Requirement: CAM-DGT-092
- Preconditions: Same-name columns.
- Steps: Select Show Detailed Column Name.
- Expected: Headers disambiguated.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns

## ACC-DGT-093: addTableRows

- Requirement: CAM-DGT-093
- Preconditions: Generic table.
- Steps: Add New.
- Expected: Element and row exist.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149551/Adding+and+removing+rows

## ACC-DGT-094: removeRowVersusDelete

- Requirement: CAM-DGT-094
- Preconditions: Row selected.
- Steps: Ctrl+Delete.
- Expected: Element kept.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149551/Adding+and+removing+rows

## ACC-DGT-095: sortTableRows

- Requirement: CAM-DGT-095
- Preconditions: Table open.
- Steps: Click header; Ctrl-click second.
- Expected: Rows sorted by both.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149562/Organizing+rows

## ACC-DGT-096: moveTableRows

- Requirement: CAM-DGT-096
- Preconditions: Row selected.
- Steps: Ctrl+Up.
- Expected: Row moves.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149562/Organizing+rows

## ACC-DGT-097: toggleElementNumbers

- Requirement: CAM-DGT-097
- Preconditions: Table open.
- Steps: Set to false.
- Expected: Numbers hidden.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149566/Displaying+hiding+element+numbers+in+a+row

## ACC-DGT-098: showTableHierarchy

- Requirement: CAM-DGT-098
- Preconditions: Hierarchical rows.
- Steps: Pick Compact tree.
- Expected: Common owners grouped.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149569/Displaying+row+elements+hierarchically

## ACC-DGT-099: addNestedRequirement

- Requirement: CAM-DGT-099
- Preconditions: Requirement selected.
- Steps: Add Nested.
- Expected: Child requirement exists.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149584/Nesting+additional+elements+in+a+hierarchical+table

## ACC-DGT-100: pasteExternalTableData

- Requirement: CAM-DGT-100
- Preconditions: Copied sheet.
- Steps: Ctrl+V.
- Expected: Elements created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149593/Copying+and+pasting+data

## ACC-DGT-101: copyTableDataOut

- Requirement: CAM-DGT-101
- Preconditions: Cells selected.
- Steps: Ctrl+C elsewhere Ctrl+V.
- Expected: Values pasted.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149593/Copying+and+pasting+data

## ACC-DGT-102: filterTableRows

- Requirement: CAM-DGT-102
- Preconditions: Table open.
- Steps: Type *dd.
- Expected: Matching rows.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149597/Filtering+table+data

## ACC-DGT-103: keepFilterOnReload

- Requirement: CAM-DGT-103
- Preconditions: Filter set.
- Steps: Enable option; reload.
- Expected: Filter retained.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149607/Saving+the+filter+criteria

## ACC-DGT-104: exportTableToFile

- Requirement: CAM-DGT-104
- Preconditions: Table open.
- Steps: Export; choose CSV.
- Expected: File written.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149609/Exporting+table

## ACC-DGT-105: createGenericTable

- Requirement: CAM-DGT-105
- Preconditions: Owner selected.
- Steps: Create Diagram > Generic Table.
- Expected: Table opens.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table

## ACC-DGT-106: useGenericTableWizard

- Requirement: CAM-DGT-106
- Preconditions: Project open.
- Steps: Run the wizard.
- Expected: Filled table.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table

## ACC-DGT-107: changeGenericElementTypes

- Requirement: CAM-DGT-107
- Preconditions: Table open.
- Steps: Untick a type.
- Expected: Columns removed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149632/Adding+or+removing+element+types

## ACC-DGT-108: fillGenericFromModel

- Requirement: CAM-DGT-108
- Preconditions: Table with type.
- Steps: Drag package.
- Expected: Contents listed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149642/Filling+the+table+with+elements

## ACC-DGT-109: addGlossaryTerms

- Requirement: CAM-DGT-109
- Preconditions: Glossary table.
- Steps: Select word; Add To glossary.
- Expected: Term row added.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149655/Adding+terms+in+the+Glossary+Table

## ACC-DGT-110: insertGlossaryTerms

- Requirement: CAM-DGT-110
- Preconditions: Glossary exists.
- Steps: Ctrl+Space.
- Expected: Term inserted.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149660/Using+terms+in+your+model

## ACC-DGT-111: specifyInstanceClassifier

- Requirement: CAM-DGT-111
- Preconditions: Instance table.
- Steps: Set classifier.
- Expected: Columns follow attributes.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149683/Specifying+the+classifier

## ACC-DGT-112: chooseInstanceColumns

- Requirement: CAM-DGT-112
- Preconditions: Classifier set.
- Steps: Columns > Select Columns.
- Expected: Columns shown.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149685/Selecting+columns+to+display

## ACC-DGT-113: createInstancesInTable

- Requirement: CAM-DGT-113
- Preconditions: Classifier set.
- Steps: Create > Create with Parts.
- Expected: Instance with parts.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149690/Filling+the+table+with+instances

## ACC-DGT-114: setInstanceSlotValues

- Requirement: CAM-DGT-114
- Preconditions: Slot cell.
- Steps: Create Instance Specification.
- Expected: Instance created.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149694/Specifying+instances+as+slot+values

## ACC-DGT-115: createMetricTable

- Requirement: CAM-DGT-115
- Preconditions: Package selected.
- Steps: Tools > Metrics.
- Expected: Table filled.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149714/Creating+a+Metric+Table

## ACC-DGT-116: calculateMetrics

- Requirement: CAM-DGT-116
- Preconditions: Metric table.
- Steps: Calculate New Metric.
- Expected: New row below.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149724/Calculating+metrics+in+the+Metric+Table

## ACC-DGT-117: linkExcelOrCsvFile

- Requirement: CAM-DGT-117
- Preconditions: Table with mapping.
- Steps: Excel/CSV Sync > Select File.
- Expected: Linked.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149735/Sync+with+Excel+or+CSV+files

## ACC-DGT-118: readAndWriteSyncedFile

- Requirement: CAM-DGT-118
- Preconditions: Linked table.
- Steps: Read from File.
- Expected: Model updated.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149745/Excel+and+CSV+Sync+Options+dialog

## ACC-DGT-119: loadTablePartially

- Requirement: CAM-DGT-119
- Preconditions: Large table.
- Steps: Set Enabled.
- Expected: Only visible rows computed.
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149756/Partial+loading+in+tables

