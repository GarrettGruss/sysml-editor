# Diagramming acceptance scenarios

Generated from the Cameo user guide, section 006 Diagramming. Each scenario tests one requirement in `../cameo-ui-model/Diagramming.sysml` (package `CameoUI_DGM`). Scenarios 001 to 051 cover the first requirements; 052 to 114 cover the later, finer ones. Requirements 001 to 051 were deepened in place; their scenarios still check the main path.

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


## ACC-DGM-052 Open from the recent diagrams list

- Requirement: CAM-DGM-052
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams
- Preconditions: Several diagrams were opened
- Steps:
  1. Press F12
  2. Pick the third entry
- Expected: The dialog lists up to 50 diagrams newest first and the picked one opens.

## ACC-DGM-053 Invert the tab mode with Ctrl

- Requirement: CAM-DGM-053
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams
- Preconditions: Option set to reuse the active tab
- Steps:
  1. Hold Ctrl and double-click a diagram in the browser
- Expected: The diagram opens in a new tab.

## ACC-DGM-054 Drag a file onto an element

- Requirement: CAM-DGM-054
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects
- Preconditions: A file in the file system
- Steps:
  1. Drag the file onto a block in the browser
- Expected: A hyperlink to the file is added to the block.

## ACC-DGM-055 Drag an element out of a specification window

- Requirement: CAM-DGM-055
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects
- Preconditions: A class with a specification window open
- Steps:
  1. Drag a listed attribute onto an empty diagram spot
- Expected: A symbol of that element appears.

## ACC-DGM-056 Drop a signal on an activity diagram

- Requirement: CAM-DGM-056
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects
- Preconditions: An activity diagram and a signal
- Steps:
  1. Drag the signal from the browser onto the pane
- Expected: A send-signal action is created.

## ACC-DGM-057 Long drag with port display

- Requirement: CAM-DGM-057
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports
- Preconditions: A class with ports and a composite diagram
- Steps:
  1. Drag the class and hold until the tooltip shows
  2. Drop and choose Create Property Symbol and Display All Ports
- Expected: A typed property appears with all its ports.

## ACC-DGM-058 Layout options of the parts dialog

- Requirement: CAM-DGM-058
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports
- Preconditions: A composite diagram with a class owning parts
- Steps:
  1. Open Display Parts/Ports
  2. Tick Layout Parts and Left/Right ports
  3. Click OK
- Expected: Parts are shown laid out and ports sit on left and right sides.

## ACC-DGM-059 Hide all ports

- Requirement: CAM-DGM-059
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports
- Preconditions: A shape with ports shown
- Steps:
  1. Right-click the shape
  2. Choose Display > Hide All Ports
- Expected: Ports vanish from the diagram but stay in the model.

## ACC-DGM-060 Show properties of a port

- Requirement: CAM-DGM-060
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports
- Preconditions: A port whose type has properties
- Steps:
  1. Select the port
  2. Choose Display and pick the properties
- Expected: The properties show inside the port shape.

## ACC-DGM-061 Draw paths on drop

- Requirement: CAM-DGM-061
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths
- Preconditions: Option on, related elements in the model
- Steps:
  1. Drag two related elements from the browser to the pane
- Expected: Both shapes and the path between them are drawn.

## ACC-DGM-062 Copy diagram as PNG

- Requirement: CAM-DGM-062
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: A diagram with a selection
- Steps:
  1. Press Ctrl+Shift+P
  2. Paste into another application
- Expected: The selected shapes appear as a PNG image.

## ACC-DGM-063 Copy and open an element URL

- Requirement: CAM-DGM-063
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: An element in the tree
- Steps:
  1. Choose Copy URL
  2. Run Open Element from URL with it
- Expected: The element is selected in the tree.

## ACC-DGM-064 Paste as a new element

- Requirement: CAM-DGM-064
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: A shape with an owned symbol
- Steps:
  1. Copy the owned symbol
  2. Select another shape
  3. Press Ctrl+E
- Expected: A new model element appears in the target.

## ACC-DGM-065 Paste a symbol style

- Requirement: CAM-DGM-065
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: Two class symbols with different colours
- Steps:
  1. Copy the first
  2. Select the second
  3. Press Ctrl+Shift+V
- Expected: The second takes the first symbol style.

## ACC-DGM-066 Paste as overview

