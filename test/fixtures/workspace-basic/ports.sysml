package Ports {
  port def Power;
  part def Battery {
    port output : Power;
  }
  part def Motor {
    port input : Power;
  }
  part def Drivetrain {
    part battery : Battery;
    part motor : Motor;
    port supply : Power;
    connect battery.output to motor.input;
  }
}
