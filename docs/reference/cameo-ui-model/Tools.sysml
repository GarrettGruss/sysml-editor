package CameoUI_TLS {
    private import CameoUI::*;
    private import ScalarValues::*;
    doc /* Section 000 User Guide / 010 Tools. Model merge, model patch, metric suites, transformations, executable concepts, resource manager, code-engineering helpers, instantiation wizard, spelling, diagnostics and housekeeping tools. Written by hand; see README.md. The page "Integration with external Evaluators" only points to another document and is not modelled. */

    // ---- Shared concepts ----
    enum def MergeKind { enum threeWay; enum twoWay; }
    enum def ChangeKind { enum addition; enum deletion; enum modification; enum movement; enum orderChange; }
    enum def ChangeState { enum accepted; enum rejected; }
    enum def PatchKind { enum allSelectedContent; enum changesFromSelectedVersion; }
    enum def ConflictWinner { enum source; enum target; }
    enum def OptimizeFor { enum speed; enum memory; }
    enum def MetricKind { enum elementQuantity; enum failedElementQuantity; enum failedElementPercentage; }
    enum def UpdateMode { enum followSource; enum keepDestination; }
    attribute def ProjectVersion { attribute name : Label; }
    attribute def Change { attribute kind : ChangeKind; attribute review : ChangeState; attribute conflicting : Boolean; attribute equivalent : Boolean; }

    // ---- Model merge ----
    part def MergeProjectsDialog :> Dialog { part mergeType : Option; part sourceProject : Field; part ancestorProject : Field; part optimizeFor : Option; part ancestorChoice : Option; }
    part def MergeWithLockQuestion :> Dialog;
    part def MergeWindow :> Window {
        part mergedResultTree : MergedResultTree;
        part specificationPanel : MergeSpecificationPanel;
        part changeDetailsPanel : ChangeDetailsPanel;
        part summaryLegendPanel : Panel;
        part toolbar : MergeToolbar;
    }
    part def MergedResultTree :> ContainmentTree { part changesFilter : Option; }
    part def MergeSpecificationPanel :> Panel { part sourceColumn : Field; part ancestorColumn : Field; part targetColumn : Field; part previewColumn : Field; }
    part def ComparePropertyDialog :> Dialog;
    part def ChangeDetailsPanel :> Panel;
    part def MergeToolbar :> Toolbar;
    part def DifferenceViewerTab :> DiagramPane { part legend : Panel; part changeSlider : Field; }
    part def MergeEnvironmentOptions :> Dialog { part optimizeFor : Option; part ignoreOrderFor : Option; part derivedProperties : Option; part conflictWinner : Option; part diagramChanges : Option; part usedProjectDiagrams : Option; }

    action def MergeFrom :> Command;               // Collaborate > Merge From
    action def ProjectMerge :> Command;            // Tools > Project > Merge
    action def AcceptChange :> Command;
    action def RejectChange :> Command;
    action def AcceptWithProperties :> Command;
    action def RejectWithProperties :> Command;
    action def AcceptRecursively :> Command;
    action def RejectRecursively :> Command;
    action def MarkAsResolved :> Command;
    action def SelectOriginalLocations :> Command;
    action def SelectNewLocations :> Command;
    action def GoToFirstChange :> Command;         // Alt+Home
    action def GoToPreviousChange :> Command;      // Alt+Up
    action def GoToNextChange :> Command;          // Alt+Down
    action def GoToLastChange :> Command;          // Alt+End
    action def GoToNextConflict :> Command;        // Alt+Page Down
    action def AnnotateMergedDiagram :> Command;
    action def GenerateMergeReport :> Command;
    action def FinishMerging :> Command;
    action def CancelMerge :> Command;

    state def MergeSession {
        entry action init;
        then state configuring;
        state configuring;
        state reviewing;
        state finished;
        state cancelled;
        transition first configuring accept ProjectMerge then reviewing;
        transition first reviewing accept FinishMerging then finished;
        transition first reviewing accept CancelMerge then cancelled;
    }

    // ---- Model patch ----
    part def CreatePatchDialog :> Dialog { part scope : Field; part patchType : Option; part versionChoice : Option; part targetFile : Field; }
    part def ApplyPatchWindow :> Window;
    part def UnappliedChangesPane :> Panel;
    action def CreatePatch :> Command;             // Tools > Patch > Create Patch
    action def ApplyPatch :> Command;              // Tools > Patch > Apply Patch

    // ---- Metric suites ----
    part def MetricSuite :> ModelElement { part target : ModelElement[0..*]; part parameters : ParameterDefinition[1..*]; part metrics : MetricDefinition[0..*]; }
    part def ParameterDefinition :> Property { attribute isContext : Boolean; }
    part def MetricDefinition :> Property { attribute language : Label; attribute body : Label; }
    part def ValidationBasedMetricDefinition :> MetricDefinition { attribute validationRule : Label; attribute metricKind : MetricKind; attribute failingElementsMenuItem : Label[0..1]; }
    part def MetricTable :> DiagramElement;
    part def CreateMetricTableDialog :> Dialog;
    part def ProfileDiagramPane :> DiagramPane;

    // ---- Model transformation ----
    part def ModelTransformationWizard :> Wizard { part steps : TransformationStep[5]; }
    part def TransformationStep { attribute caption : Label; }
    part def TypeMap :> ModelElement { part rules : TypeMapRule[0..*]; attribute defaultDirection : Label; }
    part def TypeMapRule :> ModelElement { ref fromType : ModelElement; ref toType : ModelElement; attribute direction : Label; attribute isDefault : Boolean; attribute blockInheritedSourceTypes : Boolean; attribute blockInheritedDestinationTypes : Boolean; }
    part def ModelRefreshOptionsDialog :> Dialog { part updateMode : Option; }
    part def ProfileMigrationRule :> ModelElement { ref fromElement : ModelElement; ref toElement : ModelElement; }
    action def ModelTransformations :> Command;    // Tools > Model Transformations
    action def UpdateTransformedModel :> Command;  // package menu Tools > Update Transformed Model
    action def TransformedTo :> Command;           // Transformations > Transformed To

    state def TransformationWizardStep {
        entry action init;
        then state selectType;
        state selectType;
        state selectSource;
        state selectDestination;
        state selectTypeMap;
        state specifyDetails;
        transition first selectType accept Next then selectSource;
        transition first selectSource accept Next then selectDestination;
        transition first selectDestination accept Next then selectTypeMap;
        transition first selectTypeMap accept Next then specifyDetails;
    }
    action def Next :> Command;

    // ---- Executable concepts and OCL ----
    part def ExpressionLanguage { attribute name : Label; }
    part def EditSpecificationDialog :> Dialog { part language : Option; part checkOclSyntax : Option; part body : Field; }
    action def CheckOclSyntax :> Command;

    // ---- Resource manager ----
    part def ResourcePluginManagerDialog :> Dialog { part resourceLocation : Field; part resourceList : Field; part detailsPane : Panel; }
    part def ManageResourceLocationsDialog :> Dialog;
    action def OpenResourceManager :> Command;     // Help > Resource/Plugin Manager
    action def InstallResource :> Command;
    action def RemoveResource :> Command;

    // ---- Code-engineering helpers ----
    part def SelectAttributesDialog :> Dialog;
    part def ImplementOverrideDialog :> Dialog { part allOperations : Field; part selectedOperations : Field; }
    action def CreateSettersGetters :> Command;
    action def ImplementOverrideOperations :> Command;

    // ---- Automatic instantiation wizard ----
    part def AutomaticInstantiationWizard :> Wizard { part partsStep : Panel; part packageStep : Panel; part diagramStep : Panel; }
    part def InstantiatedProperty { attribute name : Label; attribute value : Label; ref type : ModelElement; }
    action def CreateInstance :> Command;          // Tools > Create Instance

    // ---- Spelling ----
    part def CheckSpellingDialog :> Dialog { part scope : Option; part spellingOptions : Option; }
    part def SpellCheckerDialog :> Dialog;
    part def SpellingOptions :> Dialog { part checkAsYouType : Option; part checkTaggedValues : Option; part dictionary : Option; part caseSensitive : Option; part camelCaseWords : Option; part ignoreUpperCase : Option; part skipNumbers : Option; }
    action def CheckSpelling :> Command;           // Tools > Check Spelling
    action def AddToDictionary :> Command;
    action def IgnoreWord :> Command;

    // ---- Diagnostics and housekeeping ----
    part def ProjectStatisticsDialog :> Dialog { part includeUsedProjects : Option; part confidential : Option; }
    part def EvaluateOperationPerformanceDialog :> Dialog;
    part def ServerCertificatesOptions :> Dialog { part trustedByAll : Panel; part trustedByCurrentUser : Panel; }
    part def PackageStructureConfiguration :> ModelElement { attribute applyToElements : Label[0..*]; attribute createElements : Label; attribute removeIndentSymbols : Boolean; }
    part def SelectPackageStructureDialog :> Dialog;
    action def ExportDetailedStatistics :> Command;
    action def EvaluateOperationPerformance :> Command;
    action def ObfuscateProject :> Command;        // File > Obfuscate Project
    action def CreatePackageStructure :> Command;  // element menu Tools > Create Package Structure

    state def PerformanceRecording { state idle; state recording; state showingResults; }

    // ---- Cross-section references ----
    ref specificationWindow : SpecificationWindow[0..1];
    ref quickFindDialog : QuickFindDialog[0..1];
    ref validationResultsPanel : ValidationResultsPanel[0..1];
    ref environmentOptionsDialog : EnvironmentOptionsDialog[0..1];
    ref projectUsages : CameoUI_PRJ::UsedProjectsDialog[0..1];
    ref createDiagramCommand : CameoUI_DGM::CreateDiagram[0..1];
    ref tracingRelationMap : CameoUI_DGT::RelationMapType[0..1];

    part def ReportWizard :> Wizard;
    part def ModelVisualizerPanel :> Panel;
    part def ValidationRule { attribute name : Label; }

    // ---- Procedures ----
    action def StartLocalMerge {
        doc /* Page: Starting Model Merge, local model merge. Tools > Project > Merge opens the merge dialog on the active target project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge */
        action openTargetProject;
        then action chooseProjectMerge;
        then action selectMergeType;
        then action selectSourceProject;
        then action selectAncestorForThreeWay;
        then action optionallyOpenAdvanced;
        then action pickOptimization;
        then action clickMerge;
    }
    action def StartServerMerge {
        doc /* Page: Starting Model Merge, server projects. Collaborate > Merge From, then a lock question. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge */
        action openServerTarget;
        then action chooseMergeFrom;
        then action selectSourceServerProject;
        then action confirmDialog;
        then action chooseLockOrNoLock;
        then action reviewMergeWindow;
    }
    action def ChooseAncestorOnServer {
        doc /* Page: Starting Model Merge, advanced options on the server. Lowest Common Parent or Branch Point decides the ancestor. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge */
        action chooseProjectMerge;
        then action selectSourceServerProject;
        then action openAdvanced;
        then action pickAncestorRule;
        then action pickOptimization;
        then action clickMerge;
        then action continueOrShowResults;
    }
    action def OpenMergeEnvironmentOptions {
        doc /* Page: Preparing for merge. Options > Environment > General > Merge and Compare. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151239/Preparing+for+merge */
        action chooseOptionsEnvironment;
        then action expandGeneralGroup;
        then action selectMergeAndCompare;
    }
    action def FinishMerge {
        doc /* Page: Finishing and canceling merge. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151315/Finishing+and+canceling+merge */
        action clickFinishMerging;
        then action saveOrCommitProject;
    }
    action def CancelMergeProcedure {
        doc /* Page: Finishing and canceling merge. Cancel or Close both ask for confirmation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151315/Finishing+and+canceling+merge */
        action clickCancelOrClose;
        then action answerQuestion;
    }
    action def OpenDiagramDifferences {
        doc /* Page: Viewing and analyzing changes of modified diagrams. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151310/Viewing+and+analyzing+changes+of+modified+diagrams */
        action doubleClickModifiedDiagram;
        then action readViewerTabs;
        then action moveChangeSlider;
        then action clickChangeFlag;
    }
    action def GenerateDifferencesReport {
        doc /* Page: Generating a differences report. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151314/Generating+a+differences+report */
        action clickReportButton;
        then action chooseTemplate;
        then action pickFileLocation;
        then action saveReport;
    }
    action def CreateModelPatch {
        doc /* Page: Using Model Patch, creating a model patch. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch */
        action openSourceProject;
        then action chooseCreatePatch;
        then action addElementsToScope;
        then action clickNext;
        then action selectPatchType;
        then action selectVersionForChangesType;
        then action clickNextAgain;
        then action pickSaveLocation;
        then action clickSave;
    }
    action def ApplyModelPatch {
        doc /* Page: Using Model Patch, applying a model patch. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch */
        action openTargetProject;
        then action chooseApplyPatch;
        then action selectPatchFile;
        then action reviewChanges;
        then action clickApplyPatch;
        then action investigateResult;
    }
    action def CreateMetricSuiteFromBase {
        doc /* Page: Adding a new Metric Suite, using the base suite. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151323/Adding+a+new+Metric+Suite */
        action ensureStandardProfileUsed;
        then action createSuitePackage;
        then action createProfileDiagram;
        then action quickFindBaseSuite;
        then action selectBaseSuite;
        then action dragBaseSuiteToDiagram;
        then action createMetricSuiteShape;
        then action generalizeFromBaseSuite;
    }
    action def SpecifySuiteTarget {
        doc /* Page: Specify the target for the Metric Suite. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151327/Specify+the+target+for+the+Metric+Suite */
        action openSuiteSpecification;
        then action editTargetValue;
        then action selectTargetElements;
        then action addToSelected;
        then action confirmSelection;
        then action closeSpecification;
    }
    action def AddParameterDefinition {
        doc /* Page: Specifying parameter definitions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151330/Specifying+parameter+definitions */
        action selectSuiteShape;
        then action chooseCreateParameterDefinition;
        then action typeParameterName;
        then action selectTypeOfParameter;
    }
    action def DeclareContextParameter {
        doc /* Page: Specifying parameter definitions, declaring the context. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151330/Specifying+parameter+definitions */
        action openParameterSpecification;
        then action setAsContextTrue;
        then action closeSpecification;
    }
    action def BuildMetricDefinition {
        doc /* Page: Building metric definitions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151332/Building+metric+definitions */
        action selectSuiteShape;
        then action chooseCreateMetricDefinition;
        then action typeMetricName;
        then action selectResultType;
        then action openMetricSpecification;
        then action setDefaultToOpaqueExpression;
        then action openDefaultValueDialog;
        then action selectLanguage;
        then action typeFormula;
        then action confirmAndClose;
    }
    action def BuildValidationMetricDefinition {
        doc /* Page: Building validation-based metric definitions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151334/Building+validation-based+metric+definitions */
        action chooseValidationBasedMetricFromManipulator;
        then action typeMetricName;
        then action selectResultType;
        then action openMetricSpecification;
        then action selectValidationRule;
        then action selectMetricType;
        then action optionallyNameFailingElementsItem;
    }
    action def CreateValidationDashboard {
        doc /* Page: Creating a validation dashboard. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151340/Creating+a+validation+dashboard */
        action createTrackedSuitesAndTables;
        then action createAbstractDashboardSuite;
        then action setSuiteAbstract;
        then action addColumnMetricDefinitions;
        then action generalizeTrackedSuitesFromIt;
        then action redefineColumnMetrics;
        then action createDashboardTable;
        then action setTableScopeToTables;
        then action setQueryToLatestInstances;
    }
    action def StartTransformationWizard {
        doc /* Page: Working with Model Transformation Wizard and the five step pages. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151351/Working+with+Model+Transformation+Wizard */
        action chooseModelTransformations;
        then action selectTransformationType;
        then action selectSourceModel;
        then action selectDestinationOrInPlace;
        then action selectTypeMap;
        then action setCustomProperties;
        then action clickFinish;
    }
    action def CreateTypeMap {
        doc /* Page: Transformation Type Mapping. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151368/Transformation+Type+Mapping */
        action importTransformationProfile;
        then action createTypeMapPackage;
        then action applyTypeMapStereotype;
        then action chooseSourceAndTargetTypes;
        then action createDependencies;
        then action applyMapStereotype;
        then action keepDependenciesInMapPackage;
    }
    action def UpdateTransformedModelProcedure {
        doc /* Page: Transformation Traces and Update. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151381/Transformation+Traces+and+Update */
        action rightClickDestinationPackage;
        then action chooseUpdateTransformedModel;
        then action pickRefreshOption;
    }
    action def CreateProfileMigrationRule {
        doc /* Page: Profile Migration Transformation mapping, stereotype rule. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151384/Profile+Migration+Transformation+mapping */
        action createDependencyBetweenStereotypes;
        then action applyReplaceStereotype;
        then action performTransformation;
    }
    action def RunProfileMigration {
        doc /* Page: Sample of the Profile Migration Transformation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151386/Sample+of+the+Profile+Migration+Transformation */
        action createOldAndNewStereotypes;
        then action drawMigrationDependency;
        then action applyReplaceStereotype;
        then action openTransformationWizard;
        then action selectProfileMigration;
        then action selectSourcePackage;
        then action checkMappings;
        then action clickFinish;
    }
    action def CheckOclSyntaxProcedure {
        doc /* Page: Object Constraint Language. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151389/Object+Constraint+Language */
        action clickSpecificationValue;
        then action openEditSpecification;
        then action chooseOclLanguage;
        then action tickCheckSyntax;
    }
    action def AddResourceLocationAndInstall {
        doc /* Page: Resource Manager. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager */
        action openResourceManager;
        then action openManageLocations;
        then action addFileOrUrl;
        then action confirmLocation;
        then action tickResource;
        then action clickDownloadInstall;
        then action closeAndRestart;
    }
    action def UninstallResource {
        doc /* Page: Resource Manager. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager */
        action tickResource;
        then action clickRemove;
        then action closeAndRestart;
    }
    action def CreateSettersAndGetters {
        doc /* Page: Creating Setters and Getters. Alternative: add a tagged value naming the attribute. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151414/Creating+Setters+and+Getters */
        action rightClickClass;
        then action chooseCodeEngineering;
        then action chooseCreateSettersGetters;
        then action selectAttributes;
    }
    action def ImplementOverrideProcedure {
        doc /* Page: Implementing or Overriding Operations. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151415/Implementing+or+Overriding+Operations */
        action rightClickClass;
        then action chooseCodeEngineering;
        then action chooseImplementOverride;
        then action moveOperationsToSelected;
        then action clickOk;
    }
    action def RunAutomaticInstantiation {
        doc /* Page: Working with Automatic Instantiation Wizard. Three steps, the last optional. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard */
        action selectElementsToInstantiate;
        then action chooseCreateInstance;
        then action selectPartsAndValues;
        then action selectOrCreatePackage;
        then action optionallyCreateDiagram;
        then action clickFinish;
    }
    action def CreateInstancePackage {
        doc /* Page: Working with Automatic Instantiation Wizard, step 2. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard */
        action selectParentPackage;
        then action clickCreationMode;
        then action clickCreateOwner;
        then action chooseKind;
        then action typeName;
        then action closeSpecification;
    }
    action def CheckProjectSpelling {
        doc /* Page: Spell checking for the entire project or a selected scope. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151437/Spell+checking+for+the+entire+project+or+a+selected+scope */
        action chooseCheckSpelling;
        then action pickScope;
        then action optionallySetSpellingOptions;
        then action clickCheck;
        then action correctFirstError;
        then action stepThroughErrors;
        then action confirmWithOk;
    }
    action def ExportProjectStatistics {
        doc /* Page: Project Statistics. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151454/Project+Statistics */
        action chooseProjectStatistics;
        then action clickExportDetailedStatistics;
        then action pickDataToExport;
        then action setExportOptions;
        then action clickExport;
        then action clickClose;
    }
    action def MeasureOperationPerformance {
        doc /* Page: Evaluating operation performance. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151461/Evaluating+operation+performance */
        action chooseEvaluateOperationPerformance;
        then action clickStart;
        then action runTheOperation;
        then action clickStop;
        then action readDiagnostics;
    }
    action def ObfuscateProjectProcedure {
        doc /* Page: Model Obfuscation. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151471/Model+Obfuscation */
        action chooseObfuscateProject;
        then action nameAndLocateFile;
        then action clickSave;
        then action acknowledgeDone;
    }
    action def AddTrustedCertificate {
        doc /* Page: Server Certificates. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151473/Server+Certificates */
        action chooseOptionsEnvironment;
        then action selectServerCertificates;
        then action pickTrustGroup;
        then action clickAdd;
        then action locateCertificateFile;
        then action clickOpen;
    }
    action def CreatePackageStructureConfiguration {
        doc /* Page: Automated Package Structure Creation, creating a configuration. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation */
        action createConfigurationElement;
        then action applyConfigurationStereotype;
        then action openSpecificationTags;
        then action setApplyToElements;
        then action setCreateElements;
        then action optionallySetRemoveIndentSymbols;
        then action clickClose;
    }
    action def CreatePackageStructureAutomatically {
        doc /* Page: Automated Package Structure Creation, applying a configuration. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation */
        action rightClickElement;
        then action chooseCreatePackageStructure;
        then action selectConfiguration;
        then action clickOk;
    }

    // ---- Requirements ----
    requirement <'CAM-TLS-001'> mergeTypes {
        doc /* Two project versions can be merged in two ways: a 3-way merge that also uses a common ancestor, recommended because it tells apart what each side changed, and a 2-way merge that only compares the two versions. The ancestor is found by itself for server projects and must be chosen for local ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151219/Understanding+merge+types */
    }
    requirement <'CAM-TLS-002'> changeKinds {
        doc /* A merge is built from a tree of changes found between the ancestor and each contributor: additions, deletions, modifications (add, remove or replace a value), moves to a new owner, and order changes for a whole collection. Each change is either accepted or rejected. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept */
    }
    requirement <'CAM-TLS-003'> dependentChanges {
        doc /* Some changes depend on others, for example a type change depends on the addition of the new type. Accepting or rejecting one change carries the changes it depends on along with it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept */
    }
    requirement <'CAM-TLS-004'> conflictsEquivalents {
        doc /* In a 3-way merge, two incompatible changes from both sides form a conflict, and identical changes from both sides are equivalent and counted once. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept */
    }
    requirement <'CAM-TLS-005'> mergeOptions {
        doc /* Environment options tune a merge: speed versus memory, property names whose order changes are ignored, derived properties to track, which side wins conflicts automatically, and whether diagram changes cover only loaded diagrams or all, including those of used projects. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151239/Preparing+for+merge */
    }
    requirement <'CAM-TLS-006'> startLocalMerge {
        doc /* A local merge starts from Tools > Project > Merge with the open project as target: choose 3-way or 2-way, the source project, the ancestor for 3-way, optional advanced options, then Merge. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge */
    }
    requirement <'CAM-TLS-007'> startServerMerge {
        doc /* On a server, a merge starts from Collaborate > Merge From, uses the 3-way type, takes the lowest common parent or branch point as ancestor, and offers to lock the project during the merge or not. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge */
    }
    requirement <'CAM-TLS-008'> mergeSummaryLegend {
        doc /* A summary and legend panel in the merge window counts differences between ancestor and each contributor, by kind, and explains the markings used in the result tree and property panel. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151260/Getting+merge+summary+information+and+changes+legend */
    }
    requirement <'CAM-TLS-009'> mergedResultTree {
        doc /* The merged result tree shows every changed element with a tick or cross for its state, colour for the change kind (green added, red deleted, blue modified, moved or reordered), a diamond for conflicts resolved by system or user, and marks on owners of changed content. By default only source changes show; a filter picks kinds. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151263/Understanding+content+of+the+Merged+Result+panel */
    }
    requirement <'CAM-TLS-010'> propertyDiffPanel {
        doc /* A property panel lists the properties of the selected changed element with source, optional ancestor, target and a merge preview column; each property change can be accepted or rejected, references can be followed back to the tree, and text values open a compare dialog. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151286/Inspecting+element+property+changes+in+the+Specification+panel */
    }
    requirement <'CAM-TLS-011'> changeDetailsPanel {
        doc /* A change details panel shows a tree of source and target changes for the selected element or property, including dependent changes, and accepts or rejects from its menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151290/Inspecting+changes+in+the+Change+details+panel */
    }
    requirement <'CAM-TLS-012'> changeNavigation {
        doc /* The merge toolbar accepts or rejects the selected change in three scopes (change only, with its properties, recursively with sub-elements) and moves to the next change, and also jumps to the first, previous, next, last change or next conflict, with Alt-key shortcuts. Options toggle columns, used-project elements, the legend panel and the window layout. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151291/Displaying+and+navigating+through+changes */
    }
    requirement <'CAM-TLS-013'> conflictNavigation {
        doc /* A filter on the result tree narrows it to conflicts, split by resolved by user or by system, and a notification link filters to the automatically resolved ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151300/Quickly+navigating+through+conflicting+changes */
    }
    requirement <'CAM-TLS-014'> acceptRejectMenu {
        doc /* The result tree menu offers Accept, Reject, with-properties and recursive variants, Mark as Resolved for conflicts, and for moved elements a command to select their original or new location. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151302/Accepting+and+rejecting+changes+using+shortcut+menu */
    }
    requirement <'CAM-TLS-015'> diagramDiffViewer {
        doc /* Double-clicking a changed diagram opens difference viewer tabs for ancestor, source and target, marking added, deleted and modified symbols and relations with coloured borders and numbered flags. A legend filters change kinds, a slider fades between versions, and the toolbar returns to the tree, syncs zoom and scroll, prints and zooms. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151310/Viewing+and+analyzing+changes+of+modified+diagrams */
    }
    requirement <'CAM-TLS-016'> diffReport {
        doc /* A differences report in Word format is made from the merge toolbar, either full or diagrams-only, or from a custom template placed in the merge reports folder. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151314/Generating+a+differences+report */
    }
    requirement <'CAM-TLS-017'> finishCancelMerge {
        doc /* Finish Merging copies the accepted changes into the target, after which the project must be saved or committed. Cancel or Close asks for confirmation. Annotate Merged Diagram marks symbols whose positions changed on both sides, and a symbol menu picks the resolution. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151315/Finishing+and+canceling+merge */
    }
    requirement <'CAM-TLS-018'> patchTypes {
        doc /* A model patch is either all selected content, which overrides and adds elements as the source of truth and works on any project, or the changes from a chosen server version, which adds only concurrent changes and can be made only from a server project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151489/Model+Patch+types */
    }
    requirement <'CAM-TLS-019'> createPatch {
        doc /* A patch is created from Tools > Patch > Create Patch or a tree menu: add elements, children come along, pick the type, choose a file and save. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch */
    }
    requirement <'CAM-TLS-020'> applyPatch {
        doc /* Applying a patch means opening the patch file in the target project, reviewing the changes and clicking Apply Patch; failures are listed in a pane with reasons. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch */
    }
    requirement <'CAM-TLS-021'> patchDependencies {
        doc /* A patch does not include elements the content depends on, so the author checks Related Elements > Depends On or makes sure the target has them; otherwise elements lose their types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch */
    }
    requirement <'CAM-TLS-022'> metricSuiteCreate {
        doc /* A metric suite is a class stereotyped as a suite, created either from a predefined base suite by generalization, which brings the context and date metrics, or from scratch on a profile diagram. Its description is set in the specification. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151323/Adding+a+new+Metric+Suite */
    }
    requirement <'CAM-TLS-023'> metricSuiteConventions {
        doc /* A suite needs a target, one context parameter and a date tracker. One metric is the result of one calculation; all results of a suite run are slots of one instance of the suite. A single person should own suites in a project. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151318/Metric+Suites */
    }
    requirement <'CAM-TLS-024'> metricSuiteTarget {
        doc /* A suite target names the element types or element, for example a package or the model root, the metrics apply to; selecting it uses a select-elements dialog, and the suite does not appear when creating a table if its target does not match. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151327/Specify+the+target+for+the+Metric+Suite */
    }
    requirement <'CAM-TLS-025'> metricParameters {
        doc /* Parameters are typed attributes of the suite, each with a mandatory type; one of them is set as the context and receives the element chosen for calculation, which must have the target type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151330/Specifying+parameter+definitions */
    }
    requirement <'CAM-TLS-026'> metricDefinitions {
        doc /* A metric definition is a suite attribute with a mandatory result type whose default value is an expression, such as a structured expression, in a chosen language. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151332/Building+metric+definitions */
    }
    requirement <'CAM-TLS-027'> metricUseCases {
        doc /* Typical suite recipes: a date and time metric built from formatting and timestamp operations, reading a parameter value with an instance-navigation operation or a script call, and a metric that combines results of other metrics, such as a percentage. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151345/Specific+use+cases */
    }
    requirement <'CAM-TLS-028'> validationMetric {
        doc /* A validation-based metric definition names a validation rule, a metric type such as element count or failed count, and optionally the menu item that lists the failing elements. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151334/Building+validation-based+metric+definitions */
    }
    requirement <'CAM-TLS-029'> validationDashboard {
        doc /* A validation dashboard collects the latest metric instances of several tables into one table through an abstract suite whose definitions are the columns and redefinitions that link each table metric to a column. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151340/Creating+a+validation+dashboard */
    }
    requirement <'CAM-TLS-030'> transformationsAvailable {
        doc /* Available transformations convert between modelling domains; the built-in ones are Any to Any, which copies a model part and may remap types, and Profile Migration. Plugins add more. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151350/Available+Transformations */
    }
    requirement <'CAM-TLS-031'> transformationWizard {
        doc /* The transformation wizard opens from Tools > Model Transformations and walks through type, source, destination, type map and custom properties; Back, Next and Finish move between steps and Finish accepts defaults for the rest. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151351/Working+with+Model+Transformation+Wizard */
    }
    requirement <'CAM-TLS-032'> transformationDestination {
        doc /* The destination step either places the result in a chosen or new package, copying the source first, or transforms in place, editing the source directly and keeping no original. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151358/Selecting+destination+model */
    }
    requirement <'CAM-TLS-033'> transformationDetails {
        doc /* The last step shows properties of the chosen transformation, with Reset to Defaults. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151364/Setting+custom+transformation+properties */
    }
    requirement <'CAM-TLS-034'> typeMap {
        doc /* A type map is a stereotyped package of stereotyped dependencies, each a rule to replace the use of one type by another; it is made by importing the transformation profile, applying the type map stereotype, drawing dependencies and stereotyping them as map rules. Chained mappings are not supported. The wizard step shows the map table and can run it in reverse. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151368/Transformation+Type+Mapping */
    }
    requirement <'CAM-TLS-035'> typeMapBehavior {
        doc /* Tags on a type map or rule control behaviour: default direction and per-rule direction, a default rule when several rules share a source type (without one the map is unusable), blocking of inherited source or destination types, special empty and any types, and a modifier placeholder for qualified types. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151372/Controlling+direction */
    }
    requirement <'CAM-TLS-036'> transformationTraces {
        doc /* Each transformation records traces between source and result elements, which can be followed forward through Transformations > Transformed To, backward from a result element, and seen in the specification traceability tab and the relation map. Traces can be removed. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151381/Transformation+Traces+and+Update */
    }
    requirement <'CAM-TLS-037'> transformationUpdate {
        doc /* Update Transformed Model, from the destination package menu, reapplies the transformation: new source elements get copies, deleted ones stay, and a dialog picks whether destination properties follow the source or stay as edited. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151381/Transformation+Traces+and+Update */
    }
    requirement <'CAM-TLS-038'> profileMigration {
        doc /* Profile migration replaces applied stereotypes, tagged values and type usages according to dependency rules marked as replace-stereotype, replace-tag or replace-type, and the wizard disables Next when no rules exist. It starts from the Tools menu or a package menu. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151383/Profile+Migration+Transformation */
    }
    requirement <'CAM-TLS-039'> executableConcepts {
        doc /* Executable concepts are expression-driven items: validation rules, derived properties, smart packages, executable opaque behaviors, metric definitions, macros and opaque behaviors, written in structured expressions, OCL, binary or script languages (Groovy, JavaScript, Jython and more), and tested in an expression evaluation tool. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151388/Executable+concepts */
    }
    requirement <'CAM-TLS-040'> oclConstraints {
        doc /* OCL constraints can be invariants, pre or postconditions, guards, derivations, initial values and operation bodies; the specification dialog has an OCL syntax check that underlines errors in red. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151389/Object+Constraint+Language */
    }
    requirement <'CAM-TLS-041'> resourceManager {
        doc /* A resource and plugin manager under Help installs, updates, removes and shows dependencies of profiles, plugins, templates, languages and samples, from local or web distribution files (core file preloaded) or a plain zip import, then requires a restart. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager */
    }
    requirement <'CAM-TLS-042'> customResources {
        doc /* Companies can bundle resources into a distribution file with a descriptor and host it on a share or web server, using a development tools plugin to build it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager */
    }
    requirement <'CAM-TLS-043'> setterGetter {
        doc /* Set and get operations for class attributes are generated from the class menu under Tools > Code Engineering, or by a tagged value, named from the attribute name and type. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151414/Creating+Setters+and+Getters */
    }
    requirement <'CAM-TLS-044'> implementOverride {
        doc /* Implement/Override Operations lists operations inherited from a base classifier or interface, with Selected and All lists that move items by buttons or double-click, and generates the chosen ones. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151415/Implementing+or+Overriding+Operations */
    }
    requirement <'CAM-TLS-045'> instantiationWizard {
        doc /* The automatic instantiation wizard is opened from Tools > Create Instance on elements and creates instance specifications with chosen parts, types, names, stereotypes and default values; it can be finished at once with its suggestions. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151416/Automatic+Instantiation+Wizard */
    }
    requirement <'CAM-TLS-046'> instantiationParts {
        doc /* Parts are suggested from multiplicity: a fixed count gives that many parts, an interval gives one with parallel parts added on demand, and 1 gives none. Part types can switch to a subtype, names use dot notation and values are chosen or created. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard */
    }
    requirement <'CAM-TLS-047'> instantiationTarget {
        doc /* Created instances go into an existing, new or cloned package, and optionally onto a new diagram with links, a name, a type and an owner. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard */
    }
    requirement <'CAM-TLS-048'> spellAsYouType {
        doc /* Words are checked while typing in symbol names, specification properties, documentation and the tree, shown with a red wavy underline; the menu offers suggestions, Ignore, Add to dictionary and Add to New Glossary. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151433/Spell+Checking+as+you+type */
    }
    requirement <'CAM-TLS-049'> spellProject {
        doc /* Tools > Check Spelling checks the whole project or a scope and lists problems in the validation results; each can be corrected in a dialog with Next and Previous. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151437/Spell+checking+for+the+entire+project+or+a+selected+scope */
    }
    requirement <'CAM-TLS-050'> spellOptions {
        doc /* Spelling options control as-you-type checking, tagged values, language dictionary, case sensitivity, camel-case splitting, ignoring upper case and numbers, and imported OpenOffice dictionaries. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151444/Setting+the+spell+checking+options */
    }
    requirement <'CAM-TLS-051'> spellCustomElements {
        doc /* A customization tag lists which string properties of a customized element are spell checked. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151448/Defining+properties+of+the+customized+element+to+be+spell+checked */
    }
    requirement <'CAM-TLS-052'> projectStatistics {
        doc /* Tools > Project Statistics exports detailed project statistics (diagram and element counts by type, options, hardware, server cache, build times) to a file, optionally with used projects and with names hidden. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151454/Project+Statistics */
    }
    requirement <'CAM-TLS-053'> operationPerformance {
        doc /* Evaluate Operation Performance starts and stops a recording while an operation runs and lists per expression its share, time, count, name and type, with tree expand and collapse, select in tree and export to log. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151461/Evaluating+operation+performance */
    }
    requirement <'CAM-TLS-054'> modelObfuscation {
        doc /* File > Obfuscate Project saves a copy of the project with texts and images replaced by random content so it can be sent for support. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151471/Model+Obfuscation */
    }
    requirement <'CAM-TLS-055'> customObfuscation {
        doc /* A custom word obfuscation algorithm is supplied by a plugin class and selected by a Java option in the properties file. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151471/Model+Obfuscation */
    }
    requirement <'CAM-TLS-056'> serverCertificates {
        doc /* Options > Environment > Server Certificates keeps certificates trusted by all users or by the current user, with add, remove and details; with single sign-on a self-signed certificate can be reviewed and accepted, which adds it to the current-user list. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151473/Server+Certificates */
    }
    requirement <'CAM-TLS-057'> packageStructureConfig {
        doc /* A package structure configuration is a named element with the structure stereotype whose tags say for which element types the action is offered, an indented list of packages to create, and whether bullet symbols are stripped. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation */
    }
    requirement <'CAM-TLS-058'> createPackageStructure {
        doc /* Tools > Create Package Structure on an element opens a dialog of matching configurations and creates the chosen nested packages in it. Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation */
    }
}
