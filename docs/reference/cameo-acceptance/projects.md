# Projects acceptance scenarios

Generated from the Cameo user guide, section 002 Working with projects. Each scenario tests one requirement in `../cameo-ui-model/Projects-2.sysml` (package `CameoUI_PRJ_2`).

## ACC-PRJ-001 Create project

- Requirement: CAM-PRJ-001
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148587/Creating+a+new+project
- Preconditions: Application running
- Steps:
  1. Press Ctrl+Shift+N
  2. Select UML Project under General-Purpose Modeling
  3. Type a name
  4. Pick a location
  5. Click OK
- Expected: A new empty project file with that name exists at the location and opens.

## ACC-PRJ-002 New project structure

- Requirement: CAM-PRJ-002
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148587/Creating+a+new+project
- Preconditions: A new project
- Steps:
  1. Look at the model browser
  2. Try to rename the UML Standard Profile package
- Expected: The three root packages are present and the built-in ones refuse rename and delete.

## ACC-PRJ-003 Project properties

- Requirement: CAM-PRJ-003
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog
- Preconditions: An open project
- Steps:
  1. Choose File > Project Properties
  2. Edit the title and description
  3. Click OK
- Expected: The values are stored with the project and shown when reopened.

## ACC-PRJ-004 Compatibility range

- Requirement: CAM-PRJ-004
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog
- Preconditions: Properties dialog open
- Steps:
  1. Enter Version 19.0 SP3
  2. Enter Compatible with 19.0 SP1
  3. Click OK
- Expected: A project using profile 19.0 SP2 stays editable.

## ACC-PRJ-005 Advanced project tabs

- Requirement: CAM-PRJ-005
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog
- Preconditions: Properties dialog open
- Steps:
  1. Click More
  2. Open Shared Packages tab
  3. Set a preferred path
  4. Open Used Projects tab
- Expected: Shared packages and used projects are listed and the preferred path is kept.

## ACC-PRJ-006 Reset ids

- Requirement: CAM-PRJ-006
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148589/Project+Properties+dialog
- Preconditions: Project with duplicate-id warning
- Steps:
  1. Open Project Properties > Advanced
  2. Click Reset IDs
  3. Confirm
- Expected: All element ids are new; server projects cannot reset the project id.

## ACC-PRJ-007 Switch projects

- Requirement: CAM-PRJ-007
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects
- Preconditions: Two projects open
- Steps:
  1. Choose File > Switch Projects
  2. Pick the other project
- Expected: The other project becomes active.

## ACC-PRJ-008 Close all projects

- Requirement: CAM-PRJ-008
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects
- Preconditions: Two projects with unsaved changes
- Steps:
  1. Choose File > Close All Projects
  2. Click Yes To All
- Expected: Every project is saved and closed without more prompts.

## ACC-PRJ-009 Copy between projects

- Requirement: CAM-PRJ-009
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148596/Working+with+multiple+projects
- Preconditions: Two open projects
- Steps:
  1. Select an element in project A
  2. Press Ctrl+C
  3. Select a package in project B
  4. Press Ctrl+V
- Expected: The element appears in project B.

## ACC-PRJ-010 Save project

- Requirement: CAM-PRJ-010
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects
- Preconditions: Modified project
- Steps:
  1. Press Ctrl+S
  2. Choose a directory and name in Save As
- Expected: The project file on disk has the changes.

## ACC-PRJ-011 Save formats

- Requirement: CAM-PRJ-011
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects
- Preconditions: Save dialog open
- Steps:
  1. Open the format list
  2. Choose MagicDraw File Format
  3. Save
- Expected: A file with the chosen extension is written.

## ACC-PRJ-012 Save backup

- Requirement: CAM-PRJ-012
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148600/Saving+projects
- Preconditions: Options set to create backups
- Steps:
  1. Save a changed project twice
- Expected: A backup of the first save exists next to the project.

## ACC-PRJ-013 Auto recovery

- Requirement: CAM-PRJ-013
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148602/Autosave
- Preconditions: Idle-save option on
- Steps:
  1. Edit the model
  2. Wait the idle time
  3. Kill the application
  4. Restart
- Expected: The tool offers to load the recovery file.

## ACC-PRJ-014 Open project

- Requirement: CAM-PRJ-014
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects
- Preconditions: Application running
- Steps:
  1. Choose File > Open Project
  2. Select the file
  3. Click Open
