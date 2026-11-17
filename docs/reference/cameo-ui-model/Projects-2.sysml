package CameoUI_PRJ_2 {
    private import CameoUI::*;
    doc /* Requirements for section 002 Working with projects. Parts, commands and procedures are in package CameoUI_PRJ (Projects.sysml). */

    requirement <'CAM-PRJ-001'> createProject {
        doc /* The user can start a new project from the File menu, the main toolbar or Ctrl+Shift+N, pick a project type under a domain, name it and choose where it is stored. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148587/Creating+a+new+project */
    }
    requirement <'CAM-PRJ-002'> newProjectStructure {
        doc /* A new project starts with an empty root Model package, a File View package and the standard profile packages, and the user cannot rename or delete the built-in packages. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148587/Creating+a+new+project */
    }
    requirement <'CAM-PRJ-003'> projectProperties {
        doc /* A Project Properties dialog from the File menu shows and edits the project title, author, version and description. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog */
    }
    requirement <'CAM-PRJ-004'> compatibilityRange {
        doc /* The user can set a Version and a lower Compatible With value so that older profile versions can still edit projects made with newer ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog */
    }
    requirement <'CAM-PRJ-005'> advancedProjectTabs {
        doc /* The advanced section of the dialog lists shared packages with a preferred path, the used projects and a standard-profile flag. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog */
    }
    requirement <'CAM-PRJ-006'> resetIds {
        doc /* The user can regenerate all element identifiers, or just the project identifier, to resolve duplicate-id warnings between related projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog */
    }
    requirement <'CAM-PRJ-007'> switchProjects {
        doc /* Several projects can be open at once, each in its own workspace, and the user switches between them from the File menu or a toolbar drop-down. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects */
    }
    requirement <'CAM-PRJ-008'> closeAllProjects {
        doc /* Close All Projects asks per project whether to save, with Yes, Yes To All, No, No To All and Cancel. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects */
    }
    requirement <'CAM-PRJ-009'> copyBetweenProjects {
        doc /* Elements move or copy between open projects with Cut, Copy and Paste from the Edit menu, shortcut menu or Ctrl+X, C, V. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects */
    }
    requirement <'CAM-PRJ-010'> saveProject {
        doc /* Save Project and Save Project As write the project from the File menu, the toolbar or Ctrl+S, with a destination and file name. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects */
    }
    requirement <'CAM-PRJ-011'> saveFormats {
        doc /* The user picks a save format: packed mdzip by default, mdxml, or plain xml. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects */
    }
    requirement <'CAM-PRJ-012'> saveBackup {
        doc /* With Create Backup File on, saving keeps a backup of the previous version; with Rich XMI on, extra data goes into the XMI file. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects */
    }
    requirement <'CAM-PRJ-013'> autoRecovery {
        doc /* After an idle period the tool writes an AutoRecovery file, deletes it on normal exit, and offers to load it after a crash. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148602/Autosave */
    }
    requirement <'CAM-PRJ-014'> openProject {
        doc /* A project opens from File > Open Project, the toolbar button, a drag from the file system or a double-click on the project file. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects */
    }
    requirement <'CAM-PRJ-015'> openLastProject {
        doc /* An option reopens the last project at startup. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects */
    }
    requirement <'CAM-PRJ-016'> xmiStorage {
        doc /* Projects are stored as XMI with diagram data in extension sections, so other UML tools open the model but not the diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects */
    }
    requirement <'CAM-PRJ-017'> openLegacyProject {
        doc /* Projects from version 17.0 or earlier open in newer versions and convert on re-save, used projects first. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects */
    }
    requirement <'CAM-PRJ-018'> exportFormats {
        doc /* File > Export To offers UML XMI 2.5, native XML, Ecore, MOF XMI and Eclipse UML2 XMI. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148730/Exporting+UML+models */
    }
    requirement <'CAM-PRJ-019'> exportEclipseUml2 {
        doc /* A project exports to Eclipse UML2 2.x to 5.x XMI with a .uml extension, and its export properties are set in Environment Options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148730/Exporting+UML+models */
    }
    requirement <'CAM-PRJ-020'> exportAsTemplate {
        doc /* A locally saved project is exported as a template with a name and description into the templates folder. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148733/Exporting+projects+as+templates */
    }
    requirement <'CAM-PRJ-021'> customTemplate {
        doc /* A custom template is a folder holding the project file, an xml descriptor, a banner icon and a template icon, all named alike, and shows up under a chosen category. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148734/Creating+custom+project+templates */
    }
    requirement <'CAM-PRJ-022'> newFromTemplate {
        doc /* New Project with Project from Template creates a project from a chosen template, optionally cloning the template's used projects with a name prefix. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148736/Creating+new+projects+from+templates */
    }
    requirement <'CAM-PRJ-023'> importAnotherProject {
        doc /* File > Import From > Another Project imports a model or template from another project file. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148736/Creating+new+projects+from+templates */
    }
    requirement <'CAM-PRJ-024'> attachFile {
        doc /* Any file can be attached to the project, as a drag onto the diagram, a drag onto a tree element, or Create Element > Attached File, and becomes an Attached File element with size, author and dates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files */
    }
    requirement <'CAM-PRJ-025'> reattachFile {
        doc /* The file of an Attached File can be replaced from its specification window, which updates Modified At. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files */
    }
    requirement <'CAM-PRJ-026'> detachFile {
        doc /* An attached file is removed like any element, Delete in the tree or Ctrl+D on its shape. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files */
    }
    requirement <'CAM-PRJ-027'> openAttachedFile {
        doc /* Double-click or Open File opens an attached file in its operating-system program, and the changed file can be saved back, unless it is read-only. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files */
    }
    requirement <'CAM-PRJ-028'> attachedImageInHtml {
        doc /* An attached image is inserted into HTML text on a diagram from the Advanced HTML Editor, by URL or from the attached list. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files */
    }
    requirement <'CAM-PRJ-029'> saveAttachedFileAs {
        doc /* Save File As writes an attached file back to the local file system. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files */
    }
    requirement <'CAM-PRJ-030'> imageShapeFromAttached {
        doc /* Dragging an attached gif, jpg, svg or png onto the diagram makes an image shape that does not update when the file is replaced. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files */
    }
    requirement <'CAM-PRJ-031'> disclaimerConfig {
        doc /* A Class with the disclaimerConfiguration stereotype and text tag values shows disclaimers that must all be read before the project opens, main project first, used projects in order. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148745/Project+disclaimer+configuration */
    }
    requirement <'CAM-PRJ-032'> disclaimerMessages {
        doc /* Disclaimer messages are added, removed, edited and reordered as tag values in the specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148745/Project+disclaimer+configuration */
    }
    requirement <'CAM-PRJ-033'> projectOptions {
        doc /* The Project Options dialog from Options > Project edits project-wide option groups, with a description area and Reset to Defaults. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options */
    }
    requirement <'CAM-PRJ-034'> browserOptions {
        doc /* Project options control the model browser, such as grouping composite instances and showing diagram abbreviations. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options */
    }
    requirement <'CAM-PRJ-035'> interchangeOptions {
        doc /* Option groups exist for OWL import and export, concept modeling and the glossary table, such as export syntax and URI strategy. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options */
    }
    requirement <'CAM-PRJ-036'> filterBrowser {
        doc /* The Containment tab has a Filter command whose Select Element Type dialog hides chosen element types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148814/Filtering */
    }
    requirement <'CAM-PRJ-037'> filterSearch {
        doc /* The Find dialog's Type button opens the same type dialog to restrict a search. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148814/Filtering */
    }
    requirement <'CAM-PRJ-038'> notificationWindow {
        doc /* Window > Notification Window, Ctrl+M or the status line icons open a window listing notifications with time, name, expandable message and links to elements or documentation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window */
    }
    requirement <'CAM-PRJ-039'> notificationToolbar {
        doc /* The Notification window toolbar opens configuration, scrolls, locks position, clears messages, shows 30-day history and finds text with next, previous, highlight and match case. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window */
    }
    requirement <'CAM-PRJ-040'> notificationTabs {
        doc /* Project notifications and environment notifications are on separate tabs. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window */
    }
    requirement <'CAM-PRJ-041'> standardProfiles {
        doc /* Bundled profiles and libraries are standard resources and the tool warns on opening them as projects, using them read-write, importing or merging them. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148936/Working+with+standard+profiles */
    }
    requirement <'CAM-PRJ-042'> profileVersions {
        doc /* Each project records the profile and plugin versions it needs, warns when they are missing or obsolete, and loads proxies for preview only. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148936/Working+with+standard+profiles */
    }
    requirement <'CAM-PRJ-043'> oclRules {
        doc /* Validation rules moved from OCL to Java in 2022x Refresh2, so users download the legacy OCL rules project or recreate them from the listed scripts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148942/Refactored+OCL2.0+validation+rules */
    }
    requirement <'CAM-PRJ-044'> findDialog {
        doc /* The Find dialog, from Edit > Find, the toolbar or Ctrl+Shift+F, finds elements by name, stereotype, tag value and documentation, with * and ? wildcards and results in a Search Results tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
    }
    requirement <'CAM-PRJ-045'> findScope {
        doc /* Type, Scope and Properties boxes narrow a search by element type with subtypes, by package, and by property values. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
    }
    requirement <'CAM-PRJ-046'> findOptions {
        doc /* Options let the user clear previous results, load unloaded diagrams and used projects, include standard profiles or smart packages, find elements unused in diagrams, and show results in a new tab. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
    }
    requirement <'CAM-PRJ-047'> searchResultsActions {
        doc /* Search results can be added to Favorites or saved as a dynamic or static Smart Package. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
    }
    requirement <'CAM-PRJ-048'> findById {
        doc /* Typing [xmi.id]= followed by an id in What finds that element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog */
    }
    requirement <'CAM-PRJ-049'> quickFind {
        doc /* Quick Find, from Edit, Ctrl+Alt+F or tab toolbars, searches names as the user types, restricted to types, diagrams or any element, with 100 results per page. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog */
    }
    requirement <'CAM-PRJ-050'> quickFindMatching {
        doc /* Quick Find supports match-anywhere, camel-case initials, and list or tree view with F3 and Shift+F3 navigation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog */
    }
    requirement <'CAM-PRJ-051'> quickFindFilters {
        doc /* Filter options hide uncommon elements and exclude auxiliary resources such as standard profiles. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog */
    }
    requirement <'CAM-PRJ-052'> findTodo {
        doc /* Edit > Find TODO lists every element whose To Do property has a value. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148795/Find+TODO */
    }
    requirement <'CAM-PRJ-053'> findAndReplace {
        doc /* Find and Replace, from Edit or Ctrl+R, replaces text in names, documentation, tag values, notes, text boxes and expressions, with type and scope options, and refuses invalid values. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148797/Find+and+Replace+dialog */
    }
    requirement <'CAM-PRJ-054'> findInDiagram {
        doc /* Find in Diagram, from the toolbar, Edit or Ctrl+F, highlights text in diagrams, tables, matrices and maps and steps through hits with F3. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148803/Searching+in+diagrams */
    }
    requirement <'CAM-PRJ-055'> searchBackground {
        doc /* Searching runs in the background, stops with partial results if the model changes, warns above 1000 results, and asks whether to search while indexing continues. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148758/Searching */
    }
    requirement <'CAM-PRJ-056'> textIndexing {
        doc /* Text indexing starts when a server project first opens, shows progress in the status bar, and Tools > Rebuild Text Index (expert mode) rebuilds it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148809/Indexing */
    }
    requirement <'CAM-PRJ-057'> partitionConcept {
        doc /* A model splits into separate project files at package level, for reuse, access rights, versioning and performance, with used projects read-only or read-write. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148845/Project+partitioning */
    }
    requirement <'CAM-PRJ-058'> decomposeGuidelines {
        doc /* Parts to split are logically complete, have one-way dependencies and no cycles. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148845/Project+partitioning */
    }
    requirement <'CAM-PRJ-059'> exportPackages {
        doc /* Export Packages to New Project saves chosen packages and their contents as a project, checks dependencies first, and uses the new project read-only in the main one. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148847/Exporting+packages+to+new+projects */
    }
    requirement <'CAM-PRJ-060'> shareData {
        doc /* Chosen packages are shared so others see them, each with an optional preferred mount path, and used projects form a recursive structure. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148849/Sharing+project+data */
    }
    requirement <'CAM-PRJ-061'> indexUnloaded {
        doc /* Indexing an unloaded used project shows more proxy elements (common or custom indexing) when the using project sets Use Index. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148851/Indexing+of+unloaded+projects */
    }
    requirement <'CAM-PRJ-062'> useProject {
        doc /* The Use Project wizard, from File or Options > Project Usages, selects a project from the file system or a predefined path and sets accessibility, load mode and mount locations. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project */
    }
    requirement <'CAM-PRJ-063'> usedAccessibility {
        doc /* Used projects are read-only by default and can be switched to read-write in the Used Projects dialog, or opened separately. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project */
    }
    requirement <'CAM-PRJ-064'> importUsedProject {
        doc /* Project Usages > Import copies a used project into the main project and removes the link; standard profiles cannot be imported. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148858/Importing+models */
    }
    requirement <'CAM-PRJ-065'> reloadUsedProject {
        doc /* Project Usages > Reload on a used package shows changes made in the used project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148861/Reloading+used+projects+in+a+project */
    }
    requirement <'CAM-PRJ-066'> loadModes {
        doc /* Used projects load Always, Autoload, Autoload with prompt, or Manual, and can be unloaded and loaded to save memory, leaving read-only proxy elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148862/Working+with+partially+loaded+projects */
    }
    requirement <'CAM-PRJ-067'> usedProjectsDialog {
        doc /* The Used Projects dialog edits accessibility, load mode, use-index and mounts, and has Use Project, Remove (with or without references), Import, Reload, Unload, Open and Options. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148859/Managing+used+projects */
    }
    requirement <'CAM-PRJ-068'> integrityValidation {
        doc /* Validation reports mount-location conflicts, conflicting required versions and cyclic dependencies among used projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148896/Validating+project+integrity */
    }
    requirement <'CAM-PRJ-069'> automatedUsages {
        doc /* Since 17.0.3 the tool creates and rearranges automated usages itself, without freezing versions, and flags unconfirmed ones as invalid. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148863/Automated+project+usages */
    }
    requirement <'CAM-PRJ-070'> resolveUnconfirmed {
        doc /* An unconfirmed usage is confirmed through the Use Project wizard or rejected by removing the underlying references from the validation results. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148867/Resolving+unconfirmed+usages+of+packages */
    }
    requirement <'CAM-PRJ-071'> recoveredElements {
        doc /* Proxies carry name, kind and owner of unavailable elements, and recovered elements mark dangling references. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148866/Maintaining+decomposed+model+integrity */
    }
    requirement <'CAM-PRJ-072'> integrityAnalysis {
        doc /* Run Composition Integrity Analysis from the browser, results panel or diagram toolbar lists recovered elements as REF, SRE and URE entries. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148869/Managing+unresolved+references */
    }
    requirement <'CAM-PRJ-073'> replaceRecovered {
        doc /* A reference to a recovered element can be redirected to another element, one element at a time or all references at once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148887/Replacing+recovered+element+with+another+element */
    }
    requirement <'CAM-PRJ-074'> removeUnresolved {
        doc /* Clean Usage of Recovered Element deletes references to a recovered element, skipping read-only or locked ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148888/Removing+unresolved+reference */
    }
    requirement <'CAM-PRJ-075'> removeRecoveredSymbol {
        doc /* A recovered element's symbol is removed from a diagram with the smart manipulator, Delete, or the results panel. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148889/Removing+recovered+element+symbol */
    }
    requirement <'CAM-PRJ-076'> avoidRecovery {
        doc /* Confirmation prompts and the Detect Illegal Model References and Composition Inspection (Standard or Advanced) options prevent recovered elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148892/How+to+avoid+triggering+element+recovery */
    }
    requirement <'CAM-PRJ-077'> importFormats {
        doc /* File > Import From lists importers such as another project, Excel/CSV, XMI, MOF, ReqIF, OWL, XPDL, FMU, Simulink, Modelica and Enterprise Architect XMI. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148605/Importing+data+from+other+UML+tools+and+formats */
    }
    requirement <'CAM-PRJ-078'> mofExport {
        doc /* Export To > MOF XMI File exports the whole model or selected packages as EMOF or CMOF, with optional validation that warns about skipped diagrams and behavior. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148906/Exporting+projects+to+MOF+files */
    }
    requirement <'CAM-PRJ-079'> mofImport {
        doc /* Import From > MOF XMI File imports an EMOF or CMOF file as a separate project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148913/Importing+projects+from+MOF+files */
    }
    requirement <'CAM-PRJ-080'> ecoreProject {
        doc /* An Ecore project comes from the Ecore template or by using the Ecore profile (UML and MOF projects only) and the standard Ecore library. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148915/Creating+projects+for+Ecore+modeling */
    }
    requirement <'CAM-PRJ-081'> ecoreModeling {
        doc /* Ecore is modeled on class diagrams; classes, enumerations and operations map directly, attributes and references are told apart automatically, and annotations are comments with key-value details. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148919/Ecore+modeling */
    }
    requirement <'CAM-PRJ-082'> ecoreExport {
        doc /* Whole models or selected packages export to .ecore with a validation suite, map data types, and used projects must be exported first and saved afterwards. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148927/Exporting+projects+to+Ecore+files */
    }
    requirement <'CAM-PRJ-083'> ecoreImport {
        doc /* Ecore files are imported by saving them as EMOF in Eclipse and using the MOF import, which may lose Ecore-only details. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148935/Importing+projects+from+Ecore+files */
    }
    requirement <'CAM-PRJ-084'> eaImport {
        doc /* Import Enterprise Architect UML 2.1 XMI 2.1 File takes an input file, an output file and conversion options for aggregation side, EA data, opening the result and a log. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148607/Working+with+Enterprise+Architect+Import */
    }
    requirement <'CAM-PRJ-085'> eaOptions {
        doc /* Environment Options for the importer map EA write actions to add or remove, or create or destroy, variants. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148613/Customizing+the+conversion+options */
    }
    requirement <'CAM-PRJ-086'> eaSpecificData {
        doc /* EA constraints, requirements, scenarios, files, external requirements, changes and issues become stereotyped UML elements through an EA Profile. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148617/Transforming+EA+Specific+Data */
    }
    requirement <'CAM-PRJ-087'> eaDiagrams {
        doc /* Twelve EA diagram kinds import with geometry, colors and display properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148620/Importing+Diagrams */
    }
    requirement <'CAM-PRJ-088'> eaTransformations {
        doc /* Special transformations rebuild EA use case, activity, sequence, communication, state machine, composite structure and interaction overview elements as the matching modeling-tool elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148626/Activity+diagram+elements */
    }
    requirement <'CAM-PRJ-089'> eaLimitations {
        doc /* Known limits are documented, such as lost diagram legends, n-ary views and alternative images, and fixed lifeline positions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148729/Known+Limitations+and+Constraints */
    }

    // Cross-section references
    part def PrjXrefs {
        ref environmentOptions : EnvironmentOptionsDialog;
        ref stereotype : Stereotype;
        ref specificationWindow : SpecificationWindow;
        ref advancedHtmlEditor : CameoUI_ELM::AdvancedHtmlEditorDialog;
        ref styleEngine : CameoUI_DGM::StyleEngineDialog;
        ref selectElementType : CameoUI_DGT::SelectElementTypeDialog;
        ref smartPackage : CameoUI_ELM::SmartPackage;
        ref pathVariables : CameoUI_GST::PathVariableDialog;
        ref validation : CameoUI_TLS::ValidationRule[0..*];
        ref activeValidationResults : ValidationResultsPanel;
        ref smartManipulator : CameoUI_DGM::SmartManipulatorToolbar;
        ref importReqIf : CameoUI_PRJ::ImportReqIf;
        ref classDiagram : CameoUI_DGT::ClassDiagramType;
    }
}