- Requirement: CAM-DGM-066
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects
- Preconditions: Copied shapes from diagram A
- Steps:
  1. Open diagram B
  2. Choose Edit > Paste as Diagram Overview
- Expected: An overview shape of the copied content appears.

## ACC-DGM-067 Enter full screen

- Requirement: CAM-DGM-067
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs
- Preconditions: An open diagram
- Steps:
  1. Press F11
  2. Press F11 again
- Expected: Chrome hides in full screen and returns on exit.

## ACC-DGM-068 Show owner on the tab

- Requirement: CAM-DGM-068
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs
- Preconditions: A diagram in a package
- Steps:
  1. Open Diagram Properties
  2. Set Show Owner to true
- Expected: The tab shows the owner name.

## ACC-DGM-069 Custom diagram info

- Requirement: CAM-DGM-069
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information
- Preconditions: Project options open
- Steps:
  1. Choose Custom Mode for diagram info
  2. Enter an HTML table
- Expected: The preview and the diagram show it.

## ACC-DGM-070 Abbreviated type in the frame

- Requirement: CAM-DGM-070
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame
- Preconditions: A sequence diagram
- Steps:
  1. Tick Show Abbreviated Type
- Expected: The frame header shows sd.

## ACC-DGM-071 Show a diagram as a shape

- Requirement: CAM-DGM-071
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149818/Drawing+diagram+shapes
- Preconditions: Two diagrams
- Steps:
  1. Drag diagram B onto diagram A
  2. Set Show Stereotypes to Text
- Expected: A diagram shape appears with text-only stereotype.

## ACC-DGM-072 Edit overview content

- Requirement: CAM-DGM-072
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149829/Modifying+the+content+of+a+diagram+overview+shape
- Preconditions: An overview shape
- Steps:
  1. Open Edit Compartments
  2. Move an item from Hidden to Selected
  3. Click OK
- Expected: The overview shows the added item.

## ACC-DGM-073 Banner at both ends

- Requirement: CAM-DGM-073
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners
- Preconditions: A diagram with a banner
- Steps:
  1. Set the Display value to Both
- Expected: The banner shows at top and bottom.

## ACC-DGM-074 Clone a legend item

- Requirement: CAM-DGM-074
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149854/Creating+and+managing+Legend+Items
- Preconditions: A legend with one item
- Steps:
  1. Select the item
  2. Click Clone
- Expected: A copy opens in its own specification window.

## ACC-DGM-075 Set an item icon

- Requirement: CAM-DGM-075
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149869/Specifying+Legend+Item+adornment
- Preconditions: A legend item
- Steps:
  1. Open Adornment
  2. Pick an icon and its position
- Expected: Matching symbols show the icon.

## ACC-DGM-076 Resolve conflicting legends

- Requirement: CAM-DGM-076
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149884/Avoiding+Conflicting+Legend+items
- Preconditions: Two legends colouring the same shape
- Steps:
  1. Set Priority on the items
- Expected: The higher priority adornment wins.

## ACC-DGM-077 Apply an item by condition

- Requirement: CAM-DGM-077
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items
- Preconditions: A legend item and requirements with risk
- Steps:
  1. Open Elements by Condition
  2. Create a property test risk = High
- Expected: All high-risk requirements are adorned.

## ACC-DGM-078 Adorn a table column

- Requirement: CAM-DGM-078
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items
- Preconditions: A requirements table with a legend
- Steps:
  1. Set Adorned Properties to Risk on an item
- Expected: Only the Risk cells are coloured.

## ACC-DGM-079 Extract a risk legend

- Requirement: CAM-DGM-079
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149898/Creating+Legends+automatically
- Preconditions: A requirements diagram
- Steps:
  1. Choose Extract Legends
  2. Select Risk
  3. Click Extract
- Expected: A Risk legend with one item per value appears.

## ACC-DGM-080 Suspend and disable a legend

- Requirement: CAM-DGM-080
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends
- Preconditions: An applied legend
- Steps:
  1. Toggle Suspended
  2. Set Use Legends to false
- Expected: Adornments disappear in both cases.

## ACC-DGM-081 Filter by Hide

- Requirement: CAM-DGM-081
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items
- Preconditions: A diagram with a legend
- Steps:
  1. Set preference Hide
  2. Select an item
  3. Filter
- Expected: Matching symbols are hidden and the diagram is read-only.

## ACC-DGM-082 Change type of two diagrams