- Expected: The project loads in a new workspace.

## ACC-PRJ-015 Open last project

- Requirement: CAM-PRJ-015
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects
- Preconditions: Option set to true
- Steps:
  1. Close with a project open
  2. Start the application
- Expected: The last project is open.

## ACC-PRJ-016 Xmi storage

- Requirement: CAM-PRJ-016
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects
- Preconditions: A saved project
- Steps:
  1. Open the file in another UML tool
- Expected: The model loads and the diagrams are absent.

## ACC-PRJ-017 Open legacy project

- Requirement: CAM-PRJ-017
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148603/Opening+projects
- Preconditions: A 17.0 project with used projects
- Steps:
  1. Open and re-save the used projects
  2. Open and re-save the main project
- Expected: The main project is in the latest format.

## ACC-PRJ-018 Export formats

- Requirement: CAM-PRJ-018
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148730/Exporting+UML+models
- Preconditions: An open project
- Steps:
  1. Choose File > Export To
- Expected: The five formats are offered.

## ACC-PRJ-019 Export eclipse uml2

- Requirement: CAM-PRJ-019
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148730/Exporting+UML+models
- Preconditions: An open project
- Steps:
  1. Choose File > Export To > Eclipse UML2 (v5.x)
  2. Pick a location
  3. Click Export
- Expected: A .uml file is written.

## ACC-PRJ-020 Export as template

- Requirement: CAM-PRJ-020
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148733/Exporting+projects+as+templates
- Preconditions: A local project
- Steps:
  1. Choose File > Export To > Template
  2. Type name LibraryTemplate
  3. Click OK
- Expected: LibraryTemplate.mdzip exists in the templates folder.

## ACC-PRJ-021 Custom template

- Requirement: CAM-PRJ-021
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148734/Creating+custom+project+templates
- Preconditions: Application closed
- Steps:
  1. Create a folder in templates
  2. Add project and icons
  3. Write the xml descriptor
  4. Start the application
- Expected: The template is listed under its category in New Project.

## ACC-PRJ-022 New from template

- Requirement: CAM-PRJ-022
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148736/Creating+new+projects+from+templates
- Preconditions: Templates installed
- Steps:
  1. Press Ctrl+Shift+N
  2. Open Other > Project from Template
  3. Name the project
  4. Tick Clone custom used projects
  5. Click OK
- Expected: The project has the template structure and cloned used projects with the prefix.

## ACC-PRJ-023 Import another project

- Requirement: CAM-PRJ-023
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148736/Creating+new+projects+from+templates
- Preconditions: Two projects
- Steps:
  1. Choose File > Import From > Another Project
  2. Select the project
  3. Click Import
- Expected: All its elements are copied in.

## ACC-PRJ-024 Attach file

- Requirement: CAM-PRJ-024
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files
- Preconditions: A project and a file on disk
- Steps:
  1. Right-click a package
  2. Choose Create Element > Attached File
  3. Select the file
  4. Click Attach
- Expected: An Attached File element with its properties is in the tree.

## ACC-PRJ-025 Reattach file

- Requirement: CAM-PRJ-025
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files
- Preconditions: An attached file
- Steps:
  1. Select it and press Enter
  2. Filter properties by file
  3. Pick a new file
  4. Click Attach
  5. Click Close
- Expected: Modified At changes.

## ACC-PRJ-026 Detach file

- Requirement: CAM-PRJ-026
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148740/Attaching+reattaching+and+detaching+files
- Preconditions: An attached file with a shape
- Steps:
  1. Select it in the tree
  2. Press Delete
- Expected: The element is gone.

## ACC-PRJ-027 Open attached file

- Requirement: CAM-PRJ-027
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files
- Preconditions: An attached Word document
- Steps:
  1. Double-click it
  2. Edit and close
  3. Choose to save
- Expected: The stored file and Modified At are updated.

## ACC-PRJ-028 Attached image in html

- Requirement: CAM-PRJ-028
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files
- Preconditions: An attached image
- Steps:
  1. Copy Image URL
  2. Draw an HTML text box
  3. Insert image From Attached File
  4. Click OK twice
- Expected: The image shows in the text box.

## ACC-PRJ-029 Save attached file as

- Requirement: CAM-PRJ-029
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files
- Preconditions: An attached file
- Steps:
  1. Right-click it
  2. Choose Save File As
  3. Pick a location
