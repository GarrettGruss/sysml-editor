# Tools acceptance scenarios

One scenario per requirement in `../cameo-ui-model/Tools.sysml` (package `CameoUI_TLS`), from guide section 010 Tools.

## ACC-TLS-001 mergeTypes

- Requirement: CAM-TLS-001
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151219/Understanding+merge+types
- Preconditions: Two versions of a model exist
- Steps:
  1. Open the merge dialog
  2. Choose 3-way, then pick source and ancestor
  3. Repeat choosing 2-way, which asks for no ancestor
- Expected: The 3-way merge reports changes per side; the 2-way merge reports only differences between the two.

## ACC-TLS-002 changeKinds

- Requirement: CAM-TLS-002
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept
- Preconditions: A source with an added, a deleted, a renamed, a moved and a reordered element
- Steps:
  1. Start a merge
  2. Open the changes list
  3. Check that each element is labelled with its change kind
- Expected: All five kinds are shown, and each can be accepted or rejected.

## ACC-TLS-003 dependentChanges

- Requirement: CAM-TLS-003
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept
- Preconditions: A source where a property type was replaced by a newly added type
- Steps:
  1. Select the property modification
  2. Accept it
- Expected: The addition of the new type is accepted too.

## ACC-TLS-004 conflictsEquivalents

- Requirement: CAM-TLS-004
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151238/Understanding+change+concept
- Preconditions: Source and target both rename one element, differently, and both move another element to the same package
- Steps:
  1. Run a 3-way merge
  2. Inspect the conflict
  3. Inspect the equivalent move
- Expected: The rename is shown as a conflict; the identical move is shown as equivalent.

## ACC-TLS-005 mergeOptions

- Requirement: CAM-TLS-005
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151239/Preparing+for+merge
- Preconditions: Environment options dialog available
- Steps:
  1. Open Options > Environment > General > Merge and Compare
  2. Set the conflict winner to Source
  3. Start a merge with a conflict
- Expected: The conflict is resolved to the source value and marked as resolved by the system.

## ACC-TLS-006 startLocalMerge

- Requirement: CAM-TLS-006
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge
- Preconditions: A target project open and two other versions on disk
- Steps:
  1. Choose Tools > Project > Merge
  2. Select 3-way
  3. Pick the source, then the ancestor
  4. Click Merge
- Expected: The Merge window opens if changes were found.

## ACC-TLS-007 startServerMerge

- Requirement: CAM-TLS-007
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151241/Starting+Model+Merge
- Preconditions: A server project with two branches
- Steps:
  1. Choose Collaborate > Merge From
  2. Pick the source branch
  3. Pick Merge with Lock
- Expected: Other users cannot commit while the merge runs.

## ACC-TLS-008 mergeSummaryLegend

- Requirement: CAM-TLS-008
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151260/Getting+merge+summary+information+and+changes+legend
- Preconditions: A merge in progress
- Steps:
  1. Open the Summary/Legend panel
- Expected: Counts per contributor and the marking legend are shown.

## ACC-TLS-009 mergedResultTree

- Requirement: CAM-TLS-009
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151263/Understanding+content+of+the+Merged+Result+panel
- Preconditions: A merge with several change kinds
- Steps:
  1. Open the Merged Result tree
  2. Use the changes filter to show only deletions
  3. Read the marks
- Expected: Only deletions show, with red backgrounds and state marks.

## ACC-TLS-010 propertyDiffPanel

- Requirement: CAM-TLS-010
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151286/Inspecting+element+property+changes+in+the+Specification+panel
- Preconditions: A changed element with a changed documentation text
- Steps:
  1. Select the element
  2. Read the columns
  3. Double-click the documentation property
- Expected: A compare dialog shows inserted and deleted text.

## ACC-TLS-011 changeDetailsPanel

- Requirement: CAM-TLS-011
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151290/Inspecting+changes+in+the+Change+details+panel
- Preconditions: A merge in progress
- Steps:
  1. Select a changed element
  2. Expand Dependent changes
- Expected: Dependent changes appear and can be accepted.

## ACC-TLS-012 changeNavigation

- Requirement: CAM-TLS-012
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151291/Displaying+and+navigating+through+changes
- Preconditions: A merge with several changes
- Steps:
  1. Press Alt+Down
  2. Click Accept with properties
  3. Press Alt+Page Down
- Expected: Selection moves to the next change, then accepts, then jumps to the next conflict.

## ACC-TLS-013 conflictNavigation

- Requirement: CAM-TLS-013
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151300/Quickly+navigating+through+conflicting+changes
- Preconditions: A merge with auto-resolved conflicts
- Steps:
  1. Click the conflict notification
- Expected: The tree lists only automatically resolved conflicts.

## ACC-TLS-014 acceptRejectMenu

