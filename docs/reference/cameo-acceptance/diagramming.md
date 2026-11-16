# Diagramming acceptance scenarios

Generated from the Cameo user guide, section 006 Diagramming. Each scenario tests one requirement in `../cameo-ui-model/Diagramming.sysml`.

## ACC-DGM-001 Create a diagram via the creation dialog

- Requirement: CAM-DGM-001
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams
- Preconditions: A project with a package
- Steps:
  1. Select the package in the model browser
  2. Press Ctrl+N
  3. Type 'ibd' in the box
  4. Pick the offered diagram type
- Expected: A diagram of that type is created under the package and opens.

## ACC-DGM-002 Create a diagram from the model browser

- Requirement: CAM-DGM-002
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams
- Preconditions: A project with a package
- Steps:
  1. Right-click the package
  2. Choose Create Diagram, then a type
- Expected: The diagram appears under the package.

## ACC-DGM-003 Open a diagram and navigate back

- Requirement: CAM-DGM-003
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams
- Preconditions: Two diagrams exist
- Steps:
  1. Double-click diagram A in the browser
  2. Open diagram B in the same tab
  3. Click Back
- Expected: Diagram A is shown again; Forward returns to B.

## ACC-DGM-004 Open a project without loading diagrams

- Requirement: CAM-DGM-004
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams
- Preconditions: A large project
- Steps:
  1. Open the project with the no-diagrams option
  2. Open one diagram
- Expected: Only the opened diagram loads.

## ACC-DGM-005 Drag an element onto a diagram

- Requirement: CAM-DGM-005
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects
- Preconditions: Open diagram; element in browser
- Steps:
  1. Drag the element from the browser to the canvas
- Expected: A symbol of the element appears at the drop point.

## ACC-DGM-006 Nest a shape by dragging

- Requirement: CAM-DGM-006
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects
- Preconditions: Two shapes
- Steps:
  1. Drag shape A onto shape B
- Expected: A is nested in B and the model ownership updates.

## ACC-DGM-007 Show ports on a shape

- Requirement: CAM-DGM-007
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports
- Preconditions: A part with ports in an interconnection diagram
- Steps:
  1. Select the shape
  2. Open Display Parts/Ports
  3. Tick ports
- Expected: Ports are drawn on the shape border.

## ACC-DGM-008 Show internal structure

- Requirement: CAM-DGM-008
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149791/Displaying+internal+structure+on+structured+classifiers
- Preconditions: A part def with parts
- Steps:
  1. Select the part def shape
  2. Choose Display Internal Structure
- Expected: Nested parts and connections appear inside.

## ACC-DGM-009 Display related elements

- Requirement: CAM-DGM-009
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149795/Displaying+related+elements
- Preconditions: A shape with relations
- Steps:
  1. Select the shape
  2. Choose Display Related Elements
  3. Pick relation types
  4. Confirm
- Expected: Related shapes and paths are added.

## ACC-DGM-010 Display paths among selected shapes

- Requirement: CAM-DGM-010
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths
- Preconditions: Shapes with hidden relations
- Steps:
  1. Select two shapes
  2. Choose Display Paths
- Expected: Existing relations are drawn.

## ACC-DGM-011 Copy shapes to another diagram

- Requirement: CAM-DGM-011
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: Two open diagrams
- Steps:
  1. Select shapes in A
  2. Ctrl+C
  3. Open B
  4. Ctrl+V
- Expected: Symbols of the same elements appear in B.

## ACC-DGM-012 Split diagram tabs

- Requirement: CAM-DGM-012
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs
- Preconditions: Two diagrams open
- Steps:
  1. Use the split command
  2. Drag a tab to the new group
- Expected: The two diagrams are side by side.

## ACC-DGM-013 Edit diagram documentation

- Requirement: CAM-DGM-013
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149811/Specifying+diagram+properties
- Preconditions: An open diagram
- Steps:
  1. Open the diagram specification
  2. Edit documentation
  3. Close
- Expected: The change is stored.

## ACC-DGM-014 Change default shape fill

- Requirement: CAM-DGM-014
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149813/Specifying+diagram+style+properties
- Preconditions: An open diagram
- Steps:
  1. Open Diagram Properties
  2. Change a fill colour
  3. Apply
- Expected: Shapes use the new fill.

## ACC-DGM-015 Turn off name synchronization

- Requirement: CAM-DGM-015
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149815/Diagram+name+and+its+context+name+synchronization
- Preconditions: A diagram named after its owner
- Steps:
  1. Disable synchronization
  2. Rename the owner
