package CameoUI_DGM {
    private import CameoUI::*;
    private import ScalarValues::*;
    doc /* Section 000 User Guide / 006 Diagramming. Diagram creation, display, editing, layout and export. Written by hand; see README.md. */

    // ---- Screens and commands ----
    part def DiagramToolbar :> Toolbar;
    part def CreateDiagramDialog :> Dialog { part typeSearch : Field; }
    part def RecentDiagramsDialog :> Dialog;
    part def DisplayPartsPortsDialog :> Dialog { part elementTree : Field; part layoutOptions : Option; }
    part def DisplayRelatedElementsDialog :> Dialog { part relations : Field; part direction : Option; part scope : Option; part depth : Option; }
    part def SaveAsImageDialog :> Dialog { part format : Option; part scale : Option; part overwrite : Option; }
    part def ImageExportPropertiesDialog :> Dialog;
    part def PrintDialog :> Dialog;
    part def CompartmentEditDialog :> Dialog;
    part def DiagramPropertiesDialog :> Dialog;
    part def SymbolPropertiesDialog :> Dialog;
    part def ExtractLegendsDialog :> Dialog;
    part def SplitTransitionDialog :> Dialog;
    part def SmartManipulatorToolbar :> Toolbar;
    part def LegendShape :> Shape;
    part def LegendItem { attribute name : Label; attribute priority : Integer; }
    part def DiagramFrame :> Shape;
    part def DiagramOverviewShape :> Shape;
    part def DiagramBanner :> DiagramElement { attribute text : Label; attribute position : Label; }
    part def LayoutTemplate :> DiagramElement;
    part def DiagramAspect { attribute name : Label; }

    action def CreateDiagram :> Command;        // Diagrams > Create Diagram, Ctrl+N
    action def OpenDiagram :> Command;
    action def Back :> Command;                 // Alt+Left
    action def Forward :> Command;              // Alt+Right
    action def SelectInContainmentTree :> Command;   // Alt+B
    action def QuickDiagramLayout :> Command;
    action def SelectAll :> Command;            // Edit > Select All, Ctrl+A
    action def ZoomToFit :> Command;            // Ctrl+W
    action def ZoomIn :> Command;
    action def ZoomOut :> Command;
    action def ZoomToSelection :> Command;
    action def ZoomOneToOne :> Command;
    action def ShowGrid :> Command;
    action def RoutePathsRectilinearly :> Command;
    action def DisplayRelatedElements :> Command;
    action def DisplayInBetweenPaths :> Command;
    action def DisplayAllPaths :> Command;
    action def SaveAsImage :> Command;
    action def PrintDiagram :> Command;         // Ctrl+P
    action def MarkDiagramComplete :> Command;
    action def ApplyLayoutTemplate :> Command;
    action def ApplyLegend :> Command;
    action def ChangeDiagramType :> Command;
    action def DeleteSymbol :> Command;         // removes from diagram only, Delete key
    action def DeleteFromModel :> Command;      // removes the element itself, Ctrl+D
    action def DragElementToDiagram :> Command;
    action def CopyAsImage :> Command;
    action def PasteStyle :> Command;           // Ctrl+Shift+V
    action def PasteWithNewElement :> Command;  // Ctrl+E
    action def EnterPresentationMode :> Command;

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

    state def LayoutTemplateCreationMode { state usage; state definition; }
    state def PresentationMode { state normal; state presenting; state simulating; }
    state def DiagramCompleteness { state incomplete; state complete; }
    state def FilterPreference { state showMatching; state hideMatching; }
    state def LegendState { state active; state suspended; state disabled; state unapplied; }
    state def WindowMode { state tabbed; state floating; state fullScreen; }

    // ---- Procedures ----
    action def CreateDiagramViaDialog {
        doc /* Page: Creating diagrams: diagram creation dialog. Step 2 is one of Ctrl+N, main toolbar button, Diagrams > Create Diagram, or the Create Diagram button on the Content diagram palette. Step 3 accepts camel-case initials, lower case, no separators, or partial text. Esc or a click outside cancels. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action selectOwnerInBrowser;
        then action openCreateDialog;
        then action typeTypeSearch;
        then action pickDiagramType;
        then action diagramOpens;
    }
    action def CreateDiagramFromBrowser {
        doc /* Page: Creating diagrams: from the model browser. The owner may be a package, profile, model or other element; Shift-select several owners to create one diagram in each. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action rightClickOwner;
        then action chooseCreateDiagram;
        then action chooseType;
    }
    action def CreateDiagramFromSpecification {
        doc /* Page: Creating diagrams: from the specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action openInnerElementsGroup;
        then action clickCreate;
        then action chooseCreateDiagramAndType;
        then action typeDiagramName;
        then action closeWindow;
    }
    action def CreateDiagramViaWizard {
        doc /* Page: Creating diagrams: diagram creation wizard. Entry points: Diagrams > Diagram Wizards, or Analyze > Model Visualizer then Start. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
        action openDiagramWizards;
        then action selectWizard;
        then action followWizardSteps;
    }
    action def OpenDiagramAndGoBack {
        doc /* Page: Opening diagrams: navigate within a tab. Alt+Left and Alt+Right replace the toolbar buttons. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
        action openFirstDiagram;
        then action openSecondDiagramInSameTab;
        then action clickBack;
        then action clickForward;
    }
    action def OpenDiagramInNewTab {
        doc /* Page: Opening diagrams: new tab. Alternatively Ctrl+Enter opens over the active tab; Ctrl while opening inverts the default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
        action selectDiagramInBrowser;
        then action chooseOpenInNewTab;
    }
    action def OpenRecentDiagram {
        doc /* Page: Opening diagrams: recently opened dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
        action pressF12;
        then action pickDiagram;
        then action confirmOpen;
    }
    action def OpenModelWithoutDiagrams {
        doc /* Page: Opening diagrams: model without loading diagrams. Set the diagram loading mode to no diagrams, or to all diagrams, in the launcher properties file. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
        action openLauncherProperties;
        then action addNoDiagramsLoadingArgument;
        then action startTool;
    }
    action def ZoomToFitProcedure {
        doc /* Page: Zooming: fit the diagram. View > Fit in Window (Ctrl+W), the status-line Fit icon, or the Zoom tab button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
        action invokeZoomToFit;
    }
    action def ZoomToSelectionProcedure {
        doc /* Page: Zooming: selection at maximum size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
        action selectShapes;
        then action invokeZoomToSelection;
    }
    action def DisplayPartsAndPorts {
        doc /* Page: Displaying parts and ports: dialog. Step 3 uses the element tree (shift-click ticks nested elements) or the context panel (Select Properties, Select Ports, Select All, Clear All). Inactive tick boxes are shapes already shown. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
        action openDisplayPartsPortsDialog;
        then action toggleOptionalInfo;
        then action tickProperties;
        then action setLayoutOptions;
        then action clickOk;
    }
    action def HideAllPorts {
        doc /* Page: Displaying parts and ports: hide ports. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
        action selectShapesOrPane;
        then action chooseDisplayHideAllPorts;
    }
    action def DisplayPortsWithManipulator {
        doc /* Page: Displaying parts and ports: smart manipulator. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
        action selectShapeOrFrame;
        then action clickDisplayAllPorts;
    }
    action def DropClassAsProperty {
        doc /* Page: Displaying parts and ports: drag a class. A plain drop creates a typed property; the long-drag menu adds all ports. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
        action dragClassFromBrowser;
        then action holdUntilTooltipOptional;
        then action dropOnPane;
        then action chooseCreatePropertySymbolOption;
    }
    action def DisplayInternalStructure {
        doc /* Page: Displaying internal structure. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149791/Displaying+internal+structure+on+structured+classifiers */
        action selectClassifierShape;
        then action chooseDisplayInternalStructure;
        then action chooseClassifierName;
        then action pickDiagram;
    }
    action def DisplayRelated {
        doc /* Page: Displaying related elements. Entry points: shortcut Display group, toolbar Display button, Analyze menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149795/Displaying+related+elements */
        action selectShapesOrFrame;
        then action chooseDisplayRelatedElements;
        then action pickRelationKinds;
        then action pickDirection;
        then action pickScope;
        then action pickDepth;
        then action setCreateNewSymbolsOption;
        then action setLayoutOption;
        then action clickOk;
    }
    action def DisplayInBetweenPathsSteps {
        doc /* Page: Displaying paths: in-between. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
        action selectTwoOrMoreShapes;
        then action chooseDisplayInBetweenPaths;
    }
    action def DisplayAllPathsSteps {
        doc /* Page: Displaying paths: all paths of shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
        action selectShapes;
        then action chooseDisplayAllPaths;
    }
    action def DisplayPathsOnDrop {
        doc /* Page: Displaying paths: on drop. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
        action openEnvironmentOptions;
        then action setDisplayPathsOnElementDropTrue;
        then action clickOk;
        then action dragElementsToPane;
    }
    action def SplitDiagramGroup {
        doc /* Page: Using diagram tabs: split. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
        action openTabContextMenu;
        then action chooseNewHorizontalOrVerticalGroup;
    }
    action def EnterDiagramFullScreen {
        doc /* Page: Using diagram tabs: full screen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
        action pressF11OrChooseShowTabsInFullScreen;
        then action useAutoHiddenBrowser;
        then action leaveFullScreenTheSameWay;
    }
    action def ShowDiagramOwnerOnTab {
        doc /* Page: Using diagram tabs: owner on the tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
        action openDiagramProperties;
        then action setShowOwnerTrue;
    }
    action def HideDiagramFrame {
        doc /* Page: Diagram frame: hide. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame */
        action openDiagramContextMenu;
        then action clearShowDiagramFrame;
    }
    action def ShowAbbreviatedFrameType {
        doc /* Page: Diagram frame: abbreviated type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame */
        action openDiagramProperties;
        then action tickShowAbbreviatedType;
    }
    action def CreateOverviewByDrag {
        doc /* Page: Creating a diagram overview shape: by drag. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape */
        action openTargetDiagram;
        then action selectDiagramInBrowser;
        then action dragToPane;
        then action switchOnOverviewContent;
    }
    action def CreateOverviewFromPalette {
        doc /* Page: Creating a diagram overview shape: palette. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape */
        action clickDiagramOverviewTool;
        then action pickDiagramInSelectDialog;
        then action clickFreeSpace;
    }
    action def CreateOverviewByPaste {
        doc /* Page: Creating a diagram overview shape: paste. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape */
        action copyShapes;
        then action openTargetDiagram;
        then action chooseEditPasteAsOverview;
    }
    action def EditOverviewContent {
        doc /* Page: Modifying overview content. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149829/Modifying+the+content+of+a+diagram+overview+shape */
        action openEditCompartments;
        then action moveItemsBetweenHiddenAndSelected;
        then action clickOk;
    }
    action def CreateBanner {
        doc /* Page: Diagram banners: create. Positions: header (default), footer, both, none. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
        action applyBannerStereotype;
        then action openDiagramSpecification;
        then action openTagsGroup;
        then action createTextValue;
        then action typeBannerText;
        then action chooseDisplayPosition;
        then action addMoreBannersOptional;
        then action closeWindow;
    }
    action def EditBanner {
        doc /* Page: Diagram banners: edit. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
        action openDiagramSpecification;
        then action openTagsGroup;
        then action selectTextValue;
        then action editTextOrPosition;
        then action closeWindow;
    }
    action def RemoveBanner {
        doc /* Page: Diagram banners: remove. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
        action openDiagramSpecification;
        then action openTagsGroup;
        then action selectTextValue;
        then action removeOneOrAllValues;
        then action closeWindow;
    }
    action def CreateLegendItemFromShape {
        doc /* Page: Legend items: from the legend shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149854/Creating+and+managing+Legend+Items */
        action selectLegendShape;
        then action clickCreateLegendItemManipulator;
        then action specifyProperties;
        then action closeWindow;
    }
    action def ManageLegendItems {
        doc /* Page: Legend items: manage in specification. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149854/Creating+and+managing+Legend+Items */
        action openLegendSpecification;
        then action openLegendItemsGroup;
        then action useUpDownCreateCloneDelete;
    }
    action def ApplyLegendItemToElements {
        doc /* Page: Applying legend items: specific elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items */
        action openItemSpecification;
        then action openSpecificElementsCell;
        then action selectElements;
        then action clickOk;
        then action closeWindow;
    }
    action def ApplyLegendItemByCondition {
        doc /* Page: Applying legend items: by condition. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items */
        action openItemSpecification;
        then action openElementsByConditionCell;
        then action chooseElementType;
        then action definePropertyTest;
        then action clickOk;
        then action closeWindow;
    }
    action def ExtractLegends {
        doc /* Page: Creating legends automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149898/Creating+Legends+automatically */
        action openExtractLegendsDialog;
        then action selectLegends;
        then action setAdornmentOptions;
        then action clickExtract;
    }
    action def ApplyLegendSteps {
        doc /* Page: Applying legends. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends */
        action openLegendButtonMenu;
        then action chooseApplyLegends;
        then action selectLegends;
        then action clickOk;
    }
    action def UnapplyLegend {
        doc /* Page: Applying legends: remove. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends */
        action deleteLegendShapeOrUncheck;
        then action answerKeepAdornmentsQuestion;
    }
    action def FilterByLegendItems {
        doc /* Page: Filtering by legend items. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items */
        action openFilterDialog;
        then action chooseShowOrHidePreference;
        then action selectLegendItems;
        then action clickOk;
        then action clearOrSaveFilter;
    }
    action def ShowDiagramInfoTable {
        doc /* Page: Table with diagram information. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information */
        action chooseShowDiagramInfo;
        then action openCustomize;
        then action chooseStandardOrCustomMode;
        then action reviewPreview;
    }
    action def ChangeDiagramTypeProcedure {
        doc /* Page: Changing diagram type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type */
        action selectDiagramsOfOneType;
        then action chooseRefactorChangeTypeTo;
        then action pickNewType;
    }
    action def DrawElementFromPalette {
        doc /* Page: Working with symbols: draw from the palette. Hold Shift while picking, or switch on the Sticky tool (Z), to draw several of one type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
        action pickTool;
        then action clickPane;
        then action typeName;
        then action confirmName;
    }
    action def DrawSymbolOfExistingElement {
        doc /* Page: Working with symbols: existing element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
        action activateDiagram;
        then action selectElementInBrowser;
        then action dragToPane;
    }
    action def RemoveSymbolFromDiagram {
        doc /* Page: Working with symbols: remove from diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
        action selectSymbols;
        then action pressDeleteOrRemoveFromDiagram;
    }
    action def DeleteElementFromModel {
        doc /* Page: Working with symbols: delete from model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
        action selectSymbols;
        then action chooseDeleteOrPressCtrlD;
    }
    action def DrawRelationship {
        doc /* Page: Creating a relationship: palette path. Red highlight means the relationship is not allowed between the shapes; the route avoids other shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
        action pickPathTool;
        then action clickSourceShape;
        then action dropOnTargetShape;
    }
    action def CreateRelationFromElement {
        doc /* Page: Creating a relationship: Create Relation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
        action rightClickElement;
        then action chooseCreateRelationDirectionAndKind;
        then action chooseOtherEnd;
        then action clickOk;
    }
    action def CreateRelationInSpecification {
        doc /* Page: Creating a relationship: specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
        action openRelationsGroup;
        then action clickCreateOutgoingOrIncoming;
        then action pickRelationKind;
        then action chooseElement;
        then action clickOk;
    }
    action def RemoveRelationship {
        doc /* Page: Removing a relationship. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149965/Removing+a+relationship */
        action selectRelationship;
        then action clickRemoveFromDiagramOrDelete;
        then action confirmModelDeletion;
    }
    action def ChangePathStyle {
        doc /* Page: Changing a path style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149966/Changing+a+path+style */
        action selectPaths;
        then action chooseStyleFromEditMenuOrCtrlL;
    }
    action def RoutePathsRectilinearlySteps {
        doc /* Page: Routing paths. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149967/Routing+paths */
        action selectPathOrShape;
        then action clickRouteRectilinearly;
    }
    action def RoundPathCorners {
        doc /* Page: Making path corners rounded. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149969/Making+the+paths+corners+rounded */
        action openSymbolProperties;
        then action setRoundedCornersTrue;
    }
    action def AddLineJumps {
        doc /* Page: Creating line jump. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149970/Creating+line+jump */
        action openDiagramProperties;
        then action chooseAddLineJumpsTo;
    }
    action def SplitPathWithShape {
        doc /* Page: Inserting a shape on the path. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path */
        action selectOrCreateShape;
        then action dragShapeOntoPath;
        then action chooseBeforeAfterOrCancel;
    }
    action def SolveOwnershipProblem {
        doc /* Page: Smart manipulator toolbar: ownership. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar */
        action selectRedElement;
        then action clickRedButton;
        then action chooseFix;
    }
    action def CreateConnectedElement {
        doc /* Page: Smart manipulator toolbar: connected element. Ctrl+click adds a breakpoint; Esc cancels. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar */
        action pickRelationInToolbar;
        then action rightClickAtEnd;
        then action chooseElementToCreate;
    }
    action def CreateElementInCompartment {
        doc /* Page: Creating elements in compartments. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149990/Creating+elements+in+compartments+on+shapes */
        action selectShape;
        then action clickCreateElementManipulator;
        then action chooseElement;
    }
    action def SuppressCompartment {
        doc /* Page: Displaying and suppressing compartments. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149991/Displaying+and+suppressing+compartments+on+shapes */
        action selectShape;
        then action clickCompartmentsManipulator;
        then action toggleCompartment;
    }
    action def EditCompartments {
        doc /* Page: Compartments: edit shown items. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149994/Displaying+or+hiding+elements+in+compartments+on+shapes */
        action openEditCompartments;
        then action chooseTab;
        then action moveItemsBetweenHiddenAndSelected;
        then action clickOk;
    }
    action def SelectGroupOfShapes {
        doc /* Page: Selection: group of shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
        action dragRectangle;
        then action pressCtrlToSwitchCoverage;
    }
    action def SelectSameType {
        doc /* Page: Selection: same type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
        action holdAlt;
        then action clickOneShape;
    }
    action def PasteSpecial {
        doc /* Page: Copying text or images to diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150000/Copying+text+or+images+to+diagrams */
        action selectTextOrImage;
        then action pressCtrlC;
        then action openDiagram;
        then action pressCtrlV;
        then action choosePasteFormat;
    }
    action def NestImage {
        doc /* Page: Nesting image shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150001/Nesting+image+shapes */
        action selectImage;
        then action dragOntoElement;
    }
    action def ShowGridSteps {
        doc /* Page: Using the grid: show and snap. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid */
        action chooseViewGridShowGrid;
        then action chooseSnapShapesToGrid;
        then action chooseSnapPathsToGrid;
    }
    action def ChangeGridSize {
        doc /* Page: Using the grid: size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid */
        action chooseGridSize;
        then action enterSizeBetween2And30;
        then action clickOk;
    }
    action def PushDiagramFragment {
        doc /* Page: Pusher and magnet. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150012/Pusher+and+magnet */
        action clickPusherOrMagnet;
        then action rightDragFragment;
    }
    action def SetLabelConsideration {
        doc /* Page: Label layout: consideration mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram */
        action openLayoutOptions;
        then action selectLayoutStyle;
        then action chooseLabelConsideration;
    }
    action def RotateLabels {
        doc /* Page: Label orientation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150021/Label+orientation */
        action selectLabelsPathsOrShapes;
        then action clickRotateOrPickOrientation;
    }
    action def SaveDiagramAsImage {
        doc /* Page: Save As Image dialog. Scope is active diagram, selected symbols or selected diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog */
        action openSaveAsImageDialog;
        then action chooseScope;
        then action chooseWorkingDirectory;
        then action chooseFormat;
        then action openOptionsOptional;
        then action setOverwrite;
        then action clickSave;
        // TODO xref: ProjectOptions (Customizing environment)
    }
    action def DefineLayoutTemplate {
        doc /* Page: Defining and setting a layout template. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150051/Setting+diagram+as+layout+template */
        action createClassDiagram;
        then action drawClassWithPorts;
        then action styleShapesAndPortPositions;
        then action chooseUseAsLayoutTemplate;
    }
    action def StopUsingLayoutTemplate {
        doc /* Page: Stopping to use a diagram as layout template. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150059/Stopping+to+use+diagram+as+layout+template */
        action openStereotypeDialog;
        then action clearLayoutTemplate;
        then action clickApply;
    }
    action def ApplyLayoutTemplateToShape {
        doc /* Page: Applying layout template. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template */
        action selectShape;
        then action chooseDisplayLayoutTemplateApply;
        then action pickTemplateIfSeveral;
    }
    action def SetDefaultLayoutTemplate {
        doc /* Page: Setting layout template as default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150067/Setting+layout+template+as+default */
        action openDiagramSpecification;
        then action openTagsGroup;
        then action createDefaultValueTrue;
        then action closeWindow;
    }
    action def OpenLayoutTemplate {
        doc /* Page: Navigation to layout templates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150071/Navigation+to+layout+templates */
        action selectShape;
        then action chooseDisplayLayoutTemplateOpen;
    }
    action def EnableAspects {
        doc /* Page: Enabling aspects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150091/Enabling+or+disabling+diagram+aspects+option */
        action openProjectOptions;
        then action openDiagramsGroup;
        then action setUseAspectsTrue;
        then action clickOk;
    }
    action def IgnoreAspects {
        doc /* Page: Ignored aspects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150092/Specifying+or+removing+ignored+aspects */
        action openProjectOptions;
        then action openDiagramAspectsGroup;
        then action pressEditOnIgnoredAspects;
        then action selectAspects;
        then action clickOk;
    }
    action def CreateCustomAspect {
        doc /* Page: Creating custom aspects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150096/Creating+custom+aspects */
        action createStereotype;
        then action showAuxiliaryResources;
        then action generalizeToAspectStereotype;
    }
    action def ApplyAspectToDiagram {
        doc /* Page: Applying or removing aspect. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150102/Applying+or+removing+aspect+for+preexisting+diagrams */
        action openDiagramContextMenu;
        then action pointToAspect;
        then action chooseAspect;
    }
    action def DisplayPartsByAspect {
        doc /* Page: Displaying parts and ports according to aspects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150108/Displaying+parts+and+ports+according+to+aspects */
        action openDisplayPartsPortsDialog;
        then action chooseSelectByAspect;
        then action clickOk;
    }
    action def MarkComplete {
        doc /* Page: Complete diagrams: mark. The complete stereotype is applied; auto-resize and automatic label display are suspended. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
        action chooseCompleteOnDiagram;
        then action reviewHighlightedShapes;
        then action updateShapes;
    }
    action def MarkIncomplete {
        doc /* Page: Complete diagrams: unmark. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
        action clearCompleteOption;
        then action answerSuspendQuestion;
    }
    action def CheckCompleteDiagrams {
        doc /* Page: Complete diagrams: check. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
        action chooseAnalyzeCheckCompleteDiagrams;
        then action readWarnings;
    }
    action def PrintDiagramSteps {
        doc /* Page: Print dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150124/Print+dialog */
        action pressCtrlP;
        then action setPrintOptions;
        then action clickPrint;
    }
    action def SetImageExportOptions {
        doc /* Page: Diagram image export. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export */
        action openProjectOptionsImageExport;
        then action setLimits;
        then action openEnvironmentImageExport;
        then action setQualityAndResolution;
    }
    action def CreatePresentationSequence {
        doc /* Page: Presentation mode: sequence. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
        action openContentDiagram;
        then action pickPresentationFlow;
        then action connectDiagramShapesInOrder;
    }
    action def EnterPresentationModeSteps {
        doc /* Page: Presentation mode: enter and leave. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
        action chooseEnterPresentationMode;
        then action navigateLinkedDiagrams;
        then action pressEscToLeave;
    }

    // ---- Requirements ----
    requirement <'CAM-DGM-001'> createDialog {
        doc /* A diagram is created from a searchable dialog opened with Ctrl+N, a main-toolbar button, the Diagrams menu or the Content diagram palette. The search field matches diagram type names by camel-case initials, lower case, ignoring separators, and by partial text (for example "ibd"); Esc or a click outside cancels. The new diagram is named after its owner, with numbering for repeats. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
    }
    requirement <'CAM-DGM-002'> createBrowser {
        doc /* A diagram is created from the browser context menu of a package or other element (Create Diagram, then a type), for several selected elements at once, or from the Inner Elements group of an element specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149763/Creating+diagrams */
    }
    requirement <'CAM-DGM-003'> openDiagram {
        doc /* A diagram opens by double-click, Enter, Ctrl+Enter, the context menu (Open, Open in New Tab), from a diagram shape on a content diagram, or by double-clicking the element a diagram belongs to. Navigation within a tab keeps its own back and forward history (Alt+Left, Alt+Right, toolbar buttons) and does not open new tabs by default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-004'> lazyLoad {
        doc /* A model can be opened without loading any diagram, or with all diagrams loaded, through a start-up property of the tool, for recovery when a diagram blocks loading. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-005'> dragToDiagram {
        doc /* Elements dragged from the browser onto a diagram pane are shown there; elements the open diagram type cannot show are refused. A relationship dropped on a diagram brings its end shapes and the path. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-006'> moveDragNest {
        doc /* Dragging a shape moves it, and dropping it onto another shape nests it when the types allow; dropping an element on a note or text box adds a hyperlink to it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-007'> displayParts {
        doc /* Parts, ports and nested properties of a structured element are shown or hidden through a Display Parts/Ports dialog (element tree, select all, clear all, select by kind, shift-click for nested), a toolbar Display button or a context menu group, or the smart manipulator. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-008'> internalStruct {
        doc /* The internal structure of a selected classifier is displayed inside its shape by choosing Display Internal Structure and the diagram that holds it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149791/Displaying+internal+structure+on+structured+classifiers */
    }
    requirement <'CAM-DGM-009'> relatedElements {
        doc /* Related elements of a selected shape, several shapes or the whole diagram are displayed in one step by choosing relation kinds, direction (incoming, outgoing, both), scope (whole project or owning package), depth (indefinite or a level), whether to create new symbols for already drawn elements, and whether to lay out the result. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149795/Displaying+related+elements */
    }
    requirement <'CAM-DGM-010'> displayPaths {
        doc /* Missing paths between two or more selected shapes (In-Between Paths) or all paths of selected shapes (All Paths) are displayed on demand; paths to self appear only in the latter. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
    }
    requirement <'CAM-DGM-011'> copyPaste {
        doc /* Diagram content is copied, cut and pasted within and between diagrams and projects, and the whole diagram or selection can be put on the clipboard for other applications. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-012'> diagramTabs {
        doc /* Diagram tabs can be split into new horizontal or vertical groups (needs at least two open diagrams) and floated through the tab context menu or by dragging a tab to the pane. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
    }
    requirement <'CAM-DGM-013'> diagramProps {
        doc /* A diagram has a specification window, opened from its context menu, with its name, documentation and other properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149811/Specifying+diagram+properties */
    }
    requirement <'CAM-DGM-014'> styleProps {
        doc /* A Diagram Properties dialog (context menu or Shift+Enter) sets style properties such as colours, grid, diagram info and fonts for one diagram; project options set defaults. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149813/Specifying+diagram+style+properties */
    }
    requirement <'CAM-DGM-015'> nameSync {
        doc /* A diagram name follows the name of its context element (activity, interaction, state machine, class) and the reverse, unless an environment option turns synchronization off. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149815/Diagram+name+and+its+context+name+synchronization */
    }
    requirement <'CAM-DGM-016'> diagramFrame {
        doc /* Every diagram has a frame; it can be hidden, resized, and its header content (stereotype icon, context icon, abbreviated type) set in the diagram or project style properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame */
    }
    requirement <'CAM-DGM-017'> banner {
        doc /* Header and footer banners with text can be added to a diagram, edited and removed; they sit inside the pane but outside the frame. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
    }
    requirement <'CAM-DGM-018'> overview {
        doc /* A shape can show an overview of another diagram, created by dragging the diagram shape and switching on overview content, by a palette tool, or by pasting copied content; double-click opens the source diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149822/Creating+a+diagram+overview+shape */
    }
    requirement <'CAM-DGM-019'> legends {
        doc /* Legends define adornments (colours, line style, icons) for elements, are created in a diagram or table, applied, unapplied, suspended, disabled and extracted automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends */
    }
    requirement <'CAM-DGM-020'> legendFilter {
        doc /* A diagram can be filtered to the elements that match chosen legend items, showing only them or hiding them; the filtered diagram is read-only until the filter is cleared or saved. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items */
    }
    requirement <'CAM-DGM-021'> infoTable {
        doc /* A table with diagram information (name, author, dates, last modifier, tags) can be shown on the diagram and customised in project options, standard or custom HTML. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information */
    }
    requirement <'CAM-DGM-022'> changeType {
        doc /* A diagram type is changed to a compatible type through Refactor > Change Type To; elements are not converted. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type */
    }
    requirement <'CAM-DGM-023'> drawSymbol {
        doc /* A palette tool draws a new element on the pane; Shift or a sticky tool repeats it; existing elements are drawn again as extra symbols by dragging from the browser or copy and paste; the name is typed directly on the symbol. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-024'> deleteSymbol {
        doc /* Remove from Diagram (Delete key) removes selected symbols only; Delete (Edit menu, Ctrl+D) removes the elements from the model with all data. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-025'> createRelationship {
        doc /* A relationship is drawn with a palette tool from source to target shape (red or blue highlight shows validity), or created from a selection or a specification window using Create Relation outgoing or incoming. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
    }
    requirement <'CAM-DGM-026'> removeRelationship {
        doc /* A relationship is removed from the diagram only, or from the model after a confirmation question. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149965/Removing+a+relationship */
    }
    requirement <'CAM-DGM-027'> pathStyle {
        doc /* The style of selected paths (rectilinear, oblique, bezier) is changed from the Edit menu, Ctrl+L, the toolbar or symbol properties; Remove Break Points and Reset Label Positions are also offered. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149966/Changing+a+path+style */
    }
    requirement <'CAM-DGM-028'> routePaths {
        doc /* Paths are re-routed rectilinearly with a smart manipulator button; on a shape it applies to all connected paths. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149967/Routing+paths */
    }
    requirement <'CAM-DGM-029'> roundCorners {
        doc /* Path corners are made rounded by setting a symbol property. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149969/Making+the+paths+corners+rounded */
    }
    requirement <'CAM-DGM-030'> lineJump {
        doc /* Line jumps are drawn where paths cross: none, on horizontal lines or on vertical lines, per diagram or project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149970/Creating+line+jump */
    }
    requirement <'CAM-DGM-031'> splitPath {
        doc /* Dropping a shape on a transition or flow path in state and activity diagrams splits it, inserting the shape before or after, with a remembered choice. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path */
    }
    requirement <'CAM-DGM-032'> smartManip {
        doc /* Small buttons on a selected symbol and a smart manipulator toolbar (standard and extra modes) create connected elements, route paths, display ports and fix ownership problems; they can be switched off in environment options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar */
    }
    requirement <'CAM-DGM-033'> compartmentCreate {
        doc /* Elements are created directly in a shape compartment with a Create Element manipulator or a per-compartment create button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149990/Creating+elements+in+compartments+on+shapes */
    }
    requirement <'CAM-DGM-034'> compartmentShow {
        doc /* Compartments are shown or suppressed from a Compartments manipulator, a Suppress button or symbol properties; a Compartment Edit dialog chooses which listed elements appear. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149991/Displaying+and+suppressing+compartments+on+shapes */
    }
    requirement <'CAM-DGM-035'> shapeSizing {
        doc /* Shapes are resized by handles or to a preferred size; a shape created from another by a path takes its size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149995/Smart+shape+sizing */
    }
    requirement <'CAM-DGM-036'> selection {
        doc /* Selection supports click, Select All (Ctrl+A), select all of the same type (Alt+click), Shift multi-select and rubber-band with partial or complete coverage modes (Ctrl toggles). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
    }
    requirement <'CAM-DGM-037'> pasteImage {
        doc /* Text or images from the clipboard are pasted onto a diagram through a Paste Special choice (image, plain text, HTML), becoming a text box or image shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150000/Copying+text+or+images+to+diagrams */
    }
    requirement <'CAM-DGM-038'> zoom {
        doc /* The diagram is zoomed in, out, to fit the window (Ctrl+W), to selection, and to 1:1, by menu, keys, wheel, a status-line slider or the Zoom tab; the step size is an option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
    }
    requirement <'CAM-DGM-039'> grid {
        doc /* A grid is shown or hidden, shapes and paths snap to it, its size (2 to 30, default 10) and style (dense or sparse) are set. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid */
    }
    requirement <'CAM-DGM-040'> pusher {
        doc /* A pusher tool moves a fragment of the diagram to make room and a magnet tool pulls fragments together, using a right-button drag. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150012/Pusher+and+magnet */
    }
    requirement <'CAM-DGM-041'> alignTools {
        doc /* The toolbar aligns (left, right, top, bottom, centre), centres, spaces evenly and makes selected shapes the same size, width or height. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-042'> autoLayout {
        doc /* Quick Diagram Layout arranges visible elements with the default layout algorithm; Layout Options choose the algorithm. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-043'> selectInTree {
        doc /* Select in Containment Tree (Alt+B) selects the active element in the model tree; Find in Diagram locates a tree element in the diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-044'> labelLayout {
        doc /* Labels keep default positions, reset to default after edits or moves, show a dashed deviation line while dragged, and may be considered by the hierarchic layout styles (none, partial, full). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram */
    }
    requirement <'CAM-DGM-045'> saveImage {
        doc /* File > Save as Image saves the active diagram, selected symbols or selected diagrams in several formats to a working directory, optionally overwriting, with an Options button for export properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog */
    }
    requirement <'CAM-DGM-046'> layoutTemplates {
        doc /* A layout template is a diagram that defines the look and port positions of one class; it is applied to parts, classes, classifiers or a diagram frame, one may be the default, several may coexist, and it can be reopened or removed. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150049/Defining+layout+template */
    }
    requirement <'CAM-DGM-047'> aspects {
        doc /* Diagram aspects (stereotypes) are enabled by a project option, ignored, created, applied to diagrams, and used to show only parts and ports whose stereotype or type stereotype matches. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150091/Enabling+or+disabling+diagram+aspects+option */
    }
    requirement <'CAM-DGM-048'> completeDiagram {
        doc /* A diagram is marked complete so auto-resizing and label display are suspended; later model changes highlight affected symbols, which are updated on demand; it can be unmarked and checked by validation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
    }
    requirement <'CAM-DGM-049'> print {
        doc /* A diagram is printed from File > Print (Ctrl+P) through a dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150124/Print+dialog */
    }
    requirement <'CAM-DGM-050'> imageExportOpts {
        doc /* Project and environment options control image export: size limits, behaviour when exceeded, background, JPEG quality, SVG text, resolution, scale, TIFF settings. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export */
    }
    requirement <'CAM-DGM-051'> presentation {
        doc /* Presentation Mode shows a chosen diagram or a sequence linked by Presentation Flow relationships full screen without chrome, and can run simulation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
    }
    requirement <'CAM-DGM-052'> recentDiagrams {
        doc /* A Recently Opened Diagrams dialog (Diagrams menu or F12) lists the last 50 activated diagrams and opens the chosen one. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-053'> openTabMode {
        doc /* An environment option picks whether opening reuses the active tab or makes a new one, and holding Ctrl while opening inverts that choice. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149768/Opening+diagrams */
    }
    requirement <'CAM-DGM-054'> dragFilesToElements {
        doc /* Dragging a file onto a browser element or a symbol creates a hyperlink to it; dragging an image sets the element image, or a stereotype icon. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-055'> dragFromSpecification {
        doc /* Elements can be dragged into properties of a specification window, and elements dragged out of it create a symbol, a new attribute on a shape or a new element in the browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-056'> dragBehaviors {
        doc /* On behaviour diagrams, dropping operations, signals, events or behaviours onto messages, transitions, call actions or swimlanes assigns or creates the matching construct. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149770/Dragging+objects */
    }
    requirement <'CAM-DGM-057'> longDragMenu {
        doc /* Holding a dragged class or property until a tooltip shows opens a drop menu with Create Property Symbol and Create Property Symbol and Display All Ports; a plain drop creates the typed property. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-058'> displayPartsLayoutOptions {
        doc /* The Display Parts/Ports dialog has options to lay out parts, use a layout template, show connectors and place ports top/bottom or left/right, and shows full paths, full types and inherited members on demand. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-059'> hideAllPorts {
        doc /* Hide All Ports hides the ports of the selection or diagram without deleting them from the model; Display All Ports on the smart manipulator shows first-level ports only. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-060'> portProperties {
        doc /* Displaying properties of a port shows the properties of its type inside the port shape and enables part compartments for it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149773/Displaying+parts+and+ports */
    }
    requirement <'CAM-DGM-061'> displayPathsOnDrop {
        doc /* An environment option makes dragging elements from the browser also draw the paths among them and the shapes already shown. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149802/Displaying+paths */
    }
    requirement <'CAM-DGM-062'> copyAsImageFormats {
        doc /* Copy as BMP, EMF, JPG or PNG (Ctrl+Shift+B, E, J, P) copies the selection, or the diagram when nothing is selected, to the clipboard in that format. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-063'> copyUrl {
        doc /* Copy URL gives a link to an element or symbol, and Open Element from URL jumps to it in the tree or diagram, also from other applications. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-064'> pasteWithNewElement {
        doc /* Paste with New Element (Ctrl+E) pastes copied symbols as new model elements, for owned symbols moved between shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-065'> pasteStyle {
        doc /* Paste Style (Ctrl+Shift+V) applies the properties of copied symbols to selected symbols according to element type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-066'> pasteAsOverview {
        doc /* Paste as Diagram Overview creates an overview shape from copied content, including matrices. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149808/Copying+and+pasting+objects */
    }
    requirement <'CAM-DGM-067'> fullScreen {
        doc /* Diagram tabs go full screen (F11, double-click a tab, View menu), with the browser auto-hidden and the main toolbar optionally hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
    }
    requirement <'CAM-DGM-068'> showOwnerOnTab {
        doc /* A diagram property shows the owner name on the tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149809/Using+diagram+tabs */
    }
    requirement <'CAM-DGM-069'> diagramInfoModes {
        doc /* The diagram info table source is standard (author, dates, tags) or custom HTML, with a preview. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149950/Table+with+diagram+information */
    }
    requirement <'CAM-DGM-070'> frameHeader {
        doc /* Frame header shows the diagram stereotype icon or the context stereotype icon, or text only, and may use the abbreviated type (for example sd, stm, uc). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149816/Diagram+frame */
    }
    requirement <'CAM-DGM-071'> diagramShapeAppearance {
        doc /* A diagram can be drawn as a shape on another diagram (drag from the browser); its stereotypes, constraints, tagged values, icon source and abbreviated type are set in symbol properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149818/Drawing+diagram+shapes */
    }
    requirement <'CAM-DGM-072'> overviewEdit {
        doc /* Content of an overview shape is edited in a Compartment Edit dialog using moves between Hidden and Selected lists. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149829/Modifying+the+content+of+a+diagram+overview+shape */
    }
    requirement <'CAM-DGM-073'> bannerPositions {
        doc /* Each banner text has a position of header (default), footer, both or none, and several banners can exist. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149830/Diagram+banners */
    }
    requirement <'CAM-DGM-074'> legendItemManagement {
        doc /* Legend items are created from the legend shape or its specification window, cloned, deleted and reordered. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149854/Creating+and+managing+Legend+Items */
    }
    requirement <'CAM-DGM-075'> legendAdornment {
        doc /* A legend item adornment sets fill, pen and text colours, line width, shape or path line style, an icon and its position, and the representation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149869/Specifying+Legend+Item+adornment */
    }
    requirement <'CAM-DGM-076'> legendPriority {
        doc /* Items of several legends are kept apart by distinct adornment properties; a priority property resolves conflicts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149884/Avoiding+Conflicting+Legend+items */
    }
    requirement <'CAM-DGM-077'> legendApplyTo {
        doc /* A legend item applies either to specific elements (selection dialog or symbol menu) or to elements by condition such as a property test, never both. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items */
    }
    requirement <'CAM-DGM-078'> legendTableCells {
        doc /* In tables a legend item can adorn chosen properties (columns) of matching rows. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149889/Applying+Legend+Items */
    }
    requirement <'CAM-DGM-079'> legendExtract {
        doc /* Legends and legend items are extracted automatically from element types, stereotypes, part and port types, flowing items or stereotype tag values, with options for adornments and connector legends. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149898/Creating+Legends+automatically */
    }
    requirement <'CAM-DGM-080'> legendSuspend {
        doc /* A legend can be suspended, unapplied, displayed again, disabled project-wide, or applied by diagram condition without being shown; deleting its shape asks whether to keep the adornments. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149906/Applying+Legends */
    }
    requirement <'CAM-DGM-081'> legendFilterPreference {
        doc /* A filter shows or hides matching elements, with a default preference in project options; a notice offers Clear and Save, and select adorned symbols is available. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149919/Filtering+by+Legend+items */
    }
    requirement <'CAM-DGM-082'> changeTypeRules {
        doc /* Static diagrams convert to static ones; dynamic diagrams only when of the same base type; the command applies to several diagrams of one type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149952/Changing+diagram+type */
    }
    requirement <'CAM-DGM-083'> stickyPalette {
        doc /* Holding Shift while choosing a tool or toggling the Sticky tool (Z) keeps it active for repeated drawing. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-084'> textVerticalPosition {
        doc /* Symbol properties set text and compartment vertical position to top, centre or bottom. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149954/Working+with+symbols+of+model+elements */
    }
    requirement <'CAM-DGM-085'> createRelationFromSelection {
        doc /* Create Relation > Outgoing or Incoming from an element picks targets by clicking in the browser or diagram, by search, with active and pinned selections. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149961/Creating+a+relationship */
    }
    requirement <'CAM-DGM-086'> splitTransitionDialog {
        doc /* The split dialog offers Before, After or Do Not Insert, with a remember option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149974/Inserting+a+shape+on+the+path */
    }
    requirement <'CAM-DGM-087'> pathCompartments {
        doc /* A Compartment Edit dialog shows or hides stereotypes, constraints, tags and properties on paths, merging items when several paths are chosen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149980/Path+compartments */
    }
    requirement <'CAM-DGM-088'> ownershipProblems {
        doc /* A symbol with an ownership problem is highlighted red and the manipulator menu offers fixes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149985/Smart+manipulator+toolbar */
    }
    requirement <'CAM-DGM-089'> multiShapeCompartments {
        doc /* Compartment Edit on several shapes works on their union and applies changes to all. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149994/Displaying+or+hiding+elements+in+compartments+on+shapes */
    }
    requirement <'CAM-DGM-090'> inheritedShapeSize {
        doc /* A shape created from another through a path or inserted into a flow keeps the size of the source shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149995/Smart+shape+sizing */
    }
    requirement <'CAM-DGM-091'> selectSameType {
        doc /* Alt+click selects all shapes of one type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
    }
    requirement <'CAM-DGM-092'> coverageModeProject {
        doc /* Group selection coverage mode is set for the project from a toolbar button or environment options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149997/Selection+and+multiple+selections */
    }
    requirement <'CAM-DGM-093'> zoomOptions {
        doc /* The zoom slider can be hidden and the zoom step size set. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150003/Zooming */
    }
    requirement <'CAM-DGM-094'> gridSettings {
        doc /* Grid size and style are set, with snap for shapes and paths chosen separately. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150011/Using+the+grid */
    }
    requirement <'CAM-DGM-095'> labelConsideration {
        doc /* Hierarchic and specialised layouts take labels into account in full, partial or none mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150019/Label+layout+in+the+diagram */
    }
    requirement <'CAM-DGM-096'> labelOrientation {
        doc /* Labels on shapes and paths rotate between horizontal, vertical and automatic; the default is set per project for shapes and paths. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150021/Label+orientation */
    }
    requirement <'CAM-DGM-097'> saveImageScope {
        doc /* Save As Image chooses active diagram, selected symbols or selected diagrams (found by search), working directory, format and overwrite. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150026/Save+As+Image+dialog */
    }
    requirement <'CAM-DGM-098'> imageProperties {
        doc /* A Properties dialog sets format-specific export properties such as resolution and size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150029/Properties+dialog */
    }
    requirement <'CAM-DGM-099'> templateDefinition {
        doc /* A layout template defines one class with its ports in a class diagram, or a part property in a composite structure diagram, set by a Use as Layout Template command and a stereotype; creation mode picks usage or definition. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150051/Setting+diagram+as+layout+template */
    }
    requirement <'CAM-DGM-100'> templateApply {
        doc /* Applying works on a part, class or classifier, or a diagram frame, from the toolbar or menu, and requires a typed part and a template diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template */
    }
    requirement <'CAM-DGM-101'> templateManage {
        doc /* Templates can be removed from a shape by undo or redisplay, several can exist per class, one may be default and listed first, and Open Template navigates to it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150065/Multiple+layout+template */
    }
    requirement <'CAM-DGM-102'> templateAspect {
        doc /* A layout template can carry an aspect so it only applies in matching diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150061/Applying+layout+template */
    }
    requirement <'CAM-DGM-103'> aspectSetup {
        doc /* Aspects require the Use Aspects option, can be ignored per project, include predefined ones with the SysML plugin and custom ones made as stereotypes of the aspect stereotype. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150091/Enabling+or+disabling+diagram+aspects+option */
    }
    requirement <'CAM-DGM-104'> aspectDiagrams {
        doc /* Aspect diagrams are created like others or an aspect is applied to or removed from an existing diagram, several at once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150102/Applying+or+removing+aspect+for+preexisting+diagrams */
    }
    requirement <'CAM-DGM-105'> aspectMatching {
        doc /* An aspect matches parts and ports whose stereotype, or type stereotype, has the same name; the Display dialog then selects by aspect. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150104/How+aspects+match+with+parts+and+ports */
    }
    requirement <'CAM-DGM-106'> aspectNavigation {
        doc /* A rake icon on a decomposed part opens the aspect diagram of its internal structure, with navigation among aspect diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150106/Navigation+among+aspect+diagrams */
    }
    requirement <'CAM-DGM-107'> completeOptions {
        doc /* Project options set whether auto-resizing and auto-display of labels are suspended, and whether suspended symbols are highlighted. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
    }
    requirement <'CAM-DGM-108'> completeUpdate {
        doc /* Highlighted shapes in a complete diagram update through resize, a manipulator or Resize to Fit Content; paths through Show Suspended Labels; also for several at once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
    }
    requirement <'CAM-DGM-109'> checkComplete {
        doc /* Check Complete Diagrams validates with three rules for suspended autodisplay, autoresize and other autochanges. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150113/Complete+diagrams */
    }
    requirement <'CAM-DGM-110'> imageExportLimits {
        doc /* Export honours time, height and width limits and a preference to crop or skip when limits are exceeded. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150126/Diagram+image+export */
    }
    requirement <'CAM-DGM-111'> presentationFlow {
        doc /* A sequence of diagram shapes is created on a content diagram with a Presentation Flow tool; only linked diagrams are navigable, new tabs are blocked, and Esc leaves. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
    }
    requirement <'CAM-DGM-112'> presentationSimulation {
        doc /* Simulation runs show their controls inside Presentation Mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150135/Presentation+Mode */
    }
    requirement <'CAM-DGM-113'> toolbarStyleTools {
        doc /* The toolbar offers fill colour, apply default symbol style, paste style, show as box or image, suppress all, make preferred size, validate diagram, options, legend, find in diagram and run. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
    requirement <'CAM-DGM-114'> toolbarLabelTools {
        doc /* The toolbar can reset label position, rotate a label, remove break points and set rectilinear. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/271516078/Understanding+Diagram+Toolbar */
    }
}