- Requirement: CAM-DGM-082
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type
- Preconditions: Two class diagrams
- Steps:
  1. Select both
  2. Choose Refactor > Change Type To
  3. Pick a block definition diagram
- Expected: Both diagrams change type.

## ACC-DGM-083 Draw repeatedly with Sticky

- Requirement: CAM-DGM-083
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements
- Preconditions: A palette
- Steps:
  1. Press Z
  2. Pick a tool
  3. Click the pane three times
- Expected: Three elements of that type appear.

## ACC-DGM-084 Set vertical text position

- Requirement: CAM-DGM-084
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements
- Preconditions: A shape
- Steps:
  1. Open Symbol Properties
  2. Set Text Vertical Position to Bottom
- Expected: Text sits at the bottom.

## ACC-DGM-085 Create a relation from the context menu

- Requirement: CAM-DGM-085
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship
- Preconditions: Two elements
- Steps:
  1. Right-click the first
  2. Choose Create Relation > Outgoing and a kind
  3. Click the second
  4. Click OK
- Expected: The relationship exists.

## ACC-DGM-086 Remember split choice

- Requirement: CAM-DGM-086
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path
- Preconditions: A transition and a state
- Steps:
  1. Drop the state on the transition
  2. Click Before Transition with Remember my choice
- Expected: The next drop inserts before without asking.

## ACC-DGM-087 Hide a path compartment item

- Requirement: CAM-DGM-087
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149980/Path+compartments
- Preconditions: A path with a stereotype shown
- Steps:
  1. Right-click
  2. Edit Compartments
  3. Move the stereotype to Hidden
- Expected: The path no longer shows it.

## ACC-DGM-088 Fix an ownership problem

- Requirement: CAM-DGM-088
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar
- Preconditions: A symbol drawn red
- Steps:
  1. Click the red button
  2. Pick a fix
- Expected: The highlight clears.

## ACC-DGM-089 Edit compartments of two shapes

- Requirement: CAM-DGM-089
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149994/Displaying+or+hiding+elements+in+compartments+on+shapes
- Preconditions: Two different shapes
- Steps:
  1. Select both
  2. Edit Compartments
- Expected: The dialog lists the union of compartments.

## ACC-DGM-090 New shape keeps size

- Requirement: CAM-DGM-090
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149995/Smart+shape+sizing
- Preconditions: A wide shape
- Steps:
  1. Draw a path from the manipulator and create a target
- Expected: The new shape has the same size.

## ACC-DGM-091 Select same type

- Requirement: CAM-DGM-091
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections
- Preconditions: A diagram with several classes and notes
- Steps:
  1. Hold Alt and click one class
- Expected: All classes are selected.

## ACC-DGM-092 Set coverage project-wide

- Requirement: CAM-DGM-092
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections
- Preconditions: A diagram
- Steps:
  1. Click Complete coverage mode
  2. Rubber-band half over a shape
- Expected: The half-covered shape is not selected.

## ACC-DGM-093 Hide the zoom slider

- Requirement: CAM-DGM-093
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming
- Preconditions: Status line visible
- Steps:
  1. Choose View > Status Line > Show Diagram Zoom Slider
- Expected: The slider is hidden.

## ACC-DGM-094 Change grid size

- Requirement: CAM-DGM-094
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid
- Preconditions: Grid shown
- Steps:
  1. Set size 20
  2. Drag a shape
- Expected: It snaps to the 20 unit grid.

## ACC-DGM-095 Label consideration

- Requirement: CAM-DGM-095
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram
- Preconditions: Layout Options open
- Steps:
  1. Choose Hierarchic Layout
  2. Set Label consideration Full
  3. Run layout
- Expected: Shapes are spaced to fit labels.

## ACC-DGM-096 Rotate a label

- Requirement: CAM-DGM-096
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150021/Label+orientation
- Preconditions: A path with a label
- Steps:
  1. Click Rotate Label
- Expected: The label turns vertical.

## ACC-DGM-097 Save selected symbols as image

- Requirement: CAM-DGM-097
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog
- Preconditions: Some symbols selected
- Steps:
  1. Open Save as Image
  2. Choose Selected symbols
  3. Pick PNG
  4. Save
- Expected: A PNG of only those symbols is written.

## ACC-DGM-098 Set export properties

- Requirement: CAM-DGM-098
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150029/Properties+dialog
- Preconditions: Save As Image open
- Steps:
  1. Click Options
  2. Set resolution
  3. OK
