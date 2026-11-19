package CameoUI_PRJ {
    private import CameoUI::*;
    doc /* Section 000 User Guide / 002 Working with projects. Creating, saving, opening, importing and exporting projects, templates, attachments, options, searching, filtering, notifications, project partitioning, MOF and Ecore. Requirements are in Projects-2.sysml (package CameoUI_PRJ_2). */

    // ---- Screens ----
    part def NewProjectDialog :> Wizard { part domain : Field; part projectType : Field; part name : Field; part location : Field; part cloneUsedProjects : Option; part prefix : Option; part templateList : Field; part templateDescription : Field; }
    part def ProjectPropertiesDialog :> Dialog { part author : Field; part version : Field; part compatibleWith : Field; part sharedPackagesTab : Panel; part usedProjectsTab : Panel; part advancedTab : Panel; }
    part def SaveDialog :> Dialog { part directory : Field; part fileName : Field; part format : Option; }
    part def CloseAllQuestionDialog :> Dialog;
    part def ExportTemplateDialog :> Dialog { part templateName : Field; part templateDescription : Field; }
    part def SelectFileToAttachDialog :> Dialog;
    part def AttachedFileElement :> ModelElement { attribute attachedAt : Label; attribute modifiedAt : Label; attribute size : Label; attribute author : Label; attribute file : Label; }
    part def DisclaimerConfigurationClass :> ModelElement { attribute text : Label[0..*]; }
    part def SelectElementTypeDialog :> Dialog { attribute includeSubtypes : Label; attribute includeCustomTypes : Label; }
    part def FindDialog :> Dialog { part what : Field; part type : Field; part scope : Field; part properties : Field; part optionsArea : Panel; part clearPrevious : Option; part loadDiagrams : Option; part includeStandardProfiles : Option; part includeAdditionalContent : Option; part searchUnusedInDiagrams : Option; part resultsInNewWindow : Option; }
    part def FindAndReplaceDialog :> Dialog { part findWhat : Field; part replaceWith : Field; part type : Field; part scope : Field; }
    part def SearchResultsTab :> Panel;
    part def DiagramSearchBar :> Toolbar;
    part def NotificationWindow :> Window { part toolbar : NotificationToolbar; part notificationArea : Panel; part projectTab : Panel; part environmentTab : Panel; }
    part def NotificationToolbar :> Toolbar;
    part def ExportPackagesToNewProjectDialog :> Dialog { part treeList : Field; part selectedPackages : Field; part projectDescription : Field; }
    part def SharedPackagesDialog :> Dialog { part treeList : Field; part selectedPackages : Field; }
    part def UseProjectWizard :> Wizard { part sourceStep : WizardStep; part optionsStep : WizardStep; }
    part def UsedProjectsDialog :> Dialog { part accessibility : Option; part loadMode : Option; part useIndex : Option; part packages : Field; }
    part def ProjectOptionsIndexingGroup :> Panel;
    part def SelectTargetFileDialog :> Dialog { part mofKind : Option; part validate : Option; }
    part def ImportEnterpriseArchitectDialog :> Dialog { part inputFile : Field; part outputFile : Field; part switchAggregationSide : Option; part excludeEaData : Option; part openAfterConversion : Option; part generateLog : Option; }
    part def ProjectMenu :> Menu;
    part def ProjectToolbar :> Toolbar;

    // ---- Commands ----
    action def NewProject :> Command;                // File > New Project, Ctrl+Shift+N
    action def OpenProject :> Command;               // File > Open Project
    action def SaveProject :> Command;               // File > Save Project, Ctrl+S
    action def SaveProjectAs :> Command;
    action def CloseAllProjects :> Command;
    action def SwitchProjects :> Command;
    action def OpenProjectProperties :> Command;     // File > Project Properties
    action def ResetIds :> Command;
    action def ResetProjectId :> Command;
    action def ExportTo :> Command;                  // File > Export To
    action def ExportAsTemplate :> Command;
    action def ImportFrom :> Command;                // File > Import From
    action def ImportFromAnotherProject :> Command;
    action def AttachFile :> Command;                // Create Element > Attached File
    action def OpenAttachedFile :> Command;
    action def SaveAttachedFileAs :> Command;
    action def CopyImageUrl :> Command;
    action def OpenProjectOptions :> Command;        // Options > Project
    action def OpenEnvironmentOptions :> Command;    // Options > Environment
    action def FilterContainment :> Command;
    action def Find :> Command;                      // Edit > Find, Ctrl+Shift+F
    action def QuickFind :> Command;                 // Ctrl+Alt+F
    action def FindTodo :> Command;
    action def FindAndReplace :> Command;            // Ctrl+R
    action def FindInDiagram :> Command;             // Ctrl+F
    action def RebuildTextIndex :> Command;          // Tools > Rebuild Text Index, expert mode
    action def OpenNotificationWindow :> Command;    // Window > Notification Window, Ctrl+M
    action def ShowFullNotificationHistory :> Command;
    action def ClearNotifications :> Command;
    action def ExportPackagesToNewProject :> Command;
    action def SharePackages :> Command;
    action def UseProject :> Command;
    action def OpenUsedProjects :> Command;          // Options > Project Usages
    action def ReloadUsedProject :> Command;
    action def UnloadUsedProject :> Command;
    action def LoadUsedProject :> Command;
    action def ImportUsedProject :> Command;
    action def RemoveUsedProject :> Command;
    action def ConfirmUsage :> Command;
    action def RemoveUnderlyingReferences :> Command;
    action def RunCompositionIntegrityAnalysis :> Command;
    action def ChangeUsagesTo :> Command;
    action def UseAnotherElement :> Command;
    action def CleanUsageOfRecoveredElement :> Command;
    action def RemoveRecoveredSymbol :> Command;
    action def ExportMof :> Command;
    action def ImportMof :> Command;
    action def ExportEcore :> Command;
    action def ValidateEcore :> Command;
    action def ImportEnterpriseArchitect :> Command;
    action def AddToFavorites :> Command;
    action def SaveQueryAsSmartPackage :> Command;
    action def SaveResultsAsSmartPackage :> Command;

    part def ProjectMenuContent :> ProjectMenu {
        part newItem : MenuItem { :>> invokes = NewProject; :>> shortcut = "Ctrl+Shift+N"; }
        part saveItem : MenuItem { :>> invokes = SaveProject; :>> shortcut = "Ctrl+S"; }
        part propertiesItem : MenuItem { :>> invokes = OpenProjectProperties; }
        part closeAllItem : MenuItem { :>> invokes = CloseAllProjects; }
        part exportItem : MenuItem { :>> invokes = ExportTo; }
        part importItem : MenuItem { :>> invokes = ImportFrom; }
    }
    part def SearchMenuContent :> Menu {
        part findItem : MenuItem { :>> invokes = Find; :>> shortcut = "Ctrl+Shift+F"; }
        part quickFindItem : MenuItem { :>> invokes = QuickFind; :>> shortcut = "Ctrl+Alt+F"; }
        part replaceItem : MenuItem { :>> invokes = FindAndReplace; :>> shortcut = "Ctrl+R"; }
        part todoItem : MenuItem { :>> invokes = FindTodo; }
        part inDiagramItem : MenuItem { :>> invokes = FindInDiagram; :>> shortcut = "Ctrl+F"; }
    }

    // ---- Modes and states ----
    attribute def Reload;
    state def UsedProjectLoadMode { state alwaysLoad; state autoload; state autoloadWithPrompt; state manualLoad; }
    state def UsedProjectLoadState { entry action init; then state loaded; state loaded; state unloaded; }
    state def UsedProjectAccessibility { state readOnly; state readWrite; }
    state def UsageConfirmation { state userDefined; state automatedBacked; state unconfirmed; }
    state def FilePresence { state attached; state detached; }
    state def SearchProgress { state idle; state searching; state partialResults; state complete; }
    state def QuickFindView { state list; state tree; }
    state def SaveFormat { state mdzip; state mdxml; state xml; }
    state def NotificationHistory { state recentOnly; state fullHistory; }
    state def MofKind { state emof; state cmof; }
    state def ProfileCompatibility { state compatible; state obsolete; state missing; }

    // ---- Procedures ----
    action def createBlankProject {
        doc /* Page: Creating a new project: blank workspace. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148587/Creating+a+new+project */
        action openNewProjectDialog; then action selectUmlProject; then action typeName; then action chooseLocation; then action clickOk;
    }
    action def savePrj {
        doc /* Page: Saving projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects */
        action chooseSave; then action pickDirectory; then action typeFileName; then action pickFormat; then action confirm;
    }
    action def enableAutoRecovery {
        doc /* Page: Autosave. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148602/Autosave */
        action openEnvironmentOptions; then action openSaveLoadGroup; then action setRecoveryOnIdle; then action enterIdleMinutes;
    }
    action def openPrj {
        doc /* Page: Opening projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects */
        action chooseOpenProject; then action selectFile; then action clickOpen;
    }
    action def exportAsTemplateProc {
        doc /* Page: Exporting projects as templates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148733/Exporting+projects+as+templates */
        action openProject; then action chooseExportTemplate; then action typeNameAndDescription; then action clickOk;
    }
    action def createCustomTemplate {
        doc /* Page: Creating custom project templates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148734/Creating+custom+project+templates */
        action closeApplication; then action createTemplateFolder; then action pasteProjectAndIcons; then action writeXmlDescriptor; then action startApplication; then action selectTemplate;
    }
    action def createFromTemplate {
        doc /* Page: Creating new projects from templates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148736/Creating+new+projects+from+templates */
        action openNewProjectDialog; then action expandOther; then action selectProjectFromTemplate; then action typeName; then action chooseLocation; then action selectTemplate; then action clickOk;
    }
    action def attachFileViaMenu {
        doc /* Page: Attaching files: shortcut menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files */
        action rightClickOwner; then action chooseCreateAttachedFile; then action selectFile; then action clickAttach; then action nameElement;
    }
    action def reattachFileProc {
        doc /* Page: Attaching files: reattaching. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files */
        action selectAttachedFile; then action openSpecification; then action filterByFile; then action clickFileValueButton; then action selectNewFile; then action clickAttach; then action closeSpecification;
    }
    action def openAttachedFileProc {
        doc /* Page: Working with attached files: opening. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files */
        action doubleClickAttachedFile; then action editInExternalProgram; then action closeExternalProgram; then action chooseSaveBack;
    }
    action def createDisclaimer {
        doc /* Page: Project disclaimer configuration. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148745/Project+disclaimer+configuration */
        action createClass; then action applyDisclaimerStereotype; then action openSpecification; then action selectTagsGroup; then action createTextValue; then action typeMessage; then action close;
    }
    action def filterContainmentTree {
        doc /* Page: Filtering. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148814/Filtering */
        action openContainmentTab; then action chooseFilter; then action toggleElementTypes; then action clickOk;
    }
    action def findElements {
        doc /* Page: Find dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
        action openFindDialog; then action enterCriteria; then action expandOptionsIfNeeded; then action clickFind; then action readSearchResults;
    }
    action def quickFindElement {
        doc /* Page: Quick Find dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog */
        action openQuickFind; then action chooseSearchFor; then action typePhrase; then action pickResult;
    }
    action def findInDiagramProc {
        doc /* Page: Searching in diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148803/Searching+in+diagrams */
        action openDiagram; then action pressFind; then action typeText; then action stepThroughHits;
    }
    action def rebuildTextIndexProc {
        doc /* Page: Indexing. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148809/Indexing */
        action chooseTools; then action chooseRebuildTextIndex;
    }
    action def exportPackagesToProject {
        doc /* Page: Exporting packages to new projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148847/Exporting+packages+to+new+projects */
        action openExportDialog; then action addPackage; then action typeDescription; then action clickOk; then action resolveDependencyErrors; then action chooseLocationAndName;
    }
    action def sharePackagesProc {
        doc /* Page: Sharing project data. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148849/Sharing+project+data */
        action selectPackage; then action chooseSharePackages; then action addMorePackages; then action clickOk;
    }
    action def useLocalProject {
        doc /* Page: Using other projects in a project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project */
        action chooseUseLocalProject; then action selectProject; then action clickNext; then action specifyUsageOptions; then action clickFinish;
    }
    action def changeAccessibility {
        doc /* Page: Using other projects: accessibility. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project */
        action openUsedProjects; then action selectUsedProject; then action chooseAccessibility; then action clickOk;
    }
    action def importUsedProjectProc {
        doc /* Page: Importing models. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148858/Importing+models */
        action selectUsedPackage; then action chooseProjectUsagesImport;
    }
    action def unloadUsedProjectProc {
        doc /* Page: Working with partially loaded projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148862/Working+with+partially+loaded+projects */
        action rightClickUsedProject; then action chooseUnload;
    }
    action def changeLoadMode {
        doc /* Page: Working with partially loaded projects: load mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148862/Working+with+partially+loaded+projects */
        action openUsedProjects; then action selectUsedProject; then action chooseLoadMode;
    }
    action def confirmUsageProc {
        doc /* Page: Resolving unconfirmed usages of packages. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148867/Resolving+unconfirmed+usages+of+packages */
        action rightClickUsage; then action chooseConfirm; then action reviewWizard; then action clickFinish;
    }
    action def replaceRecoveredElement {
        doc /* Page: Replacing recovered element with another element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148887/Replacing+recovered+element+with+another+element */
        action rightClickRecovered; then action chooseChangeUsagesTo; then action selectReplacement; then action clickOk;
    }
    action def removeUnresolvedReference {
        doc /* Page: Removing unresolved reference. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148888/Removing+unresolved+reference */
        action rightClickReferrer; then action chooseCleanUsage;
    }
    action def exportToMof {
        doc /* Page: Exporting projects to MOF files. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148906/Exporting+projects+to+MOF+files */
        action chooseMofWholeModel; then action typeFileName; then action chooseMofKind; then action setValidate; then action clickExport;
    }
    action def exportToEcore {
        doc /* Page: Exporting projects to Ecore files. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148927/Exporting+projects+to+Ecore+files */
        action chooseEcoreWholeModel; then action typeFileName; then action setValidate; then action clickExport;
    }
    action def importEnterpriseArchitectProc {
        doc /* Page: Working with Enterprise Architect Import. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148607/Working+with+Enterprise+Architect+Import */
        action chooseImportEa; then action specifyInputFile; then action specifyOutputFile; then action chooseConversionOption; then action clickImport;
    }
    part def ServerProjectLocksPanel :> Panel;
    action def ImportReqIf :> Command;   // File > Import From > ReqIF
}
