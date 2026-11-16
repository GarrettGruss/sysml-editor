package MiningFrigate {
    requirement def MiningFrigateRequirementsDef {
        requirement <'MFRQ01'> OreExtractionEfficiencyRequirement {
            doc /* The Mining Frigate shall extract ore at an efficiency of at least 85 percent. */
            requirement <'MFRQ01_1'> ExtractorYield {
                doc /* The extractor shall yield at least 40 tonnes per hour. */
            }
            requirement <'MFRQ01_2'> ExtractorWear {
                doc /* The extractor shall run 500 hours between services. */
            }
        }
        requirement <'MFRQ02'> CargoCapacityRequirement {
            doc /* The cargo hold shall carry at least 12000 tonnes of ore. */
        }
        requirement <'MFRQ03'> ShieldRequirement {
            doc /* The shield shall withstand 3 hits. */
        }
    }
    package Appendices {
        doc /* Notes. */
    }
}
