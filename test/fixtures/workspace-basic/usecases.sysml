package Mobility {
  part def Vehicle;
  part def Driver;

  use case def 'Provide Transportation' {
    subject vehicle : Vehicle;
    actor driver : Driver;
    include use case 'enter vehicle' : 'Enter Vehicle';
  }

  use case def 'Enter Vehicle' {
    subject vehicle : Vehicle;
  }
}