- Requirement: CAM-TLS-014
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151302/Accepting+and+rejecting+changes+using+shortcut+menu
- Preconditions: A moved element in the result tree
- Steps:
  1. Right-click the moved element
  2. Choose Select Original Location
- Expected: The tree selects the old location.

## ACC-TLS-015 diagramDiffViewer

- Requirement: CAM-TLS-015
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151310/Viewing+and+analyzing+changes+of+modified+diagrams
- Preconditions: A diagram changed in the source
- Steps:
  1. Double-click the diagram in the tree
  2. Move the slider to the middle
  3. Click a flag
- Expected: Both versions are blended; the flag selects its element in the tree.

## ACC-TLS-016 diffReport

- Requirement: CAM-TLS-016
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151314/Generating+a+differences+report
- Preconditions: A merge in progress
- Steps:
  1. Click Report
  2. Choose Full Report
  3. Save the file
- Expected: A document with the result tree and changed diagrams is saved.

## ACC-TLS-017 finishCancelMerge

- Requirement: CAM-TLS-017
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151315/Finishing+and+canceling+merge
- Preconditions: A merge with accepted changes
- Steps:
  1. Click Finish Merging
  2. Save the project
- Expected: The target contains the accepted changes.

## ACC-TLS-018 patchTypes

- Requirement: CAM-TLS-018
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151489/Model+Patch+types
- Preconditions: A project with a package
- Steps:
  1. Start Create Patch
  2. Choose All selected content
  3. Start Create Patch again and pick Changes from selected version
- Expected: The second type needs a server project and a version.

## ACC-TLS-019 createPatch

- Requirement: CAM-TLS-019
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch
- Preconditions: A project with a package
- Steps:
  1. Open the Create a Patch dialog
  2. Add the package
  3. Choose All selected content
  4. Save the file
- Expected: A patch file exists.

## ACC-TLS-020 applyPatch

- Requirement: CAM-TLS-020
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch
- Preconditions: A patch file and a target project
- Steps:
  1. Choose Tools > Patch > Apply Patch
  2. Select the file
  3. Review
  4. Click Apply Patch
- Expected: The success message appears, or the not-applied pane lists causes.

## ACC-TLS-021 patchDependencies

- Requirement: CAM-TLS-021
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151494/Using+Model+Patch
- Preconditions: A part whose type is outside the patch scope
- Steps:
  1. Create a patch with only the part
  2. Apply it where the type is missing
- Expected: The part is created without a type.

## ACC-TLS-022 metricSuiteCreate

- Requirement: CAM-TLS-022
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151323/Adding+a+new+Metric+Suite
- Preconditions: A project using the standard profile
- Steps:
  1. Create a profile diagram
  2. Find BaseMetricSuite
  3. Create a MetricSuite and generalize it from the base
  4. Type a description
- Expected: The new suite inherits the base parameter and metric definitions.

## ACC-TLS-023 metricSuiteConventions

- Requirement: CAM-TLS-023
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151318/Metric+Suites
- Preconditions: A defined suite
- Steps:
  1. Calculate a table
  2. Open the created instance
- Expected: The instance holds the parameter and metric values as slots.

## ACC-TLS-024 metricSuiteTarget

- Requirement: CAM-TLS-024
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151327/Specify+the+target+for+the+Metric+Suite
- Preconditions: A suite
- Steps:
  1. Open its specification
  2. Edit Target
  3. Select Package
  4. Close
- Expected: The suite is offered for packages in the Create Metric Table dialog.

## ACC-TLS-025 metricParameters

- Requirement: CAM-TLS-025
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151330/Specifying+parameter+definitions
- Preconditions: A suite
- Steps:
  1. Add a parameter definition
  2. Set its type
  3. Set Set As Context to true
- Expected: The element chosen for calculation becomes the context value.

## ACC-TLS-026 metricDefinitions

- Requirement: CAM-TLS-026
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151332/Building+metric+definitions
- Preconditions: A suite
- Steps:
  1. Create a metric definition
  2. Set Real as the type
  3. Set an opaque expression as default
  4. Pick a language and type the formula
- Expected: The table shows the calculated value.

## ACC-TLS-027 metricUseCases

- Requirement: CAM-TLS-027
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151345/Specific+use+cases
- Preconditions: A suite without a base
- Steps:
  1. Add the date and time metric
  2. Add a metric that reads the scope parameter
  3. Add a percentage metric over two others
- Expected: All three values show in a metric table.

## ACC-TLS-028 validationMetric

- Requirement: CAM-TLS-028
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151334/Building+validation-based+metric+definitions
- Preconditions: A suite and a validation rule
- Steps:
  1. Create a validation-based definition
  2. Choose the rule
  3. Choose Failed Element Quantity
