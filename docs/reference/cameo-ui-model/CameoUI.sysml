package CameoUI {
    private import ScalarValues::*;
    doc /* Root of the Cameo/MagicDraw UI reference model. Section files are packages that import CameoUI::*. Shared vocabulary only; keep it small. */

    // Value types
    attribute def Label :> String;
    enum def SelectionMode { enum partialCoverage; enum completeCoverage; }

    // Screens and chrome
    part def Window { part panels : Panel[0..*]; part menus : Menu[0..1]; part toolbars : Toolbar[0..*]; }
    part def Panel { attribute title : Label; }
    part def Menu { attribute title : Label; part items : MenuItem[0..*]; }
    part def MenuItem { attribute title : Label; attribute shortcut : Label[0..1]; ref invokes : Command[0..1]; }
    part def Toolbar { part buttons : ToolbarButton[0..*]; }
    part def ToolbarButton { attribute title : Label; ref invokes : Command[0..1]; }
    part def Dialog { attribute title : Label; part fields : Field[0..*]; }
    part def Field { attribute title : Label; }
    part def Option :> Field;   // a setting, in a Properties/Options dialog
    part def Tab :> Panel;
    part def Wizard :> Dialog;

    // Commands: anything the user can invoke. Menu items and buttons reference them.
    action def Command;

    // Model browser and specification
    part def ContainmentTree :> Panel;
    part def SpecificationWindow :> Dialog;

    // Diagrams
    part def DiagramType { attribute name : Label; }
    part def DiagramPane :> Panel { part elements : DiagramElement[0..*]; }
    part def DiagramElement { attribute name : Label; ref represents : ModelElement[0..1]; }
    part def Shape :> DiagramElement { part compartments : Compartment[0..*]; }
    part def Path :> DiagramElement { ref source : Shape; ref target : Shape; }
    part def Compartment { attribute title : Label; }
    part def Palette :> Panel;
    part def ModelElement { attribute name : Label; }
    part def Property :> Field;

    // Shared dialogs and panels
    part def SelectElementDialog :> Dialog { part treeTab : Field; part searchScope : Option; }
    part def ProjectOptionsDialog :> Dialog { part optionGroups : Panel; part descriptionArea : Panel; part resetToDefaults : ToolbarButton; part showDescription : ToolbarButton; }
    part def EnvironmentOptionsDialog :> Dialog { part groupTree : Field; part quickFilter : Field; part descriptionArea : Panel; part createBackup : Option; part richXmi : Option; part recoveryOnIdle : Option; part idleMinutes : Option; part openLastProject : Option; part notificationOptions : Option; }
    part def QuickFindDialog :> Dialog { part searchFor : Field; part searchByName : Field; part matchTextAnywhere : Option; part useCamelCase : Option; part applyFilter : Option; part hideUncommonElements : Option; part excludeAuxiliaryResources : Option; }
    part def ValidationResultsPanel :> Panel;
    part def ContainmentTreePanel :> Panel { part tree : ContainmentTree; }
    part def StatusLine :> Panel;
    part def Legend { attribute name : Label; }
    part def Stereotype { attribute name : Label; }
    part def ProjectResource { attribute name : Label; attribute location : Label; }
    part def Notification { attribute text : Label; attribute severity : Label; }
    part def ShortcutBinding { attribute keys : Label; ref invokes : Command[0..1]; }
    part def Perspective { attribute name : Label; }
    enum def Visibility { enum standardAndExpert; enum expertOnly; enum hidden; }
    action def SymbolProperties :> Command;   // Alt+Enter

    // Generic modes and steps
    state def Mode;
    state def WizardStep;
}