- Expected: The file is written.

## ACC-PRJ-030 Image shape from attached

- Requirement: CAM-PRJ-030
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148742/Working+with+attached+files
- Preconditions: An attached image
- Steps:
  1. Drag it onto a diagram
- Expected: An image shape appears.

## ACC-PRJ-031 Disclaimer config

- Requirement: CAM-PRJ-031
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148745/Project+disclaimer+configuration
- Preconditions: A project
- Steps:
  1. Create a class
  2. Apply the stereotype
  3. Add text values in Tags
  4. Close and reopen
- Expected: Each message shows in order before the project opens.

## ACC-PRJ-032 Disclaimer messages

- Requirement: CAM-PRJ-032
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148745/Project+disclaimer+configuration
- Preconditions: A disclaimer class
- Steps:
  1. Open its specification
  2. Select the text tag
  3. Use add, remove, edit buttons
- Expected: The list reflects the changes.

## ACC-PRJ-033 Project options

- Requirement: CAM-PRJ-033
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options
- Preconditions: An open project
- Steps:
  1. Choose Options > Project
  2. Select an option
  3. Read its description
  4. Click Reset to Defaults
- Expected: The option returns to its default.

## ACC-PRJ-034 Browser options

- Requirement: CAM-PRJ-034
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options
- Preconditions: Project Options open
- Steps:
  1. Open General > Browser
  2. Set Show Diagram Abbreviations to true
- Expected: Diagram names in the tree carry abbreviations.

## ACC-PRJ-035 Interchange options

- Requirement: CAM-PRJ-035
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148755/Setting+project+options
- Preconditions: Project Options open
- Steps:
  1. Open OWL Import/Export
  2. Set the syntax to Turtle
- Expected: The next OWL export is Turtle.

## ACC-PRJ-036 Filter browser

- Requirement: CAM-PRJ-036
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148814/Filtering
- Preconditions: Containment tab open
- Steps:
  1. Open the tab menu
  2. Choose Filter
  3. Clear a type
  4. Click OK
- Expected: Elements of that type are hidden.

## ACC-PRJ-037 Filter search

- Requirement: CAM-PRJ-037
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148814/Filtering
- Preconditions: Find dialog open
- Steps:
  1. Click the Type button
  2. Select a type
  3. Click OK
  4. Click Find
- Expected: Only that type is listed.

## ACC-PRJ-038 Notification window

- Requirement: CAM-PRJ-038
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window
- Preconditions: A project with a model error
- Steps:
  1. Press Ctrl+M
- Expected: The window lists the notification.

## ACC-PRJ-039 Notification toolbar

- Requirement: CAM-PRJ-039
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window
- Preconditions: Notification window open
- Steps:
  1. Click Clear Messages
  2. Click Show Full History
  3. Search for a word
- Expected: Cleared items return in history and matches highlight.

## ACC-PRJ-040 Notification tabs

- Requirement: CAM-PRJ-040
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148827/Notification+window
- Preconditions: Notification window open
- Steps:
  1. Switch between the tabs
- Expected: Each tab lists its own kind.

## ACC-PRJ-041 Standard profiles

- Requirement: CAM-PRJ-041
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148936/Working+with+standard+profiles
- Preconditions: Project using a standard profile
- Steps:
  1. Try to use the profile in read-write mode
- Expected: A warning appears.

## ACC-PRJ-042 Profile versions

- Requirement: CAM-PRJ-042
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148936/Working+with+standard+profiles
- Preconditions: A project needing a missing plugin
- Steps:
  1. Open the project
- Expected: A warning and Resource Manager appear; elements load as proxies.

## ACC-PRJ-043 Ocl rules

- Requirement: CAM-PRJ-043
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148942/Refactored+OCL2.0+validation+rules
- Preconditions: A 2022x project
- Steps:
  1. Use the OCL2.0 Validation Rules project
  2. Validate
- Expected: The legacy rules run.

## ACC-PRJ-044 Find dialog

- Requirement: CAM-PRJ-044
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog
- Preconditions: A project
- Steps:
  1. Press Ctrl+Shift+F
  2. Type Add*
  3. Click Find
- Expected: Matching elements are listed in Search Results.

## ACC-PRJ-045 Find scope

