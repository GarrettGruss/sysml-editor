package Diagramming {
    private import CameoUI::*;
    doc /* Section 000 User Guide / 006 Diagramming. Diagram creation, display, editing, layout and export. */

    // ---- Screens and commands ----
    part def DiagramToolbar :> Toolbar;
    part def CreateDiagramDialog :> Dialog { part typeSearch : Field; }
    part def SaveAsImageDialog :> Dialog { part format : Option; part scale : Option; }
    part def PrintDialog :> Dialog;
    part def CompartmentEditDialog :> Dialog;
    part def DiagramPropertiesDialog :> Dialog;
    part def SmartManipulatorToolbar :> Toolbar;
    part def LegendShape :> Shape;
    part def DiagramFrame :> Shape;
    part def DiagramOverviewShape :> Shape;
    part def DiagramBanner :> DiagramElement { attribute text : Label; attribute position : Label; }
    part def LayoutTemplate :> DiagramElement;
    part def DiagramAspect { attribute name : Label; }

    action def CreateDiagram :> Command;        // Diagrams > Create Diagram, Ctrl+N
    action def OpenDiagram :> Command;
    action def Back :> Command;
    action def Forward :> Command;
    action def SelectInContainmentTree :> Command;
    action def QuickDiagramLayout :> Command;
    action def SelectAll :> Command;            // Edit > Select All, Ctrl+A
    action def ZoomToFit :> Command;
    action def ZoomIn :> Command;
    action def ZoomOut :> Command;
    action def ShowGrid :> Command;
    action def RoutePathsRectilinearly :> Command;
    action def DisplayRelatedElements :> Command;
    action def DisplayPaths :> Command;
    action def SaveAsImage :> Command;
    action def PrintDiagram :> Command;
    action def MarkDiagramComplete :> Command;
    action def ApplyLayoutTemplate :> Command;
    action def ApplyLegend :> Command;
    action def ChangeDiagramType :> Command;
    action def DeleteSymbol :> Command;         // removes from diagram only
    action def DeleteFromModel :> Command;      // removes the element itself
    action def DragElementToDiagram :> Command;

    part def DiagramToolbarContent :> DiagramToolbar {
        part backButton : ToolbarButton { :>> invokes = Back; }
        part forwardButton : ToolbarButton { :>> invokes = Forward; }
        part selectInTreeButton : ToolbarButton { :>> invokes = SelectInContainmentTree; }
        part layoutButton : ToolbarButton { :>> invokes = QuickDiagramLayout; }
    }

    part def CompleteCoverageToggle :> ToolbarButton;
    state def GroupSelectionMode {
        entry action init;
        then state partial;
        state partial;
        state complete;
        transition first partial accept ToggleCoverage then complete;
        transition first complete accept ToggleCoverage then partial;
    }
    attribute def ToggleCoverage;

    state def LayoutTemplateCreationMode { state off; state on; }
    state def PresentationMode { state normal; state presenting; state simulating; }
    state def DiagramCompleteness { state incomplete; state complete; }

    // ---- Procedures ----
    action def CreateDiagramViaDialog {
        doc /* Page: Creating diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action selectOwner; then action invokeCreate; then action typeSearch;
        then action pickType; then action diagramOpens;
    }
    action def CreateDiagramFromBrowser {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action rightClickOwner; then action chooseCreateDiagram; then action chooseType;
    }
    action def OpenDiagramAndGoBack {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
        action openFirst; then action openSecond; then action clickBack;
    }
    action def ZoomToFitProcedure {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
        action invokeZoomToFit;
    }
    action def DrawElementFromPalette {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
        action pickTool; then action clickPane; then action typeName; then action confirm;
    }
    action def DrawRelationship {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
        action pickPathTool; then action clickSource; then action clickTarget;
    }
    action def SelectGroupOfShapes {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
        action dragRectangle; then action optionallyHoldCtrlToSwitchCoverageMode;
    }
    action def SaveDiagramAsImage {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog */
        action openDialog; then action chooseFormat; then action chooseFile; then action save;
        // TODO xref: ProjectOptions (Customizing environment)
    }
    action def ApplyLayoutTemplateToShape {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template */
        action selectShape; then action chooseTemplate; then action apply;
    }
    action def MarkComplete {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
        action markComplete; then action reviewHighlightedShapes; then action updateShapes;
    }
    action def DisplayRelated {
        doc /* Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149795/Displaying+related+elements */
        action selectShape; then action chooseDisplayRelated; then action pickRelationsAndDepth; then action confirm;
    }

    // ---- Requirements ----
    requirement <'CAM-DGM-001'> createDialog {
        doc /* A diagram can be created from a searchable dialog opened by Ctrl+N, a toolbar button or the Diagrams menu, with camel-case and partial matching of diagram type names. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
    }
    requirement <'CAM-DGM-002'> createBrowser {
        doc /* A diagram can be created from the browser context menu of a package or other element, for several selected elements at once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
    }
    requirement <'CAM-DGM-003'> openDiagram {
        doc /* A diagram opens from the browser, from a content diagram, from the Diagrams menu, with back/forward navigation within a tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-004'> lazyLoad {
        doc /* A model can be opened without loading its diagrams, or with all diagrams loaded. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-005'> dragToDiagram {
        doc /* Elements can be dragged from the browser onto a diagram to show them there. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-006'> moveDragNest {
        doc /* Dragging a shape moves it, and dropping it onto another shape nests it when the types allow. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-007'> displayParts {
        doc /* Parts and ports of a structured element can be shown or hidden using a dialog, a button or a context menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-008'> internalStruct {
        doc /* The internal structure of a selected classifier can be displayed inside its shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149791/Displaying+internal+structure+on+structured+classifiers */
    }
    requirement <'CAM-DGM-009'> relatedElements {
        doc /* Related elements of a selected shape can be displayed in one step by choosing relation kinds and depth. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149795/Displaying+related+elements */
    }
    requirement <'CAM-DGM-010'> displayPaths {
        doc /* Missing paths between selected shapes, or all paths of a shape, can be displayed, and automatically when elements are added. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
    }
    requirement <'CAM-DGM-011'> copyPaste {
        doc /* Diagram content can be copied and pasted within and between diagrams and into other applications as image. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-012'> diagramTabs {
        doc /* Diagram tabs can be split into horizontal or vertical groups, floated, show the owner, and go full screen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
    }
    requirement <'CAM-DGM-013'> diagramProps {
        doc /* A diagram has a specification window with its name, documentation and other properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149811/Specifying+diagram+properties */
    }
    requirement <'CAM-DGM-014'> styleProps {
        doc /* Diagram style properties (fonts, colours, shape defaults) can be set in a dialog per diagram or project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149813/Specifying+diagram+style+properties */
    }
    requirement <'CAM-DGM-015'> nameSync {
        doc /* A diagram name follows its context element name unless synchronization is turned off. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149815/Diagram+name+and+its+context+name+synchronization */
    }
    requirement <'CAM-DGM-016'> diagramFrame {
        doc /* The diagram frame can be hidden and its content (icons, abbreviated type) configured. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame */
    }
    requirement <'CAM-DGM-017'> banner {
        doc /* Banners with text and a position can be created, edited and removed on a diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
    }
    requirement <'CAM-DGM-018'> overview {
        doc /* A shape can show an overview of another diagram, created by drag, palette or paste, with editable content. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape */
    }
    requirement <'CAM-DGM-019'> legends {
        doc /* Legends define adornments for elements and can be created, applied, unapplied, and extracted automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends */
    }
    requirement <'CAM-DGM-020'> legendFilter {
        doc /* A diagram can be filtered to elements that match selected legend items. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items */
    }
    requirement <'CAM-DGM-021'> infoTable {
        doc /* A table with diagram information can be shown on the diagram and configured. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information */
    }
    requirement <'CAM-DGM-022'> changeType {
        doc /* A diagram's type can be changed to another compatible type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type */
    }
    requirement <'CAM-DGM-023'> drawSymbol {
        doc /* Palette tools draw new elements on the pane, several at a time, with direct naming; existing elements can be drawn again as extra symbols. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-024'> deleteSymbol {
        doc /* Deleting selected symbols removes them from the diagram only; a separate command removes the elements from the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-025'> createRelationship {
        doc /* Relationships can be drawn between shapes with a palette tool, among a selection, or from a specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
    }
    requirement <'CAM-DGM-026'> removeRelationship {
        doc /* A relationship can be removed from the diagram or from the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149965/Removing+a+relationship */
    }
    requirement <'CAM-DGM-027'> pathStyle {
        doc /* Path style (rectilinear, oblique, curved) can be changed for selected paths. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149966/Changing+a+path+style */
    }
    requirement <'CAM-DGM-028'> routePaths {
        doc /* Paths can be re-routed rectilinearly with a button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149967/Routing+paths */
    }
    requirement <'CAM-DGM-029'> roundCorners {
        doc /* Path corners can be made rounded. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149969/Making+the+paths+corners+rounded */
    }
    requirement <'CAM-DGM-030'> lineJump {
        doc /* Line jumps can be added where paths cross. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149970/Creating+line+jump */
    }
    requirement <'CAM-DGM-031'> splitPath {
        doc /* A new shape can be inserted on a path, splitting it into two relationships. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path */
    }
    requirement <'CAM-DGM-032'> smartManip {
        doc /* Smart manipulators and a toolbar offer quick creation of connected elements and ownership fixes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar */
    }
    requirement <'CAM-DGM-033'> compartmentCreate {
        doc /* Elements can be created directly in compartments of a shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149990/Creating+elements+in+compartments+on+shapes */
    }
    requirement <'CAM-DGM-034'> compartmentShow {
        doc /* Compartments can be shown or suppressed, and their listed elements chosen in a dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149991/Displaying+and+suppressing+compartments+on+shapes */
    }
    requirement <'CAM-DGM-035'> shapeSizing {
        doc /* Shapes can be resized to a preferred size automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149995/Smart+shape+sizing */
    }
    requirement <'CAM-DGM-036'> selection {
        doc /* Selection supports click, select all, select same type, shift multi-select and rubber-band with partial or complete coverage modes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
    }
    requirement <'CAM-DGM-037'> pasteImage {
        doc /* Text or images from the clipboard can be pasted onto diagrams, and images can be nested into elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150000/Copying+text+or+images+to+diagrams */
    }
    requirement <'CAM-DGM-038'> zoom {
        doc /* The diagram can be zoomed in, out, to fit, to selection and to original size, with a slider. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
    }
    requirement <'CAM-DGM-039'> grid {
        doc /* A grid can be shown, shapes and paths can snap to it, and size and style are configurable. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid */
    }
    requirement <'CAM-DGM-040'> pusher {
        doc /* A pusher and a magnet move or pull parts of the diagram to make or close space. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150012/Pusher+and+magnet */
    }
    requirement <'CAM-DGM-041'> alignTools {
        doc /* The toolbar offers align, distribute and make-same-size commands for selected shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-042'> autoLayout {
        doc /* Quick Diagram Layout arranges visible elements automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-043'> selectInTree {
        doc /* The toolbar can select the active element in the containment tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-044'> labelLayout {
        doc /* Label positions and orientation, default and per label, can be configured. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram */
    }
    requirement <'CAM-DGM-045'> saveImage {
        doc /* A diagram can be saved as an image in several formats with export options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog */
    }
    requirement <'CAM-DGM-046'> layoutTemplates {
        doc /* Layout templates can be defined from a diagram, applied to shapes, set as default, and removed. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150051/Setting+diagram+as+layout+template */
    }
    requirement <'CAM-DGM-047'> aspects {
        doc /* Diagram aspects can be enabled, ignored, created, applied to diagrams and used to filter displayed parts and ports. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150092/Specifying+or+removing+ignored+aspects */
    }
    requirement <'CAM-DGM-048'> completeDiagram {
        doc /* A diagram can be marked complete so later model additions are highlighted for review and updated on demand. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
    }
    requirement <'CAM-DGM-049'> print {
        doc /* A diagram can be printed through a dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150124/Print+dialog */
    }
    requirement <'CAM-DGM-050'> imageExportOpts {
        doc /* Project and environment options control image export (format, resolution, notifications, SVG). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export */
    }
    requirement <'CAM-DGM-051'> presentation {
        doc /* Presentation mode shows a sequence of diagrams full screen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
    }
}
