package Ordering {
  item def Order;
  item def Receipt;
  item def Shipment;

  part def Customer;
  part def Shop;
  part def Warehouse;

  occurrence def OrderInteraction {
    ref part customer : Customer;
    ref part shop : Shop;
    ref part warehouse : Warehouse;

    message placeOrder of Order from customer to shop;
    then message pickGoods of Shipment from shop to warehouse;
    then message sendReceipt of Receipt from shop to customer;
  }
}