- Requirement: CAM-PRJ-045
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog
- Preconditions: Find dialog open
- Steps:
  1. Pick Class
  2. Set Is Abstract to true
  3. Choose a package scope
  4. Click Find
- Expected: Only abstract classes in the package are listed.

## ACC-PRJ-046 Find options

- Requirement: CAM-PRJ-046
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog
- Preconditions: Options area open
- Steps:
  1. Tick Show results in new window
  2. Find twice
- Expected: Each result set has its own tab.

## ACC-PRJ-047 Search results actions

- Requirement: CAM-PRJ-047
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog
- Preconditions: Search results shown
- Steps:
  1. Select results
  2. Click the toolbar menu
  3. Choose Save Query as Smart Package
  4. Pick an owner
- Expected: A Smart Package with the results exists.

## ACC-PRJ-048 Find by id

- Requirement: CAM-PRJ-048
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148761/Find+dialog
- Preconditions: An element id
- Steps:
  1. Type [xmi.id]=<id>
  2. Click Find
- Expected: The element is found.

## ACC-PRJ-049 Quick find

- Requirement: CAM-PRJ-049
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog
- Preconditions: A project
- Steps:
  1. Press Ctrl+Alt+F
  2. Choose Any Element
  3. Type a name
- Expected: Matches appear in a list and selection reveals the element.

## ACC-PRJ-050 Quick find matching

- Requirement: CAM-PRJ-050
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog
- Preconditions: Quick Find open
- Steps:
  1. Type cv3
  2. Press F3
- Expected: CV-3 is found and next result is selected.

## ACC-PRJ-051 Quick find filters

- Requirement: CAM-PRJ-051
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148778/Quick+Find+dialog
- Preconditions: Quick Find open
- Steps:
  1. Open Filter Options
  2. Tick Exclude Auxiliary Resources
- Expected: Standard profile elements disappear from results.

## ACC-PRJ-052 Find todo

- Requirement: CAM-PRJ-052
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148795/Find+TODO
- Preconditions: Elements with To Do notes
- Steps:
  1. Choose Edit > Find TODO
- Expected: They are listed in Search Results.

## ACC-PRJ-053 Find and replace

- Requirement: CAM-PRJ-053
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148797/Find+and+Replace+dialog
- Preconditions: A project
- Steps:
  1. Press Ctrl+R
  2. Enter Find What and Replace With
  3. Click Replace
- Expected: Occurrences change; an invalid typed value gives an error.

## ACC-PRJ-054 Find in diagram

- Requirement: CAM-PRJ-054
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148803/Searching+in+diagrams
- Preconditions: A diagram open
- Steps:
  1. Press Ctrl+F
  2. Type a word
  3. Press F3
- Expected: Hits are highlighted and the view scrolls.

## ACC-PRJ-055 Search background

- Requirement: CAM-PRJ-055
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148758/Searching
- Preconditions: A large project
- Steps:
  1. Start a search
  2. Edit the model
- Expected: Partial results are shown.

## ACC-PRJ-056 Text indexing

- Requirement: CAM-PRJ-056
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148809/Indexing
- Preconditions: Search misses expected results
- Steps:
  1. Choose Tools > Rebuild Text Index
- Expected: The index is rebuilt and the search finds them.

## ACC-PRJ-057 Partition concept

- Requirement: CAM-PRJ-057
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148845/Project+partitioning
- Preconditions: A large model
- Steps:
  1. Decide the split
  2. Export packages as used projects
- Expected: Parts are reusable and have separate histories.

## ACC-PRJ-058 Decompose guidelines

- Requirement: CAM-PRJ-058
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148845/Project+partitioning
- Preconditions: A project with dependencies
- Steps:
  1. Analyze dependencies
  2. Pick one-way parts
- Expected: The chosen parts have no circular dependency.

## ACC-PRJ-059 Export packages

- Requirement: CAM-PRJ-059
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148847/Exporting+packages+to+new+projects
- Preconditions: A project with a package
- Steps:
  1. Choose File > Export To > Project Usage
  2. Add the package
  3. Add a description
  4. Click OK
  5. Choose a location
- Expected: The package is read-only and comes from the new project.

## ACC-PRJ-060 Share data

- Requirement: CAM-PRJ-060
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148849/Sharing+project+data
- Preconditions: A local project
- Steps:
  1. Select a package
  2. Choose Project Usages > Share Packages
  3. Click OK
