package VehicleSpec {
    private import DocumentAnnotations::*;
    private import RequirementDerivation::*;

    @DocumentRoot { title = "Vehicle SRS"; version = "1.0"; }

    doc /* This specification describes the requirements of the vehicle. */

    package 'Performance Requirements' {
        doc /* Scope of the performance requirements. */
        comment /*
         * Rules that apply to every requirement:
         * - mass is measured fully loaded
         * - range uses the standard cycle
         */
        requirement <'R1'> massLimit {
            doc /* The vehicle mass shall not exceed 2000 kg. */
        }
        requirement <'R2'> chassisMass {
            doc /* The chassis mass shall not exceed 600 kg. */
        }
        part def TestRig;

        #derivation connection {
            end #original ::> massLimit;
            end #derive ::> chassisMass;
        }

        package Acceleration {
            requirement <'R3'> accel {
                doc /* The vehicle shall accelerate from 0 to 100 km/h in under 8 s. */
            }
        }
    }

    package Safety {
        doc /* Safety requirements of the vehicle. */
        requirement <'R4'> brakeDistance;
    }

    package Design {
        part vehicle;
        part engine;
        satisfy 'Performance Requirements'::massLimit by vehicle;
    }

    package Verification {
        verification def weighVehicle {
            objective {
                verify 'Performance Requirements'::massLimit;
            }
        }
        verification def spare;
    }

    package Glossary {
        @Appendix;
        doc /* Terms used in this specification. */
    }
}