- Expected: The diagram name is unchanged.

## ACC-DGM-016 Hide the diagram frame

- Requirement: CAM-DGM-016
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame
- Preconditions: A diagram with a frame
- Steps:
  1. Use the frame property to hide it
- Expected: The frame disappears.

## ACC-DGM-017 Add a banner

- Requirement: CAM-DGM-017
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners
- Preconditions: An open diagram
- Steps:
  1. Open the banner command
  2. Enter text, choose position
  3. Confirm
- Expected: The banner is shown.

## ACC-DGM-018 Create an overview shape

- Requirement: CAM-DGM-018
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape
- Preconditions: Two diagrams
- Steps:
  1. Drag diagram B onto A
- Expected: A shows a miniature of B.

## ACC-DGM-019 Apply a legend

- Requirement: CAM-DGM-019
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends
- Preconditions: A diagram and a legend
- Steps:
  1. Select Apply Legend
  2. Choose the legend
- Expected: Matching symbols are adorned.

## ACC-DGM-020 Filter by legend item

- Requirement: CAM-DGM-020
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items
- Preconditions: A diagram with an applied legend
- Steps:
  1. Select a legend item
  2. Choose Filter
- Expected: Only matching shapes remain visible.

## ACC-DGM-021 Show diagram info table

- Requirement: CAM-DGM-021
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information
- Preconditions: An open diagram
- Steps:
  1. Enable the table
  2. Select the fields
- Expected: The table appears.

## ACC-DGM-022 Change diagram type

- Requirement: CAM-DGM-022
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type
- Preconditions: A diagram
- Steps:
  1. Choose Change Type
  2. Pick a target
- Expected: Diagram redisplays as the new type.

## ACC-DGM-023 Draw an element from the palette

- Requirement: CAM-DGM-023
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements
- Preconditions: Open diagram
- Steps:
  1. Click a palette tool
  2. Click on the canvas
  3. Type the name
  4. Press Enter
- Expected: The element exists in the model and on the diagram.

## ACC-DGM-024 Delete a symbol versus an element

- Requirement: CAM-DGM-024
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements
- Preconditions: A diagram with a shape
- Steps:
  1. Select shape
  2. Press Delete
  3. Choose Delete from Model on another
- Expected: The first only leaves the diagram; the second is removed from the SysML text.

## ACC-DGM-025 Draw a relationship

- Requirement: CAM-DGM-025
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship
- Preconditions: Two shapes
- Steps:
  1. Choose a relationship tool
  2. Click source then target
- Expected: A path appears and the model has the relationship.

## ACC-DGM-026 Remove a relationship from the model

- Requirement: CAM-DGM-026
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149965/Removing+a+relationship
- Preconditions: A path on a diagram
- Steps:
  1. Select path
  2. Choose Delete from Model
- Expected: The relationship is gone from model and diagram.

## ACC-DGM-027 Change path style

- Requirement: CAM-DGM-027
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149966/Changing+a+path+style
- Preconditions: A path
- Steps:
  1. Select path
  2. Choose style
- Expected: Route changes.

## ACC-DGM-028 Route paths rectilinearly

- Requirement: CAM-DGM-028
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149967/Routing+paths
- Preconditions: Diagonal paths
- Steps:
  1. Select paths
  2. Click Route Paths Rectilinearly
- Expected: Paths use right angles.

## ACC-DGM-029 Round path corners

- Requirement: CAM-DGM-029
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149969/Making+the+paths+corners+rounded
- Preconditions: A rectilinear path
- Steps:
  1. Enable rounded corners
- Expected: Corners are rounded.

## ACC-DGM-030 Add line jumps

- Requirement: CAM-DGM-030
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149970/Creating+line+jump
- Preconditions: Two crossing paths
- Steps:
  1. Enable line jumps
- Expected: A hop is drawn at the crossing.

## ACC-DGM-031 Insert a shape on a path

- Requirement: CAM-DGM-031
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path
- Preconditions: A path
- Steps:
  1. Drag a palette shape onto the path
- Expected: Two paths connect through the new shape.

## ACC-DGM-032 Create a connected element

- Requirement: CAM-DGM-032
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar
- Preconditions: A shape
- Steps:
  1. Click a smart manipulator
  2. Choose a kind
- Expected: A new shape connected to the first appears.

## ACC-DGM-033 Create an element in a compartment

