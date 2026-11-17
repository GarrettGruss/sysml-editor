package CameoUI_ELM {
    private import CameoUI::*;
    private import ScalarValues::*;
    doc /* Section 000 User Guide / 009 Working with model elements. Importing from spreadsheets, the Specification window, property editing, refactoring, symbol formatting, hyperlinks, numbering, favorites and related option dialogs. Written by hand; see README.md. */

    // ---- Screens ----
    part def ExcelCsvImportDialog :> Dialog { part importMapSource : Field; part mappingOptions : Option; part mappingArea : Field; }
    part def SaveImportMapDialog :> Dialog;
    part def ManageMapGroupsDialog :> Dialog;
    part def SelectTypeDialog :> Dialog { part hideUncommon : Option; part filterByImports : Option; }
    part def SelectElementTypeDialog :> Dialog;
    part def SpecificationToolbar :> Toolbar;
    part def PropertyGroupToolbar :> Toolbar;
    part def QuickFilterBox :> Field;
    part def MultilineValueEditor :> Dialog;
    part def AdvancedHtmlEditorDialog :> Dialog;
    part def SymbolPropertiesDialog :> Dialog { part applyStyle : ToolbarButton; part makeDefault : ToolbarButton; }
    part def SymbolStylesOptionGroup :> Panel;
    part def ImageLibraryPane :> Panel;
    part def SelectImageDialog :> Dialog;
    part def CustomizePropertiesDialog :> Dialog;
    part def EditHyperlinkDialog :> Dialog { part addressTab : Field; part fileTab : Field; part elementSymbolTab : Field; part oslcTab : Field; attribute active : Boolean; }
    part def ElementNumberingDialog :> Dialog { part separator : Field; part prefix : Field; part numberingScheme : Field; }
    part def ManageFavoritesDialog :> Dialog;
    part def SynchronizationDialog :> Dialog;
    part def DateAndTimeSettingsDialog :> Dialog { part calendar : Field; part timeZone : Field; }
    part def ExtractSequenceWizard :> Wizard;
    part def ExtractActivityWizard :> Wizard;
    part def ExtractStateMachineWizard :> Wizard;
    part def ExtractStructureWizard :> Wizard;
    part def ElementSpecification { attribute name : Label; part propertyGroups : Field[0..*]; }
    part def ImportMap { attribute name : Label; }
    part def MapGroup { attribute name : Label; ref maps : ImportMap[2..*]; }
    part def Hyperlink { attribute active : Boolean; attribute displayText : Label; }
    part def NumberingScheme { attribute prefix : Label; attribute separator : Label; }
    part def SymbolStyle { attribute name : Label; attribute isDefault : Boolean; }

    // ---- Commands ----
    action def PasteAsElements :> Command;   // Ctrl+V
    action def ImportUsingNewMap :> Command;
    action def ImportUsingExistingMap :> Command;
    action def ImportUsingExistingMapGroup :> Command;
    action def ManageMapGroups :> Command;
    action def OpenSpecification :> Command;
    action def SelectInContainmentTree :> Command;
    action def RefreshSpecification :> Command;
    action def ResetToDefaults :> Command;
    action def Redefine :> Command;
    action def ConvertTo :> Command;
    action def ReplaceElement :> Command;
    action def ReverseDirection :> Command;
    action def ReverseFlowDirection :> Command;
    action def SwapSymbols :> Command;
    action def Extract :> Command;
    action def MakeDefaultStyle :> Command;
    action def CloneStyle :> Command;
    action def PasteStyle :> Command;   // Ctrl+Shift+V
    action def CustomizeProperties :> Command;
    action def ManageNavigation :> Command;
    action def OpenHyperlink :> Command;
    action def ElementNumbering :> Command;
    action def AddSelectedToFavorites :> Command;
    action def ManageFavorites :> Command;
    action def SynchronizeManually :> Command;
    action def CopyUrl :> Command;
    action def OpenElementFromUrl :> Command;
    action def CloneElement :> Command;
    action def MoveUp :> Command;   // Ctrl+Up
    action def MoveDown :> Command;   // Ctrl+Down

    // ---- Modes ----
    state def SelectionDialogMode { state single; state multiple; transition first single accept ToggleMultiple then multiple; transition first multiple accept ToggleSingle then single; }
    attribute def ToggleMultiple;
    attribute def ToggleSingle;
    state def CreationMode { state off; state on; transition first off accept TurnOn then on; transition first on accept TurnOff then off; }
    attribute def TurnOn;
    attribute def TurnOff;
    state def PropertyDetailMode { state standardDetail; state expertDetail; state allDetail; }
    state def PropertyViewMode { state categorized; state alphabetical; }
    state def TypeSelectionMode { state off; state on; transition first off accept EnableTypeSelection then on; transition first on accept DisableTypeSelection then off; }
    attribute def EnableTypeSelection;
    attribute def DisableTypeSelection;
    state def SpecificationOpeningMode { state sameWindow; state separateWindows; }
    state def OwnerDisplayMode { state hidden; state belowName; state sameLine; state aboveName; }
    state def TooltipStyle { state none; state elementName; state elementDocumentation; }
    state def HyperlinkUpdateMode { state automaticallyUpdated; state automaticallyChecked; state custom; }
    state def NumberDisplayMode { state aboveName; state beforeName; state notDisplayed; }
    state def ExtractSequenceWizardFlow { entry action begin; then state specifyElement; state specifyElement; state selectMessages; transition first specifyElement accept Next then selectMessages; }
    state def ExtractActivityWizardFlow { entry action begin; then state specifyDiagram; state specifyDiagram; state createParameters; state createReference; transition first specifyDiagram accept Next then createParameters; transition first createParameters accept Next then createReference; }
    state def ExtractStateMachineWizardFlow { entry action begin; then state specifyElement; state specifyElement; state createPoints; state specifySubmachine; transition first specifyElement accept Next then createPoints; transition first createPoints accept Next then specifySubmachine; }
    state def ExtractStructureWizardFlow { entry action begin; then state specifyElement; state specifyElement; state createPorts; state createProperty; transition first specifyElement accept Next then createPorts; transition first createPorts accept Next then createProperty; }
    attribute def Next;

    // ---- Procedures ----
    action def pasteListAsElementsInTree {
        doc /* Page: Creating elements from other resources: Containment tree. Each list item becomes an element; names must be unique per owner. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150801/Creating+elements+from+other+resources */
        action copyList;
        then action selectOwnerInTree;
        then action pasteFromShortcutMenu;
        then action chooseElementType;
        then action elementsAppearInModel;
    }
    action def pasteListAsElementsOnDiagram {
        doc /* Page: Creating elements from other resources: diagram pane via Select Type dialog. Alternative: use the palette instead of the Paste Special dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150801/Creating+elements+from+other+resources */
        action copyList;
        then action clickFreeSpace;
        then action pressPaste;
        then action chooseElementsInPasteSpecial;
        then action chooseElementType;
    }
    action def saveImportMap {
        doc /* Page: Saving an Import Map. Starts from File > Import From > Excel/CSV File > Import Using New Map. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150812/Saving+an+Import+Map */
        action openImportUsingNewMap;
        then action setMandatoryOptions;
        then action clickSaveMap;
        then action chooseSaveLocation;
        then action clickCreate;
        then action typeMapName;
        then action closeSpecification;
        then action confirmImport;
    }
    action def createMapGroup {
        doc /* Page: Managing Map Groups: creating a group. A group is only useful with at least two maps; it runs them in order. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150815/Managing+Map+Groups */
        action openManageMapGroups;
        then action selectImportsPackage;
        then action clickCreateGroup;
        then action typeGroupName;
        then action closeSpecification;
        then action addMapsToGroup;
    }
    action def openExcelCsvImportDialog {
        doc /* Page: Excel and CSV Import dialog: opening. File > Import From > Excel/CSV File > Import Using New Map. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150826/Excel+and+CSV+Import+dialog */
        action chooseImportUsingNewMap;
        then action dialogOpens;
    }
    action def migrateCsvImportMaps {
        doc /* Page: Import Maps migration from CSV Import Plugin. Group migrates only when all its maps migrate together. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150839/Import+Maps+migration+from+CSV+Import+Plugin */
        action openProjectWithOldMaps;
        then action chooseImportUsingExistingMap;
        then action acceptMigrationMessage;
        then action selectMapOrGroup;
        then action clickOk;
        then action selectFileAndCheckOptions;
        then action clickImport;
    }
    action def removeExcelImportPluginUsage {
        doc /* Page: Covering use cases of Excel Import Plugin: removing plugin usage. The deprecated plugin usage must go before using the current import. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150832/Covering+use+cases+of+Excel+Import+Plugin */
        action openProject;
        then action showAuxiliaryResources;
        then action rightClickImportProfile;
        then action chooseProjectUsagesRemove;
    }
    action def importNestedRequirements {
        doc /* Page: Importing nested Requirements. The spreadsheet needs an Owner column. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150841/Importing+nested+Requirements */
        action openProject;
        then action chooseImportUsingNewMap;
        then action selectExcelFile;
        then action setImportTypeElement;
        then action setRequirementElementType;
        then action mapNameTextIdOwner;
        then action setTargetScope;
        then action mapColumnsToProperties;
        then action clickImport;
    }
    action def importBlocksAndProperties {
        doc /* Page: Importing Blocks and their properties. Four phases: blocks, property maps, map group, run the group. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150844/Importing+Blocks+and+their+properties */
        action importBlocks;
        then action savePropertyImportMaps;
        then action createMapGroup;
        then action importMapGroup;
    }
    action def importRelationships {
        doc /* Page: Importing relationships. Needs existing source and target elements and legal relationship ends. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150850/Importing+relationships */
        action prepareSourceTargetColumns;
        then action mapColumnsToClientSupplier;
        then action restrictSearchToTargetScope;
        then action clickImport;
    }
    action def importInstances {
        doc /* Page: Importing instances. Instances are created with slots under a classifier. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150854/Importing+instances */
        action chooseImportUsingNewMap;
        then action selectExcelFile;
        then action setImportTypeInstances;
        then action setInstanceClassifier;
        then action selectNestedProperties;
        then action setTargetScope;
        then action selectSheet;
        then action mapColumnsToProperties;
        then action clickImport;
    }
    action def openReferencedSpecification {
        doc /* Page: Functions of Specification window: open referenced element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150863/Functions+of+Specification+window */
        action chooseOpenSpecification;
        then action navigateWithBackForward;
    }
    action def setProjectDefaultProperties {
        doc /* Page: Default property values: whole project. Existing elements keep their values. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values */
        action chooseProjectOptions;
        then action expandDefaultModelProperties;
        then action changeValues;
    }
    action def setDiagramDefaultProperties {
        doc /* Page: Default property values: one diagram type. Done through the Customize Diagrams wizard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values */
        action chooseDiagramsCustomize;
        then action selectDiagramType;
        then action clickEdit;
        then action reachToolbarButtonsStep;
        then action addNewButton;
        then action selectModelElementType;
        then action editDefaultProperties;
    }
    action def editLongText {
        doc /* Page: Editing long textual values. HTML check box switches to the HTML editor. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150886/Editing+long+textual+values */
        action clickValueCell;
        then action clickEditButton;
        then action typeValue;
        then action clickOk;
    }
    action def editMultilineValues {
        doc /* Page: Editing multiline textual values. Alt+Enter adds a row, Alt+Backspace removes, Alt+Shift+Up/Down reorders. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150887/Editing+multiline+textual+values */
        action openMultilineEditor;
        then action addRow;
        then action editRowText;
        then action reorderRows;
        then action removeRow;
    }
    action def selectFromNonEditableList {
        doc /* Page: Selecting single value from non-editable list. <UNSPECIFIED> clears optional values. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150890/Selecting+single+property+value+from+non-editable+list */
        action clickValueCell;
        then action chooseListValue;
    }
    action def selectFromEditableList {
        doc /* Page: Selecting single value from editable list. Choose from auto-completion or the Select Element dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150893/Selecting+single+property+value+from+editable+list */
        action clickValueCell;
        then action openSelectElementDialog;
        then action pickOrCreateElement;
        then action clickOk;
    }
    action def selectMultipleValues {
        doc /* Page: Selecting multiple property values. Multiple Selection mode must be on. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150899/Selecting+multiple+property+values */
        action clickValueCell;
        then action clickEditButton;
        then action pickElements;
        then action clickOk;
    }
    action def createInnerElementAsValue {
        doc /* Page: Creating inner element as property value. The owner of the property becomes owner of the new element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150904/Creating+inner+element+as+property+value */
        action clickValueCell;
        then action clickAddButton;
        then action chooseElementKind;
        then action fillNewSpecification;
        then action closeOrGoBack;
    }
    action def assignValueSpecification {
        doc /* Page: Assigning value specification as property value. Changing it means deleting the old one first. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150906/Assigning+value+specification+as+property+value */
        action clickValueCell;
        then action openShortcutMenu;
        then action chooseValueSpecification;
        then action pickSpecification;
    }
    action def sortElementsManually {
        doc /* Page: Sorting elements manually. Locked elements cannot be reordered in server projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150911/Sorting+elements */
        action openOwnerSpecification;
        then action chooseInnerElementsGroup;
        then action chooseSortingView;
        then action selectElements;
        then action moveUpOrDown;
    }
    action def redefineInheritedPart {
        doc /* Page: Redefinition: redefine an inherited part. Ports and connectors stay in place. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150915/Redefinition */
        action rightClickPart;
        then action chooseRefactorRedefineTo;
        then action typeNameOrPickType;
    }
    action def reverseRelationshipDirection {
        doc /* Page: Reversing relationships direction. Needs editable, compatible ends. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150922/Reversing+relationships+direction */
        action selectRelationship;
        then action chooseRefactorReverseDirection;
    }
    action def reverseInformationFlow {
        doc /* Page: Reversing Information Flow direction. Updated in all related diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150927/Reversing+Information+Flow+direction */
        action selectConnectorWithFlow;
        then action chooseRefactorReverseFlowDirection;
    }
    action def swapSymbols {
        doc /* Page: Swapping. Not allowed when shapes have different parents. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150924/Swapping */
        action dragOneShapeOntoOther;
        then action orSelectTwoShapes;
        then action chooseRefactorSwap;
    }
    action def extractFromDiagram {
        doc /* Page: Extract wizards: start. Common start for sequence, activity, state machine and structure. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150934/Extract+Sequence+Wizard */
        action selectPartOfDiagram;
        then action chooseRefactorExtract;
        then action wizardOpens;
    }
    action def openSymbolProperties {
        doc /* Page: Symbol Properties dialog: open. Edit > Symbol > Symbol Properties, shortcut menu, or Alt+Enter. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150977/Symbol+Properties+dialog */
        action selectSymbols;
        then action chooseSymbolProperties;
        then action dialogOpens;
    }
    action def applyImageFromLibrary {
        doc /* Page: Applying image: Image Library tab. Other routes: Select Image dialog, external resource. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150982/Applying+image */
        action openImageLibraryFromWindowMenu;
        then action selectImage;
        then action dragImageOntoSymbol;
    }
    action def hideRakeIcon {
        doc /* Page: Displaying rake icon. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150998/Displaying+rake+icon */
        action openSymbolProperties;
        then action setShowRakeIconFalse;
    }
    action def cloneSymbolStyle {
        doc /* Page: Working with Symbol styles: clone a style. Lock styles first in a Teamwork Cloud project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151004/Working+with+Symbol+styles */
        action selectDefaultStyle;
        then action clickClone;
        then action nameNewStyle;
        then action changeOptions;
    }
    action def makeStyleDefault {
        doc /* Page: Working with Symbol styles: make default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151004/Working+with+Symbol+styles */
        action selectStyle;
        then action clickMakeDefault;
    }
    action def copyAndPasteSymbolStyle {
        doc /* Page: Copy and paste symbol style. Edit > Paste Style, Ctrl+Shift+V. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151025/Copy+and+paste+symbol+style */
        action selectSourceSymbols;
        then action copySymbols;
        then action selectTargetSymbols;
        then action pasteStyle;
    }
    action def createProjectFromStyleTemplate {
        doc /* Page: Making your own default style for new projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151029/Making+your+own+default+style+for+new+projects */
        action openTemplateFile;
        then action modifySymbolStyles;
        then action saveTemplate;
        then action newProjectFromTemplate;
        then action pickTemplateAndConfirm;
    }
    action def openCustomizeProperties {
        doc /* Page: Customizing lists of properties and commands: open. Four entry points: specification, browser, symbol properties, browser symbol tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151030/Customizing+lists+of+properties+and+commands */
        action chooseEntryPoint;
        then action clickCustomize;
        then action chooseVisibleProperties;
    }
    action def addHyperlinkToElement {
        doc /* Page: Hyperlinks on elements: add. Only one hyperlink per element is active. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151069/Hyperlinks+on+elements */
        action selectElementOrDiagram;
        then action chooseGoToManageNavigation;
        then action chooseNavigationHyperlinksGroup;
        then action clickAdd;
        then action pickHyperlinkTab;
        then action fillTabFields;
        then action tickActive;
    }
    action def openHyperlink {
        doc /* Page: Opening hyperlinks. Ctrl opens a diagram target in a new window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151072/Opening+hyperlinks */
        action hoverOrSelectLinked;
        then action clickOrDoubleClick;
    }
    action def selectLinkedElementInTree {
        doc /* Page: Selecting referenced element in Containment tree. Alt plus double-click, or Ctrl+Alt plus double-click. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151073/Selecting+referenced+element+in+Containment+tree */
        action selectLinkedText;
        then action altDoubleClick;
    }
    action def setHyperlinkDefaults {
        doc /* Page: Default settings of hyperlinks to model elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151068/Default+settings+of+hyperlinks+to+model+elements */
        action chooseOptionsProject;
        then action expandGeneralElementReferences;
        then action setDisplayMode;
        then action setUpdateMode;
    }
    action def createElementInSelectionDialog {
        doc /* Page: Creating new elements in selection dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151096/Creating+new+elements */
        action turnCreationModeOn;
        then action selectOwnerInTree;
        then action clickCreate;
        then action pickElementType;
        then action fillSpecificationAndClose;
    }
    action def cloneElementInSelectionDialog {
        doc /* Page: Cloning selected element in selection dialog. A number is appended to the cloned name. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151097/Cloning+selected+element */
        action turnCreationModeOn;
        then action selectElement;
        then action clickClone;
        then action editSpecificationAndClose;
    }
    action def restrictTypesToImports {
        doc /* Page: Filter By Package Imports filter. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151104/Filter+By+Package+Imports+filter */
        action createPackageDiagram;
        then action dragPackages;
        then action createPackageImport;
        then action openSelectType;
        then action applyImportFilter;
    }
    action def enableTypeSelectionMode {
        doc /* Page: Selecting port and part types. Per-project setting. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151109/Selecting+port+and+part+types */
        action openCompositeStructureOrClassPalette;
        then action clickTypeSelectionMode;
    }
    action def enableAutoNumbering {
        doc /* Page: Automatic numbering. Needs a numbering customization. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151117/Automatic+numbering */
        action chooseOptionsProject;
        then action openGeneralNumbering;
        then action setUseElementAutoNumberingTrue;
        then action clickOk;
        then action chooseNumberDisplayMode;
    }
    action def numberElementManually {
        doc /* Page: Manual numbering. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151121/Manual+numbering */
        action chooseElementNumbering;
        then action selectElement;
        then action clickCreate;
        then action editOrSetCustomId;
    }
    action def addElementToFavorites {
        doc /* Page: Adding favorites. Quick path or via Manage Favorites. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151131/Adding+removing+and+changing+order+of+favorites */
        action selectElementInBrowser;
        then action openBrowserMenu;
        then action chooseAddSelectedToFavorites;
    }
    action def manageFavorites {
        doc /* Page: Manage favorites. Order matches the Favorites menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151140/Manage+favorites */
        action openManageFavorites;
        then action addOrRemove;
        then action reorder;
        then action clickOk;
    }
    action def insertImageInHtmlText {
        doc /* Page: Inserting images into HTML text. Three sources: file, attached file, image library. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151171/Inserting+images+into+HTML+text */
        action openAdvancedHtmlEditor;
        then action clickInsertImage;
        then action chooseSource;
        then action clickOkTwice;
    }
    action def openSynchronizationDialog {
        doc /* Page: Synchronization dialog environment: open. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151180/Synchronization+dialog+environment */
        action chooseSynchronizeManually;
        then action dialogOpens;
        then action synchronizeSelectedOrAll;
    }
    action def copyElementUrl {
        doc /* Page: Copying element URLs. The mdel:// scheme; not on the no-install version. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151183/Copying+and+opening+element+URLs */
        action chooseCopyUrl;
        then action shareUrl;
        then action chooseOpenElementFromUrl;
    }
    action def setDateAndTime {
        doc /* Page: Setting date and time. Uses the computer locale for format. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151184/Setting+date+and+time */
        action openDateTimeDialog;
        then action pickDateTimeZone;
        then action confirm;
    }
    action def setOwnerDisplayMode {
        doc /* Page: Owner display mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151188/Owner+display+mode */
        action openSymbolProperties;
        then action setShowOwnerMode;
    }
    action def setQualifiedNameStyle {
        doc /* Page: Qualified name display style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151194/Qualified+name+display+style */
        action chooseOptionsProject;
        then action selectGeneralGeneral;
        then action setQualifiedNameDisplayStyle;
    }
    action def setTooltipsStyle {
        doc /* Page: Changing the tooltips style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151209/Changing+the+tooltips+style */
        action chooseOptionsProject;
        then action findTooltipsStyle;
        then action pickValue;
        then action clickOk;
    }
    action def markElementAuxiliary {
        doc /* Page: Marking elements as auxiliary. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151210/Marking+elements+as+auxiliary */
        action selectElementInBrowser;
        then action openTagsTab;
        then action setTreatAsAuxiliaryTrue;
    }
    action def reorderInDialog {
        doc /* Page: Reordering elements. Up/Down buttons, Ctrl+Up/Down, or drag and drop. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151213/Reordering+elements */
        action selectElements;
        then action moveWithButtonsKeysOrDrag;
    }

    // ---- Requirements ----
    requirement <'CAM-ELM-001'> pasteListCreatesElements {
        doc /* Pasting a list from another application creates one element per line, in the tree or on a diagram, after a type is chosen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150801/Creating+elements+from+other+resources */
    }
    requirement <'CAM-ELM-002'> importMapSave {
        doc /* A configured spreadsheet import can be saved as a reusable map stored in the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150812/Saving+an+Import+Map */
    }
    requirement <'CAM-ELM-003'> mapGroups {
        doc /* Several import maps can be grouped and run in order. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150815/Managing+Map+Groups */
    }
    requirement <'CAM-ELM-004'> importDialogAreas {
        doc /* The import dialog has file selection, mapping options and a column mapping area, with mandatory options enforced. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150826/Excel+and+CSV+Import+dialog */
    }
    requirement <'CAM-ELM-005'> importMappingOptions {
        doc /* Import options choose the type (elements or instances), element type, stereotype, mapped properties, target scope, search scopes, sheet and first cell. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150826/Excel+and+CSV+Import+dialog */
    }
    requirement <'CAM-ELM-006'> migrateLegacyMaps {
        doc /* Maps made with the older CSV import plugin can be migrated, and a group only migrates when all its maps do. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150839/Import+Maps+migration+from+CSV+Import+Plugin */
    }
    requirement <'CAM-ELM-007'> importNestedRequirementsReq {
        doc /* Requirements with an Owner column import as a nested hierarchy under a target package. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150841/Importing+nested+Requirements */
    }
    requirement <'CAM-ELM-008'> importBlocksReq {
        doc /* Blocks and their part and value properties can be imported from a sheet by importing blocks first, then property maps via a map group. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150844/Importing+Blocks+and+their+properties */
    }
    requirement <'CAM-ELM-009'> importRelationshipsReq {
        doc /* Relationships between existing elements import from source and target columns, if the ends are legal. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150850/Importing+relationships */
    }
    requirement <'CAM-ELM-010'> importInstancesReq {
        doc /* Instances with slot values and nested instances import under a classifier. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150854/Importing+instances */
    }
    requirement <'CAM-ELM-011'> specWindowFunctions {
        doc /* One window shows every element's properties, inner elements, relationships, documentation and hyperlinks, and lets the user edit them. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150863/Functions+of+Specification+window */
    }
    requirement <'CAM-ELM-012'> specWindowNavigation {
        doc /* Referenced element specifications open in the same window with Back and Forward, or in separate windows. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150866/Specification+window+toolbar */
    }
    requirement <'CAM-ELM-013'> specSelectInTree {
        doc /* From a specification the element can be selected in the containment tree and the data refreshed. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150866/Specification+window+toolbar */
    }
    requirement <'CAM-ELM-014'> propertyGroupViews {
        doc /* Properties can be viewed grouped by category or alphabetically, with descriptions, expand and collapse all, standard, expert or all detail, and inherited properties shown or hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150870/Property+group+toolbar */
    }
    requirement <'CAM-ELM-015'> quickFilter {
        doc /* Typing in a long property list shows a filter box when ten or more properties exist. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150881/Quick+filter */
    }
    requirement <'CAM-ELM-016'> defaultPropertiesProject {
        doc /* Default property values for new elements can be set per project and reset. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values */
    }
    requirement <'CAM-ELM-017'> defaultPropertiesDiagram {
        doc /* Default properties can also be set per diagram type through its toolbar button. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150883/Default+property+values */
    }
    requirement <'CAM-ELM-018'> longTextEditor {
        doc /* A long text value opens in a dedicated edit dialog, optionally in HTML mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150886/Editing+long+textual+values */
    }
    requirement <'CAM-ELM-019'> multilineValueEditor {
        doc /* Multi-value text properties are edited row by row with add, remove, reorder and per-row HTML. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150887/Editing+multiline+textual+values */
    }
    requirement <'CAM-ELM-020'> booleanToggle {
        doc /* Boolean properties are set with a check box. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150888/Editing+logical+values */
    }
    requirement <'CAM-ELM-021'> pickFromFixedList {
        doc /* A single value can be chosen from a fixed list, and optional values can be cleared. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150890/Selecting+single+property+value+from+non-editable+list */
    }
    requirement <'CAM-ELM-022'> pickFromEditableList {
        doc /* A single reference can be set from auto-completion or by browsing the whole model, or by creating a new element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150893/Selecting+single+property+value+from+editable+list */
    }
    requirement <'CAM-ELM-023'> pickMultipleValues {
        doc /* Several references can be assigned at once from the selection dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150899/Selecting+multiple+property+values */
    }
    requirement <'CAM-ELM-024'> innerElementValue {
        doc /* Properties that own inner elements can add and remove them, with a new specification opening for each. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150904/Creating+inner+element+as+property+value */
    }
    requirement <'CAM-ELM-025'> valueSpecificationValue {
        doc /* A property value can be a value specification (literal, expression) chosen from a menu and replaced after deleting the old one. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150906/Assigning+value+specification+as+property+value */
    }
    requirement <'CAM-ELM-026'> ownedElementGroups {
        doc /* Owned elements such as entry, do and exit behaviours are edited as groups in the owner's specification, creating the owned element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150908/Editing+property+values+in+property+groups */
    }
    requirement <'CAM-ELM-027'> sortInnerElements {
        doc /* Inner elements of an owner can be ordered manually, singly or as a range. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150911/Sorting+elements */
    }
    requirement <'CAM-ELM-028'> redefinePart {
        doc /* An inherited part can be redefined from its shape, creating a new redefining part with ports and connectors kept. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150915/Redefinition */
    }
    requirement <'CAM-ELM-029'> convertElementKind {
        doc /* An element can be converted to another kind, with a warning that incompatible properties and relations are lost. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150918/Incompatible+properties+and+related+elements */
    }
    requirement <'CAM-ELM-030'> replaceElement {
        doc /* One element can be replaced by another of the same kind, redirecting references and diagram symbols. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150920/Replacing+elements */
    }
    requirement <'CAM-ELM-031'> reverseRelationship {
        doc /* The direction of a relationship (transition, flow, others) can be reversed when ends are compatible and editable. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150922/Reversing+relationships+direction */
    }
    requirement <'CAM-ELM-032'> swapShapes {
        doc /* Two connected symbols with the same parent can be swapped by drag or command, in activity and state diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150924/Swapping */
    }
    requirement <'CAM-ELM-033'> reverseInfoFlowReq {
        doc /* Information flow on a connector can be reversed and updates all diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150927/Reversing+Information+Flow+direction */
    }
    requirement <'CAM-ELM-034'> extractSequence {
        doc /* A selected part of a sequence diagram is extracted to a new interaction and diagram, creating gates for crossing messages; outgoing crossing messages other than replies are left out. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150932/Rules+of+extracting+in+Sequence+diagram */
    }
    requirement <'CAM-ELM-035'> extractActivity {
        doc /* A selected part of an activity diagram is extracted, with parameters and a call action created, if only one control flow crosses in and out and elements share an owner and partition. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150941/Extraction+rules+in+Activity+diagram */
    }
    requirement <'CAM-ELM-036'> extractStateMachine {
        doc /* A selected part of a state machine is extracted into a submachine with entry and exit points. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150961/Extract+State+Machine+Wizard */
    }
    requirement <'CAM-ELM-037'> extractStructure {
        doc /* A selected part of a structure diagram is extracted with new ports and a referencing property. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150970/Extract+Structure+Wizard */
    }
    requirement <'CAM-ELM-038'> symbolPropertiesDialog {
        doc /* A non-modal dialog edits symbol properties, offering styles, all properties for mixed selections, and make default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150977/Symbol+Properties+dialog */
    }
    requirement <'CAM-ELM-039'> applyImageToSymbol {
        doc /* An image from the library, a file or an external resource can be shown on a symbol. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150982/Applying+image */
    }
    requirement <'CAM-ELM-040'> rakeIcon {
        doc /* Elements that have an inner diagram show a rake icon opening it, which can be hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227150998/Displaying+rake+icon */
    }
    requirement <'CAM-ELM-041'> symbolStyles {
        doc /* Project symbol styles define diagram, shape, path and stereotype looks; they can be cloned, edited, made default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151001/Symbol+styles+option+group */
    }
    requirement <'CAM-ELM-042'> styleInheritance {
        doc /* Each symbol property has an inherited flag that turns off when overridden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151008/Properties+Inheritance */
    }
    requirement <'CAM-ELM-043'> stereotypeStyles {
        doc /* Stereotypes can have their own colours and line styles, set in options or symbol properties and shipped with a profile. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151016/Customizing+stereotype+style+properties */
    }
    requirement <'CAM-ELM-044'> usedProjectStyles {
        doc /* Styles from used projects are listed with their source and can be copied. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151019/Collecting+symbol+styles+from+used+projects */
    }
    requirement <'CAM-ELM-045'> pasteStyle {
        doc /* Style from one symbol can be copied and pasted on others of the same type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151025/Copy+and+paste+symbol+style */
    }
    requirement <'CAM-ELM-046'> defaultStyleTemplate {
        doc /* A template project can carry default styles for new projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151029/Making+your+own+default+style+for+new+projects */
    }
    requirement <'CAM-ELM-047'> customizeLists {
        doc /* The property lists in specifications, symbol dialogs, menus and shortcut menus can be customized. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151030/Customizing+lists+of+properties+and+commands */
    }
    requirement <'CAM-ELM-048'> hyperlinkTabs {
        doc /* A hyperlink dialog supports web address, file, model element and OSLC targets, with one active link. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151052/Address+tab */
    }
    requirement <'CAM-ELM-049'> hyperlinkElementDisplay {
        doc /* Links to elements show name, representation text, icon plus text, or custom text, and update automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151060/Element+Symbol+tab */
    }
    requirement <'CAM-ELM-050'> hyperlinkDefaults {
        doc /* Default display and update modes of element links are set in project options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151068/Default+settings+of+hyperlinks+to+model+elements */
    }
    requirement <'CAM-ELM-051'> hyperlinkOnElements {
        doc /* Elements and diagrams can carry hyperlinks that open on double-click. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151069/Hyperlinks+on+elements */
    }
    requirement <'CAM-ELM-052'> openAndLocateHyperlink {
        doc /* Links open with a click or Ctrl-click, and Alt double-click selects the target in the tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151072/Opening+hyperlinks */
    }
    requirement <'CAM-ELM-053'> selectionDialogMultiple {
        doc /* Selection dialogs toggle between single and multiple selection; going back to single keeps the first alphabetical choice. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151095/Elements+multiple+selection */
    }
    requirement <'CAM-ELM-054'> selectionDialogCreateClone {
        doc /* In selection dialogs, a creation mode lets the user create or clone elements without leaving. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151096/Creating+new+elements */
    }
    requirement <'CAM-ELM-055'> typeFilters {
        doc /* Type pickers can hide uncommon types and restrict to package imports. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151098/Hide+Uncommon+Elements+filter */
    }
    requirement <'CAM-ELM-056'> typeSelectionMode {
        doc /* A mode asks for a type when a part or port is created and creates missing types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151109/Selecting+port+and+part+types */
    }
    requirement <'CAM-ELM-057'> numberingAutomatic {
        doc /* Elements can be numbered automatically on creation using a numbering scheme, with display above, before or hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151117/Automatic+numbering */
    }
    requirement <'CAM-ELM-058'> numberingManual {
        doc /* Numbers can be set, changed, removed, increased, decreased, renumbered and the last id updated. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151121/Manual+numbering */
    }
    requirement <'CAM-ELM-059'> favoritesList {
        doc /* Elements can be added, removed and ordered as favorites, reachable from a menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151131/Adding+removing+and+changing+order+of+favorites */
    }
    requirement <'CAM-ELM-060'> htmlEditor {
        doc /* Rich text can be edited in an HTML editor with images from file, attachment or library. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151164/Advanced+HTML+Editor+dialog */
    }
    requirement <'CAM-ELM-061'> synchronizeParameters {
        doc /* Parameters that fall out of sync with pins or ports can be re-synchronized in either direction through a dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151180/Synchronization+dialog+environment */
    }
    requirement <'CAM-ELM-062'> elementUrls {
        doc /* An element or symbol URL can be copied and later opened to select it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151183/Copying+and+opening+element+URLs */
    }
    requirement <'CAM-ELM-063'> dateTimeDialog {
        doc /* Date properties use a dialog with calendar, time and zone fields, using the machine locale. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151184/Setting+date+and+time */
    }
    requirement <'CAM-ELM-064'> ownerDisplay {
        doc /* A symbol can show its owner name above, below, in line, or not at all, as qualified name. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151188/Owner+display+mode */
    }
    requirement <'CAM-ELM-065'> qualifiedNameStyle {
        doc /* Qualified names can start at the model library root or at the project root. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151194/Qualified+name+display+style */
    }
    requirement <'CAM-ELM-066'> selectElementTypeDialog {
        doc /* A type dialog filters or searches elements by kind, in list, inheritance or structure views. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151195/Selecting+element+types */
    }
    requirement <'CAM-ELM-067'> tooltipStyle {
        doc /* Tooltips on symbols show nothing, the name or the documentation, per project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151209/Changing+the+tooltips+style */
    }
    requirement <'CAM-ELM-068'> auxiliaryElements {
        doc /* Elements can be marked auxiliary and hidden unless the browser or environment shows them. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151210/Marking+elements+as+auxiliary */
    }
    requirement <'CAM-ELM-069'> reorderInLists {
        doc /* Elements in dialog lists can be reordered with buttons, Ctrl+arrows or dragging. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151213/Reordering+elements */
    }
    part def SmartPackage :> ModelElement { attribute isDynamic : Boolean; }
    part def ElmXrefs {
        ref projectOptions : ProjectOptionsDialog;
        ref customizeDiagrams : CameoUI_DGT::CustomizeDiagramsWizard;
        ref containmentTree : ContainmentTreePanel;
        ref validationResults : ValidationResultsPanel;
        ref imageLibrary : ImageLibraryPane;
    }
}