- Expected: The export uses it.

## ACC-DGM-099 Define and set a template

- Requirement: CAM-DGM-099
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150051/Setting+diagram+as+layout+template
- Preconditions: A class with ports in a class diagram
- Steps:
  1. Place ports
  2. Choose Use as Layout Template
- Expected: The diagram shows the layoutTemplate stereotype.

## ACC-DGM-100 Apply a template to a part

- Requirement: CAM-DGM-100
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template
- Preconditions: A typed part and a template diagram
- Steps:
  1. Right-click the part
  2. Choose Display > Layout Template > Apply Template
- Expected: Ports take the template positions.

## ACC-DGM-101 Set the default template

- Requirement: CAM-DGM-101
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150065/Multiple+layout+template
- Preconditions: Two templates of one class
- Steps:
  1. Set default true on one
  2. Open the Apply list
- Expected: The default is first.

## ACC-DGM-102 Aspect bound template

- Requirement: CAM-DGM-102
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template
- Preconditions: A template with an aspect
- Steps:
  1. Apply it in a diagram with another aspect
- Expected: It is not offered.

## ACC-DGM-103 Enable aspects and ignore one

- Requirement: CAM-DGM-103
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150091/Enabling+or+disabling+diagram+aspects+option
- Preconditions: A project
- Steps:
  1. Set Use Aspects true
  2. Add an aspect to Ignored Aspects
- Expected: The ignored aspect no longer appears in lists.

## ACC-DGM-104 Apply an aspect to a diagram

- Requirement: CAM-DGM-104
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150102/Applying+or+removing+aspect+for+preexisting+diagrams
- Preconditions: A diagram
- Steps:
  1. Right-click
  2. Aspect
  3. Choose electrical
- Expected: The diagram carries the aspect.

## ACC-DGM-105 Aspect matches stereotype

- Requirement: CAM-DGM-105
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150104/How+aspects+match+with+parts+and+ports
- Preconditions: A part stereotyped electrical
- Steps:
  1. Open Display Parts/Ports in an electrical aspect diagram
  2. Use select by aspect
- Expected: Only electrical parts are ticked.

## ACC-DGM-106 Follow the rake icon

- Requirement: CAM-DGM-106
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150106/Navigation+among+aspect+diagrams
- Preconditions: A part with internal structure
- Steps:
  1. Click its rake icon
- Expected: The aspect diagram of that part opens.

## ACC-DGM-107 Resume auto-resize

- Requirement: CAM-DGM-107
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams
- Preconditions: A complete diagram
- Steps:
  1. Set Suspend Auto-Resizing to false
  2. Mark a new diagram complete
- Expected: The diagram keeps auto-resizing.

## ACC-DGM-108 Update highlighted shape

- Requirement: CAM-DGM-108
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams
- Preconditions: A complete diagram after model additions
- Steps:
  1. Select the blue shape
  2. Choose Resize to Fit Content
- Expected: The new content shows.

## ACC-DGM-109 Run complete check

- Requirement: CAM-DGM-109
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams
- Preconditions: A complete diagram with hidden content
- Steps:
  1. Choose Analyze > Check Complete Diagrams
- Expected: Warnings list the diagram.

## ACC-DGM-110 Limits exceeded

- Requirement: CAM-DGM-110
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export
- Preconditions: Image Width Limit 100
- Steps:
  1. Export a wide diagram
- Expected: It is cropped or skipped as the preference says.

## ACC-DGM-111 Build a presentation flow

- Requirement: CAM-DGM-111
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode
- Preconditions: A content diagram with three diagram shapes
- Steps:
  1. Pick Presentation Flow
  2. Connect shapes in order
- Expected: Only linked diagrams are navigable in the mode.

## ACC-DGM-112 Simulate in presentation

- Requirement: CAM-DGM-112
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode
- Preconditions: A simulation-capable diagram
- Steps:
  1. Enter the mode
  2. Run
- Expected: Simulation buttons appear at the bottom.

## ACC-DGM-113 Apply default symbol style

- Requirement: CAM-DGM-113
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar
- Preconditions: A recoloured symbol
- Steps:
  1. Click Apply Default Symbol Style
- Expected: The default style returns.

## ACC-DGM-114 Remove break points

- Requirement: CAM-DGM-114
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar
- Preconditions: A path with bends
- Steps:
  1. Click Remove Break Points
- Expected: Path returns to the straight route.