- Requirement: CAM-DGM-033
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149990/Creating+elements+in+compartments+on+shapes
- Preconditions: A part def shape
- Steps:
  1. Use the compartment add action
  2. Type a name
- Expected: A child element is added to the owner.

## ACC-DGM-034 Hide a compartment

- Requirement: CAM-DGM-034
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149991/Displaying+and+suppressing+compartments+on+shapes
- Preconditions: A shape with attributes
- Steps:
  1. Open the compartment menu
  2. Suppress attributes
- Expected: The compartment is hidden.

## ACC-DGM-035 Resize to preferred size

- Requirement: CAM-DGM-035
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149995/Smart+shape+sizing
- Preconditions: A shape with long text
- Steps:
  1. Select
  2. Choose Resize to Preferred Size
- Expected: The shape fits its content.

## ACC-DGM-036 Select all shapes of a type

- Requirement: CAM-DGM-036
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections
- Preconditions: A diagram with mixed shapes
- Steps:
  1. Alt-click a shape
- Expected: All shapes of that type are selected.

## ACC-DGM-037 Paste an image

- Requirement: CAM-DGM-037
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150000/Copying+text+or+images+to+diagrams
- Preconditions: An image on the clipboard
- Steps:
  1. Press Ctrl+V on the canvas
- Expected: An image shape appears.

## ACC-DGM-038 Zoom to fit

- Requirement: CAM-DGM-038
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming
- Preconditions: A large diagram
- Steps:
  1. Use Zoom To Fit
- Expected: The entire diagram is visible.

## ACC-DGM-039 Snap to grid

- Requirement: CAM-DGM-039
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid
- Preconditions: Grid enabled
- Steps:
  1. Drag a shape
- Expected: The shape aligns to gridlines.

## ACC-DGM-040 Push a fragment

- Requirement: CAM-DGM-040
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150012/Pusher+and+magnet
- Preconditions: A diagram
- Steps:
  1. Use the pusher tool
  2. Drag
- Expected: Shapes below move away.

## ACC-DGM-041 Align shapes left

- Requirement: CAM-DGM-041
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar
- Preconditions: Three shapes
- Steps:
  1. Select
  2. Click Align Left
- Expected: Left edges match.

## ACC-DGM-042 Quick layout

- Requirement: CAM-DGM-042
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar
- Preconditions: A diagram
- Steps:
  1. Click Auto-layout
- Expected: Shapes are arranged without overlap.

## ACC-DGM-043 Select in containment tree

- Requirement: CAM-DGM-043
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar
- Preconditions: A shape selected
- Steps:
  1. Click Select in Containment Tree
- Expected: The tree highlights the element.

## ACC-DGM-044 Rotate a label

- Requirement: CAM-DGM-044
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram
- Preconditions: A path with a label
- Steps:
  1. Choose label orientation
- Expected: The label is rotated.

## ACC-DGM-045 Save as image

- Requirement: CAM-DGM-045
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog
- Preconditions: An open diagram
- Steps:
  1. Open Save As Image
  2. Pick format and file
  3. Save
- Expected: The file is written.

## ACC-DGM-046 Apply a layout template

- Requirement: CAM-DGM-046
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150051/Setting+diagram+as+layout+template
- Preconditions: A template diagram
- Steps:
  1. Select shape
  2. Apply template
- Expected: Contents are arranged per the template.

## ACC-DGM-047 Apply an aspect

- Requirement: CAM-DGM-047
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150092/Specifying+or+removing+ignored+aspects
- Preconditions: Aspects enabled
- Steps:
  1. Open the diagram
  2. Apply the aspect
- Expected: Parts and ports shown per aspect.

## ACC-DGM-048 Mark complete

- Requirement: CAM-DGM-048
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams
- Preconditions: A diagram
- Steps:
  1. Mark as complete
  2. Add a model element
- Expected: The diagram flags the new element.

## ACC-DGM-049 Print a diagram

- Requirement: CAM-DGM-049
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150124/Print+dialog
- Preconditions: An open diagram
- Steps:
  1. Open Print
  2. Confirm
- Expected: A print job is sent.

## ACC-DGM-050 Set export options

- Requirement: CAM-DGM-050
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export
- Preconditions: Project open
- Steps:
  1. Open options
  2. Set resolution
- Expected: Exports use it.

## ACC-DGM-051 Run presentation

- Requirement: CAM-DGM-051
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode
- Preconditions: A sequence of diagrams
- Steps:
  1. Create the sequence
  2. Enter Presentation Mode
- Expected: Diagrams show in order.

