package CameoUI {
    doc /* Root of the Cameo/MagicDraw UI reference model. Section files are packages that import CameoUI::*. Shared vocabulary only; keep it small. */

    // Value types
    attribute def Label :> ScalarValues::String;
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

    // Generic modes and steps
    state def Mode;
    state def WizardStep;
}
