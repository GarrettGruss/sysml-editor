package CameoUI_DGT {
    private import CameoUI::*;
    private import ScalarValues::*;
    doc /* Section 000 User Guide / 005 Diagrams. The kinds of diagrams (UML, analysis, extension) and the table family, with the screens and procedures the guide describes for them. Written by hand; see README.md. */

    // ---- Diagram kinds ----
    part def UmlDiagramType :> DiagramType;
    part def ClassDiagramType :> UmlDiagramType;
    part def ObjectDiagramType :> UmlDiagramType;
    part def UseCaseDiagramType :> UmlDiagramType;
    part def SequenceDiagramType :> UmlDiagramType;
    part def CommunicationDiagramType :> UmlDiagramType;
    part def StateMachineDiagramType :> UmlDiagramType;
    part def ProtocolStateMachineDiagramType :> UmlDiagramType;
    part def ActivityDiagramType :> UmlDiagramType;
    part def ComponentDiagramType :> UmlDiagramType;
    part def DeploymentDiagramType :> UmlDiagramType;
    part def PackageDiagramType :> UmlDiagramType;
    part def ProfileDiagramType :> UmlDiagramType;
    part def CompositeStructureDiagramType :> UmlDiagramType;
    part def InteractionOverviewDiagramType :> UmlDiagramType;
    part def AnalysisDiagramType :> DiagramType;
    part def DependencyMatrixType :> AnalysisDiagramType;
    part def RelationMapType :> AnalysisDiagramType;
    part def RobustnessDiagramType :> AnalysisDiagramType;
    part def ExtensionDiagramType :> DiagramType;
    part def UserInterfaceModelingDiagramType :> ExtensionDiagramType;
    part def ContentDiagramType :> ExtensionDiagramType;
    part def NetworkingDiagramType :> ExtensionDiagramType;
    part def CorbaIdlDiagramType :> ExtensionDiagramType;
    part def TimeDiagramType :> ExtensionDiagramType;
    part def FreeFormDiagramType :> ExtensionDiagramType;
    part def TableType :> DiagramType;
    part def GenericTableType :> TableType;
    part def GlossaryTableType :> TableType;
    part def InstanceTableType :> TableType;
    part def MetricTableType :> TableType;
    part def RequirementTableType :> TableType;

    // ---- Screens ----
    // TODO xref: SpecificationWindow property editing (009 Working with model elements)
    // TODO xref: ProjectOptionsDialog (002 Working with projects)
    // TODO xref: SelectElementDialog (009 Working with model elements)
    // TODO xref: CreateDiagramDialog (006 Diagramming)
    // TODO xref: ModelVisualizer (010 Tools)
    // TODO xref: Validation rules and ValidateDiagram results (010 Tools)
    // TODO xref: Refactor Convert To (009 Working with model elements)
    part def CriteriaArea :> Panel { part boxes : Field[0..*]; part filterBox : Field; part toggleButton : ToolbarButton; }
    part def TableToolbarSet :> Toolbar;
    part def TableGrid :> Panel { part rowNumbers : Field; part columnHeaders : Field; part cells : Field[0..*]; }
    part def DescriptionArea :> Panel;
    part def TableInfoArea :> Panel;
    part def TablePane :> DiagramPane { part toolbars : TableToolbarSet; part criteria : CriteriaArea; part grid : TableGrid; part description : DescriptionArea; part info : TableInfoArea; }
    part def MatrixCriteriaArea :> CriteriaArea { part rowElementType; part columnElementType; part rowScope; part columnScope; part dependencyCriteria; part direction; part showElements; }
    part def DependencyMatrixPane :> TablePane { part legend : Shape; }
    part def RelationMapPane :> DiagramPane { part legend : Shape; part criteriaArea : CriteriaArea; }
    part def SelectElementTypeDialog :> Dialog { part includeSubtypes : Option; part includeCustomTypes : Option; }
    part def DependencyCriteriaDialog :> Dialog { part relationshipProperties : Field; part includeSubtypes : Option; part filterByPropertyValue : Option; part includeAggregationAndComposition : Option; }
    part def RelationshipStyleDialog :> Dialog { part color : Option; part lineStyle : Option; part startArrow : Option; part endArrow : Option; part representationIcon : Option; }
    part def RowColumnQueryDialog :> Dialog { part containment : Option; part structure : Option; part custom : Option; part buildHierarchy : Option; }
    part def SelectScopeDialog :> Dialog;
    part def SelectColumnsDialog :> Dialog;
    part def ExpressionDialog :> Dialog { part singleValue : Option; part unique : Option; }
    part def FilterSettingsDialog :> Dialog { part columns : Option; part caseSensitive : Option; part wildcardOrRegex : Option; part matchMode : Option; part showRelatives : Option; }
    part def ExcelCsvSyncOptionsDialog :> Dialog { part fileArea : Field; part syncOptions : Field; part mappingOptions : Field; part mapping : Field; }
    part def PortMappingDialog :> Dialog { part fromList : Field; part toList : Field; part newPortDropBox : Field; }
    part def SelectDiagramContextDialog :> Dialog { part treeTab : Field; part listTab : Field; part creationMode : Option; }
    part def CreateMetricTableDialog :> Dialog { part name : Field; part owner : Field; part metricSuites : Field; }
    part def ElementNumberingDialog :> Dialog;
    part def GenericTableWizard :> Wizard;
    part def LegendKeyShape :> Shape;
    part def GlossaryTerm { attribute name : Label; attribute synonyms : Label[0..*]; }
    part def ExecutionSpecificationBar :> Shape;
    part def BehaviorExecutionBar :> ExecutionSpecificationBar { ref behavior : ModelElement[0..1]; }
    part def ActionExecutionBar :> ExecutionSpecificationBar { ref actionRef : ModelElement[0..1]; }

    // ---- Commands ----
    action def CreateDiagramOfKind :> Command;           // Diagrams > Create Diagram, Ctrl+N
    action def Refresh :> Command;
    action def ChangeAxes :> Command;
    action def ExportTable :> Command;
    action def AddNew :> Command;                         // Insert
    action def AddExisting :> Command;                    // Ctrl+Insert
    action def AddNested :> Command;                      // Alt+Insert
    action def RemoveFromTable :> Command;               // Ctrl+Delete
    action def DeleteFromTableAndModel :> Command;       // Ctrl+D
    action def MoveRowUp :> Command;                      // Ctrl+Up
    action def MoveRowDown :> Command;                    // Ctrl+Down
    action def ExpandAll :> Command;
    action def CollapseAll :> Command;
    action def ShowColumns :> Command;
    action def NewCustomColumn :> Command;
    action def ReadFromFile :> Command;
    action def WriteToFile :> Command;
    action def FindInDiagram :> Command;                  // Ctrl+F
    action def ValidateDiagram :> Command;
    action def CalculateNewMetric :> Command;
    action def Recalculate :> Command;
    action def AddMetricWithDifferentParameters :> Command;
    action def CreateWithParts :> Command;                // Alt+Insert in instance tables
    action def InsertGlossaryTerm :> Command;             // Ctrl+Space
    action def ClearCells :> Command;                     // Delete
    action def SuppressBranches :> Command;
    action def ExpandBranches :> Command;
    action def CreateRelatedElement :> Command;          // Insert in relation maps
    action def EnableExecutionSpecification :> Command;
    action def ToggleBehaviorCreationMode :> Command;
    action def ToggleCenterlines :> Command;              // C

    // ---- Modes and options ----
    state def TableDisplayMode { state completeTree; state compactTree; state list; }
    state def PartialLoadingMode { state auto; state enabled; state disabled; }
    state def RelationMapLayout { state tree; state radial; }
    state def SequenceModelingApproach {
        entry action init;
        then state activationBarsAsLifelines;
        state activationBarsAsLifelines;
        state executionSpecifications;
        transition first activationBarsAsLifelines accept EnableExecutionSpecification then executionSpecifications;
    }
    state def MatrixShowElements { state withRelations; state withoutRelations; state allElements; state columnsWithoutRelations; state rowsWithoutRelations; }
    state def DiagramContextPolicy { state createAutomatically; state doNotCreate; }
    state def DiagramOrientation { state vertical; state horizontal; }
    state def SortOrder { state ascending; state descending; state custom; }
    state def GlossaryAcronyms { state enabled; state disabled; }

    // ---- Procedures ----
    action def createDependencyMatrixProcedure {
        doc /* Page: Creating Dependency Matrix: pick an owner, create the matrix by one of four entry points, name it, set criteria, refresh. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149163/Creating+Dependency+Matrix */
        action selectOwnerInTree;
        then action openCreateDiagramEntry;
        then action chooseDependencyMatrix;
        then action typeMatrixName;
        then action selectCriteria;
        then action clickRefresh;
    }
    action def specifyRowScopeProcedure {
        doc /* Page: Specifying scope: drag packages or use the scope dialog or the specification window. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149180/Specifying+scope */
        action selectPackages;
        then action dragToScopeBox;
        then action holdCtrlToAdd;
        then action confirmScope;
    }
    action def createRelationInMatrixCellProcedure {
        doc /* Page: Modifying relationships: create one relationship from a cell. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix */
        action selectCell;
        then action doubleClickCell;
        then action chooseTypeAndDirection;
        then action relationshipCreated;
    }
    action def deleteRelationsInMatrixCellProcedure {
        doc /* Page: Modifying relationships: remove all relationships of a cell. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix */
        action rightClickCell;
        then action openDeleteSubmenu;
        then action chooseDeleteAll;
    }
    action def shiftMatrixRowsProcedure {
        doc /* Page: Rearranging rows and columns: move selected rows. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149231/Rearranging+rows+and+columns */
        action selectRows;
        then action pressCtrlDown;
        then action orderBecomesCustom;
    }
    action def createRelationMapFromElementProcedure {
        doc /* Page: Creating relation map: from the related-elements menu the context becomes the owner. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149264/Creating+relation+map */
        action selectContextElement;
        then action openRelatedElementsMenu;
        then action chooseCreateRelationMap;
        then action mapOpens;
    }
    action def decomposeMapNodeProcedure {
        doc /* Page: Manipulations in the relation map: decompose an element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
        action selectNode;
        then action pressInsert;
        then action chooseTypeAndRelationship;
        then action elementDecomposed;
    }
    action def colorMapRelationCriteriaProcedure {
        doc /* Page: Specifying colors and legend. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149283/Specifying+colors+and+legend */
        action openRelationCriteriaDialog;
        then action openStyleDialog;
        then action setColorAndLine;
        then action closeBothDialogs;
    }
    action def enableExecutionSpecModeStepProcedure {
        doc /* Page: Working with Execution Specifications: switch a sequence diagram to execution specification bars. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
        action openSequenceDiagram;
        then action clickEnableExecutionSpecification;
        then action barsBecomeExecutionSpecs;
    }
    action def setOperationMethodOnMessageProcedure {
        doc /* Page: Working with Execution Specifications: set a behavior through an operation dropped on a message. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
        action drawMessageBetweenBars;
        then action dragOperationOntoMessage;
        then action openEndBarSpecification;
        then action readBehaviorProperty;
    }
    action def convertStateBehaviorKindProcedure {
        doc /* Page: Working with State Machine diagram: convert a behavior. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149104/Working+with+State+Machine+diagram */
        action selectBehaviorInState;
        then action openBehaviorMenu;
        then action chooseRefactorConvertTo;
        then action pickTargetBehavior;
    }
    action def pasteListIntoActivityProcedure {
        doc /* Page: Working with Activity diagram: create actions by pasting a copied list. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
        action copyList;
        then action pressCtrlV;
        then action selectAction;
        then action answerYesToConnect;
    }
    action def turnOffCenterlinesProcedure {
        doc /* Page: Working with Activity diagram: switch off dynamic centerlines. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
        action clickShowCenterlines;
    }
    action def changeDiagramOrientationProcedure {
        doc /* Page: Working with Activity diagram: change orientation in Diagram Properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
        action openDiagramProperties;
        then action setDiagramOrientation;
        then action confirmDialog;
    }
    action def turnOffAutoContextCreationProcedure {
        doc /* Page: Composite Structure Diagram context: choose Do Not Create. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context */
        action openProjectOptions;
        then action findDiagramContextOption;
        then action selectDoNotCreate;
        then action clickOk;
    }
    action def changeContextElementProcedure {
        doc /* Page: Composite Structure Diagram context: change the context from the specification. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context */
        action openSpecification;
        then action findContextProperty;
        then action openContextDialog;
        then action pickOrCreateElement;
        then action clickOk;
    }
    action def mapPortsInDialogProcedure {
        doc /* Page: Mapping ports on a Part type change. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149150/Mapping+ports+on+a+Part+type+change */
        action selectFromPort;
        then action dragOntoToPort;
        then action checkMappingLine;
    }
    action def pasteListAsNestedPartsProcedure {
        doc /* Page: Creating nested parts by pasting items from the list. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149156/Creating+nested+parts+by+pasting+items+from+the+list */
        action copyIndentedList;
        then action pressCtrlV;
        then action chooseElements;
        then action selectPart;
        then action answerYesForNesting;
    }
    action def createGenericTableProcedure {
        doc /* Page: Creating Generic Table without a wizard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table */
        action selectOwnerInTree;
        then action openCreateDiagramEntry;
        then action chooseGenericTable;
        then action typeTableName;
        then action selectElementTypes;
        then action fillTable;
    }
    action def createGenericTableViaWizardProcedure {
        doc /* Page: Creating Generic Table using the wizard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table */
        action openGenericTableWizard;
        then action typeNameAndOwner;
        then action selectElementTypes;
        then action selectElements;
    }
    action def addTermFromDiagramTextProcedure {
        doc /* Page: Adding terms in the Glossary Table: from the diagram pane. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149655/Adding+terms+in+the+Glossary+Table */
        action selectWordOrPhrase;
        then action rightClickSelection;
        then action chooseAddToGlossary;
    }
    action def specifyInstanceClassifierStepProcedure {
        doc /* Page: Specifying the classifier. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149683/Specifying+the+classifier */
        action openSelectClassifier;
        then action addToSelectedElements;
        then action confirmClassifier;
    }
    action def createInstanceWithPartsProcedure {
        doc /* Page: Filling the table with instances: create with parts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149690/Filling+the+table+with+instances */
        action showNestedColumns;
        then action openCreateMenu;
        then action chooseCreateWithParts;
    }
    action def createMetricTableProcedure {
        doc /* Page: Creating a Metric Table. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149714/Creating+a+Metric+Table */
        action rightClickPackage;
        then action chooseToolsMetricsNewMetricTable;
        then action typeNameOwnerAndSuites;
        then action clickOk;
    }
    action def calculateNewMetricProcedure {
        doc /* Page: Calculating metrics in the Metric Table. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149724/Calculating+metrics+in+the+Metric+Table */
        action selectRow;
        then action chooseCalculateNewMetric;
        then action newRowAppears;
    }
    action def filterTableProcedure {
        doc /* Page: Filtering table data. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149597/Filtering+table+data */
        action openFilterSettings;
        then action chooseColumnsCaseAndMatch;
        then action typeKeyword;
        then action pressEnter;
    }
    action def addCustomColumnProcedure {
        doc /* Page: Working with columns: add a custom column. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns */
        action openColumnsMenu;
        then action chooseNewCustomColumn;
        then action defineExpression;
        then action clickOk;
    }
    action def exportTableProcedure {
        doc /* Page: Exporting table. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149609/Exporting+table */
        action clickExport;
        then action chooseLocationAndName;
        then action chooseFormat;
        then action clickSave;
    }
    action def syncTableWithExcelProcedure {
        doc /* Page: Sync with Excel or CSV files. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149735/Sync+with+Excel+or+CSV+files */
        action createOrOpenTable;
        then action chooseElementTypeOrClassifier;
        then action chooseColumns;
        then action selectFileViaSyncMenu;
        then action reviewMapping;
        then action readFromFile;
    }
    action def switchPartialLoadingProcedure {
        doc /* Page: Partial loading in tables. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149756/Partial+loading+in+tables */
        action openOptionsMenu;
        then action chooseLoadPartially;
        then action chooseAutoEnabledOrDisabled;
    }

    // ---- Requirements ----
    requirement <'CAM-DGT-001'> offerUmlDiagramTypes {
        doc /* The tool offers the thirteen UML 2 diagram kinds: class, use case, sequence, activity, state machine, component, object, package, deployment, communication, protocol state machine, composite structure, interaction overview and profile. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149068/UML+diagrams */
    }
    requirement <'CAM-DGT-002'> groupViewsByArchitecture {
        doc /* Diagrams are grouped by the 4+1 architectural views (use case, structural, behavioral, implementation, environment) so the user picks a kind by viewpoint. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149084/Architectural+views */
    }
    requirement <'CAM-DGT-003'> showClassAndInterfaceStructure {
        doc /* A class diagram shows classes and interfaces with their attributes, operations and relationships (association, dependency, generalization, packaging). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149086/Class+diagram */
    }
    requirement <'CAM-DGT-004'> showObjectInstancesAndLinks {
        doc /* An object diagram shows instances of classifiers and links between them as a snapshot of a possible system state. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149088/Object+diagram */
    }
    requirement <'CAM-DGT-005'> modelActorsAndUseCases {
        doc /* A use case diagram models external actors and the use cases they take part in, from the outside view of the system. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149090/Use+Case+diagram */
    }
    requirement <'CAM-DGT-006'> modelMessagesBetweenParts {
        doc /* A communication diagram shows sequenced messages between objects or parts at instance or specification level. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149094/Communication+diagram */
    }
    requirement <'CAM-DGT-007'> modelLifelinesAndMessages {
        doc /* A sequence diagram has lifelines on the horizontal axis and time on the vertical axis, with messages between lifelines. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149096/Sequence+diagram */
    }
    requirement <'CAM-DGT-008'> enableExecutionSpecMode {
        doc /* A per-diagram palette button switches a sequence diagram so activation bars are execution specifications; the switch cannot be reversed. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
    }
    requirement <'CAM-DGT-009'> dropBehaviorOnExecSpec {
        doc /* Dragging a behavior from the containment tree onto an execution specification sets its behavior; dropping an action converts it to the matching kind and sets its action. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
    }
    requirement <'CAM-DGT-010'> openBehaviorFromExecSpec {
        doc /* Double-clicking an execution specification opens the diagram of its behavior or action. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
    }
    requirement <'CAM-DGT-011'> setMethodFromMessageOperation {
        doc /* Dragging an operation that has a method onto a message sets that method as the behavior of the execution specification at the message end. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
    }
    requirement <'CAM-DGT-012'> anchorTimeConstraintToBar {
        doc /* Drawing a time or duration constraint near the top or bottom of an activation bar sets the constrained element and whether it refers to the first event. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149098/Working+with+Execution+Specifications */
    }
    requirement <'CAM-DGT-013'> displayInnerStateElements {
        doc /* On a state machine diagram the user can display inner elements, automatically on first diagram creation or later from the Display menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149104/Working+with+State+Machine+diagram */
    }
    requirement <'CAM-DGT-014'> convertStateBehavior {
        doc /* A behavior (entry, do, exit, trigger, internal transition) selected in a state compartment can be converted to another behavior kind through Refactor > Convert To. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149104/Working+with+State+Machine+diagram */
    }
    requirement <'CAM-DGT-015'> restrictProtocolStateMachine {
        doc /* A protocol state machine diagram is tied to a classifier and shows only the operation-triggered transitions it permits. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149106/Protocol+State+Machine+diagram */
    }
    requirement <'CAM-DGT-016'> toggleBehaviorCreationMode {
        doc /* A palette toggle makes each new call behavior action create its own activity as the behavior, and typing the action name names the activity; it works per project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-017'> pasteListAsActions {
        doc /* Pasting an item list copied from outside the tool onto an activity diagram creates actions, optionally joined by control flows. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-018'> showDynamicCenterlines {
        doc /* While moving or drawing a shape in a flow diagram, guide lines show when its center aligns with another shape; the C key or an option turns them off. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-019'> setDiagramOrientation {
        doc /* Diagram orientation (vertical or horizontal) decides where rectilinear path breaks and attachment sides are placed; it is set in project options or diagram properties. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-020'> cascadeDeleteInActivity {
        doc /* Deleting the last symbol of an element from an activity diagram removes it from the model, and deleting a call behavior action also deletes its unused behavior; pins are exempt. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-021'> displayInnerActivityElements {
        doc /* Display Inner Elements populates an activity diagram with the contents of its activity, automatically for the first diagram under it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149116/Working+with+Activity+diagram */
    }
    requirement <'CAM-DGT-022'> modelComponentsAndDependencies {
        doc /* A component diagram models software components, the classes they realize, and dependencies between components. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149124/Component+diagram */
    }
    requirement <'CAM-DGT-023'> modelNodesAndDeployment {
        doc /* A deployment diagram shows hardware nodes, their links, and the artifacts or components deployed on them. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149126/Deployment+diagram */
    }
    requirement <'CAM-DGT-024'> showPackageStructure {
        doc /* A package diagram shows packages, nesting and dependencies between them. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149128/Package+diagram */
    }
    requirement <'CAM-DGT-025'> offerPackageRelationships {
        doc /* The package palette offers Package, Model, Profile, Package Merge, Package Import and Element Import, with hot keys P and M. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149130/Package+diagram+elements */
    }
    requirement <'CAM-DGT-026'> offerProfileDiagram {
        doc /* A profile diagram shows stereotypes, meta attributes and constraints; palette items need expert mode. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149140/Profile+diagram */
    }
    requirement <'CAM-DGT-027'> decomposeClassifierInternals {
        doc /* A composite structure diagram shows parts, ports and connectors inside a classifier. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149142/Composite+Structure+diagram */
    }
    requirement <'CAM-DGT-028'> autoCreateDiagramContext {
        doc /* When a composite structure diagram is created for an element that cannot be its context, a class is created as the context automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context */
    }
    requirement <'CAM-DGT-029'> chooseContextCreationPolicy {
        doc /* The Diagram Context project option chooses between creating the context automatically or asking via a Select Diagram Context dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context */
    }
    requirement <'CAM-DGT-030'> changeDiagramContext {
        doc /* The context of a diagram is changed from its specification by picking an existing element or creating one. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149144/Composite+Structure+Diagram+context */
    }
    requirement <'CAM-DGT-031'> nestPartsThatAreAssociationEnds {
        doc /* A part that is an association end property can be nested into another part, and the change is mirrored in the class diagram. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149146/Nesting+parts+that+are+association+ends */
    }
    requirement <'CAM-DGT-032'> mapPortsAutomaticallyOnTypeChange {
        doc /* When a part type changes, ports of the old type are replaced by matching ports of the new type, and connectors reconnect, by rules on type, name, interface, subtyping and redefinition. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149150/Mapping+ports+on+a+Part+type+change */
    }
    requirement <'CAM-DGT-033'> mapPortsManually {
        doc /* If ports cannot be mapped automatically, a Port Mapping dialog lets the user drag ports from old to new, create ports, and remove mapping lines. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149150/Mapping+ports+on+a+Part+type+change */
    }
    requirement <'CAM-DGT-034'> pasteListAsNestedParts {
        doc /* Pasting an indented list copied from outside onto a composite structure diagram creates nested parts following its indentation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149156/Creating+nested+parts+by+pasting+items+from+the+list */
    }
    requirement <'CAM-DGT-035'> modelInteractionFlow {
        doc /* An interaction overview diagram uses activity notation with frames that hold interactions, to show control flow between interactions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149158/Interaction+Overview+diagram */
    }
    requirement <'CAM-DGT-036'> createDependencyMatrix {
        doc /* A dependency matrix is created from the Create Diagram dialog, the toolbar, Ctrl+N or the context menu, is owned by an element, and is a model element in the browser. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149163/Creating+Dependency+Matrix */
    }
    requirement <'CAM-DGT-037'> setMatrixCriteriaFields {
        doc /* The criteria area holds row and column element type, row and column scope, dependency criteria, direction and show elements, with query buttons for scopes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149247/Dependency+Matrix+Criteria+area */
    }
    requirement <'CAM-DGT-038'> chooseMatrixElementTypes {
        doc /* Row and column element types are chosen by dragging from the browser or via Select Element Type with optional subtypes and custom types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria */
    }
    requirement <'CAM-DGT-039'> scopeMatrixByPackages {
        doc /* Row and column scope is set by dragging packages, a dialog or the specification window, and Ctrl adds to the scope. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149180/Specifying+scope */
    }
    requirement <'CAM-DGT-040'> buildMatrixHierarchyByQuery {
        doc /* A scope query selects containment, structure or custom decomposition, with a Build Hierarchy option for custom expressions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149180/Specifying+scope */
    }
    requirement <'CAM-DGT-041'> chooseDependencyCriteria {
        doc /* The dependency criteria dialog selects relationship types, with options for subtypes, custom types, property-value filters, and aggregation with association. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria */
    }
    requirement <'CAM-DGT-042'> chooseMatrixDirection {
        doc /* A direction setting controls which direction of relationship is shown and the direction used for new ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria */
    }
    requirement <'CAM-DGT-043'> filterMatrixByRelationState {
        doc /* Show Elements limits the matrix to related, unrelated or all elements, or hides columns or rows without relations; the matrix is refreshed afterwards. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149165/Selecting+criteria */
    }
    requirement <'CAM-DGT-044'> refreshMatrix {
        doc /* Refresh rebuilds the matrix after criteria or data change. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar */
    }
    requirement <'CAM-DGT-045'> drawCellDependencies {
        doc /* Cells show an arrowed diagonal from client to supplier, a plain diagonal for mutual dependency, and variants for one, two or more relations. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content */
    }
    requirement <'CAM-DGT-046'> showCellCounts {
        doc /* Matrix headers and cells show counts: relations per row, per column and criteria per cell. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content */
    }
    requirement <'CAM-DGT-047'> showCellTooltip {
        doc /* Hovering a cell shows a tooltip with the relationships it stands for. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149199/Understanding+cell+content */
    }
    requirement <'CAM-DGT-048'> createRelationFromCell {
        doc /* Double-clicking a cell, or choosing Create New from its menu, creates a relationship of the offered type and direction; a prompt appears if several are possible. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix */
    }
    requirement <'CAM-DGT-049'> createManyRelationsFromCells {
        doc /* With Ctrl held, many row and column elements are selected so one action creates all relationships. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix */
    }
    requirement <'CAM-DGT-050'> deleteRelationFromCell {
        doc /* Double-click or the Delete submenu removes one, all, or many cells' relationships from both matrix and model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149218/Modifying+relationships+in+Dependency+Matrix */
    }
    requirement <'CAM-DGT-051'> navigateFromCell {
        doc /* Navigate in a cell menu selects the relationship in the containment tree. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149228/Navigation+from+cell */
    }
    requirement <'CAM-DGT-052'> sortAndShiftMatrixAxes {
        doc /* Rows and columns can be sorted ascending or descending, or shifted by menu or Ctrl plus arrows, which sets the order to Custom. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149231/Rearranging+rows+and+columns */
    }
    requirement <'CAM-DGT-053'> styleMatrixRelations {
        doc /* Each relation criterion has color, line style, arrowheads or an icon (from file or URL), shown in a legend that can be moved or hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149189/Specifying+relationship+line+styles */
    }
    requirement <'CAM-DGT-054'> highlightMatrixViolations {
        doc /* Validation results are shown by highlighting cells whose relationships break rules. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149237/Validation+in+Dependency+Matrix */
    }
    requirement <'CAM-DGT-055'> transposeMatrix {
        doc /* Change Axes swaps rows and columns. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar */
    }
    requirement <'CAM-DGT-056'> exportMatrixToCsv {
        doc /* A matrix can be exported to a CSV file that opens in a spreadsheet. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar */
    }
    requirement <'CAM-DGT-057'> removeVersusDeleteMatrixElement {
        doc /* Remove From Matrix drops an element from the matrix only; Delete removes it from the model too. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149241/Dependency+Matrix+toolbar */
    }
    requirement <'CAM-DGT-058'> offerMatrixContextMenus {
        doc /* Matrix and row/column menus offer Specification, Go To, Select in Containment Tree, Refactor, Tools, print, full screen and tab closing commands. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149250/Dependency+Matrix+shortcut+menu */
    }
    requirement <'CAM-DGT-059'> createRelationMap {
        doc /* A relation map is created for a selected context element from the dialog, shortcut, Analyze menu or Related Elements menu; the last two make the context the owner. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149264/Creating+relation+map */
    }
    requirement <'CAM-DGT-060'> setRelationMapCriteria {
        doc /* Criteria area fields: context, relation criteria, element type with subtypes, scope, layout (tree or radial) and depth. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149265/Specifying+criteria+layout+and+depth */
    }
    requirement <'CAM-DGT-061'> changeRelationMapContext {
        doc /* The context is replaced by dragging an element, selecting it, or clicking a node when the Make Element as Context option is on. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149275/Changing+the+context */
    }
    requirement <'CAM-DGT-062'> cutRelationMapNames {
        doc /* An option shortens long element names, with a tooltip showing the full name. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149276/Cutting+element+names */
    }
    requirement <'CAM-DGT-063'> toggleSingleNodePerElement {
        doc /* One node per element or one per occurrence, by option. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149278/Showing+single+node+per+element */
    }
    requirement <'CAM-DGT-064'> showMapElementNumbers {
        doc /* An option numbers elements before their names. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149281/Displaying+element+numbering */
    }
    requirement <'CAM-DGT-065'> colorMapRelations {
        doc /* Relation criteria get colors and line styles, shown in a legend that is on by default. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149283/Specifying+colors+and+legend */
    }
    requirement <'CAM-DGT-066'> collapseMapBranches {
        doc /* Branches are suppressed or expanded from a control at the node. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-067'> zoomAndPanMap {
        doc /* The map zooms with Ctrl+wheel, toolbar or Ctrl+numpad keys, fits to window with Ctrl+W, resets to 1:1, and pans by dragging. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-068'> hideOrDeleteMapNode {
        doc /* Delete hides a node; Ctrl+D removes the element from the model. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-069'> restoreMapLayout {
        doc /* Refresh restores manually changed branches, moves, hidden and removed items unless a preserve option is on. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-070'> createRelatedElementInMap {
        doc /* Insert on a node decomposes it by choosing an element type and relationship, reusing an existing element if chosen. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-071'> createSiblingWhileNaming {
        doc /* Ctrl+Enter while naming a new element creates another of the same type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149289/Manipulations+in+the+relation+map */
    }
    requirement <'CAM-DGT-072'> followRobustnessRules {
        doc /* Robustness diagrams classify objects as boundary, entity or control and allow only actor-boundary, boundary-control, entity-control and control-control talk. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149291/Robustness+diagram */
    }
    requirement <'CAM-DGT-073'> prototypeUserInterfaces {
        doc /* A user interface modeling diagram is created from the toolbar or browser, and widgets are dragged from Text, Containers, Button and Other palettes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149325/Working+with+User+Interface+Modeling+diagrams */
    }
    requirement <'CAM-DGT-074'> editUiTablesAndTrees {
        doc /* Columns, rows, nodes and leaves of UI model tables and trees are added from the containment tree and reordered with the Element Numbering dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149332/User+Interface+Modeling */
    }
    requirement <'CAM-DGT-075'> saveUiPrototypeAsImage {
        doc /* A finished UI diagram can be saved as an image from File > Save As Image. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149368/Case+Studies+for+User+Interface+Modeling */
    }
    requirement <'CAM-DGT-076'> drawContentDiagram {
        doc /* The content diagram generates or represents project structure and relations between diagrams; it has its own specification and palette. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149389/Content+diagram */
    }
    requirement <'CAM-DGT-077'> drawNetworkTopology {
        doc /* A networking diagram draws network topology with icons from the Networking profile. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149392/Networking+diagram */
    }
    requirement <'CAM-DGT-078'> drawCorbaIdl {
        doc /* A CORBA IDL diagram creates CORBA elements (interface, value type, typedef, sequence, union, enum). Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149392/Networking+diagram */
    }
    requirement <'CAM-DGT-079'> drawTimingDiagram {
        doc /* A time diagram is like a sequence diagram with predefined stereotypes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149399/Time+diagram */
    }
    requirement <'CAM-DGT-080'> drawFreeFormShapes {
        doc /* A free form diagram draws geometric shapes and flowchart shapes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149407/Free+Form+diagram */
    }
    requirement <'CAM-DGT-081'> composeTableAreas {
        doc /* Every table has toolbars, a criteria area, a grid of numbered rows and property columns, a description area and an info area. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149409/Tables */
    }
    requirement <'CAM-DGT-082'> offerTableToolbars {
        doc /* Tables share navigation, edit (add new, add existing, delete, remove from table), layout, publish, find, view, validation, options and criteria-toggle toolbars with shortcuts. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149424/Table+toolbars */
    }
    requirement <'CAM-DGT-083'> specifyTableScope {
        doc /* Scope is set by a select dialog or by dragging containers to the Scope box; a Refresh updates smart-package scopes. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149510/Specifying+the+scope+for+the+table */
    }
    requirement <'CAM-DGT-084'> collectRowsByExpression {
        doc /* A query dialog with custom expressions collects table rows automatically. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149510/Specifying+the+scope+for+the+table */
    }
    requirement <'CAM-DGT-085'> editCellsIntoModel {
        doc /* Double-clicking an editable cell edits it with the editor matching the property type; changes are saved in the model; grey cells are read-only. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells */
    }
    requirement <'CAM-DGT-086'> selectTableRegions {
        doc /* Cells, ranges, whole rows, whole columns and the whole table can be selected by click, drag, Shift and header menus. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells */
    }
    requirement <'CAM-DGT-087'> openSpecFromCell {
        doc /* The Specification window opens from a cell by double-click (read-only) or menu (editable), with a submenu if several elements are referenced. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells */
    }
    requirement <'CAM-DGT-088'> clearCellValues {
        doc /* Clear or Delete empties string, boolean, number or enumeration values in a cell, row, column or whole table. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells */
    }
    requirement <'CAM-DGT-089'> moveBetweenCellsByKeys {
        doc /* Arrows, Tab, Shift+Tab, Enter and Shift+Enter move the cell cursor. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149516/Working+with+cells */
    }
    requirement <'CAM-DGT-090'> manageTableColumns {
        doc /* Columns are hidden, dragged to reorder (not the first), and added or removed through a Columns menu and Select Columns dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns */
    }
    requirement <'CAM-DGT-091'> defineCustomColumns {
        doc /* A custom column is defined by an expression, edited or removed from its header; type and multiplicity follow the expression. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns */
    }
    requirement <'CAM-DGT-092'> showDetailedColumnNames {
        doc /* An option adds property group and stereotype names to column headers. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149522/Working+with+columns */
    }
    requirement <'CAM-DGT-093'> addTableRows {
        doc /* Add New creates a model element as a new row; Add Existing picks an existing one; instance and metric tables have their own menus. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149551/Adding+and+removing+rows */
    }
    requirement <'CAM-DGT-094'> removeRowVersusDelete {
        doc /* Remove From Table (Ctrl+Delete) drops the row only; Delete (Ctrl+D) also deletes the element. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149551/Adding+and+removing+rows */
    }
    requirement <'CAM-DGT-095'> sortTableRows {
        doc /* Clicking a header sorts by it; Ctrl-click adds further sort columns. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149562/Organizing+rows */
    }
    requirement <'CAM-DGT-096'> moveTableRows {
        doc /* Up and Down (toolbar, menu, Ctrl+arrows) shift rows and renumber. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149562/Organizing+rows */
    }
    requirement <'CAM-DGT-097'> toggleElementNumbers {
        doc /* The Show Element Number property shows or hides numbering in the name column. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149566/Displaying+hiding+element+numbers+in+a+row */
    }
    requirement <'CAM-DGT-098'> showTableHierarchy {
        doc /* Display Mode picks complete tree, compact tree or list; scope queries choose containment, structure or custom hierarchy; nodes expand with Ctrl+arrows. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149569/Displaying+row+elements+hierarchically */
    }
    requirement <'CAM-DGT-099'> addNestedRequirement {
        doc /* Add Nested in a requirement table creates a requirement inside the selected one. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149584/Nesting+additional+elements+in+a+hierarchical+table */
    }
    requirement <'CAM-DGT-100'> pasteExternalTableData {
        doc /* Pasting external rows (Excel, web, documents) into a table creates or updates elements when column counts and types fit. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149593/Copying+and+pasting+data */
    }
    requirement <'CAM-DGT-101'> copyTableDataOut {
        doc /* Selected cells are copied to the clipboard for other applications, and between cells. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149593/Copying+and+pasting+data */
    }
    requirement <'CAM-DGT-102'> filterTableRows {
        doc /* A filter box with settings for columns, case, wildcard or regex, match mode and parent/child display filters rows; it is disabled while loading. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149597/Filtering+table+data */
    }
    requirement <'CAM-DGT-103'> keepFilterOnReload {
        doc /* Save Filter Criteria keeps the filter after reload and applies to export. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149607/Saving+the+filter+criteria */
    }
    requirement <'CAM-DGT-104'> exportTableToFile {
        doc /* A table is exported to HTML, CSV or XLSX through a save dialog, with an HTML template for style. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149609/Exporting+table */
    }
    requirement <'CAM-DGT-105'> createGenericTable {
        doc /* A generic table needs a name, owner and element types; scope, elements and columns are optional; creation uses dialog, shortcut or wizard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table */
    }
    requirement <'CAM-DGT-106'> useGenericTableWizard {
        doc /* The Generic Table Wizard (Diagrams > Diagram Wizards or Model Visualizer) asks name and owner, element types, then elements and fills the table. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149624/Creating+Generic+Table */
    }
    requirement <'CAM-DGT-107'> changeGenericElementTypes {
        doc /* Element types are changed in a select dialog (subtypes, custom types) or by dragging; the columns follow the types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149632/Adding+or+removing+element+types */
    }
    requirement <'CAM-DGT-108'> fillGenericFromModel {
        doc /* Elements are added by Add New, Add Existing (also by drag; containers show contents) or paste. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149642/Filling+the+table+with+elements */
    }
    requirement <'CAM-DGT-109'> addGlossaryTerms {
        doc /* Terms are added from selected text (Add To glossary), toolbar, drag or paste; synonyms are stored on the term. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149655/Adding+terms+in+the+Glossary+Table */
    }
    requirement <'CAM-DGT-110'> insertGlossaryTerms {
        doc /* Ctrl+Space inserts a term; acronyms are recognized by default and can be switched off; defined terms are underlined. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149660/Using+terms+in+your+model */
    }
    requirement <'CAM-DGT-111'> specifyInstanceClassifier {
        doc /* Classifiers for an instance table are chosen by dialog or drag; none may be added until one is set. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149683/Specifying+the+classifier */
    }
    requirement <'CAM-DGT-112'> chooseInstanceColumns {
        doc /* Instance table columns for attributes, properties, tags and nested properties are chosen in menus and the Select Columns dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149685/Selecting+columns+to+display */
    }
    requirement <'CAM-DGT-113'> createInstancesInTable {
        doc /* Create adds an instance (with parts, existing, or pasted) to an instance table once a classifier exists. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149690/Filling+the+table+with+instances */
    }
    requirement <'CAM-DGT-114'> setInstanceSlotValues {
        doc /* A slot value can be a new or existing instance chosen from the cell, and Remove clears it without deleting the instance. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149694/Specifying+instances+as+slot+values */
    }
    requirement <'CAM-DGT-115'> createMetricTable {
        doc /* A metric table is made from Tools > Metrics > New Metric Table by choosing name, owner and metric suites. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149714/Creating+a+Metric+Table */
    }
    requirement <'CAM-DGT-116'> calculateMetrics {
        doc /* Metric rows are calculated new, recalculated, or added with different parameter values. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149724/Calculating+metrics+in+the+Metric+Table */
    }
    requirement <'CAM-DGT-117'> linkExcelOrCsvFile {
        doc /* One Excel or CSV file is linked to a table, from the file system or the model, by menu or drag, with a sync options dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149735/Sync+with+Excel+or+CSV+files */
    }
    requirement <'CAM-DGT-118'> readAndWriteSyncedFile {
        doc /* Read from File imports and Write to File exports using a mapping; empty rows and columns can be skipped and export can map by ID. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149745/Excel+and+CSV+Sync+Options+dialog */
    }
    requirement <'CAM-DGT-119'> loadTablePartially {
        doc /* Load Partially is auto, enabled or disabled; when active, filter and find narrow and Select All is off. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227149756/Partial+loading+in+tables */
    }
}