- Expected: The table cell counts failing elements.

## ACC-TLS-029 validationDashboard

- Requirement: CAM-TLS-029
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151340/Creating+a+validation+dashboard
- Preconditions: Several validation metric tables
- Steps:
  1. Create an abstract suite with column metrics
  2. Generalize each suite from it
  3. Create a table for it
  4. Set its scope and query to the latest instances
- Expected: One table shows the latest values of all tracked tables.

## ACC-TLS-030 transformationsAvailable

- Requirement: CAM-TLS-030
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151350/Available+Transformations
- Preconditions: The Tools menu
- Steps:
  1. Open Model Transformations
  2. Read the list
- Expected: Any to Any and Profile Migration are listed.

## ACC-TLS-031 transformationWizard

- Requirement: CAM-TLS-031
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151351/Working+with+Model+Transformation+Wizard
- Preconditions: A model with a package
- Steps:
  1. Open the wizard
  2. Pick Any to Any
  3. Pick the source package
  4. Click Finish
- Expected: A copy of the package appears in the destination.

## ACC-TLS-032 transformationDestination

- Requirement: CAM-TLS-032
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151358/Selecting+destination+model
- Preconditions: The wizard at step 3
- Steps:
  1. Choose Place transformation model in package
  2. Select a package
  3. Next
- Expected: The source stays unchanged and a copy is transformed.

## ACC-TLS-033 transformationDetails

- Requirement: CAM-TLS-033
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151364/Setting+custom+transformation+properties
- Preconditions: The wizard at the details step
- Steps:
  1. Change a property
  2. Click Reset to Defaults
- Expected: Defaults return.

## ACC-TLS-034 typeMap

- Requirement: CAM-TLS-034
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151368/Transformation+Type+Mapping
- Preconditions: The transformation profile in use
- Steps:
  1. Create a package
  2. Apply the type map stereotype
  3. Draw a dependency from int to char
  4. Apply the map stereotype
  5. Run the wizard with that map
- Expected: All int types become char.

## ACC-TLS-035 typeMapBehavior

- Requirement: CAM-TLS-035
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151372/Controlling+direction
- Preconditions: A type map with two rules for String
- Steps:
  1. Mark one rule default
  2. Run the transformation twice, changing the destination type between runs
- Expected: The first run uses the default; the update keeps an acceptable type.

## ACC-TLS-036 transformationTraces

- Requirement: CAM-TLS-036
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151381/Transformation+Traces+and+Update
- Preconditions: A transformed model
- Steps:
  1. Right-click a source element
  2. Choose Transformations > Transformed To
- Expected: The result element is selected.

## ACC-TLS-037 transformationUpdate

- Requirement: CAM-TLS-037
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151381/Transformation+Traces+and+Update
- Preconditions: A transformed package with later source edits
- Steps:
  1. Right-click the destination package
  2. Tools > Update Transformed Model
  3. Choose Leave destination properties intact
- Expected: New elements are copied and manual destination edits are kept.

## ACC-TLS-038 profileMigration

- Requirement: CAM-TLS-038
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151383/Profile+Migration+Transformation
- Preconditions: A model using stereotype Book and a rule from Magazine to Book
- Steps:
  1. Open the wizard
  2. Pick Profile Migration
  3. Select the package
  4. Check the mappings and Finish
- Expected: Stereotyped elements now carry Magazine.

## ACC-TLS-039 executableConcepts

- Requirement: CAM-TLS-039
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151388/Executable+concepts
- Preconditions: A model with a constraint
- Steps:
  1. Open the constraint
  2. Pick the language
- Expected: The language list is offered.

## ACC-TLS-040 oclConstraints

- Requirement: CAM-TLS-040
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151389/Object+Constraint+Language
- Preconditions: A constraint specification
- Steps:
  1. Choose OCL
  2. Tick Check OCL syntax
  3. Type a wrong expression
- Expected: The wrong text is underlined.

## ACC-TLS-041 resourceManager

- Requirement: CAM-TLS-041
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager
- Preconditions: The manager open
- Steps:
  1. Open Help > Resource/Plugin Manager
  2. Add a location
  3. Tick a resource
  4. Download/Install
  5. Restart
- Expected: The resource is installed.

## ACC-TLS-042 customResources

- Requirement: CAM-TLS-042
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151391/Resource+Manager
- Preconditions: Development tools plugin installed
- Steps:
  1. Build a distribution file
  2. Host it
  3. Add its URL to the manager
- Expected: The resources are listed.

## ACC-TLS-043 setterGetter

- Requirement: CAM-TLS-043
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151414/Creating+Setters+and+Getters
- Preconditions: A class with an attribute x of type int
- Steps:
  1. Choose Tools > Code Engineering > Create Setters/Getters
  2. Select x
  3. OK
