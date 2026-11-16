package MiningSpec {
  private import VerificationCases::*;

  requirement def <'MFRD'> MiningFrigateRequirements {
    doc /* The requirements of the mining frigate. */
    requirement <'MFRQ01'> oreExtraction { doc /* The frigate shall extract ore efficiently. */ }
    requirement <'MFRQ02'> cargoCapacity {
      doc /* The frigate shall hold enough cargo. */
      requirement <'MFRQ02.1'> holdSize;
    }
    requirement <'MFRQ03'> survivability;
  }

  requirement <'SYS1'> frigateNeeds : MiningFrigateRequirements;

  part def Frigate;
  part frigate : Frigate {
    satisfy frigateNeeds;
  }

  package Standalone {
    requirement <'S1'> parentReq {
      requirement <'S1.1'> childReq;
    }
    requirement <'S2'> lonely;
    part def Rig;
    part rig : Rig { satisfy parentReq by rig; }
  }

  verification def OreExtractionTest {
    @VerificationMethod { kind = VerificationMethodKind::test; }
    objective { verify MiningFrigateRequirements::oreExtraction; }
  }
  verification def CargoInspection {
    @VerificationMethod { kind = VerificationMethodKind::inspect; }
    objective { verify MiningFrigateRequirements::cargoCapacity; }
  }
  verification def ChildAnalysis {
    @VerificationMethod { kind = VerificationMethodKind::analyze; }
    objective { verify Standalone::parentReq::childReq; }
  }
}