- Expected: The package is shared.

## ACC-PRJ-061 Index unloaded

- Requirement: CAM-PRJ-061
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148851/Indexing+of+unloaded+projects
- Preconditions: A large used project
- Steps:
  1. Open it
  2. Set Common Indexing
  3. In the main project tick Use Index
- Expected: More proxies are visible.

## ACC-PRJ-062 Use project

- Requirement: CAM-PRJ-062
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project
- Preconditions: Two projects
- Steps:
  1. Choose File > Use Project > Use Local Project
  2. Select the file
  3. Click Next
  4. Set options
  5. Click Finish
- Expected: Its shared elements appear in the tree.

## ACC-PRJ-063 Used accessibility

- Requirement: CAM-PRJ-063
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148855/Using+other+projects+in+a+project
- Preconditions: A used project
- Steps:
  1. Open Options > Project Usages
  2. Select the project
  3. Click Read-write
  4. Click OK
- Expected: The elements are editable.

## ACC-PRJ-064 Import used project

- Requirement: CAM-PRJ-064
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148858/Importing+models
- Preconditions: A used project
- Steps:
  1. Select its package
  2. Choose Project Usages > Import
- Expected: The elements are copied and the usage is gone.

## ACC-PRJ-065 Reload used project

- Requirement: CAM-PRJ-065
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148861/Reloading+used+projects+in+a+project
- Preconditions: A used project modified elsewhere
- Steps:
  1. Right-click the package
  2. Choose Project Usages > Reload
- Expected: Changes are visible.

## ACC-PRJ-066 Load modes

- Requirement: CAM-PRJ-066
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148862/Working+with+partially+loaded+projects
- Preconditions: A large project
- Steps:
  1. Set Manual load
  2. Reopen
  3. Choose Load Used Project
- Expected: Proxies show until loaded.

## ACC-PRJ-067 Used projects dialog

- Requirement: CAM-PRJ-067
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148859/Managing+used+projects
- Preconditions: A project with usages
- Steps:
  1. Open Options > Project Usages
  2. Select a project
  3. Click Remove > Remove, keep references
- Expected: The usage is removed and references remain as an unconfirmed usage.

## ACC-PRJ-068 Integrity validation

- Requirement: CAM-PRJ-068
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148896/Validating+project+integrity
- Preconditions: Conflicting used projects
- Steps:
  1. Run Project Integrity Correctness validation
- Expected: Each conflict is a result.

## ACC-PRJ-069 Automated usages

- Requirement: CAM-PRJ-069
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148863/Automated+project+usages
- Preconditions: A composite used project
- Steps:
  1. Refactor the used project
- Expected: Dependent projects keep working.

## ACC-PRJ-070 Resolve unconfirmed

- Requirement: CAM-PRJ-070
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148867/Resolving+unconfirmed+usages+of+packages
- Preconditions: An unconfirmed usage
- Steps:
  1. Right-click it in the results
  2. Choose Confirm and use
  3. Click Finish
- Expected: A user-defined usage exists.

## ACC-PRJ-071 Recovered elements

- Requirement: CAM-PRJ-071
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148866/Maintaining+decomposed+model+integrity
- Preconditions: A reference to a removed shared element
- Steps:
  1. Open the model
- Expected: A recovered element is flagged.

## ACC-PRJ-072 Integrity analysis

- Requirement: CAM-PRJ-072
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148869/Managing+unresolved+references
- Preconditions: A recovered element
- Steps:
  1. Right-click an element
  2. Choose Validation > Recovered Element > Run Composition Integrity Analysis
- Expected: A results tab lists REF, SRE and URE.

## ACC-PRJ-073 Replace recovered

- Requirement: CAM-PRJ-073
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148887/Replacing+recovered+element+with+another+element
- Preconditions: A recovered element
- Steps:
  1. Right-click it
  2. Choose Change Usages To
  3. Pick an element
  4. Click OK
- Expected: All references point to the pick.

## ACC-PRJ-074 Remove unresolved

- Requirement: CAM-PRJ-074
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148888/Removing+unresolved+reference
- Preconditions: A recovered element
- Steps:
  1. Right-click it
  2. Choose Clean Usage of Recovered Element
- Expected: References and the recovered element are gone.

## ACC-PRJ-075 Remove recovered symbol