- Expected: Operations setx and getx exist.

## ACC-TLS-044 implementOverride

- Requirement: CAM-TLS-044
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151415/Implementing+or+Overriding+Operations
- Preconditions: A class with a general type with abstract operations
- Steps:
  1. Open the tool
  2. Move an operation to Selected
  3. OK
- Expected: The operation is created in the subclass.

## ACC-TLS-045 instantiationWizard

- Requirement: CAM-TLS-045
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151416/Automatic+Instantiation+Wizard
- Preconditions: A block with parts
- Steps:
  1. Select the block
  2. Tools > Create Instance
  3. Click Finish
- Expected: Instances with suggested names are created.

## ACC-TLS-046 instantiationParts

- Requirement: CAM-TLS-046
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard
- Preconditions: A part with multiplicity 4 and one with 0..*
- Steps:
  1. Open the wizard
  2. Observe the counts
  3. Insert a parallel part on the second
- Expected: Four parts, then two on the interval one.

## ACC-TLS-047 instantiationTarget

- Requirement: CAM-TLS-047
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151417/Working+with+Automatic+Instantiation+Wizard
- Preconditions: The wizard at step 2
- Steps:
  1. Create a new package
  2. Tick Create a new diagram
  3. Choose its type
  4. Finish
- Expected: The package and diagram exist with the instances.

## ACC-TLS-048 spellAsYouType

- Requirement: CAM-TLS-048
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151433/Spell+Checking+as+you+type
- Preconditions: Spelling on
- Steps:
  1. Type a wrong word in documentation
  2. Right-click it
  3. Add to dictionary
- Expected: The underline disappears for that word.

## ACC-TLS-049 spellProject

- Requirement: CAM-TLS-049
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151437/Spell+checking+for+the+entire+project+or+a+selected+scope
- Preconditions: A project with misspelled names
- Steps:
  1. Choose Tools > Check Spelling
  2. Pick Selection
  3. Check
  4. Correct the first error
- Expected: The word is fixed and saved with OK.

## ACC-TLS-050 spellOptions

- Requirement: CAM-TLS-050
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151444/Setting+the+spell+checking+options
- Preconditions: Environment options
- Steps:
  1. Open Spelling
  2. Turn Skip Numbers on
- Expected: Numbers are no longer flagged.

## ACC-TLS-051 spellCustomElements

- Requirement: CAM-TLS-051
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151448/Defining+properties+of+the+customized+element+to+be+spell+checked
- Preconditions: A customization class
- Steps:
  1. Set the checkSpelling tag value
- Expected: Only those properties are checked.

## ACC-TLS-052 projectStatistics

- Requirement: CAM-TLS-052
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151454/Project+Statistics
- Preconditions: A project
- Steps:
  1. Open Project Statistics
  2. Export Detailed Statistics
  3. Tick Confidential
  4. Export
- Expected: A statistics file without element names is written.

## ACC-TLS-053 operationPerformance

- Requirement: CAM-TLS-053
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151461/Evaluating+operation+performance
- Preconditions: A slow diagram opening
- Steps:
  1. Tools > Evaluate Operation Performance
  2. Start
  3. Open the diagram
  4. Stop
- Expected: A table of expression timings appears.

## ACC-TLS-054 modelObfuscation

- Requirement: CAM-TLS-054
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151471/Model+Obfuscation
- Preconditions: Obfuscator plugin installed
- Steps:
  1. Choose File > Obfuscate Project
  2. Name the file
  3. Save
- Expected: The copy has unreadable strings.

## ACC-TLS-055 customObfuscation

- Requirement: CAM-TLS-055
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151471/Model+Obfuscation
- Preconditions: A plugin with the class
- Steps:
  1. Add the option
  2. Restart
  3. Obfuscate
- Expected: The custom algorithm is used.

## ACC-TLS-056 serverCertificates

- Requirement: CAM-TLS-056
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151473/Server+Certificates
- Preconditions: Environment options
- Steps:
  1. Open Server Certificates
  2. Choose Trusted by Current User
  3. Add a file
- Expected: The certificate is listed.

## ACC-TLS-057 packageStructureConfig

- Requirement: CAM-TLS-057
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation
- Preconditions: A package
- Steps:
  1. Apply the stereotype
  2. Set applyToElements
  3. Set CreateElements to an indented list
  4. Close
- Expected: The configuration is ready.

## ACC-TLS-058 createPackageStructure

- Requirement: CAM-TLS-058
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227151478/Automated+Package+Structure+Creation
- Preconditions: A configuration for Subsystem
- Steps:
  1. Right-click a subsystem
  2. Tools > Create Package Structure
  3. Choose the configuration
  4. OK
- Expected: Nested packages exist in the element.

