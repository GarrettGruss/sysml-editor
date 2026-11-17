package CameoUI_GST {
    private import CameoUI::*;
    private import ScalarValues::*;
    doc /* Section 000 User Guide / 001 Getting started. The main window (menus, Model Browser and its tabs, editor tabs, status line, quick properties panel, image library, interface style), shortcut keys, environment options, perspectives, configuration files, performance and support pages. Written by hand; see README.md. */

    // ---- Screens ----
    part def MainMenuBar :> Menu { part fileMenu : Menu; part editMenu : Menu; part viewMenu : Menu; part layoutMenu : Menu; part diagramsMenu : Menu; part optionsMenu : Menu; part toolsMenu : Menu; part analyzeMenu : Menu; part collaborateMenu : Menu; part windowMenu : Menu; part helpMenu : Menu; }
    part def MainToolbar :> Toolbar;
    part def ModelBrowser :> Panel { part tabs : BrowserTab[1..*]; part toolbar : BrowserToolbar; attribute position : BrowserPosition; }
    enum def BrowserPosition { enum left; enum right; }
    part def BrowserTab :> Panel;
    part def ContainmentTab :> BrowserTab { part tree : ContainmentTree; }
    part def StructureTab :> BrowserTab;
    part def InheritanceTab :> BrowserTab;
    part def DiagramsTab :> BrowserTab;
    part def ModelExtensionsTab :> BrowserTab;
    part def SearchResultsTab :> BrowserTab { part foundInDiagrams : ModelElement[0..*]; part foundInModel : ModelElement[0..*]; }
    part def LockViewTab :> BrowserTab { attribute filterUser : Label; }
    part def BrowserToolbar :> Toolbar;
    part def QuickFindDialog :> Dialog;
    part def FavoritesMenu :> Menu;
    part def SelectElementTypeDialog :> Dialog;
    part def QuickPropertiesPanel :> Panel { part zoomTab : ZoomTab; part documentationTab : DocumentationTab; part propertiesTab : PropertiesTab; }
    part def ZoomTab :> Panel { part viewportSquare : ToolbarButton; attribute showSlider : Boolean; }
    part def DocumentationTab :> Panel { attribute text : String; attribute isHtml : Boolean; }
    part def PropertiesTab :> Panel { part elementPage : Panel; part symbolPage : Panel; part tagsPage : Panel; part languagePage : Panel; part traceabilityPage : Panel; }
    part def ImageLibraryTab :> Panel { part quickFilter : Field; part imageTree : ContainmentTree; part previewArea : Panel; }
    part def StatusLine :> Toolbar;
    part def WelcomeTab :> Panel;
    part def SamplesTab :> Panel;
    part def FindSearchBar :> Panel { part keyword : Field; part matchCase : Option; }
    part def EnvironmentOptionsDialog :> Dialog { part groupTree : Field; part quickFilter : Field; part descriptionArea : Panel; }
    part def OptionGroup { attribute name : Label; part options : Option[0..*]; }
    part def KeyboardOptions :> OptionGroup { part commandSearch : Field; part newShortcutBox : Field; part currentKeys : Field; }
    part def PathVariableDialog :> Dialog { part name : Field; part description : Field; part value : Field; }
    part def UsePathVariablesDialog :> Dialog;
    part def LauncherPropertiesDialog :> Dialog { part extensions : Field; part launcher : Field; part arguments : Field; }
    part def SelectPerspectiveDialog :> Dialog { part perspectives : Field; part expertMode : Option; }
    part def CustomizePerspectivesDialog :> Dialog { part perspectives : Field; part areas : Field; }
    part def CustomizeAreaDialog :> Dialog;
    part def StartupDialog :> Dialog;
    part def BackgroundTaskManager :> Panel;
    part def MemoryMonitor :> Panel { attribute usedPercent : Integer; }
    part def InternalErrorsDialog :> Dialog;
    part def ReportAnIssueDialog :> Dialog;
    part def NotificationWindow :> Panel;
    part def LookAndFeelMenu :> Menu;
    part def CustomThemeDialog :> Dialog;

    part def Perspective { attribute name : Label; }
    part def FullFeaturedPerspective :> Perspective;
    part def QuickStartPerspective :> Perspective;
    part def SoftwareArchitectPerspective :> Perspective;
    part def SystemAnalystPerspective :> Perspective;
    enum def ItemVisibility { enum standardAndExpert; enum expertOnly; enum hidden; }
    enum def CustomizableArea { enum mainMenu; enum mainToolbars; enum diagramToolbars; enum modelingElementsToolbar; enum smartManipulators; enum shortcutMenuActions; enum createDiagramDialog; }

    // Cross-section references, kept as plain references only.
    part def GettingStartedXrefs {
        ref printDialog : Dialog;            // TODO xref: PrintDialog (006 Diagramming)
        ref specificationWindow : SpecificationWindow;   // TODO xref: SpecificationWindow content (009 Working with model elements)
        ref findDialog : Dialog;             // TODO xref: FindDialog (010 Tools)
        ref reportWizard : Wizard;           // TODO xref: ReportWizard (010 Tools)
        ref diagramPalette : Palette;        // TODO xref: DiagramPalette (006 Diagramming)
        ref presentationMode : Mode;         // TODO xref: PresentationMode (006 Diagramming)
        ref projectOptionsDialog : Dialog;   // TODO xref: ProjectOptionsDialog (002 Working with projects)
        ref openProject : Command;           // TODO xref: OpenProject (002 Working with projects)
        ref saveProject : Command;           // TODO xref: SaveProject (002 Working with projects)
        ref serverProjectLocks : Panel;      // TODO xref: ServerProjectLocks (002 Working with projects)
        ref smartPackage : ModelElement;     // TODO xref: SmartPackage (009 Working with model elements)
    }

    // ---- Commands ----
    action def OpenEnvironmentOptionsCommand :> Command;   // Options > Environment
    action def OpenPerspectivesCommand :> Command;         // Options > Perspectives
    action def ResetWindowsConfiguration :> Command;       // Window > Reset Windows Configuration
    action def CollapseAll :> Command;
    action def CollapseSelectedRecursively :> Command;
    action def OpenInNewTree :> Command;
    action def AddToFavorites :> Command;
    action def QuickFind :> Command;                       // Ctrl+Alt+F
    action def FindInModel :> Command;                     // Ctrl+Shift+F
    action def FindAndReplace :> Command;                  // Ctrl+R
    action def RenameElement :> Command;                   // F2
    action def CopyElementUrl :> Command;
    action def SelectInStructureTree :> Command;
    action def ClearSearchResults :> Command;
    action def RerunSearch :> Command;
    action def SaveSearchResults :> Command;
    action def ShowSamples :> Command;                     // Help > Show Samples
    action def DumpMemoryHeapCommand :> Command;           // Ctrl+Shift+H
    action def DumpMemoryHistogramCommand :> Command;      // Ctrl+Alt+Shift+H
    action def RunGarbageCollector :> Command;
    action def ExportInternalErrors :> Command;
    action def AssignShortcut :> Command;
    action def RemoveShortcut :> Command;
    action def ResetShortcutsToDefaults :> Command;
    action def ResetOptionsToDefaults :> Command;
    action def ToggleFullScreen :> Command;                // F11
    action def ReopenClosedDiagram :> Command;            // Ctrl+Shift+T
    action def ShowRecentDiagrams :> Command;              // F12

    part def BrowserToolbarContent :> BrowserToolbar {
        part collapseAllButton : ToolbarButton { :>> invokes = CollapseAll; }
        part collapseSelectedButton : ToolbarButton { :>> invokes = CollapseSelectedRecursively; }
        part openInNewTreeButton : ToolbarButton { :>> invokes = OpenInNewTree; }
        part favoritesButton : ToolbarButton { :>> invokes = AddToFavorites; }
        part quickFindButton : ToolbarButton { :>> invokes = QuickFind; }
    }

    // Shortcut table of the guide, one MenuItem per row with a shortcut.
    part def ShortcutCatalog {
        part find : MenuItem { :>> title = "Find"; :>> shortcut = "Ctrl+Shift+F"; :>> invokes = FindInModel; }
        part quickFindItem : MenuItem { :>> title = "Quick Find"; :>> shortcut = "Ctrl+Alt+F"; :>> invokes = QuickFind; }
        part findAndReplace : MenuItem { :>> title = "Find and Replace"; :>> shortcut = "Ctrl+R"; :>> invokes = FindAndReplace; }
        part rename : MenuItem { :>> title = "Rename"; :>> shortcut = "F2"; :>> invokes = RenameElement; }
        part fullScreen : MenuItem { :>> title = "Full Screen"; :>> shortcut = "F11"; :>> invokes = ToggleFullScreen; }
        part recentDiagrams : MenuItem { :>> title = "Recent diagrams"; :>> shortcut = "F12"; :>> invokes = ShowRecentDiagrams; }
        part reopenDiagram : MenuItem { :>> title = "Reopen closed diagram"; :>> shortcut = "Ctrl+Shift+T"; :>> invokes = ReopenClosedDiagram; }
        part heapDump : MenuItem { :>> title = "Dump memory heap"; :>> shortcut = "Ctrl+Shift+H"; :>> invokes = DumpMemoryHeapCommand; }
        part histogramDump : MenuItem { :>> title = "Dump memory histogram"; :>> shortcut = "Ctrl+Alt+Shift+H"; :>> invokes = DumpMemoryHistogramCommand; }
    }

    // ---- Modes ----
    state def MemoryMonitorState { state normal; state low; transition first normal accept UsedAboveThreshold then low; transition first low accept GarbageCollected then normal; }
    attribute def UsedAboveThreshold;
    attribute def GarbageCollected;
    state def ExpertMode { state basic; state expert; transition first basic accept ToggleExpert then expert; transition first expert accept ToggleExpert then basic; }
    attribute def ToggleExpert;
    state def BrowserTabVisibility { state shown; state hidden; transition first shown accept CloseTab then hidden; transition first hidden accept OpenTab then shown; }
    attribute def CloseTab;
    attribute def OpenTab;
    state def BrowserDocking { state docked; state autoHidden; state floating; transition first docked accept ToggleAutoHide then autoHidden; transition first docked accept ToggleFloating then floating; transition first autoHidden accept ToggleAutoHide then docked; transition first floating accept ToggleFloating then docked; }
    attribute def ToggleAutoHide;
    attribute def ToggleFloating;
    state def BackgroundTaskState { state running; state cancelled; state finished; transition first running accept CancelTask then cancelled; transition first running accept TaskDone then finished; }
    attribute def CancelTask;
    attribute def TaskDone;

    // ---- Procedures ----
    action def OpenEnvironmentOptions {
        doc /* Page: Customizing environment options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
        action step1OpenTheOptionsMenu;   // Open the Options menu
        then action step2ChooseEnvironment;   // Choose Environment
        then action step3UseTheQuickFilterTo;   // Use the quick filter to find an option
        then action step4ClickTheOption;   // Click the option
        then action step5ReadItsDescriptionBelowThe;   // Read its description below the list
        then action step6ChangeItsValue;   // Change its value
        then action step7ClickOK;   // Click OK
    }
    action def AssignShortcutKey {
        doc /* Page: Assigning shortcut keys. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectTheKeyboardGroup;   // Select the Keyboard group
        then action step3SearchForTheCommandOr;   // Search for the command, or search by key
        then action step4PressTheNewCombinationIn;   // Press the new combination in the shortcut box
        then action step5ClickAssign;   // Click Assign
        then action step6ClickOK;   // Click OK
    }
    action def RemoveShortcutKey {
        doc /* Page: Assigning shortcut keys. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectTheKeyboardGroup;   // Select the Keyboard group
        then action step3SearchForTheCommand;   // Search for the command
        then action step4SelectAKeyInCurrent;   // Select a key in Current keys
        then action step5ClickRemoveOrRemoveAll;   // Click Remove or Remove All
        then action step6ClickOK;   // Click OK
    }
    action def SetPerspective {
        doc /* Page: Customizing and Selecting Perspective. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148531/Customizing+and+Selecting+Perspective */
        action step1OpenOptionsPerspectivesPerspectives;   // Open Options > Perspectives > Perspectives
        then action step2SelectAPerspective;   // Select a perspective
        then action step3ClickApply;   // Click Apply
    }
    action def CustomizePerspectiveArea {
        doc /* Page: Customizing Perspectives. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148532/Customizing+Perspectives */
        action step1OpenOptionsPerspectivesCustomize;   // Open Options > Perspectives > Customize
        then action step2SelectAPerspective;   // Select a perspective
        then action step3ClickEditNearAnArea;   // Click Edit near an area
        then action step4ChooseAModeForEach;   // Choose a mode for each item
        then action step5ClickOK;   // Click OK
    }
    action def ChangeBrowserPosition {
        doc /* Page: Using the Model Browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2ClickTheBrowserGroup;   // Click the Browser group
        then action step3SetBrowserPositionToLeft;   // Set Browser Position to Left or Right
    }
    action def ZoomModelBrowser {
        doc /* Page: Using the Model Browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
        action step1SelectABrowserTab;   // Select a browser tab
        then action step2HoldCtrlAndRollThe;   // Hold Ctrl and roll the mouse wheel
    }
    action def ResetWindowsConfiguration {
        doc /* Page: Using the Model Browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
        action step1OpenTheWindowMenu;   // Open the Window menu
        then action step2ChooseResetWindowsConfiguration;   // Choose Reset Windows Configuration
    }
    action def OpenNewInheritanceTree {
        doc /* Page: Inheritance tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab */
        action step1OpenTheContainmentStructureOr;   // Open the Containment, Structure or Inheritance tab
        then action step2ClickOpenInNewTree;   // Click Open in New Tree
        then action step3ChooseOpenInNewInheritance;   // Choose Open in New Inheritance Tree
    }
    action def CopyElementBetweenProjects {
        doc /* Page: Working with model elements in the Model Browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
        action step1SelectTheElementInThe;   // Select the element in the browser
        then action step2ChooseCopyOrCutFrom;   // Choose Copy or Cut from its menu
        then action step3OpenTheOtherProject;   // Open the other project
        then action step4SelectTheTargetContainer;   // Select the target container
        then action step5ChoosePaste;   // Choose Paste
    }
    action def MoveElementInBrowser {
        doc /* Page: Working with model elements in the Model Browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
        action step1SelectTheElement;   // Select the element
        then action step2DragItOntoTheNew;   // Drag it onto the new owner
    }
    action def ViewSamples {
        doc /* Page: Editor Tabs. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs */
        action step1OpenHelpShowSamples;   // Open Help > Show Samples
        then action step2PressCtrlF;   // Press Ctrl+F
        then action step3TypeAKeyword;   // Type a keyword
        then action step4StepThroughTheMatches;   // Step through the matches
    }
    action def ShowDiagramZoomSlider {
        doc /* Page: Zoom tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectGeneralDisplay;   // Select General > Display
        then action step3TickShowDiagramZoomSlider;   // Tick Show Diagram Zoom Slider
    }
    action def WriteDocumentation {
        doc /* Page: Documentation tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148514/Documentation+tab */
        action step1SelectAnElement;   // Select an element
        then action step2OpenTheDocumentationTab;   // Open the Documentation tab
        then action step3ClickTheTextArea;   // Click the text area
        then action step4TypeTheText;   // Type the text
        then action step5TickHTMLToUseRich;   // Tick HTML to use rich text
    }
    action def ChangeInterfaceStyle {
        doc /* Page: Changing interface style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148521/Changing+interface+style */
        action step1OpenOptionsLookAndFeel;   // Open Options > Look and Feel
        then action step2ChooseAStyle;   // Choose a style
    }
    action def CreateCustomTheme {
        doc /* Page: Changing interface style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148521/Changing+interface+style */
        action step1OpenOptionsLookAndFeel;   // Open Options > Look and Feel > Metal
        then action step2OpenLookAndFeelThemes;   // Open Look and Feel Themes > Custom
        then action step3EditFontsAndColors;   // Edit fonts and colors
        then action step4ClickOK;   // Click OK
    }
    action def ChangeConfigLocation {
        doc /* Page: Configuration files. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files */
        action step1OpenThePropertiesFileIn;   // Open the properties file in the bin folder
        then action step2AddDlocalconfigLocationToJAVA;   // Add -Dlocalconfig.location to JAVA_ARGS
        then action step3RestartTheTool;   // Restart the tool
    }
    action def DisableInboundNetwork {
        doc /* Page: Disabling inbound network activity. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148545/Disabling+inbound+network+activity */
        action step1OpenThePropertiesFileIn;   // Open the properties file in the bin folder
        then action step2AddDDISABLEINBOUNDCONTrueToJAVA;   // Add -DDISABLEINBOUNDCON=true to JAVA_ARGS
        then action step3SaveAndCloseTheFile;   // Save and close the file
    }
    action def ManageUsageAnalytics {
        doc /* Page: Sharing Usage Analytics information. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148546/Sharing+Usage+Analytics+information */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectGeneralUsageAnalytics;   // Select General > Usage Analytics
        then action step3TickOrClearShareAnonymous;   // Tick or clear Share Anonymous Information
        then action step4ClickOK;   // Click OK
    }
    action def CancelBackgroundTask {
        doc /* Page: Background Task Manager. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148550/Background+Task+Manager */
        action step1FindTheTaskInThe;   // Find the task in the Background Task Manager
        then action step2ClickItsCancelButton;   // Click its cancel button
    }
    action def DumpMemoryHeap {
        doc /* Page: Memory monitor. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148552/Memory+monitor */
        action step1ClickTheMemoryMonitorBar;   // Click the Memory Monitor bar
        then action step2ChooseDumpMemoryHeap;   // Choose Dump Memory Heap
        then action step3NameANewFile;   // Name a new file
        then action step4Save;   // Save
    }
    action def ChangeMemoryAllocation {
        doc /* Page: Memory allocation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148558/Memory+allocation */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectGeneralMemorySettings;   // Select General > Memory Settings
        then action step3ChangeMaximumHeapSize;   // Change Maximum Heap Size
        then action step4RestartTheTool;   // Restart the tool
    }
    action def ChangeValidationPeriod {
        doc /* Page: Active validation period. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148559/Active+validation+period */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectGeneralActiveValidation;   // Select General > Active Validation
        then action step3ChangeActiveValidationPeriod;   // Change Active Validation Period
        then action step4RestartTheTool;   // Restart the tool
    }
    action def ExportInternalErrors {
        doc /* Page: Reporting Issues. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148560/Reporting+Issues */
        action step1OpenTheInternalErrorsDialog;   // Open the Internal Errors dialog
        then action step2ClickExportToFile;   // Click Export To File
        then action step3NameTheLogFile;   // Name the log file
        then action step4ClickExport;   // Click Export
        then action step5SendItToSupport;   // Send it to support
    }
    action def CreatePathVariable {
        doc /* Page: Creating path variables. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148573/Creating+path+variables */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectPathVariables;   // Select Path Variables
        then action step3ClickAdd;   // Click Add
        then action step4EnterNameAndDescription;   // Enter name and description
        then action step5BrowseToTheLocation;   // Browse to the location
        then action step6ClickOKInTheDialog;   // Click OK in the dialog
        then action step7ClickOKInEnvironmentOptions;   // Click OK in Environment Options
    }
    action def DefineLauncher {
        doc /* Page: Launchers. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148578/Launchers */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectLaunchers;   // Select Launchers
        then action step3ClickAdd;   // Click Add
        then action step4EnterTheFileExtensions;   // Enter the file extensions
        then action step5EnterOrBrowseToThe;   // Enter or browse to the launcher
        then action step6SetTheArguments;   // Set the arguments
    }
    action def ChangeXmlVersion {
        doc /* Page: Special characters. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148583/Special+characters */
        action step1OpenOptionsEnvironment;   // Open Options > Environment
        then action step2SelectGeneralSaveLoad;   // Select General > Save/Load
        then action step3PickTheXMLVersion;   // Pick the XML version
    }
    action def AddImageToImageLibrary {
        doc /* Page: Image Library tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148519/Image+Library+tab */
        action step1ZipAFolderOfImages;   // Zip a folder of images
        then action step2PlaceTheZipInData;   // Place the zip in data/imagelibraries/commonsymbols
        then action step3Restart;   // Restart
        then action step4OpenWindowImageLibrary;   // Open Window > Image Library
    }

    // ---- Requirements ----
    requirement <'CAM-GST-001'> mainMenuGroups {
        doc /* The main menu bar groups commands under File, Edit, View, Layout, Diagrams, Options, Tools, Analyze, Collaborate, Window and Help, and a perspective can hide some of these menus. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-002'> fileMenuProject {
        doc /* The File menu holds project commands (New, Open, Save), import and export of external data, and printing of diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-003'> editMenuDiagram {
        doc /* The Edit menu serves diagram work: select, cut, copy and paste symbols or whole diagrams, and find elements in the project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-004'> viewMenuZoomGridToolbars {
        doc /* The View menu holds zoom commands, grid options, diagram tab management and toolbar customization. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-005'> layoutMenu {
        doc /* The Layout menu arranges symbols on the active diagram, and some of its commands need more than one symbol selected. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-006'> diagramsMenu {
        doc /* The Diagrams menu creates diagrams, opens diagram wizards and history, and defines custom diagram types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-007'> optionsMenu {
        doc /* The Options menu opens project and environment options, perspective selection and customization, and the interface style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-008'> toolsAnalyzeMenus {
        doc /* The Tools menu runs transformations, reports, expression evaluation, code generation and macros; the Analyze menu runs model analysis. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-009'> collaborateWindowHelpMenus {
        doc /* The Collaborate menu works with server projects, the Window menu arranges windows, and the Help menu opens documentation and product information. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148420/Main+menu */
    }
    requirement <'CAM-GST-010'> toolbarCustomizeFromView {
        doc /* Toolbars of the tool are customized from the View menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148421/Toolbars */
    }
    requirement <'CAM-GST-011'> browserShownWithProject {
        doc /* The Model Browser is shown while at least one project is open, on the left by default, and may be moved to any place in the window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser */
    }
    requirement <'CAM-GST-012'> browserHierarchy {
        doc /* The Model Browser shows the model as a hierarchy whose nodes are collapsed by default and show expand or collapse markers only when they have children. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser */
    }
    requirement <'CAM-GST-013'> browserOperations {
        doc /* The Model Browser lets a user create, specify, copy, cut, paste, delete, drag and filter model elements, sort them, manage diagrams and display search results. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser */
    }
    requirement <'CAM-GST-014'> browserTabsSet {
        doc /* The Model Browser offers Containment, Structure, Inheritance, Diagrams, Model Extensions tabs, plus Search Results and Lock View tabs that appear only after a search or on a server project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148423/Model+Browser */
    }
    requirement <'CAM-GST-015'> browserDividerResize {
        doc /* The divider between the two parts of the Model Browser can be dragged to change their sizes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
    }
    requirement <'CAM-GST-016'> browserZoom {
        doc /* A browser tab zooms with Ctrl or Cmd plus the mouse wheel or the numeric plus and minus keys. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
    }
    requirement <'CAM-GST-017'> browserPositionOption {
        doc /* The browser can be placed on the left or right through the Browser Position environment option, or floated or auto-hidden from a tab button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
    }
    requirement <'CAM-GST-018'> browserTabClosing {
        doc /* A browser tab is closed or reopened from the Window menu, and Reset Windows Configuration restores all tabs to their default positions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
    }
    requirement <'CAM-GST-019'> browserSortAlphabetical {
        doc /* Items in the browser are sorted alphabetically by default, controlled by the Sort Alphabetically option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148434/Using+the+Model+Browser */
    }
    requirement <'CAM-GST-020'> containmentGroupsModel {
        doc /* The Containment tab groups all model data in logical sets under a root package named Model and gives quick access to each element, its specification and creation of new elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-021'> containmentOpening {
        doc /* The Containment tab opens from the browser header or from the Window menu when hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-022'> relationsBranch {
        doc /* A Relations branch lists relationships owned by an element and appears once at least one relationship exists. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-023'> auxiliaryResourcesToggle {
        doc /* Standard profiles and libraries stay hidden until Show Auxiliary Resources is switched on, and they should not be edited. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-024'> hyperlinksBranch {
        doc /* A Hyperlinks branch lists hyperlinks added to elements and appears once one exists. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-025'> codeEngineeringSets {
        doc /* Code engineering sets link source code to model data for round-trip generation and reverse engineering and are shown through a toolbar option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-026'> treeToolbarCollapseAll {
        doc /* The tab toolbar collapses all expanded nodes, or only the selected node and its subnodes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-027'> openInNewTree {
        doc /* Open in New Tree opens the selected element as the root of a new browser tab, as a new Containment, Structure or Inheritance tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-028'> favorites {
        doc /* Favorites lets a user add an element to a list, manage the list and jump to a favorite in the tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-029'> quickFind {
        doc /* Quick Find opens a small dialog to locate an element quickly. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-030'> treeOptionsMenu {
        doc /* The Options button toggles type filtering, auxiliary resources, applied stereotypes, full types and code engineering sets. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-031'> elementTypeFilter {
        doc /* Filter opens the Select Element Type dialog so that only chosen element types are visible in the tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-032'> appliedStereotypesToggle {
        doc /* Show Applied Stereotypes shows the stereotypes applied to an element next to its name. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-033'> fullTypesToggle {
        doc /* Show Full Types shows the qualified type of typed elements such as attributes and operations. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-034'> treeContextMenu {
        doc /* The element shortcut menu offers Create Element, Create Diagram, Create Relation, Specification, Validation, Go To, Refactor, Related Elements, Tools, Stereotype, Find, Apply Profiles, Project Usages and Generate Report. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-035'> createElementInTree {
        doc /* Create Element and Create Diagram add a new element or diagram inside the selected element when that element is editable. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-036'> createRelationFromTree {
        doc /* Create Relation creates an outgoing or incoming relation from the selected element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-037'> openSpecificationWindow {
        doc /* Specification opens a window to edit the properties of an element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-038'> validationCommands {
        doc /* The Validation command opens checks for accuracy, completeness and correctness of the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-039'> goToCommand {
        doc /* Go To opens the item associated with the element, such as a diagram, model element or hyperlink. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-040'> refactorConvert {
        doc /* Refactor converts the selected element to another element kind chosen by the user. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-041'> relatedElementsList {
        doc /* Related Elements lists functions available for the selected element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-042'> applyProfilesProjectUsages {
        doc /* Apply Profiles (custom profiles only, on packages and models) and Project Usages (share, export to new project) are offered on packages. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-043'> generateReportFromTree {
        doc /* Generate Report lists the available report templates for the selected element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148437/Containment+tab */
    }
    requirement <'CAM-GST-044'> structureTab {
        doc /* The Structure tab, present only with the SysML plugin, shows deeply nested properties of a structured classifier, where each node is a property typed by a classifier whose own properties appear below. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab */
    }
    requirement <'CAM-GST-045'> structureOpenNewTree {
        doc /* In the Structure tab any selected element can be opened in a new tree from the toolbar. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab */
    }
    requirement <'CAM-GST-046'> inheritedStructureOption {
        doc /* Show Inherited Structure adds properties inherited from generalizing classifiers to the Structure tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab */
    }
    requirement <'CAM-GST-047'> nestSatisfiedRequirements {
        doc /* Nest Satisfied Requirements shows requirements nested under the elements that satisfy them, taking relationship context into account. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148450/Structure+tab */
    }
    requirement <'CAM-GST-048'> inheritanceTab {
        doc /* The Inheritance tab shows classifier hierarchy through generalization; an element without generalization is not shown. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab */
    }
    requirement <'CAM-GST-049'> inheritanceInvertTree {
        doc /* Invert Tree shows the child element at the top of the inheritance hierarchy. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab */
    }
    requirement <'CAM-GST-050'> inheritanceSelectInTrees {
        doc /* From an inheritance node, Select in Containment Tree and Select in Structure Tree jump to that element in the other tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148459/Inheritance+tab */
    }
    requirement <'CAM-GST-051'> diagramsTab {
        doc /* The Diagrams tab lists project diagrams, grouped by diagram type by default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148466/Diagrams+tab */
    }
    requirement <'CAM-GST-052'> diagramsTabCommands {
        doc /* From the Diagrams tab a diagram can be opened, printed (only when open), selected in the containment tree, and grouped into packages by first letter when the model has more than 99 diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148466/Diagrams+tab */
    }
    requirement <'CAM-GST-053'> modelExtensionsTab {
        doc /* The Model Extensions tab lists stereotypes, with creation, review, copy, paste and deletion, optionally grouped by profile or metaclass. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148472/Model+Extensions+tab */
    }
    requirement <'CAM-GST-054'> searchResultsTab {
        doc /* The Search Results tab opens after a full Find (Ctrl+Shift+F or Edit > Find), not after Quick Find, and splits hits into Found in loaded diagrams and Found in model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148478/Search+Results+tab */
    }
    requirement <'CAM-GST-055'> searchResultsToolbar {
        doc /* The Search Results toolbar offers Find, Clear Results, Rerun Search and Save Search Results as a smart package. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148478/Search+Results+tab */
    }
    requirement <'CAM-GST-056'> lockViewTab {
        doc /* The Lock View tab, shown for server projects only, lists locked elements and who locked them, with a filter by user and Lock, Select in Containment Tree and Select in Inheritance Tree commands. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148486/Lock+View+tab */
    }
    requirement <'CAM-GST-057'> treeRename {
        doc /* Rename puts an element name into edit mode, also on F2. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
    }
    requirement <'CAM-GST-058'> treeCopyCutPaste {
        doc /* Copy, Cut and Paste duplicate or move the selected element, including between different projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
    }
    requirement <'CAM-GST-059'> copyElementReference {
        doc /* Copy URL and Copy Element Hyperlink put a reference to the selected element on the clipboard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
    }
    requirement <'CAM-GST-060'> treeDelete {
        doc /* Delete removes the selected element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
    }
    requirement <'CAM-GST-061'> treeDragMove {
        doc /* Dragging an element to a new owner in the browser moves it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148489/Working+with+model+elements+in+the+Model+Browser */
    }
    requirement <'CAM-GST-062'> editorTabTypes {
        doc /* Editor tabs include a Welcome tab shown at launch, a Samples tab and any number of diagram editor tabs open at once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs */
    }
    requirement <'CAM-GST-063'> editorTabsCommands {
        doc /* Editor tab commands are found under Window > Editor Tabs. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs */
    }
    requirement <'CAM-GST-064'> samplesView {
        doc /* Model samples are viewed from the Welcome tab (Samples) or Help > Show Samples. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs */
    }
    requirement <'CAM-GST-065'> welcomeSearchBar {
        doc /* Ctrl+F in the Welcome or Samples tab opens a search bar with next, previous, highlight all and match-case commands. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148490/Editor+Tabs */
    }
    requirement <'CAM-GST-066'> statusLineIndications {
        doc /* The status line shows notification, error and task progress indications and offers zoom out, zoom in, a zoom slider, fit to window, 1:1 zoom, enter presentation mode, notification window, background tasks and a memory monitor. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148497/Status+line */
    }
    requirement <'CAM-GST-067'> statusLineVisibility {
        doc /* The View > Status line menu and the General > Display options choose which status line items are shown. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148497/Status+line */
    }
    requirement <'CAM-GST-068'> quickPropertiesPanel {
        doc /* The quick properties panel has Zoom, Documentation and Properties tabs at the bottom of the browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148509/Quick+properties+panel */
    }
    requirement <'CAM-GST-069'> zoomTabPreview {
        doc /* The Zoom tab previews the selected diagram, and dragging its blue square pans or resizes the viewport of the active diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab */
    }
    requirement <'CAM-GST-070'> zoomTabFitInWindow {
        doc /* Fit in Window in the Zoom tab or Ctrl+W fits the diagram to the window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab */
    }
    requirement <'CAM-GST-071'> zoomSliderOption {
        doc /* A Show Diagram Zoom Slider option puts a zoom slider in the Zoom tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148511/Zoom+tab */
    }
    requirement <'CAM-GST-072'> documentationTab {
        doc /* The Documentation tab edits the documentation text of the selected element or symbol, optionally as HTML. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148514/Documentation+tab */
    }
    requirement <'CAM-GST-073'> propertiesTab {
        doc /* The Properties tab shows element, symbol, tags, language and traceability properties; with different kinds selected only common properties show, and above ten selected items they show on request. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148516/Properties+tab */
    }
    requirement <'CAM-GST-074'> imageLibrary {
        doc /* The Image Library tab lists bundled and user-added images (zip of gif, jpg, svg, png, wmf), filters them by simple or pattern search, previews them, and applies an image to a symbol by drop. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148519/Image+Library+tab */
    }
    requirement <'CAM-GST-075'> lookAndFeel {
        doc /* Options > Look and Feel changes the appearance of windows, dialogs and menus, with a custom theme for fonts and colors. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148521/Changing+interface+style */
    }
    requirement <'CAM-GST-076'> shortcutFindDialogs {
        doc /* Ctrl+Shift+F opens Find, Ctrl+Alt+F opens Quick Find and Ctrl+R opens Find and Replace. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-077'> shortcutDeleteSymbolOrElement {
        doc /* Delete removes only the symbol from the diagram, whereas Ctrl+D removes both the symbol and the model element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-078'> shortcutSelectAll {
        doc /* Ctrl+A selects all shapes on the active diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-079'> shortcutSelectInTree {
        doc /* Alt+B selects the element in the containment tree and switches Select Element dialog between list and tree view. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-080'> shortcutMultiSelect {
        doc /* Shift+click adds symbols to the selection, and Alt+click selects elements of the same type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-081'> shortcutOpenSpecification {
        doc /* Enter opens the Specification window, and Alt+Enter opens Symbol Properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-082'> shortcutAssignOnSymbol {
        doc /* Ctrl+Space, when typing on a symbol, lists elements that can be assigned. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-083'> shortcutNewLineInCompartment {
        doc /* Shift+Enter inserts a new line or a new row in a shape compartment, such as a new attribute. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-084'> shortcutClipboard {
        doc /* Ctrl+X, Ctrl+C and Ctrl+V cut, copy and paste, Ctrl+E pastes with a new element, Ctrl+drag copies a shape, and Ctrl+Shift+V pastes a symbol style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-085'> shortcutSaveUndoRedo {
        doc /* Ctrl+S saves, Ctrl+Z undoes, and Ctrl+Y redoes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-086'> shortcutPrint {
        doc /* Ctrl+P prints the active diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-087'> shortcutServerCommit {
        doc /* Ctrl+K commits changes to the server. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-088'> shortcutRecentDiagrams {
        doc /* F12 lists recently opened diagrams, and Ctrl+Shift+T reopens the last closed diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-089'> shortcutFullScreen {
        doc /* F11 turns on full screen mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-090'> shortcutReportWizard {
        doc /* Ctrl+Shift+G opens the Report Wizard and Alt+1 to Alt+9 can be assigned to print reports. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-091'> shortcutReversePath {
        doc /* Holding Alt while drawing a path reverses its direction. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-092'> shortcutReorder {
        doc /* Ctrl+Up and Ctrl+Down (Alt+Up and Alt+Down on Mac) reorder elements or properties in lists, trees and the Specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-093'> shortcutNextResult {
        doc /* F3 and Shift+F3 select the next or previous result in a tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-094'> shortcutBrowserZoom {
        doc /* Ctrl+mouse wheel or Ctrl+numpad plus and minus zooms the browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148525/Most+common+shortcut+keys */
    }
    requirement <'CAM-GST-095'> assignShortcut {
        doc /* A shortcut key can be assigned to any command in the Keyboard group of the Environment Options, by pressing the combination rather than typing it, and a command may have several keys. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
    }
    requirement <'CAM-GST-096'> shortcutConflict {
        doc /* A key already used by another command shows a notice, and assigning it moves the key to the new command. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
    }
    requirement <'CAM-GST-097'> removeShortcut {
        doc /* A default or custom key is removed with Remove, or all keys of a command with Remove All. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
    }
    requirement <'CAM-GST-098'> restoreShortcuts {
        doc /* Reset to Defaults restores all shortcut keys. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148526/Assigning+shortcut+keys */
    }
    requirement <'CAM-GST-099'> envDialogStructure {
        doc /* The Environment Options dialog groups project-independent options in a tab tree, filters options with a quick filter across all groups, shows a description area, and resets values with Reset to Defaults. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-100'> envGeneralDisplay {
        doc /* Display options set language, title bars, status bar, zoom slider, presentation button, memory monitor, low memory notice, welcome screen, full screen toolbars, extra features, hint and notification modes, boolean text, navigation icons and fonts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-101'> envEditingOptions {
        doc /* General editing options set opaque expression lines, diagram name sync with context, behavior diagram creation, link slots, relation move prompts and the default expression language. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-102'> envGeneralMisc {
        doc /* General options save settings on exit, tips, recent project, server and window list sizes, editor tab limit, undo list size (max 500) and automatic autowire and delegation messages. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-103'> envImageExport {
        doc /* Image export options set background, JPEG quality, SVG text output and letter spacing, EMF icons, resolution, scale percent, TIFF color space and TIFF compression. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-104'> envInternalErrors {
        doc /* Internal Errors options show internal errors, submit them automatically and attach the log. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-105'> envMemorySettings {
        doc /* Memory Settings set the maximum heap and thread stack size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-106'> envMergeCompare {
        doc /* Merge and Compare options set optimization mode, ignored order changes, automatic conflict resolution, diagram change detection and teamwork cloud diagram differences. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-107'> envNavigationOptions {
        doc /* Navigation options choose same-tab or new-tab opening of a diagram from another diagram and from the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-108'> envSaveLoad {
        doc /* Save and load options create backup files, save recovery data on idle, open the last project at startup, set table load time, rich XMI, XML version, UUIDs, dependency check, blank template, used project paths and numbering checks. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-109'> envSpecificationOptions {
        doc /* Specification options strip multiline text, open Specification in the same or new window, and set the recent specification list and history sizes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-110'> envUsageAnalyticsOption {
        doc /* A Share Analytics Information option turns anonymous usage sharing on or off. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-111'> envDiagramEditing {
        doc /* Diagram editing options set smart path layout, path breakpoints on shape move, nested activations, stereotype editing, path optimization, path display on drop, element insertion on paths, control flow joining and compartment size. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-112'> envDiagramDisplay {
        doc /* Diagram display options set text and graphics antialiasing, centerlines and grid style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-113'> envSymbolManipulation {
        doc /* Symbols Manipulation options set manipulation highlighting, group selection by partial or complete coverage (Ctrl inverts) and path label marking. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-114'> envZoomOptions {
        doc /* Zoom options set the zoom step (0.1 to 1.0) and whether zooming centers on the pointer. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-115'> envSmartManipulators {
        doc /* Smart manipulator options set the left button action, fade time and when manipulators appear (mouse over or Shift). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-116'> envToolbarOptions {
        doc /* Toolbar options show names next to icons and place the toolbar left or right. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-117'> envRelationMap {
        doc /* Relation Map options inform about removed elements, ask on layout restore and keep manual expansion state. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-118'> envBrowserOptions {
        doc /* Browser options set position, full types, auxiliary resources, sorting, applied stereotypes, change highlighting and hyperlinks, plus tree-specific options for diagrams, inheritance, search results, model extensions and structure. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-119'> envCompositionInspection {
        doc /* Composition Inspection options ask for confirmation when shared packages or their elements are removed or moved between used projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-120'> envCollaboration {
        doc /* Collaboration options set automatic login, version warnings, server names, SSL, SSO, locking, notification intervals and user display. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-121'> envLicensing {
        doc /* 3DEXPERIENCE and Floating options configure platform integration, CATIA publishing and license servers. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-122'> envNetworkProxy {
        doc /* Network options set an HTTP proxy for automatic connections and a connection timeout. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-123'> envPluginsResources {
        doc /* Plugins lists installed plugins, and Resources configures external resources loaded with a project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-124'> envSpelling {
        doc /* Spelling options check as you type, check tagged values, choose dictionary, case, camel case, upper case and numbers and add dictionaries. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-125'> envExperienceModes {
        doc /* Experience options select expert or standard command lists for menus, toolbars, smart manipulators and property dialogs. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-126'> envExternalTools {
        doc /* External Tools lets a user register tools launched from the application with model artifacts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-127'> envNotifications {
        doc /* Notification options set display time, severity colors, minimum severity and history retention. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-128'> envServerCertificates {
        doc /* Server Certificates lists certificates trusted by all users or the current user with add, remove and view. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-129'> envPluginAreas {
        doc /* Plugin-contributed groups cover code engineering, concept modeling, Eclipse UML2 XMI import and export, Enterprise Architect import, macros, Report Wizard and UAF. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148528/Customizing+environment+options */
    }
    requirement <'CAM-GST-130'> perspectiveSet {
        doc /* Perspectives (Full Featured, Quick Start, Software Architect, System Analyst) preset features by role; one is chosen in the startup dialog, from Options > Perspectives, or the Perspectives toolbar. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148531/Customizing+and+Selecting+Perspective */
    }
    requirement <'CAM-GST-131'> perspectiveCustomize {
        doc /* Seven areas (main menu, main toolbars, diagram toolbars, modeling elements toolbar, smart manipulators, shortcut menu, Create Diagram dialog) can show items in standard and expert, expert only or hidden mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148532/Customizing+Perspectives */
    }
    requirement <'CAM-GST-132'> perspectiveExpertToggle {
        doc /* Expert Menu Mode, Expert Toolbar Mode and palette Expert Mode switch complete command lists. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148532/Customizing+Perspectives */
    }
    requirement <'CAM-GST-133'> perspectiveSelectDialog {
        doc /* The Select Perspective dialog lists perspectives, an Expert check box that loads all commands, and Customize. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148533/Select+Perspective+dialog */
    }
    requirement <'CAM-GST-134'> perspectiveManage {
        doc /* Perspectives are cloned, renamed (also F2), removed, imported from and exported to .umd files, and reset to defaults. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148535/Customize+Perspectives+dialog */
    }
    requirement <'CAM-GST-135'> perspectiveAreaDialog {
        doc /* A Customize area dialog assigns each item to Standard and Expert, Expert or Hidden by radio buttons. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148542/Dialog+for+customizing+selected+modeling+tool+area */
    }
    requirement <'CAM-GST-136'> configFilesLocation {
        doc /* Configuration and auxiliary files live per user in a version-specific folder, and its path is found in Help > About > Environment. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files */
    }
    requirement <'CAM-GST-137'> configFilesRedirect {
        doc /* The configuration folder can be moved to the install folder, the Common Application Data folder or a custom path, by a launcher property or a redirect file that may use sys, env and app variables. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files */
    }
    requirement <'CAM-GST-138'> configJavaSettings {
        doc /* Configuration files define application arguments, Java home, memory and classpath, and browser extensions (.crx) can be installed in the JxBrowser extensions folder. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148544/Configuration+files */
    }
    requirement <'CAM-GST-139'> disableInboundNetwork {
        doc /* Inbound network activity can be disabled by a launch property; Help and issue submission then stop working and double-clicking a project file opens a new window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148545/Disabling+inbound+network+activity */
    }
    requirement <'CAM-GST-140'> usageAnalyticsOptOut {
        doc /* Anonymous usage analytics can be turned off in the first-start prompt, in Environment options, or entirely by a launch property; collected data is software and hardware specification. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148546/Sharing+Usage+Analytics+information */
    }
    requirement <'CAM-GST-141'> backgroundTaskManager {
        doc /* Routine tasks run in background threads, shown in a Background Task Manager at the bottom right with progress, and a long task is cancelled by its button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148550/Background+Task+Manager */
    }
    requirement <'CAM-GST-142'> memoryMonitor {
        doc /* A memory monitor in the status line shows used memory and heap size, turns red above 85 percent, runs the garbage collector, and dumps heap or histogram on request or by Ctrl+Shift+H or Ctrl+Alt+Shift+H. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148552/Memory+monitor */
    }
    requirement <'CAM-GST-143'> memoryAllocation {
        doc /* Allocated memory (Java heap) is changed in Memory Settings, the properties file or an environment variable, and a low memory notice can be disabled. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148558/Memory+allocation */
    }
    requirement <'CAM-GST-144'> activeValidationPeriod {
        doc /* The period between automatic validations can be lengthened in the Active Validation option to improve performance. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148559/Active+validation+period */
    }
    requirement <'CAM-GST-145'> performanceAdvice {
        doc /* Large models improve by more memory, longer validation periods, project partitioning, garbage collection, cancelling tasks and a diagram tab limit. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148549/Improving+performance */
    }
    requirement <'CAM-GST-146'> reportUnresponsive {
        doc /* A separate tool dumps threads, heap or histogram of an unresponsive instance to files for the support team. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148560/Reporting+Issues */
    }
    requirement <'CAM-GST-147'> internalErrorsDialog {
        doc /* Internal errors appear as notifications; an Internal Errors dialog (from the notification or the status line) exports the log, and display can be turned off for 24 hours or by option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148560/Reporting+Issues */
    }
    requirement <'CAM-GST-148'> pathVariables {
        doc /* Path variables name paths used in classpaths, hyperlinks, module paths and reports so each user can map them differently, and a suggestion dialog offers a variable for an absolute path. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148573/Creating+path+variables */
    }
    requirement <'CAM-GST-149'> launchers {
        doc /* Launchers map file extensions to external programs with arguments ($f file, $md_dir, $prj_dir, $r row, $c column), with a default launcher and browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148578/Launchers */
    }
    requirement <'CAM-GST-150'> specialCharacters {
        doc /* XML 1.0 is the default save format and replaces certain special characters in element names with underscores; XML 1.1 can be chosen under Save/Load. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148583/Special+characters */
    }
}