- Requirement: CAM-PRJ-075
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148889/Removing+recovered+element+symbol
- Preconditions: A symbol of a recovered element
- Steps:
  1. Select it
  2. Press Delete
- Expected: It is removed.

## ACC-PRJ-076 Avoid recovery

- Requirement: CAM-PRJ-076
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148892/How+to+avoid+triggering+element+recovery
- Preconditions: Project Options open
- Steps:
  1. Set Composition inspection to Advanced
- Expected: Validation covers used projects.

## ACC-PRJ-077 Import formats

- Requirement: CAM-PRJ-077
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148605/Importing+data+from+other+UML+tools+and+formats
- Preconditions: A model in another format
- Steps:
  1. Choose File > Import From
  2. Pick the format
- Expected: The matching import dialog opens.

## ACC-PRJ-078 Mof export

- Requirement: CAM-PRJ-078
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148906/Exporting+projects+to+MOF+files
- Preconditions: An open project
- Steps:
  1. Choose MOF Whole Model
  2. Pick MOF Kind
  3. Tick Validate
  4. Click Export
- Expected: A MOF file is written with warnings for skipped items.

## ACC-PRJ-079 Mof import

- Requirement: CAM-PRJ-079
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148913/Importing+projects+from+MOF+files
- Preconditions: An EMOF file
- Steps:
  1. Choose Import From > MOF XMI File
  2. Select the file
- Expected: A separate project opens.

## ACC-PRJ-080 Ecore project

- Requirement: CAM-PRJ-080
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148915/Creating+projects+for+Ecore+modeling
- Preconditions: Application running
- Steps:
  1. Choose New Project > Project from Template
  2. Select Ecore Template
- Expected: A project with the Ecore profile is created.

## ACC-PRJ-081 Ecore modeling

- Requirement: CAM-PRJ-081
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148919/Ecore+modeling
- Preconditions: Ecore project
- Steps:
  1. Create a Comment
  2. Apply EcoreAnnotation
  3. Add a key and value
- Expected: The annotation has the pair.

## ACC-PRJ-082 Ecore export

- Requirement: CAM-PRJ-082
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148927/Exporting+projects+to+Ecore+files
- Preconditions: Ecore project using another project
- Steps:
  1. Export the used project
  2. Save it
  3. Export the main project
- Expected: Cross-resource references resolve.

## ACC-PRJ-083 Ecore import

- Requirement: CAM-PRJ-083
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148935/Importing+projects+from+Ecore+files
- Preconditions: An .ecore file
- Steps:
  1. Save it as .emof in Eclipse
  2. Import the MOF file
- Expected: The model loads.

## ACC-PRJ-084 Ea import

- Requirement: CAM-PRJ-084
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148607/Working+with+Enterprise+Architect+Import
- Preconditions: An EA XMI file
- Steps:
  1. Choose Import From > Enterprise Architect
  2. Set input and output
  3. Tick options
  4. Click Import
- Expected: The converted project and log exist.

## ACC-PRJ-085 Ea options

- Requirement: CAM-PRJ-085
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148613/Customizing+the+conversion+options
- Preconditions: Environment Options open
- Steps:
  1. Choose Enterprise Architect Import
  2. Set Convert EA WriteLinkAction to
- Expected: The conversion uses the choice.

## ACC-PRJ-086 Ea specific data

- Requirement: CAM-PRJ-086
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148617/Transforming+EA+Specific+Data
- Preconditions: An EA file with requirements
- Steps:
  1. Import without excluding EA data
- Expected: Stereotyped requirement elements exist.

## ACC-PRJ-087 Ea diagrams

- Requirement: CAM-PRJ-087
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148620/Importing+Diagrams
- Preconditions: An EA file with diagrams
- Steps:
  1. Import the file
  2. Open a diagram
- Expected: Positions and colors match.

## ACC-PRJ-088 Ea transformations

- Requirement: CAM-PRJ-088
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148626/Activity+diagram+elements
- Preconditions: An EA activity diagram
- Steps:
  1. Import
  2. Open the activity
- Expected: The elements are rebuilt.

## ACC-PRJ-089 Ea limitations

- Requirement: CAM-PRJ-089
- Source: https://docs.nomagic.com/spaces/MD2024xR3/pages/227148729/Known+Limitations+and+Constraints
- Preconditions: An EA file with a legend
- Steps:
  1. Import it
- Expected: The legend is absent.
